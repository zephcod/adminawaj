/**
 * Idempotent Appwrite schema setup for Meta Conversions API reporting:
 *
 *  - creates `meta_capi_events` (one row per lead+event, the audit log that
 *    keeps "never sent" distinguishable from "sent and rejected"). Kept
 *    narrow — Appwrite limits per-row width, as meta_leads already taught us;
 *  - adds `metaDatasetId` to `companies`;
 *  - adds the `leadId` index to `meta_leads` that the reverse lookup needs
 *    (the attribute exists but Appwrite rejects Query.equal without an index).
 *
 * Safe to re-run. Existing collections and data are left untouched.
 *
 * Run: npm run db:setup-meta-capi
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

async function main() {
  console.log("Setting up Meta Conversions API schema…\n");

  // ── meta_capi_events ──
  console.log("meta_capi_events");
  await ignore409(
    () => databases.createCollection(dbId, "meta_capi_events", "Meta CAPI Events"),
    "collection"
  );
  await ignore409(() => databases.createStringAttribute(dbId, "meta_capi_events", "eventId", 80, true), "attr eventId");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_capi_events", "leadId", 36, true), "attr leadId");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_capi_events", "leadgenId", 64, true), "attr leadgenId");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_capi_events", "companyId", 36, false), "attr companyId");
  // Empty string when an event is skipped for a missing dataset, so the row
  // can still be written and seen.
  await ignore409(() => databases.createStringAttribute(dbId, "meta_capi_events", "datasetId", 64, false), "attr datasetId");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_capi_events", "eventName", 32, true), "attr eventName");
  await ignore409(() => databases.createFloatAttribute(dbId, "meta_capi_events", "value", false), "attr value");
  await ignore409(() => databases.createStringAttribute(dbId, "meta_capi_events", "currency", 8, false), "attr currency");
  await ignore409(
    () => databases.createIntegerAttribute(dbId, "meta_capi_events", "attempts", false, undefined, undefined, 1),
    "attr attempts"
  );
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "meta_capi_events",
        "state",
        ["sent", "skipped", "failed"],
        false,
        "sent"
      ),
    "attr state"
  );
  await ignore409(() => databases.createStringAttribute(dbId, "meta_capi_events", "error", 256, false), "attr error");
  await ignore409(() => databases.createDatetimeAttribute(dbId, "meta_capi_events", "sentAt", true), "attr sentAt");
  await sleep(1500); // attributes must be available before indexing
  await ignore409(
    () => databases.createIndex(dbId, "meta_capi_events", "idx_capi_event_id", IndexType.Unique, ["eventId"]),
    "index idx_capi_event_id (unique)"
  );
  await ignore409(
    () => databases.createIndex(dbId, "meta_capi_events", "idx_capi_lead", IndexType.Key, ["leadId"]),
    "index idx_capi_lead"
  );
  await ignore409(
    () => databases.createIndex(dbId, "meta_capi_events", "idx_capi_company", IndexType.Key, ["companyId"]),
    "index idx_capi_company"
  );
  await ignore409(
    () => databases.createIndex(dbId, "meta_capi_events", "idx_capi_state", IndexType.Key, ["state"]),
    "index idx_capi_state"
  );

  // ── companies: dataset id ──
  console.log("\ncompanies");
  await ignore409(
    () => databases.createStringAttribute(dbId, "companies", "metaDatasetId", 64, false),
    "attr metaDatasetId"
  );

  // ── meta_leads: reverse lookup by leadId ──
  console.log("\nmeta_leads");
  await ignore409(
    () => databases.createIndex(dbId, "meta_leads", "idx_meta_lead_lead", IndexType.Key, ["leadId"]),
    "index idx_meta_lead_lead"
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
