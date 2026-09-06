/**
 * Meta Lead Ads → CRM ingestion.
 *
 * A lead reaches us two ways — pushed by Meta's `leadgen` webhook, or found
 * by the backfill poll — and both funnel through the single `ingestLead`
 * below so the idempotency and dedupe rules exist in exactly one place.
 * Each new lead becomes a Contact plus a pipeline Lead in the `new` stage,
 * attributed to the Company whose `fbPageId` owns the form's Page.
 */
import { COLLECTIONS, DB, db, ID, Query, withRetry } from "./appwrite";
import type { Company, Lead, MetaLead, MetaLeadDelivery } from "./domain";
import { getCompanies } from "./data";
import {
  fetchFormLeads,
  fetchLeadgenForms,
  fetchPageAccessToken,
  type MetaLeadField,
  type MetaLeadRow,
} from "./meta";
import { notifyMetaLeads } from "./notify";
import { normalizePhone } from "./sms/phone";

/**
 * Meta's standard lead-form field names → Contact fields. Anything not
 * listed is a custom question and is preserved verbatim in `extras`, which
 * is where the real qualification detail usually lives.
 */
const FIELD_ALIASES: Record<string, keyof MappedLead> = {
  email: "email",
  email_address: "email",
  work_email: "email",
  full_name: "fullName",
  name: "fullName",
  first_name: "firstName",
  last_name: "lastName",
  phone_number: "phone",
  phone: "phone",
  work_phone_number: "phone",
  company_name: "company",
  company: "company",
  job_title: "jobTitle",
};

interface MappedLead {
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  extras: Record<string, string>;
}

/** Split a Meta `field_data` array into known Contact fields plus custom answers. */
export function mapLeadFields(fieldData: MetaLeadField[]): MappedLead {
  const out: MappedLead = { extras: {} };
  for (const f of fieldData ?? []) {
    const value = (f.values ?? []).filter(Boolean).join(", ").trim();
    if (!value) continue;
    const key = FIELD_ALIASES[f.name?.toLowerCase().trim() ?? ""];
    if (key && key !== "extras") {
      // First answer wins — Meta can repeat a field across form pages.
      if (!out[key]) out[key] = value;
    } else {
      out.extras[f.name] = value;
    }
  }
  // A form asking for "full name" instead of first/last is the common case.
  if (!out.firstName && out.fullName) {
    const [first, ...rest] = out.fullName.split(/\s+/);
    out.firstName = first;
    if (rest.length) out.lastName = rest.join(" ");
  }
  return out;
}

/**
 * Meta lead forms very often collect a phone number and nothing else, but
 * `contacts.email` is required. Synthesize a deterministic placeholder so
 * the same lead re-ingested later collides on email instead of duplicating.
 * The domain is reserved-by-convention and never routable — these contacts
 * are for calling and SMS, not email.
 */
const PLACEHOLDER_DOMAIN = "meta.lead.local";

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(`@${PLACEHOLDER_DOMAIN}`);
}

function resolveEmail(
  mapped: MappedLead,
  phone: string | null,
  leadgenId: string
): string {
  const given = mapped.email?.toLowerCase().trim();
  if (given && given.includes("@")) return given;
  const digits = (phone ?? mapped.phone ?? "").replace(/[^\d+]/g, "");
  if (digits) return `${digits}@${PLACEHOLDER_DOMAIN}`;
  return `lead-${leadgenId}@${PLACEHOLDER_DOMAIN}`;
}

// ── Ingest ──────────────────────────────────────────────────

export type IngestOutcome = "imported" | "duplicate" | "failed";

export interface IngestContext {
  pageId: string;
  company?: Company;
  formName?: string;
  deliveredBy: MetaLeadDelivery;
}

async function findMetaLead(leadgenId: string): Promise<MetaLead | null> {
  const res = await withRetry(() =>
    db().listDocuments(DB(), COLLECTIONS.metaLeads, [
      Query.equal("leadgenId", leadgenId),
      Query.limit(1),
    ])
  );
  return res.total > 0 ? (res.documents[0] as unknown as MetaLead) : null;
}

/** Write (or repair) the meta_leads audit row for this lead. */
async function recordMetaLead(
  existing: MetaLead | null,
  row: Record<string, unknown>
): Promise<void> {
  if (existing) {
    await withRetry(() =>
      db().updateDocument(DB(), COLLECTIONS.metaLeads, existing.$id, row)
    );
    return;
  }
  await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.metaLeads, ID.unique(), row)
  );
}

