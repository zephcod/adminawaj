/**
 * Idempotent Appwrite schema setup for the Companies / Campaign
 * assignments / Issues features (ported from the standalone `reports` app,
 * which shares this same Appwrite database).
 *
 * Creates the `companies`, `report_campaigns`, `insights_daily`,
 * `report_issues`, and `campaign_costs` collections. Existing collections
 * (contacts, leads, activities, …) are left untouched.
 *
 * Optionally seeds companies from the distinct `company` values on the
 * existing `contacts` collection: npm run db:setup-companies -- --seed-from-contacts
 *
 * Run: npm run db:setup-companies
 */
import "dotenv/config";
import { Client, Databases, ID, IndexType, Query } from "node-appwrite";

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
  console.log("Setting up companies / campaign reporting schema…\n");

  // ── companies ──
  console.log("companies");
  await ignore409(() => databases.createCollection(dbId, "companies", "Companies"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "companies", "name", 256, true), "attr name");
  await ignore409(() => databases.createStringAttribute(dbId, "companies", "pin", 32, true), "attr pin");
  await ignore409(() => databases.createStringAttribute(dbId, "companies", "metaAdAccountId", 64, false), "attr metaAdAccountId");
  await ignore409(() => databases.createStringAttribute(dbId, "companies", "sourceCompany", 256, false), "attr sourceCompany");
  await ignore409(() => databases.createStringAttribute(dbId, "companies", "accountManager", 128, false), "attr accountManager");
  await ignore409(() => databases.createStringAttribute(dbId, "companies", "currency", 8, false, "ETB"), "attr currency");
  await ignore409(
    () => databases.createFloatAttribute(dbId, "companies", "currencyMultiplier", false, undefined, undefined, 250),
    "attr currencyMultiplier"
  );
  await ignore409(() => databases.createBooleanAttribute(dbId, "companies", "active", false, true), "attr active");
  await ignore409(() => databases.createStringAttribute(dbId, "companies", "notes", 2048, false), "attr notes");
  await sleep(1500); // attributes must be available before indexing
  await ignore409(
    () => databases.createIndex(dbId, "companies", "idx_pin", IndexType.Unique, ["pin"]),
    "index idx_pin (unique)"
  );

  // ── report_campaigns ──
  console.log("\nreport_campaigns");
  await ignore409(() => databases.createCollection(dbId, "report_campaigns", "Report Campaigns"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "report_campaigns", "companyId", 36, true), "attr companyId");
  await ignore409(() => databases.createStringAttribute(dbId, "report_campaigns", "metaCampaignId", 64, true), "attr metaCampaignId");
  await ignore409(() => databases.createStringAttribute(dbId, "report_campaigns", "adAccountId", 64, false), "attr adAccountId");
  await ignore409(() => databases.createStringAttribute(dbId, "report_campaigns", "parentCampaign", 256, false), "attr parentCampaign");
  await ignore409(() => databases.createIntegerAttribute(dbId, "report_campaigns", "adCount", false, undefined, undefined, 0), "attr adCount");
  await ignore409(() => databases.createStringAttribute(dbId, "report_campaigns", "name", 512, true), "attr name");
  await ignore409(() => databases.createStringAttribute(dbId, "report_campaigns", "objective", 64, false), "attr objective");
  await ignore409(() => databases.createStringAttribute(dbId, "report_campaigns", "status", 32, false), "attr status");
  await sleep(1500);
  // A campaign belongs to exactly one company (reassignable), so
  // metaCampaignId is globally unique.
  await ignore409(
    () => databases.createIndex(dbId, "report_campaigns", "idx_meta_campaign", IndexType.Unique, ["metaCampaignId"]),
    "index idx_meta_campaign (unique)"
  );
  await ignore409(
    () => databases.createIndex(dbId, "report_campaigns", "idx_company", IndexType.Key, ["companyId"]),
    "index idx_company"
  );

  // ── insights_daily ──
  console.log("\ninsights_daily");
  await ignore409(() => databases.createCollection(dbId, "insights_daily", "Insights Daily"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "insights_daily", "companyId", 36, true), "attr companyId");
  await ignore409(() => databases.createStringAttribute(dbId, "insights_daily", "metaCampaignId", 64, true), "attr metaCampaignId");
  await ignore409(() => databases.createStringAttribute(dbId, "insights_daily", "date", 10, true), "attr date");
  await ignore409(() => databases.createFloatAttribute(dbId, "insights_daily", "spend", false, undefined, undefined, 0), "attr spend");
  await ignore409(() => databases.createIntegerAttribute(dbId, "insights_daily", "impressions", false, undefined, undefined, 0), "attr impressions");
  await ignore409(() => databases.createIntegerAttribute(dbId, "insights_daily", "reach", false, undefined, undefined, 0), "attr reach");
  await ignore409(() => databases.createIntegerAttribute(dbId, "insights_daily", "clicks", false, undefined, undefined, 0), "attr clicks");
  await ignore409(() => databases.createIntegerAttribute(dbId, "insights_daily", "leads", false, undefined, undefined, 0), "attr leads");
  await ignore409(() => databases.createIntegerAttribute(dbId, "insights_daily", "calls", false, undefined, undefined, 0), "attr calls");
  await ignore409(() => databases.createIntegerAttribute(dbId, "insights_daily", "results", false, undefined, undefined, 0), "attr results");
  await ignore409(() => databases.createBooleanAttribute(dbId, "insights_daily", "edited", false, false), "attr edited");
  await ignore409(() => databases.createStringAttribute(dbId, "insights_daily", "notes", 1024, false), "attr notes");
  await sleep(1500);
  await ignore409(
    () => databases.createIndex(dbId, "insights_daily", "idx_row_key", IndexType.Unique, ["companyId", "metaCampaignId", "date"]),
    "index idx_row_key (unique)"
  );
  await ignore409(
    () => databases.createIndex(dbId, "insights_daily", "idx_company_date", IndexType.Key, ["companyId", "date"]),
    "index idx_company_date"
  );

  // ── report_issues ──
  console.log("\nreport_issues");
  await ignore409(() => databases.createCollection(dbId, "report_issues", "Report Issues"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "report_issues", "companyId", 36, true), "attr companyId");
  await ignore409(() => databases.createStringAttribute(dbId, "report_issues", "title", 256, true), "attr title");
  await ignore409(() => databases.createStringAttribute(dbId, "report_issues", "body", 4096, true), "attr body");
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "report_issues",
        "status",
        ["open", "in_progress", "resolved"],
        true
      ),
    "attr status"
  );
  await ignore409(() => databases.createStringAttribute(dbId, "report_issues", "response", 4096, false), "attr response");
  await sleep(1500);
  await ignore409(
    () => databases.createIndex(dbId, "report_issues", "idx_issue_company", IndexType.Key, ["companyId"]),
    "index idx_issue_company"
  );

  // ── campaign_costs ──
  console.log("\ncampaign_costs");
  await ignore409(() => databases.createCollection(dbId, "campaign_costs", "Campaign Costs"), "collection");
  await ignore409(() => databases.createStringAttribute(dbId, "campaign_costs", "companyId", 36, true), "attr companyId");
  await ignore409(() => databases.createStringAttribute(dbId, "campaign_costs", "metaCampaignId", 64, true), "attr metaCampaignId");
  await ignore409(
    () =>
      databases.createEnumAttribute(
        dbId,
        "campaign_costs",
        "category",
        ["creative_production", "strategy", "consultation", "management", "other"],
        true
      ),
    "attr category"
  );
  await ignore409(() => databases.createStringAttribute(dbId, "campaign_costs", "description", 512, false), "attr description");
  await ignore409(() => databases.createFloatAttribute(dbId, "campaign_costs", "amount", true), "attr amount");
  await ignore409(() => databases.createStringAttribute(dbId, "campaign_costs", "date", 10, true), "attr date");
  await sleep(1500);
  await ignore409(
    () => databases.createIndex(dbId, "campaign_costs", "idx_cost_company_date", IndexType.Key, ["companyId", "date"]),
    "index idx_cost_company_date"
  );

  // ── optional: seed companies from leadgen contacts ──
  if (process.argv.includes("--seed-from-contacts")) {
    console.log("\nSeeding companies from contacts.company…");
    try {
      const contacts = await databases.listDocuments(dbId, "contacts", [Query.limit(500)]);
      const names = new Set<string>();
      for (const c of contacts.documents as unknown as { company?: string }[]) {
        if (c.company?.trim()) names.add(c.company.trim());
      }
      const existing = await databases.listDocuments(dbId, "companies", [Query.limit(500)]);
      const have = new Set(
        (existing.documents as unknown as { sourceCompany?: string; name: string }[]).map(
          (d) => (d.sourceCompany ?? d.name).toLowerCase()
        )
      );
      for (const name of names) {
        if (have.has(name.toLowerCase())) {
          console.log(`  • ${name} (already exists)`);
          continue;
        }
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        await databases.createDocument(dbId, "companies", ID.unique(), {
          name,
          sourceCompany: name,
          pin,
          currency: "ETB",
          active: true,
        });
        console.log(`  ✓ ${name} (PIN: ${pin})`);
      }
    } catch (e) {
      console.error("  ✗ seeding failed:", (e as Error).message);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
