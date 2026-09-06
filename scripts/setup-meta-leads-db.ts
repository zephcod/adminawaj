/**
 * Idempotent Appwrite schema setup for Meta Lead Ads ingestion:
 *
 *  - creates the `meta_leads` collection (raw ingest log, keyed by Meta's
 *    leadgen_id) with its attributes and indexes. Kept deliberately narrow —
 *    Appwrite's per-row width is limited, and the form's own answers live in
 *    `fieldData` rather than in a column each;
 *  - makes sure `contacts.source` accepts "meta_lead_ads";
 *  - adds `fbPageId` to `companies` (present in the live DB but missing from
 *    scripts/setup-companies-db.ts, so a fresh setup would lack it).
 *
 * Safe to re-run. Existing collections and data are left untouched.
 *
 * Run: npm run db:setup-meta-leads
 */
import "dotenv/config";
import { Client, Databases, IndexType } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT!;
const projectId = process.env.APPWRITE_PROJECT_ID!;
const apiKey = process.env.APPWRITE_API_KEY!;
const dbId = process.env.APPWRITE_DATABASE_ID!;

if (!endpoint || !projectId || !apiKey || !dbId) {
  console.error("Missing env vars — copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function ignore409<T>(fn: () => Promise<T>, label: string): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string };
    if (err.code === 409) {
      console.log(`  • ${label} (already exists)`);
    } else {
      console.error(`  ✗ ${label}: ${err.message}`);
      throw e;
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NEW_SOURCE = "meta_lead_ads";

/**
 * Make sure `contacts.source` can hold "meta_lead_ads".
 *
 * The attribute is a plain string in this database, not an enum — Appwrite
 * reports enums with `format: "enum"` plus an `elements` list, and this one
 * has neither. A plain string needs no migration at all, only enough width.
 * Calling updateEnumAttribute on it answers 500 general_unknown, so branch
 * on the actual shape rather than assuming (setup-db.ts's comment left it
 * open which one it was).
 */
async function ensureContactSource(): Promise<void> {
  const attr = (await databases.getAttribute(dbId, "contacts", "source")) as unknown as {
    format?: string;
    elements?: string[];
    size?: number;
    required?: boolean;
    default?: string | null;
  };

  if (attr.format !== "enum" || !attr.elements) {
    if ((attr.size ?? 0) < NEW_SOURCE.length) {
      throw new Error(
        `contacts.source is ${attr.size} chars wide — too narrow for "${NEW_SOURCE}". ` +
          `Widen it in the Appwrite console.`
      );
    }
    console.log(
      `  • source is a plain string(${attr.size}) — "${NEW_SOURCE}" fits, no change needed`
    );
    return;
  }

  // Enum: Appwrite cannot append to `elements`, the whole list is re-sent.
  if (attr.elements.includes(NEW_SOURCE)) {
    console.log(`  • enum source already includes "${NEW_SOURCE}"`);
    return;
  }

  // node-appwrite 15's compiled updateEnumAttribute throws
  // 'Missing required parameter: "xdefault"' when the argument is undefined,
  // even though the .d.ts marks it optional — pass the current default
  // explicitly (null when the attribute has none).
  const xdefault = (attr.default ?? null) as unknown as string;

  await databases.updateEnumAttribute(
    dbId,
    "contacts",
    "source",
    [...attr.elements, NEW_SOURCE],
    attr.required ?? false,
    xdefault
  );
  console.log(`  ✓ enum source += "${NEW_SOURCE}"`);
}

async function main() {
  console.log("Setting up Meta Lead Ads schema…\n");

  // ── meta_leads ──
  console.log("meta_leads");
  await ignore409(
    () => databases.createCollection(dbId, "meta_leads", "Meta Leads"),
    "collection"
  );
  await ignore409(() => databases.createStringAttribute(dbId, "meta_leads", "leadgenId", 64, true), "attr leadgenId");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_leads", "pageId", 64, true), "attr pageId");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_leads", "formName", 128, false), "attr formName");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_leads", "companyId", 36, false), "attr companyId");
  await ignore409(() => databases.createDatetimeAttribute(dbId, "meta_leads", "createdTimeMeta", true), "attr createdTimeMeta");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_leads", "fieldData", 4096, true), "attr fieldData");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_leads", "contactId", 36, false), "attr contactId");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_leads", "leadId", 36, false), "attr leadId");
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "meta_leads",
        "state",
        ["imported", "duplicate", "failed"],
        false,
        "imported"
      ),
    "attr state"
  );
  await ignore409(() => databases.createStringAttribute(dbId, "meta_leads", "error", 256, false), "attr error");
  await ignore409(
    () => databases.createEnumAttribute(dbId, "meta_leads", "deliveredBy", ["webhook", "poll"], true),
    "attr deliveredBy"
  );
  await sleep(1500); // attributes must be available before indexing
  await ignore409(
    () => databases.createIndex(dbId, "meta_leads", "idx_leadgen_id", IndexType.Unique, ["leadgenId"]),
    "index idx_leadgen_id (unique)"
  );
  await ignore409(
    () => databases.createIndex(dbId, "meta_leads", "idx_meta_lead_company", IndexType.Key, ["companyId"]),
    "index idx_meta_lead_company"
  );
  await ignore409(
    () => databases.createIndex(dbId, "meta_leads", "idx_meta_lead_state", IndexType.Key, ["state"]),
    "index idx_meta_lead_state"
  );

  // ── contacts: new source value ──
  console.log("\ncontacts");
  await ensureContactSource();

  // ── companies: fbPageId (already live; keeps a fresh setup correct) ──
  console.log("\ncompanies");
  await ignore409(
    () => databases.createStringAttribute(dbId, "companies", "fbPageId", 64, false),
    "attr fbPageId"
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