/**
 * Idempotent ingest of one Meta lead. Safe to call repeatedly with the same
 * `leadgen_id` — the unique index on meta_leads.leadgenId is the real guard,
 * the lookup below is just the fast path. A row left in `failed` state IS
 * retried, so a transient Appwrite or Graph error self-heals on the next poll.
 */
export async function ingestLead(
  lead: MetaLeadRow,
  ctx: IngestContext
): Promise<IngestOutcome> {
  const existing = await findMetaLead(lead.id);
  if (existing && existing.state !== "failed") return "duplicate";

  const base = {
    leadgenId: lead.id,
    pageId: ctx.pageId,
    formName: ctx.formName?.slice(0, 128) ?? null,
    companyId: ctx.company?.$id ?? null,
    createdTimeMeta: new Date(lead.created_time).toISOString(),
    fieldData: JSON.stringify(lead.field_data ?? []).slice(0, 4096),
    deliveredBy: ctx.deliveredBy,
  };

  try {
    const mapped = mapLeadFields(lead.field_data ?? []);
    // normalizePhone is Ethiopia-only; keep the raw value when it can't be
    // resolved rather than dropping the only way to reach this person.
    const e164 = mapped.phone ? normalizePhone(mapped.phone) : null;
    const phone = e164 ?? mapped.phone ?? null;
    const email = resolveEmail(mapped, e164, lead.id);
    const firstName = mapped.firstName || mapped.company || "Meta lead";

    const contactId = await upsertContact({
      email,
      firstName,
      lastName: mapped.lastName ?? null,
      company: mapped.company ?? ctx.company?.sourceCompany ?? ctx.company?.name ?? null,
      phone,
      jobTitle: mapped.jobTitle ?? null,
      formName: ctx.formName,
    });

    const leadId = await ensurePipelineLead(contactId, {
      name: [firstName, mapped.lastName].filter(Boolean).join(" "),
      formName: ctx.formName,
      companyName: ctx.company?.name,
      extras: mapped.extras,
      pageId: ctx.pageId,
    });

    await recordMetaLead(existing, {
      ...base,
      contactId,
      leadId,
      state: "imported",
      error: null,
    });
    return "imported";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Never let a bad lead vanish — record it so the next poll retries it.
    try {
      await recordMetaLead(existing, {
        ...base,
        state: "failed",
        error: message.slice(0, 256),
      });
    } catch (recordError) {
      console.error("[meta-leads] could not record failed lead", lead.id, recordError);
    }
    return "failed";
  }
}

async function upsertContact(c: {
  email: string;
  firstName: string;
  lastName: string | null;
  company: string | null;
  phone: string | null;
  jobTitle: string | null;
  formName?: string;
}): Promise<string> {
  const existing = await withRetry(() =>
    db().listDocuments(DB(), COLLECTIONS.contacts, [
      Query.equal("email", c.email),
      Query.limit(1),
    ])
  );
  if (existing.total > 0) {
    const doc = existing.documents[0];
    // Fill in blanks a previous touchpoint left empty; never overwrite
    // something a human may have corrected by hand.
    const patch: Record<string, unknown> = {};
    if (!doc.phone && c.phone) patch.phone = c.phone;
    if (!doc.company && c.company) patch.company = c.company;
    if (!doc.jobTitle && c.jobTitle) patch.jobTitle = c.jobTitle;
    if (Object.keys(patch).length > 0) {
      await withRetry(() =>
        db().updateDocument(DB(), COLLECTIONS.contacts, doc.$id, patch)
      );
    }
    return doc.$id;
  }

  const tags = ["meta"];
  if (c.formName) tags.push(c.formName.slice(0, 32));
  const doc = await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.contacts, ID.unique(), {
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      phone: c.phone,
      jobTitle: c.jobTitle,
      status: "active",
      source: "meta_lead_ads",
      tags,
    })
  );
  return doc.$id;
}

/**
 * Create the pipeline lead — unless this contact already has an open one.
 * A repeat submitter (the same person filling in two forms, or a re-run of
 * an ad) should land as an activity on their existing card, not a second
 * card someone has to reconcile by hand.
 */
