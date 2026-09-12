/**
 * Export every lead in the Qualified stage to a CSV in /public.
 *
 * Columns are limited to fields that actually hold data. Value, score,
 * owner, services and follow-up are all empty across the current qualified
 * set, so they are deliberately left out rather than padding the sheet with
 * 24 blank columns.
 *
 * "Industry / sector" is exported as an EMPTY column to be filled in by
 * hand: nothing in the CRM records it, and the Meta lead form does not ask.
 * Guessing it from a company name would be fabrication.
 *
 * Run: npm run export:qualified-leads
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const endpoint = process.env.APPWRITE_ENDPOINT!;
const projectId = process.env.APPWRITE_PROJECT_ID!;
const apiKey = process.env.APPWRITE_API_KEY!;
const dbId = process.env.APPWRITE_DATABASE_ID!;
const appUrl = process.env.APP_URL ?? "";

if (!endpoint || !projectId || !apiKey || !dbId) {
  console.error("Missing Appwrite env vars.");
  process.exit(1);
}

const headers = { "X-Appwrite-Project": projectId, "X-Appwrite-Key": apiKey };

async function listAll<T>(collection: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const queries = [
      { method: "limit", values: [500] },
      ...(cursor ? [{ method: "cursorAfter", values: [cursor] }] : []),
    ]
      .map((q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`)
      .join("&");
    const res = await fetch(
      `${endpoint}/databases/${dbId}/collections/${collection}/documents?${queries}`,
      { headers }
    );
    const json = await res.json();
    if (json.error || !json.documents) {
      throw new Error(`${collection}: ${json.message ?? "unexpected response"}`);
    }
    out.push(...json.documents);
    if (json.documents.length < 500) break;
    cursor = json.documents[json.documents.length - 1].$id;
  }
  return out;
}

/** Phone-only Meta leads carry a synthesized address that is not contactable. */
function realEmail(email?: string): string {
  if (!email || email.endsWith("@meta.lead.local")) return "";
  return email;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface Lead {
  $id: string;
  contactId: string;
  stage: string;
  title: string;
  $createdAt: string;
}
interface Contact {
  $id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
}
interface MetaLead {
  leadId?: string;
  formName?: string;
  createdTimeMeta?: string;
}

async function main() {
  const [leads, contacts, metaLeads] = await Promise.all([
    listAll<Lead>("leads"),
    listAll<Contact>("contacts"),
    listAll<MetaLead>("meta_leads"),
  ]);

  const contactById = new Map(contacts.map((c) => [c.$id, c]));
  const metaByLead = new Map(
    metaLeads.filter((m) => m.leadId).map((m) => [m.leadId!, m])
  );

  const qualified = leads
    .filter((l) => l.stage === "qualified")
    .map((l) => {
      const c = contactById.get(l.contactId);
      const m = metaByLead.get(l.$id);
      return {
        company: c?.company ?? "",
        industry: "", // not captured anywhere — fill in by hand
        contact: [c?.firstName, c?.lastName].filter(Boolean).join(" "),
        jobTitle: c?.jobTitle ?? "",
        phone: c?.phone ?? "",
        email: realEmail(c?.email),
        submitted: (m?.createdTimeMeta ?? l.$createdAt).slice(0, 10),
        link: appUrl ? `${appUrl}/leads/${l.$id}` : l.$id,
      };
    })
    // Most recent enquiry first.
    .sort((a, b) => b.submitted.localeCompare(a.submitted));

  const columns: [string, keyof (typeof qualified)[number]][] = [
    ["Company", "company"],
    ["Industry / sector", "industry"],
    ["Contact name", "contact"],
    ["Job title", "jobTitle"],
    ["Phone", "phone"],
    ["Email", "email"],
    // No "Campaign / form" column: the webhook path does not record the form
    // name (only the backfill poll does), so it is empty for every lead that
    // arrived in real time — which is now all of them.
    ["Submitted", "submitted"],
    ["Lead link", "link"],
  ];

  const lines = [
    columns.map(([h]) => csvCell(h)).join(","),
    ...qualified.map((r) => columns.map(([, k]) => csvCell(r[k])).join(",")),
  ];

  // UTF-8 BOM: without it Excel mangles the Amharic company and contact names.
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  const file = join(process.cwd(), "public", "qualified-leads.csv");
  writeFileSync(file, csv, "utf8");

  const filled = (k: keyof (typeof qualified)[number]) =>
    qualified.filter((r) => r[k]).length;
  console.log(`Wrote ${qualified.length} qualified leads → public/qualified-leads.csv`);
  console.log(
    `  company ${filled("company")} · job title ${filled("jobTitle")} · ` +
      `phone ${filled("phone")} · email ${filled("email")} · industry 0 (not captured)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
