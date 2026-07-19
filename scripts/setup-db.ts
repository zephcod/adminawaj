/**
 * Idempotent Appwrite schema setup for the lead management additions.
 *
 * Creates (or updates) the `leads` and `activities` collections and adds
 * the new optional attributes to the existing `contacts` collection
 * (phone, jobTitle, expanded source enum).
 *
 * Existing email-system collections are left untouched.
 *
 * Run: npm run db:setup
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

async function main() {
  console.log("Setting up lead management schema…\n");

  // ── contacts: new optional attributes ──
  console.log("contacts");
  await ignore409(
    () => databases.createStringAttribute(dbId, "contacts", "phone", 32, false),
    "attr phone"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "contacts", "jobTitle", 128, false),
    "attr jobTitle"
  );
  // Note: Appwrite cannot edit enum elements in place via every SDK version.
  // If your `source` attribute is an enum missing "referral"/"website", update
  // it in the Appwrite console (contacts → attributes → source → edit elements).

  // ── leads ──
  console.log("\nleads");
  await ignore409(() => databases.createCollection(dbId, "leads", "Leads"), "collection");
  await ignore409(
    () => databases.createStringAttribute(dbId, "leads", "contactId", 36, true),
    "attr contactId"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "leads", "title", 256, true),
    "attr title"
  );
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "leads",
        "stage",
        ["new", "contacted", "qualified", "proposal", "won", "lost"],
        true
      ),
    "attr stage"
  );
  await ignore409(
    () => databases.createFloatAttribute(dbId, "leads", "value", true),
    "attr value"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "leads", "currency", 8, false, "ETB"),
    "attr currency"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "leads", "services", 32, false, undefined, true),
    "attr services[]"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "leads", "owner", 64, false),
    "attr owner"
  );
  await ignore409(
    () =>
      databases.createEnumAttribute(dbId, "leads", "priority", ["low", "medium", "high"], false, "medium"),
    "attr priority"
  );
  await ignore409(
    () => databases.createDatetimeAttribute(dbId, "leads", "nextFollowUpAt", false),
    "attr nextFollowUpAt"
  );
  await ignore409(
    () => databases.createDatetimeAttribute(dbId, "leads", "closedAt", false),
    "attr closedAt"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "leads", "lostReason", 512, false),
    "attr lostReason"
  );
  await ignore409(
    () => databases.createIndex(dbId, "leads", "idx_stage", IndexType.Key, ["stage"]),
    "index stage"
  );
  await ignore409(
    () => databases.createIndex(dbId, "leads", "idx_contact", IndexType.Key, ["contactId"]),
    "index contactId"
  );

  // ── activities ──
  console.log("\nactivities");
  await ignore409(
    () => databases.createCollection(dbId, "activities", "Activities"),
    "collection"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "activities", "leadId", 36, true),
    "attr leadId"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "activities", "contactId", 36, true),
    "attr contactId"
  );
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "activities",
        "type",
        ["note", "call", "email", "meeting", "task", "stage_change"],
        true
      ),
    "attr type"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "activities", "body", 4096, true),
    "attr body"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "activities", "createdBy", 64, false),
    "attr createdBy"
  );
  await ignore409(
    () => databases.createDatetimeAttribute(dbId, "activities", "occurredAt", true),
    "attr occurredAt"
  );
  await ignore409(
    () => databases.createIndex(dbId, "activities", "idx_lead", IndexType.Key, ["leadId"]),
    "index leadId"
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
