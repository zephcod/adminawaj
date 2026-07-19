import { Client, Databases, ID, Query } from "node-appwrite";
import { env } from "./env";
import type { Suppression } from "./email-types";

export { ID, Query };

// Domain types shared with client components live in ./domain
export * from "./domain";
// Email-outreach system types (unchanged from the original schema)
export * from "./email-types";

export const COLLECTIONS = {
  contacts: "contacts",
  campaigns: "campaigns",
  sequences: "sequences",
  sequenceSteps: "sequence_steps",
  enrollments: "enrollments",
  sends: "sends",
  suppressions: "suppressions",
  warmup: "warmup_state",
  // ── Lead management (new) ──
  leads: "leads",
  activities: "activities",
} as const;

let _db: Databases | null = null;

/** Server-side Appwrite Databases client (singleton). */
export function db(): Databases {
  if (_db) return _db;
  const client = new Client()
    .setEndpoint(env.appwriteEndpoint())
    .setProject(env.appwriteProjectId())
    .setKey(env.appwriteApiKey());
  _db = new Databases(client);
  return _db;
}

export const DB = () => env.databaseId();

// ── Helpers ───────────────────────────────────────────────

export async function listAll<T>(
  collectionId: string,
  queries: string[] = []
): Promise<T[]> {
  const res = await db().listDocuments(DB(), collectionId, [
    Query.limit(500),
    ...queries,
  ]);
  return res.documents as unknown as T[];
}

export async function isSuppressed(email: string): Promise<boolean> {
  const res = await db().listDocuments(DB(), COLLECTIONS.suppressions, [
    Query.equal("email", email.toLowerCase()),
    Query.limit(1),
  ]);
  return res.total > 0;
}

export async function suppress(
  email: string,
  reason: Suppression["reason"]
): Promise<void> {
  if (await isSuppressed(email)) return;
  await db().createDocument(DB(), COLLECTIONS.suppressions, ID.unique(), {
    email: email.toLowerCase(),
    reason,
  });
}
