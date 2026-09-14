/**
 * CRM outcomes → Meta Conversions API, in the Conversions API for CRM shape.
 *
 * The outbound half of the Lead Ads loop. lib/meta-leads.ts turns a Meta
 * form fill into a pipeline Lead; this reports every stage that lead passes
 * through — starting with the raw lead itself — so the ad account can
 * optimise for Conversion Leads instead of raw form fills.
 *
 * Only Meta-sourced leads are eligible: matching uses Meta's own `lead_id`
 * (the leadgen id in meta_leads), which is exact and needs no hashed PII.
 * A manually created or CSV-imported lead has no leadgen id and is skipped.
 *
 * Every entry point here is best-effort and NEVER throws — see the callers
 * in app/actions.ts, one of which sits behind an optimistic UI update that
 * a rejection would visibly roll back.
 */
import { COLLECTIONS, DB, db, ID, Query, withRetry } from "./appwrite";
import {
  LEAD_EVENT,
  LEAD_EVENT_SOURCE,
  STAGE_EVENTS,
  type Lead,
  type LeadStage,
  type MetaCapiEvent,
  type MetaLead,
} from "./domain";
import { getCompany } from "./data";
import { env } from "./env";
import {
  META_LEAD_ID_RE,
  postCapiEvents,
  serializeCapiEvents,
  type CapiEvent,
} from "./meta";

/**
 * Meta accepts events up to 7 days old. Five minutes short of that, so an
 * event built right at the boundary can't expire in flight.
 */
export const CAPI_MAX_AGE_SECONDS = 7 * 86400 - 300;

export function isWithinCapiWindow(eventTimeSeconds: number): boolean {
  return Math.floor(Date.now() / 1000) - eventTimeSeconds < CAPI_MAX_AGE_SECONDS;
}

/**
 * Stage event id: `<leadId>:<eventName>:crm`. The `:crm` suffix is load-
 * bearing — events sent before the CRM-spec fix used `<leadId>:<eventName>`,
 * and Meta keeps only the first event per event_name + event_id for 48h, so
 * a corrected event reusing the old id would be silently discarded.
 */
export function buildStageEventId(leadId: string, eventName: string): string {
  return `${leadId}:${eventName}:crm`;
}

/**
 * Raw lead event id: keyed by the leadgen id, not the CRM lead. One pipeline
 * card can back several Meta leads (ensurePipelineLead reuses an open card
 * for a repeat submitter), and each of those is its own raw lead.
 */
export function buildLeadEventId(leadgenId: string): string {
  return `${leadgenId}:${LEAD_EVENT}:crm`;
}

/** Marker on pre-fix rows replaced by a CRM-compliant resend. */
const SUPERSEDED = "superseded by ";

function isSuperseded(row: MetaCapiEvent): boolean {
  return row.error?.startsWith(SUPERSEDED) ?? false;
}

/**
 * The meta_leads row a CRM lead came from, most recent first.
 *
 * One Lead can have several: ensurePipelineLead reuses an open lead for a
 * repeat submitter. Stage events report the most recent only — one CRM
 * outcome is one conversion, and sending one per leadgen id would
 * double-count it.
 *
 * Needs meta_leads.idx_meta_lead_lead.
 */
async function findOriginLead(leadId: string): Promise<MetaLead | null> {
  const res = await withRetry(() =>
    db().listDocuments(DB(), COLLECTIONS.metaLeads, [
      Query.equal("leadId", leadId),
      Query.orderDesc("createdTimeMeta"),
      Query.limit(1),
    ])
  );
  return res.total > 0 ? (res.documents[0] as unknown as MetaLead) : null;
}

async function findCapiEvent(eventId: string): Promise<MetaCapiEvent | null> {
  const res = await withRetry(() =>
    db().listDocuments(DB(), COLLECTIONS.metaCapiEvents, [
      Query.equal("eventId", eventId),
      Query.limit(1),
    ])
  );
  return res.total > 0 ? (res.documents[0] as unknown as MetaCapiEvent) : null;
}

async function recordCapiEvent(
  existing: MetaCapiEvent | null,
  row: Record<string, unknown>
): Promise<void> {
  if (existing) {
    await withRetry(() =>
      db().updateDocument(DB(), COLLECTIONS.metaCapiEvents, existing.$id, row)
    );
    return;
  }
  await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.metaCapiEvents, ID.unique(), row)
  );
}

/**
 * - `live` (default): the running app. Honours META_CAPI_ENABLED,
 *   META_CAPI_DRY_RUN and META_CAPI_TEST_EVENT_CODE from env.
 * - `dry-run`: build and log the payload; no request, no rows.
 * - `test`: send to Test Events using META_CAPI_TEST_EVENT_CODE; no rows.
 * - `production`: send for real, ignoring any test code in env.
 */
export type CapiMode = "live" | "dry-run" | "test" | "production";