async function ensurePipelineLead(
  contactId: string,
  info: {
    name: string;
    formName?: string;
    companyName?: string;
    extras: Record<string, string>;
    pageId: string;
  }
): Promise<string> {
  const open = await withRetry(() =>
    db().listDocuments(DB(), COLLECTIONS.leads, [
      Query.equal("contactId", contactId),
      // Two clauses, not one array — Appwrite ANDs filters, and notEqual
      // takes a single value.
      Query.notEqual("stage", "won"),
      Query.notEqual("stage", "lost"),
      Query.limit(1),
    ])
  );

  const answers = Object.entries(info.extras)
    .map(([q, a]) => `• ${q}: ${a}`)
    .join("\n");
  const origin = info.formName
    ? `form "${info.formName}"`
    : `page ${info.pageId}`;
  const body = [`Imported from Meta Lead Ads — ${origin}.`, answers]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4096);

  let leadId: string;
  if (open.total > 0) {
    leadId = (open.documents[0] as unknown as Lead).$id;
  } else {
    const title = [info.name || "Meta lead", info.formName ?? info.companyName]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 256);
    const doc = await withRetry(() =>
      db().createDocument(DB(), COLLECTIONS.leads, ID.unique(), {
        contactId,
        title,
        stage: "new",
        value: 0,
        currency: "ETB",
        services: [],
        priority: "medium",
      })
    );
    leadId = doc.$id;
  }

  await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.activities, ID.unique(), {
      leadId,
      contactId,
      type: "note",
      body,
      occurredAt: new Date().toISOString(),
    })
  );
  return leadId;
}

// ── Backfill poll ───────────────────────────────────────────

export interface MetaLeadSyncResult {
  companyId: string;
  companyName: string;
  pageId: string;
  forms: number;
  fetched: number;
  imported: number;
  duplicates: number;
  failed: number;
  error?: string;
}

/** Companies that own a Facebook Page, deduped so a shared page syncs once. */
async function pagesToSync(companyId?: string): Promise<Company[]> {
  const companies = await getCompanies();
  const seen = new Set<string>();
  const out: Company[] = [];
  for (const c of companies) {
    const pageId = c.fbPageId?.trim();
    if (!pageId) continue;
    if (companyId ? c.$id !== companyId : !c.active) continue;
    if (seen.has(pageId)) {
      console.warn(
        `[meta-leads] page ${pageId} is claimed by more than one company; ` +
          `syncing it under "${out.find((o) => o.fbPageId?.trim() === pageId)?.name}" only`
      );
      continue;
    }
    seen.add(pageId);
    out.push(c);
  }
  return out;
}

async function syncCompanyLeads(
  company: Company,
  sinceUnix: number
): Promise<MetaLeadSyncResult> {
  const result: MetaLeadSyncResult = {
    companyId: company.$id,
    companyName: company.name,
    pageId: company.fbPageId!.trim(),
    forms: 0,
    fetched: 0,
    imported: 0,
    duplicates: 0,
    failed: 0,
  };

  // One bad page (missing leads_retrieval, deleted page, expired grant) must
  // not take the rest of the run down — same contract as lib/sync.ts.
  try {
    const pageToken = await fetchPageAccessToken(result.pageId);
    const forms = await fetchLeadgenForms(result.pageId, pageToken);
    result.forms = forms.length;

    for (const form of forms) {
      const leads = await fetchFormLeads(form.id, pageToken, sinceUnix);
      result.fetched += leads.length;
      for (const lead of leads) {
        const outcome = await ingestLead(lead, {
          pageId: result.pageId,
          company,
          formName: form.name,
          deliveredBy: "poll",
        });
        if (outcome === "imported") result.imported++;
        else if (outcome === "duplicate") result.duplicates++;
        else result.failed++;
      }
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

/**
 * Backfill every Page-owning company. Runs on a cron and from the admin UI;
 * the webhook is the primary path, this is the safety net for deliveries
 * Meta dropped or that failed while Appwrite was unavailable.
 */
export async function syncMetaLeads(
  days = 7,
  companyId?: string
): Promise<MetaLeadSyncResult[]> {
  const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;
  const companies = await pagesToSync(companyId);

  const results: MetaLeadSyncResult[] = [];
  for (const company of companies) {
    results.push(await syncCompanyLeads(company, sinceUnix));
  }

  const imported = results.reduce((n, r) => n + r.imported, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  // One digest per run, not one per lead.
  await notifyMetaLeads(imported, failed);

  return results;
}

// ── Reads for the UI ────────────────────────────────────────

// Both tolerate a missing collection so the Manage-company page still renders
// before `npm run db:setup-meta-leads` has been run.

export async function getMetaLeadsForCompany(
  companyId: string,
  limit = 10
): Promise<MetaLead[]> {
  try {
    const res = await withRetry(() =>
      db().listDocuments(DB(), COLLECTIONS.metaLeads, [
        Query.equal("companyId", companyId),
        Query.orderDesc("createdTimeMeta"),
        Query.limit(limit),
      ])
    );
    return res.documents as unknown as MetaLead[];
  } catch {
    return [];
  }
}

export async function countFailedMetaLeads(companyId: string): Promise<number> {
  try {
    const res = await withRetry(() =>
      db().listDocuments(DB(), COLLECTIONS.metaLeads, [
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
