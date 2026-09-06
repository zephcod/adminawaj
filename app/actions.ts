"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { COLLECTIONS, DB, db, ID } from "@/lib/appwrite";
import {
  createCompany,
  createCost,
  createDeposit,
  deleteCost,
  deleteDeposit,
  reassignCampaign,
  setCampaignParent,
  updateCompany,
  updateInsight,
  updateIssue,
} from "@/lib/data";
import {
  COST_CATEGORIES,
  ISSUE_STATUSES,
  LeadStage,
  STAGE_LABELS,
  type Contact,
  type CostCategory,
  type IssueStatus,
} from "@/lib/domain";
import { normalizeAdAccountId } from "@/lib/meta";
import { syncMetaLeads, type MetaLeadSyncResult } from "@/lib/meta-leads";
import { notifyImport, notifyNewContact } from "@/lib/notify";
import { resendClient } from "@/lib/send";
import { env } from "@/lib/env";
import { buildSmsCallbackUrl, bulkSendSms, sendSms } from "@/lib/sms/afromessage";
import * as smsData from "@/lib/sms/data";
import { normalizePhone } from "@/lib/sms/phone";
import { buildStatement } from "@/lib/statement";
import { renderStatementEmail } from "@/lib/statement-email";
import { syncAll, syncOne, type CompanySyncResult } from "@/lib/sync";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath("/contacts");
}

// ── Leads ─────────────────────────────────────────────────

