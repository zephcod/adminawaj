/**
 * CRM outcomes → Meta Conversions API.
 *
 * The outbound half of the Lead Ads loop. lib/meta-leads.ts turns a Meta
 * form fill into a pipeline Lead; this reports back what that Lead became,
 * so each client's ad account can optimise for qualified business instead
 * of raw volume.
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
import { STAGE_EVENTS, type LeadStage, type MetaCapiEvent, type MetaLead } from "./domain";
import { getCompany } from "./data";
import { env } from "./env";
import { postCapiEvents, type CapiEvent } from "./meta";

/** `<leadId>:<eventName>` — stable, so a value re-send dedupes against the first. */
function buildEventId(leadId: string, eventName: string): string {
  return `${leadId}:${eventName}`;
}

/**
 * The meta_leads row a CRM lead came from, most recent first.
 *
 * One Lead can have several: ensurePipelineLead reuses an open lead for a
 * repeat submitter, so the same card may back two form fills. We report the
 * most recent only — one CRM outcome is one conversion, and sending one per
 * leadgen id would double-count it.
 *
 * Needs meta_leads.idx_meta_lead_lead; Appwrite rejects Query.equal on an
 * unindexed attribute.
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

export interface ReportOptions {
  /** Deal value, sent only for a Won event that has a real price. */
  value?: number;
  currency?: string;
}

/**
 * Report a lead's stage as a conversion event. Safe to call on every stage
 * change: unmapped stages, non-Meta leads, companies without a dataset and
 * already-sent events all return without sending.
 */
export async function reportLeadStage(
  leadId: string,
  stage: LeadStage,
  opts: ReportOptions = {}
): Promise<void> {
  try {
    if (!env.metaCapiEnabled()) return;

    const eventName = STAGE_EVENTS[stage];
    if (!eventName) return; // new / contacted / proposal carry no signal

    const origin = await findOriginLead(leadId);
    if (!origin) return; // not a Meta lead — nothing to match on, nothing to log

    const eventId = buildEventId(leadId, eventName);
    const existing = await findCapiEvent(eventId);
    const hasValue = typeof opts.value === "number" && opts.value > 0;

    // Already delivered, and this isn't the value-carrying follow-up.
    if (existing?.state === "sent" && !hasValue) return;
    // The value follow-up is worth sending once, not on every price edit.
    if (existing?.state === "sent" && hasValue && existing.value === opts.value) return;

    // Checked before every write below, not just before the POST: a dry run
    // that leaves rows behind isn't dry.
    const dryRun = env.metaCapiDryRun();

    const company = origin.companyId ? await getCompany(origin.companyId) : null;
    const datasetId = company?.metaDatasetId?.trim();
    if (!datasetId) {
      if (dryRun) {
        console.log(
          `[meta-capi] DRY RUN → would skip ${eventName} for lead ${leadId}: ` +
            `no dataset id on ${company?.name ?? "unknown company"}`
        );
        return;
      }
      // Recorded rather than dropped: a company missing its dataset id is a
      // configuration gap someone should see on the Manage page.
      await recordCapiEvent(existing, {
        eventId,
        leadId,
        leadgenId: origin.leadgenId,
        companyId: origin.companyId ?? null,
        datasetId: "",
        eventName,
        value: hasValue ? opts.value : null,
        currency: hasValue ? (opts.currency ?? null) : null,
        attempts: (existing?.attempts ?? 0) + 1,
        state: "skipped",
        error: company
          ? `No Conversions API dataset set for ${company.name}`
          : "Lead's company not found",
        sentAt: new Date().toISOString(),
      });
      return;
    }

    // Meta requires lead_id as a number.
    const numericLeadId = Number(origin.leadgenId);
    if (!Number.isSafeInteger(numericLeadId)) {
      if (dryRun) {
        console.log(
          `[meta-capi] DRY RUN → would fail ${eventName} for lead ${leadId}: ` +
            `leadgenId "${origin.leadgenId}" is not numeric`
        );
        return;
      }
      await recordCapiEvent(existing, {
        eventId,
        leadId,
        leadgenId: origin.leadgenId,
        companyId: origin.companyId ?? null,
        datasetId,
        eventName,
        attempts: (existing?.attempts ?? 0) + 1,
        state: "failed",
        error: `leadgenId "${origin.leadgenId}" is not a numeric lead_id`,
        sentAt: new Date().toISOString(),
      });
      return;
    }

    const event: CapiEvent = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "system_generated",
      event_id: eventId,
      user_data: { lead_id: numericLeadId },
      ...(hasValue
        ? { custom_data: { value: opts.value!, currency: opts.currency || "ETB" } }
        : {}),
    };

    if (dryRun) {
      console.log(
        `[meta-capi] DRY RUN → dataset ${datasetId}:`,
        JSON.stringify(event)
      );
      return;
    }

    const base = {
      eventId,
      leadId,
      leadgenId: origin.leadgenId,
      companyId: origin.companyId ?? null,
      datasetId,
      eventName,
      value: hasValue ? opts.value : null,
      currency: hasValue ? (opts.currency || "ETB") : null,
      attempts: (existing?.attempts ?? 0) + 1,
      sentAt: new Date().toISOString(),
    };

    try {
      const res = await postCapiEvents(datasetId, [event], env.metaCapiTestEventCode());
      await recordCapiEvent(existing, {
        ...base,
        state: res.eventsReceived > 0 ? "sent" : "failed",
        error: res.messages.length ? res.messages.join("; ").slice(0, 256) : null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await recordCapiEvent(existing, {
        ...base,
        state: "failed",
        error: message.slice(0, 256),
      });
    }
  } catch (e) {
    // Last line of defence: reporting must never break a stage change.
    console.error("[meta-capi] reportLeadStage failed for", leadId, e);
  }
}

// ── Reads for the UI ────────────────────────────────────────
// Both tolerate a missing collection so pages still render before
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
        Query.limit(limit),
      ])
    );
    return res.documents as unknown as MetaCapiEvent[];
  } catch {
    return [];
  }
}

export async function getCapiEventsForLead(leadId: string): Promise<MetaCapiEvent[]> {
  try {
    const res = await withRetry(() =>
      db().listDocuments(DB(), COLLECTIONS.metaCapiEvents, [
        Query.equal("leadId", leadId),
        Query.limit(10),
      ])
    );
    return res.documents as unknown as MetaCapiEvent[];
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