export interface SendOptions {
  mode?: CapiMode;
  /** Unix seconds; defaults to now. The backfill passes original timestamps. */
  eventTime?: number;
  /** Deal value — attached only when > 0. */
  value?: number;
  currency?: string;
}

export type SendOutcome =
  | "sent"
  | "test-sent"
  | "dry-run"
  | "duplicate"
  | "skipped"
  | "failed"
  | "ineligible";

interface Target {
  leadId: string;
  leadgenId: string;
  companyId?: string;
}

/** The single send path shared by live stage changes, imports and the backfill. */
async function sendEvent(
  target: Target,
  eventName: string,
  eventId: string,
  opts: SendOptions
): Promise<SendOutcome> {
  const mode = opts.mode ?? "live";
  const dryRun = mode === "dry-run" || (mode === "live" && env.metaCapiDryRun());
  const testCode =
    mode === "production" || mode === "dry-run" ? undefined : env.metaCapiTestEventCode();
  if (mode === "test" && !testCode) {
    throw new Error("test mode needs META_CAPI_TEST_EVENT_CODE");
  }
  // Dry runs leave nothing behind; test sends are checks, not history.
  const recordRows = !dryRun && mode !== "test";

  const existing = await findCapiEvent(eventId);
  if (existing?.state === "sent") return "duplicate";

  const eventTime = opts.eventTime ?? Math.floor(Date.now() / 1000);
  const hasValue = typeof opts.value === "number" && opts.value > 0;
  const base = {
    eventId,
    leadId: target.leadId,
    leadgenId: target.leadgenId,
    companyId: target.companyId ?? null,
    eventName,
    value: hasValue ? opts.value : null,
    currency: hasValue ? opts.currency || "ETB" : null,
    attempts: (existing?.attempts ?? 0) + 1,
    sentAt: new Date().toISOString(),
  };
  const record = async (row: Record<string, unknown>) => {
    if (recordRows) await recordCapiEvent(existing, { ...base, ...row });
  };
  const note = (outcome: string, why: string) => {
    if (dryRun) {
      console.log(`[meta-capi] DRY RUN → would ${outcome} ${eventName} for lead ${target.leadId}: ${why}`);
    }
  };

  if (!isWithinCapiWindow(eventTime)) {
    const why = `event_time ${new Date(eventTime * 1000).toISOString()} is past Meta's 7-day limit`;
    note("skip", why);
    await record({ datasetId: "", state: "skipped", error: why });
    return "skipped";
  }

  const company = target.companyId ? await getCompany(target.companyId) : null;
  const datasetId = company?.metaDatasetId?.trim();
  if (!datasetId) {
    // Recorded rather than dropped: a missing dataset id is a configuration
    // gap someone should see on the Manage page.
    const why = company
      ? `No Conversions API dataset set for ${company.name}`
      : "Lead's company not found";
    note("skip", why);
    await record({ datasetId: "", state: "skipped", error: why });
    return "skipped";
  }

  if (!META_LEAD_ID_RE.test(target.leadgenId)) {
    const why = `leadgenId "${target.leadgenId}" is not a 15–17 digit Meta lead id`;
    note("fail", why);
    await record({ datasetId, state: "failed", error: why });
    return "failed";
  }

  const event: CapiEvent = {
    event_name: eventName,
    event_time: eventTime,
    action_source: "system_generated",
    // A Test Events copy gets its own id: if it shared the real one, Meta's
    // 48h dedup could discard the production send that follows it.
    event_id: testCode ? `${eventId}:test` : eventId,
    user_data: { lead_id: target.leadgenId },
    custom_data: {
      event_source: "crm",
      lead_event_source: LEAD_EVENT_SOURCE,
      ...(hasValue ? { value: opts.value!, currency: opts.currency || "ETB" } : {}),
    },
  };

  if (dryRun) {
    console.log(`[meta-capi] DRY RUN → dataset ${datasetId}: ${serializeCapiEvents([event])}`);
    return "dry-run";
  }

  try {
    const res = await postCapiEvents(datasetId, [event], testCode);
    const warnings = res.messages.length ? res.messages.join("; ").slice(0, 256) : null;
    if (res.eventsReceived < 1) {
      await record({
        datasetId,
        state: "failed",
        error: warnings ?? "Meta accepted the request but received 0 events",
      });
      return "failed";
    }
    if (testCode) {
      // Test Events never count toward optimisation. Recording `sent` would
      // mark the event done and block it from ever reaching production.
      await record({
        datasetId,
        state: "skipped",
        error: "Sent to Test Events only (META_CAPI_TEST_EVENT_CODE is set) — not counted",
      });
      return "test-sent";
    }
    await record({ datasetId, state: "sent", error: warnings });
    return "sent";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await record({ datasetId, state: "failed", error: message.slice(0, 256) });
    return "failed";
  }
}

