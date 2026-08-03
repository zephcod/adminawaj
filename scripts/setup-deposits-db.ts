/**
 * Idempotent Appwrite schema setup for the company deposit ledger, used to
 * compute each company's account balance (deposits − ad spend − additional
 * costs), grouped per parent-campaign group.
 *
 * Run: npm run db:setup-deposits
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
  console.log("Setting up company_deposits schema…\n");

  await ignore409(
    () => databases.createCollection(dbId, "company_deposits", "Company Deposits"),
    "collection"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "company_deposits", "companyId", 36, true),
    "attr companyId"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "company_deposits", "parentCampaign", 256, false),
    "attr parentCampaign"
  );
  await ignore409(
    () => databases.createFloatAttribute(dbId, "company_deposits", "amount", true),
    "attr amount"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "company_deposits", "date", 10, true),
    "attr date"
  );
  await ignore409(
    () => databases.createStringAttribute(dbId, "company_deposits", "note", 512, false),
    "attr note"
  );
  await sleep(1500); // attributes must be available before indexing
  await ignore409(
    () => databases.createIndex(dbId, "company_deposits", "idx_deposit_company", IndexType.Key, ["companyId"]),
    "index idx_deposit_company"
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
