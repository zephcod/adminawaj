/**
 * Idempotent Appwrite schema update: adds the `score` (potential score,
 * 0–100) integer attribute to the `leads` collection.
 *
 * Run: npm run db:add-lead-score
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
  console.log("Adding leads.score attribute…\n");
  try {
    await databases.createIntegerAttribute(dbId, "leads", "score", false, 0, 100);
    console.log("  ✓ attr score");
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string };
    if (err.code === 409) {
      console.log("  • attr score (already exists)");
    } else {
      console.error(`  ✗ attr score: ${err.message}`);
      throw e;
    }
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