/**
 * Report a pipeline stage change. Safe to call on every change: unmapped
 * stages, non-Meta leads, companies without a dataset and events already
 * sent all return without sending.
 *
 * Won carries the deal value only if a price is already saved. It is sent
 * once: Meta has no way to update a received event, so a price entered
 * after the move to Won never reaches Meta.
 */
export async function reportLeadStage(
  leadId: string,
  stage: LeadStage,
  opts: SendOptions = {}
): Promise<SendOutcome> {
  try {
    const mode = opts.mode ?? "live";
    if (mode === "live" && !env.metaCapiEnabled()) return "ineligible";

    const eventName = STAGE_EVENTS[stage];
    if (!eventName) return "ineligible"; // `new` — the raw lead is sent at import

    const origin = await findOriginLead(leadId);
    if (!origin) return "ineligible"; // not a Meta lead — nothing to match on

    let { value, currency } = opts;
    if (stage === "won" && value === undefined) {
      const lead = (await withRetry(() =>
        db().getDocument(DB(), COLLECTIONS.leads, leadId)
      )) as unknown as Lead;
      if (lead.value > 0) {
        value = lead.value;
        currency = lead.currency;
      }
    }

    return await sendEvent(
      { leadId, leadgenId: origin.leadgenId, companyId: origin.companyId },
      eventName,
      buildStageEventId(leadId, eventName),
      { ...opts, value, currency }
    );
  } catch (e) {
    // Last line of defence: reporting must never break a stage change.
    console.error("[meta-capi] reportLeadStage failed for", leadId, e);
    return "failed";
  }
}

/**
 * Report the raw lead — the first stage in Meta's CRM funnel. Called once
 * per imported Meta lead.
 *
 * event_time is the generation time plus one second: Meta discards events
 * that don't occur strictly after the lead was generated.
 */
export async function reportLeadCreated(
  target: Target & { generatedAt: string },
  opts: SendOptions = {}
): Promise<SendOutcome> {
  try {
    const mode = opts.mode ?? "live";
    if (mode === "live" && !env.metaCapiEnabled()) return "ineligible";

    const generated = Math.floor(new Date(target.generatedAt).getTime() / 1000);
    return await sendEvent(target, LEAD_EVENT, buildLeadEventId(target.leadgenId), {
      ...opts,
      eventTime: generated + 1,
    });
  } catch (e) {
    console.error("[meta-capi] reportLeadCreated failed for", target.leadId, e);
    return "failed";
  }
}

/**
 * Backfill only: mark a pre-fix `<leadId>:<eventName>` row as replaced by
 * its CRM-compliant resend, so the lead page and company card don't show the
 * event twice. Returns false when there was nothing to supersede.
 */
export async function supersedeLegacyEvent(
  leadId: string,
  eventName: string
): Promise<boolean> {
  const legacy = await findCapiEvent(`${leadId}:${eventName}`);
  if (!legacy || isSuperseded(legacy)) return false;
  await withRetry(() =>
    db().updateDocument(DB(), COLLECTIONS.metaCapiEvents, legacy.$id, {
      state: "skipped",
      error: `${SUPERSEDED}${buildStageEventId(leadId, eventName)}`,
    })
  );
  return true;
}

// ── Reads for the UI ────────────────────────────────────────
// Superseded pre-fix rows are hidden so a resent event isn't listed twice.
// All tolerate a missing collection so pages still render before
// `npm run db:setup-meta-capi` has been run.

export async function getCapiEventsForCompany(
  companyId: string,
  limit = 10
): Promise<MetaCapiEvent[]> {
  try {
    const res = await withRetry(() =>
      db().listDocuments(DB(), COLLECTIONS.metaCapiEvents, [
        Query.equal("companyId", companyId),
        Query.orderDesc("sentAt"),
        // Over-fetch: superseded rows are filtered out below.
        Query.limit(Math.min(limit * 5, 100)),
      ])
    );
    return (res.documents as unknown as MetaCapiEvent[])
      .filter((r) => !isSuperseded(r))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function getCapiEventsForLead(leadId: string): Promise<MetaCapiEvent[]> {
  try {
    const res = await withRetry(() =>
      db().listDocuments(DB(), COLLECTIONS.metaCapiEvents, [
        Query.equal("leadId", leadId),
        Query.limit(25),
      ])
    );
    return (res.documents as unknown as MetaCapiEvent[]).filter((r) => !isSuperseded(r));
  } catch {
    return [];
  }
}

export async function countFailedCapiEvents(companyId: string): Promise<number> {
  try {
    const res = await withRetry(() =>
      db().listDocuments(DB(), COLLECTIONS.metaCapiEvents, [
        Query.equal("companyId", companyId),
        Query.equal("state", "failed"),
        Query.limit(1),
      ])
    );
    return res.total;
  } catch {
    return 0;
  }
}
