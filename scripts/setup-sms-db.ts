/**
 * Idempotent Appwrite schema setup for the SMS outreach subsystem
 * (AfroMessage integration): sms_campaigns, sms_messages, sms_events,
 * sms_suppressions. Existing collections are left untouched.
 *
 * Run: npm run db:setup-sms
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
  console.log("Setting up SMS outreach schema (AfroMessage)…\n");

  // ── sms_campaigns ──
  console.log("sms_campaigns");
  await ignore409(() => databases.createCollection(dbId, "sms_campaigns", "SMS Campaigns"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_campaigns", "providerCampaignId", 128, false), "attr providerCampaignId");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_campaigns", "name", 256, true), "attr name");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_campaigns", "senderName", 64, true), "attr senderName");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_campaigns", "identifierId", 64, false), "attr identifierId");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_campaigns", "bodyTemplate", 1600, false), "attr bodyTemplate");
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "sms_campaigns",
        "status",
        ["draft", "queued", "sending", "completed", "failed"],
        false,
        "draft"
      ),
    "attr status"
  );
  await ignore409(() => databases.createIntegerAttribute(dbId, "sms_campaigns", "recipientCount", false, undefined, undefined, 0), "attr recipientCount");
  await ignore409(() => databases.createIntegerAttribute(dbId, "sms_campaigns", "deliveredCount", false, undefined, undefined, 0), "attr deliveredCount");
  await ignore409(() => databases.createIntegerAttribute(dbId, "sms_campaigns", "failedCount", false, undefined, undefined, 0), "attr failedCount");
  await ignore409(() => databases.createFloatAttribute(dbId, "sms_campaigns", "estimatedCost", false, undefined, undefined, 0), "attr estimatedCost");
  await ignore409(() => databases.createFloatAttribute(dbId, "sms_campaigns", "actualCost", false, undefined, undefined, 0), "attr actualCost");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_campaigns", "createdBy", 128, false), "attr createdBy");
  await sleep(1500); // attributes must be available before indexing
  await ignore409(
    () => databases.createIndex(dbId, "sms_campaigns", "idx_provider_campaign", IndexType.Unique, ["providerCampaignId"]),
    "index idx_provider_campaign (unique)"
  );
  await ignore409(
    () => databases.createIndex(dbId, "sms_campaigns", "idx_status", IndexType.Key, ["status"]),
    "index idx_status"
  );

  // ── sms_messages ──
  console.log("\nsms_messages");
  await ignore409(() => databases.createCollection(dbId, "sms_messages", "SMS Messages"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "campaignId", 36, false), "attr campaignId");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "contactId", 36, false), "attr contactId");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "providerMessageId", 128, false), "attr providerMessageId");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "toNumber", 20, true), "attr toNumber");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "body", 1600, true), "attr body");
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "sms_messages",
        "state",
        ["pending", "queued", "delivered", "failed"],
        false,
        "pending"
      ),
    "attr state"
  );
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "providerStatusRaw", 32, false), "attr providerStatusRaw");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "providerDescription", 256, false), "attr providerDescription");
  await ignore409(() => databases.createIntegerAttribute(dbId, "sms_messages", "parts", false, undefined, undefined, 0), "attr parts");
  await ignore409(() => databases.createFloatAttribute(dbId, "sms_messages", "cost", false, undefined, undefined, 0), "attr cost");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "errorCode", 64, false), "attr errorCode");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_messages", "errorMessage", 256, false), "attr errorMessage");
  await ignore409(() => databases.createDatetimeAttribute(dbId, "sms_messages", "lastPolledAt", false), "attr lastPolledAt");
  await sleep(1500);
  await ignore409(
    () => databases.createIndex(dbId, "sms_messages", "idx_provider_message_id", IndexType.Unique, ["providerMessageId"]),
    "index idx_provider_message_id (unique)"
  );
  await ignore409(
    () => databases.createIndex(dbId, "sms_messages", "idx_campaign", IndexType.Key, ["campaignId"]),
    "index idx_campaign"
  );
  await ignore409(
    () => databases.createIndex(dbId, "sms_messages", "idx_reconcile", IndexType.Key, ["state", "lastPolledAt"]),
    "index idx_reconcile"
  );
  await ignore409(
    () => databases.createIndex(dbId, "sms_messages", "idx_campaign_phone", IndexType.Key, ["campaignId", "toNumber"]),
    "index idx_campaign_phone"
  );

  // ── sms_events ──
  console.log("\nsms_events");
  await ignore409(() => databases.createCollection(dbId, "sms_events", "SMS Events"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_events", "messageId", 36, true), "attr messageId");
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "sms_events",
        "source",
        ["send_response", "create_callback", "status_callback", "poll"],
        true
      ),
    "attr source"
  );
  await ignore409(() => databases.createStringAttribute(dbId, "sms_events", "statusRaw", 64, false), "attr statusRaw");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_events", "payload", 8192, true), "attr payload");
  await ignore409(() => databases.createDatetimeAttribute(dbId, "sms_events", "receivedAt", true), "attr receivedAt");
  await sleep(1500);
  await ignore409(
    () => databases.createIndex(dbId, "sms_events", "idx_event_message", IndexType.Key, ["messageId"]),
    "index idx_event_message"
  );

  // ── sms_suppressions ──
  console.log("\nsms_suppressions");
  await ignore409(() => databases.createCollection(dbId, "sms_suppressions", "SMS Suppressions"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "sms_suppressions", "phone", 20, true), "attr phone");
  await ignore409(
    () => databases.createEnumAttribute(dbId, "sms_suppressions", "reason", ["unsubscribe", "manual"], true),
    "attr reason"
  );
  await sleep(1500);
  await ignore409(
    () => databases.createIndex(dbId, "sms_suppressions", "idx_phone", IndexType.Unique, ["phone"]),
    "index idx_phone (unique)"
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