export async function createLead(formData: FormData) {
  const contactId = String(formData.get("contactId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!contactId || !title) return;

  const lead = await db().createDocument(DB(), COLLECTIONS.leads, ID.unique(), {
    contactId,
    title,
    stage: "new",
    value: Number(formData.get("value") || 0),
    currency: String(formData.get("currency") || "ETB"),
    services: formData.getAll("services").map(String),
    owner: String(formData.get("owner") || "") || null,
    priority: String(formData.get("priority") || "medium"),
    nextFollowUpAt: formData.get("nextFollowUpAt")
      ? new Date(String(formData.get("nextFollowUpAt"))).toISOString()
      : null,
  });

  await db().createDocument(DB(), COLLECTIONS.activities, ID.unique(), {
    leadId: lead.$id,
    contactId,
    type: "note",
    body: "Lead created.",
    occurredAt: new Date().toISOString(),
  });

  revalidateAll();
}

export async function moveLeadStage(leadId: string, stage: LeadStage) {
  const lead = await db().getDocument(DB(), COLLECTIONS.leads, leadId);
  if (lead.stage === stage) return;

  const closed = stage === "won" || stage === "lost";
  await db().updateDocument(DB(), COLLECTIONS.leads, leadId, {
    stage,
    closedAt: closed ? new Date().toISOString() : null,
  });

  await db().createDocument(DB(), COLLECTIONS.activities, ID.unique(), {
    leadId,
    contactId: lead.contactId,
    type: "stage_change",
    body: `Moved from ${STAGE_LABELS[lead.stage as LeadStage]} to ${STAGE_LABELS[stage]}.`,
    occurredAt: new Date().toISOString(),
  });

  revalidateAll();
  revalidatePath(`/leads/${leadId}`);
}

export async function updateFollowUp(leadId: string, formData: FormData) {
  const raw = String(formData.get("nextFollowUpAt") || "");
  await db().updateDocument(DB(), COLLECTIONS.leads, leadId, {
    nextFollowUpAt: raw ? new Date(raw).toISOString() : null,
  });
  revalidateAll();
  revalidatePath(`/leads/${leadId}`);
}

export async function updateLeadValue(leadId: string, formData: FormData) {
  await db().updateDocument(DB(), COLLECTIONS.leads, leadId, {
    value: Number(formData.get("value") || 0),
    currency: String(formData.get("currency") || "ETB"),
  });
  revalidateAll();
  revalidatePath(`/leads/${leadId}`);
}

export async function updateLeadScore(leadId: string, formData: FormData) {
  const raw = String(formData.get("score") || "");
  const score = raw === "" ? null : Math.max(0, Math.min(100, Number(raw)));
  await db().updateDocument(DB(), COLLECTIONS.leads, leadId, { score });
  revalidateAll();
  revalidatePath(`/leads/${leadId}`);
}

export async function assignOwner(leadId: string, formData: FormData) {
  await db().updateDocument(DB(), COLLECTIONS.leads, leadId, {
    owner: String(formData.get("owner") || "").trim() || null,
  });
  revalidateAll();
  revalidatePath(`/leads/${leadId}`);
}

export async function deleteLead(leadId: string) {
  await db().deleteDocument(DB(), COLLECTIONS.leads, leadId);
  revalidateAll();
}

export async function markLost(leadId: string, formData: FormData) {
  const lead = await db().getDocument(DB(), COLLECTIONS.leads, leadId);
  await db().updateDocument(DB(), COLLECTIONS.leads, leadId, {
    stage: "lost",
    closedAt: new Date().toISOString(),
    lostReason: String(formData.get("lostReason") || "") || null,
  });
  await db().createDocument(DB(), COLLECTIONS.activities, ID.unique(), {
    leadId,
    contactId: lead.contactId,
    type: "stage_change",
    body: `Marked lost${formData.get("lostReason") ? `: ${formData.get("lostReason")}` : "."}`,
    occurredAt: new Date().toISOString(),
  });
  revalidateAll();
  revalidatePath(`/leads/${leadId}`);
}

// ── Activities ────────────────────────────────────────────

export async function addActivity(leadId: string, contactId: string, formData: FormData) {
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  await db().createDocument(DB(), COLLECTIONS.activities, ID.unique(), {
    leadId,
    contactId,
    type: String(formData.get("type") || "note"),
    body,
    createdBy: String(formData.get("createdBy") || "") || null,
    occurredAt: new Date().toISOString(),
  });
  revalidatePath(`/leads/${leadId}`);
}

// ── Contacts ──────────────────────────────────────────────

export async function updateContact(contactId: string, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") || "").trim();
  if (!email || !firstName) return;

  await db().updateDocument(DB(), COLLECTIONS.contacts, contactId, {
    email,
    firstName,
    lastName: String(formData.get("lastName") || "").trim() || null,
    company: String(formData.get("company") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    jobTitle: String(formData.get("jobTitle") || "").trim() || null,
    source: String(formData.get("source") || "manual"),
    status: String(formData.get("status") || "active"),
  });

  revalidateAll();
}

export async function updateContactTags(contactId: string, tags: string[]) {
  await db().updateDocument(DB(), COLLECTIONS.contacts, contactId, {
    tags: [...new Set(tags.filter(Boolean))],
  });
  revalidatePath("/contacts");
}

export async function deleteContact(contactId: string) {
  await db().deleteDocument(DB(), COLLECTIONS.contacts, contactId);
  revalidateAll();
}

export async function createContact(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") || "").trim();
  if (!email || !firstName) return;

  const source = String(formData.get("source") || "manual");
  const lastName = String(formData.get("lastName") || "") || null;
  const company = String(formData.get("company") || "") || null;
  const phone = String(formData.get("phone") || "") || null;

  const doc = await db().createDocument(DB(), COLLECTIONS.contacts, ID.unique(), {
    email,
    firstName,
    lastName,
    company,
    phone,
    jobTitle: String(formData.get("jobTitle") || "") || null,
    status: "active",
    source,
    tags: [],
  });

  // Notify the team for every new contact except manual entries.
  if (source !== "manual") {
    await notifyNewContact({
      firstName,
      lastName: lastName ?? undefined,
      email,
      company: company ?? undefined,
      phone: phone ?? undefined,
      source,
    });
  }

  revalidateAll();

  if (formData.get("thenCreateLead")) {
    redirect(`/pipeline?newLeadFor=${doc.$id}`);
  }
}

/** Import contacts from parsed CSV rows. Skips rows whose email already exists. */
export async function importContacts(
  rows: { email: string; firstName: string; lastName?: string; company?: string; phone?: string }[]
): Promise<{ imported: number; skipped: number }> {
  const { Query } = await import("node-appwrite");
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email || !row.firstName?.trim()) {
      skipped++;
      continue;
    }
    const existing = await db().listDocuments(DB(), COLLECTIONS.contacts, [
      Query.equal("email", email),
      Query.limit(1),
    ]);
    if (existing.total > 0) {
      skipped++;
      continue;
    }
    await db().createDocument(DB(), COLLECTIONS.contacts, ID.unique(), {
      email,
      firstName: row.firstName.trim(),
      lastName: row.lastName?.trim() || null,
      company: row.company?.trim() || null,
      phone: row.phone?.trim() || null,
      status: "active",
      source: "import",
      tags: [],
    });
    imported++;
  }

  // One digest email per import (source "import" ≠ manual), not one per row.
  await notifyImport(imported, skipped);

  revalidateAll();
  return { imported, skipped };
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

// ── Companies ─────────────────────────────────────────────

export async function addCompany(formData: FormData): Promise<void> {
  const name = str(formData, "name");
  const pin = str(formData, "pin");
  if (!name || !/^\d{4,10}$/.test(pin)) {
    throw new Error("Name and a 4–10 digit PIN are required");
  }
  const adAccount = str(formData, "metaAdAccountId");
  await createCompany({
    name,
    pin,
    metaAdAccountId: adAccount ? normalizeAdAccountId(adAccount) : undefined,
    sourceCompany: str(formData, "sourceCompany") || undefined,
    currency: str(formData, "currency") || "ETB",
  });
  revalidatePath("/companies");
}

export async function saveCompany(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const pin = str(formData, "pin");
  if (!id) throw new Error("Missing company id");
  if (pin && !/^\d{4,10}$/.test(pin)) throw new Error("PIN must be 4–10 digits");
  const adAccount = str(formData, "metaAdAccountId");
  const multiplier = Number(formData.get("currencyMultiplier"));
  await updateCompany(id, {
    name: str(formData, "name") || undefined,
    ...(pin ? { pin } : {}),
    metaAdAccountId: adAccount ? normalizeAdAccountId(adAccount) : undefined,
    fbPageId: str(formData, "fbPageId") || undefined,
    accountManager: str(formData, "accountManager") || undefined,
    currency: str(formData, "currency") || "ETB",
    currencyMultiplier: multiplier > 0 ? multiplier : 250,
    active: formData.get("active") === "on",
    notes: str(formData, "notes") || undefined,
  });
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
}

export async function deleteCompany(id: string): Promise<void> {
  await db().deleteDocument(DB(), COLLECTIONS.companies, id);
  revalidatePath("/companies");
}

export async function saveInsightRow(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const companyId = str(formData, "companyId");
  if (!id) throw new Error("Missing row id");
  await updateInsight(id, {
    spend: Number(formData.get("spend")) || 0,
    impressions: Number(formData.get("impressions")) || 0,
    reach: Number(formData.get("reach")) || 0,
    clicks: Number(formData.get("clicks")) || 0,
    leads: Number(formData.get("leads")) || 0,
    calls: Number(formData.get("calls")) || 0,
    results: Number(formData.get("results")) || 0,
  });
  revalidatePath(`/companies/${companyId}`);
}

// ── Campaign assignments ──────────────────────────────────

/**
 * Assign a campaign to a company. Historical insight rows move with it,
 * so both companies' reports stay accurate.
 */
export async function assignCampaign(
  campaignId: string,
  companyId: string
): Promise<{ migrated: number }> {
  const migrated = await reassignCampaign(campaignId, companyId);
  revalidatePath("/campaigns");
  revalidatePath("/companies");
  return { migrated };
}

/** Edit a campaign's parent group from the company manage page. */
export async function saveCampaignDetails(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const companyId = str(formData, "companyId");
  if (!id) throw new Error("Missing campaign id");
  await setCampaignParent(
    id,
    str(formData, "parentCampaign").slice(0, 256) || null
  );
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/campaigns");
}

/** Set or clear a campaign's parent-campaign group. */
export async function saveCampaignParent(
  campaignId: string,
  parent: string
): Promise<void> {
  const trimmed = parent.trim().slice(0, 256);
  await setCampaignParent(campaignId, trimmed || null);
  revalidatePath("/campaigns");
}

// ── Additional costs ──────────────────────────────────────

export async function addCost(formData: FormData): Promise<void> {
  const companyId = str(formData, "companyId");
  const category = str(formData, "category");
  const amount = Number(formData.get("amount"));
  const date = str(formData, "date");
  if (!companyId) throw new Error("Missing company id");
  if (!COST_CATEGORIES.includes(category as CostCategory)) {
    throw new Error("Invalid category");
  }
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  await createCost({
    companyId,
    parentCampaign: str(formData, "parentCampaign").slice(0, 256) || undefined,
    category: category as CostCategory,
    description: str(formData, "description").slice(0, 512) || undefined,
    amount,
    date,
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}

export async function removeCost(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const companyId = str(formData, "companyId");
  if (!id) throw new Error("Missing cost id");
  await deleteCost(id);
  revalidatePath(`/companies/${companyId}`);
}

// ── Deposits ───────────────────────────────────────────────

export async function addDeposit(formData: FormData): Promise<void> {
  const companyId = str(formData, "companyId");
  const amount = Number(formData.get("amount"));
  const date = str(formData, "date");
  if (!companyId) throw new Error("Missing company id");
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  await createDeposit({
    companyId,
    parentCampaign: str(formData, "parentCampaign").slice(0, 256) || undefined,
    amount,
    date,
    note: str(formData, "note").slice(0, 512) || undefined,
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}

export async function removeDeposit(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const companyId = str(formData, "companyId");
  if (!id) throw new Error("Missing deposit id");
  await deleteDeposit(id);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}

// ── Issues ────────────────────────────────────────────────

export async function setIssueStatus(
  issueId: string,
  status: string
): Promise<void> {
  if (!ISSUE_STATUSES.includes(status as IssueStatus)) {
    throw new Error("Invalid status");
  }
  await updateIssue(issueId, { status: status as IssueStatus });
  revalidatePath("/issues");
}

export async function replyToIssue(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const response = str(formData, "response");
  if (!id) throw new Error("Missing issue id");
  await updateIssue(id, { response: response.slice(0, 4096) });
  revalidatePath("/issues");
}

// ── Sync ──────────────────────────────────────────────────

export async function runSync(companyId?: string): Promise<CompanySyncResult[]> {
  const results = companyId ? [await syncOne(companyId)] : await syncAll();
  revalidatePath("/companies");
  if (companyId) {
    revalidatePath(`/companies/${companyId}`);
  }
  return results;
}

/**
 * Pull Lead Ads submissions from every Page-owning company (or one), turning
 * each into a Contact + pipeline Lead. Idempotent — re-running only picks up
 * what the webhook missed.
 */
export async function runMetaLeadSync(
  companyId?: string,
  days = 7
): Promise<MetaLeadSyncResult[]> {
  if (!env.metaLeadsEnabled()) {
    throw new Error("Meta lead ingestion is disabled (META_LEADS_ENABLED=false).");
  }
  const results = await syncMetaLeads(days, companyId);
  revalidateAll();
  revalidatePath("/companies");
  if (companyId) {
    revalidatePath(`/companies/${companyId}`);
  }
  return results;
}

// ── Statement / invoice ───────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email a minimized statement for one parent group to a client. */
export async function emailStatement(input: {
  companyId: string;
  to: string;
  range?: string;
  parent?: string;
  summary?: string;
}): Promise<{ ok: boolean; message: string }> {
  const to = input.to.trim();
  if (!EMAIL_RE.test(to)) return { ok: false, message: "Enter a valid email address." };

  const data = await buildStatement(input.companyId, input.range, input.parent);
  if (!data) return { ok: false, message: "Company not found." };

  try {
    const subject = `Campaign statement — ${data.parentLabel} (${data.since} → ${data.until})`;
    const html = await renderStatementEmail(data, input.summary?.slice(0, 2000));
    const { error } = await resendClient().emails.send({
      from: process.env.FROM_TRANSACTIONAL ?? "Awaj ET <no-reply@awajet.com>",
      to,
      subject,
      html,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: `Statement sent to ${to}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ── SMS ────────────────────────────────────────────────────

const SMS_RECIPIENT_CAP = 500;

/** Single SMS to one contact or a raw phone. Persist-before-send. */
export async function sendSingleSms(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const rawPhone = str(formData, "phone");
  const body = str(formData, "message");
  const contactId = str(formData, "contactId") || undefined;

  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, message: `Invalid phone number: ${rawPhone}` };
  if (!body) return { ok: false, message: "Message body is required." };
  if (await smsData.isPhoneSuppressed(phone)) {
    return { ok: false, message: "This number has opted out of SMS." };
  }

  const row = await smsData.createSmsMessageRow({ contactId, toNumber: phone, body });

  if (!env.smsEnabled() || env.smsDryRun()) {
    revalidatePath("/sms");
    return { ok: true, message: "Saved (SMS sending is disabled — dry run)." };
  }

  const result = await sendSms({
    to: phone,
    message: body,
    sender: env.afromessageSender(),
    from: env.afromessageIdentifierId(),
    callback: buildSmsCallbackUrl("status"),
  });
  if (!result.ok) {
    await smsData.markMessageFailed(row.$id, result.code, result.message);
    return { ok: false, message: `Send failed: ${result.message}` };
  }
  await smsData.setMessageProviderId(row.$id, result.data.message_id);
  revalidatePath("/sms");
  return { ok: true, message: `Sent (message_id ${result.data.message_id}).` };
}

/**
 * Create + launch a bulk SMS campaign. Re-validates everything server-side
 * — never trusts the client-only confirmation dialog.
 */
export async function createSmsCampaign(
  formData: FormData
): Promise<{ ok: boolean; message: string; campaignId?: string }> {
  const name = str(formData, "name");
  const senderName = str(formData, "senderName") || env.afromessageSender();
  const bodyTemplate = str(formData, "bodyTemplate");
  const contactIds = formData.getAll("contactIds").map(String);
  const overrideCap = formData.get("overrideCap") === "on";
  const confirmed = formData.get("confirmed") === "on";

  if (!name || !senderName || !bodyTemplate) {
    return { ok: false, message: "Name, sender, and message body are required." };
  }
  if (!confirmed) {
    return { ok: false, message: "Confirmation step was not completed." };
  }
  if (contactIds.length === 0) {
    return { ok: false, message: "No recipients selected." };
  }
  if (contactIds.length > SMS_RECIPIENT_CAP && !overrideCap) {
    return {
      ok: false,
      message: `${contactIds.length} recipients exceeds the ${SMS_RECIPIENT_CAP} cap. Check "override" to proceed anyway.`,
    };
  }

  // Resolve contacts → phones, normalize, and drop opted-out numbers
  // server-side even though they may have been present in the submitted list.
  const contacts = await Promise.all(
    contactIds.map((id) =>
      db()
        .getDocument(DB(), COLLECTIONS.contacts, id)
        .then((d) => d as unknown as Contact)
        .catch(() => null)
    )
  );
  const candidates = contacts
    .filter((c): c is Contact => !!c)
    .map((c) => ({ contactId: c.$id, phone: c.phone ? normalizePhone(c.phone) : null }))
    .filter((c): c is { contactId: string; phone: string } => !!c.phone);

  const suppressedChecks = await Promise.all(candidates.map((c) => smsData.isPhoneSuppressed(c.phone)));
  const notSuppressed = candidates.filter((_, i) => !suppressedChecks[i]);
  const seen = new Set<string>();
  const deduped = notSuppressed.filter((r) => {
    if (seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });

  if (deduped.length === 0) {
    return { ok: false, message: "No valid, opted-in recipients with a phone number." };
  }

  const campaign = await smsData.createSmsCampaignRow({
    name,
    senderName,
    bodyTemplate,
    recipientCount: deduped.length,
  });

  // Persist a `pending` sms_messages row per recipient BEFORE calling the provider.
  const messageRows = await Promise.all(
    deduped.map((r) =>
      smsData.createSmsMessageRow({
        campaignId: campaign.$id,
        contactId: r.contactId,
        toNumber: r.phone,
        body: bodyTemplate,
      })
    )
  );

  if (!env.smsEnabled() || env.smsDryRun()) {
    revalidatePath("/sms");
    return {
      ok: true,
      message: `Saved ${messageRows.length} messages (dry run — SMS sending disabled).`,
      campaignId: campaign.$id,
    };
  }

  await smsData.updateCampaignStatus(campaign.$id, "queued");
  const { campaignId: providerCampaignId } = await bulkSendSms({
    to: deduped.map((r) => ({ to: r.phone, message: bodyTemplate })),
    sender: senderName,
    from: env.afromessageIdentifierId(),
    campaign: name,
    createCallback: buildSmsCallbackUrl("create"),
    statusCallback: buildSmsCallbackUrl("status"),
  });
  if (providerCampaignId) await smsData.setCampaignProviderId(campaign.$id, providerCampaignId);
  await smsData.updateCampaignStatus(campaign.$id, "sending");

  revalidatePath("/sms");
  return {
    ok: true,
    message: `Campaign launched: ${messageRows.length} messages queued.`,
    campaignId: campaign.$id,
  };
}

/** Manual SMS opt-out (mirrors the email suppression's manual-add path). */
export async function optOutPhone(formData: FormData): Promise<void> {
  const phone = normalizePhone(str(formData, "phone"));
  if (!phone) throw new Error("Invalid phone number");
  await smsData.suppressPhone(phone, "manual");
  revalidatePath("/sms");
}
