/**
 * Idempotent Appwrite schema update for `campaign_costs`:
 * - Adds the `parentCampaign` string attribute (optional — empty means
 *   "Other campaigns"), so costs can be recorded directly against a
 *   parent-campaign group instead of one specific campaign.
 * - Relaxes `metaCampaignId` to optional — it's now legacy, kept only so
 *   pre-existing per-campaign cost rows still resolve to a group via a
 *   campaign lookup.
 *
 * Run: npm run db:update-costs-parent-group
 */
import "dotenv/config";
import { Client, Databases } from "node-appwrite";

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

async function main() {
  console.log("Updating campaign_costs schema…\n");

  try {
    await databases.createStringAttribute(dbId, "campaign_costs", "parentCampaign", 256, false);
    console.log("  ✓ attr parentCampaign");
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string };
    if (err.code === 409) {
      console.log("  • attr parentCampaign (already exists)");
    } else {
      console.error(`  ✗ attr parentCampaign: ${err.message}`);
      throw e;
    }
  }

  try {
    // This SDK version's updateStringAttribute throws if xdefault is
    // omitted (its .d.ts marks it optional, but the compiled client
    // enforces it), so pass "" explicitly as the default for the now-optional field.
    await databases.updateStringAttribute(dbId, "campaign_costs", "metaCampaignId", false, "", 64);
    console.log("  ✓ attr metaCampaignId (now optional)");
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string };
    console.error(`  ✗ attr metaCampaignId: ${err.message}`);
    throw e;
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
