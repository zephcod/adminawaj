"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { COLLECTIONS, DB, db, ID } from "@/lib/appwrite";
import { LeadStage, STAGE_LABELS } from "@/lib/domain";
import { notifyImport, notifyNewContact } from "@/lib/notify";

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
