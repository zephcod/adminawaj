import { Client, Databases, ID, Query, Storage } from "node-appwrite";
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
  // ── Lead management ──
  leads: "leads",
  activities: "activities",
  // ── Campaign reporting (shared with the reports app) ──
  // Note: "reportCampaigns" is a distinct Meta ad campaign, unrelated to
  // the email-outreach "campaigns" collection above.
  companies: "companies",
  reportCampaigns: "report_campaigns",
  insights: "insights_daily",
  issues: "report_issues",
  costs: "campaign_costs",
  deposits: "company_deposits",
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

// ── Storage (email attachments bucket, shared with outreach app) ─

export const ATTACHMENTS_BUCKET = () =>
  process.env.APPWRITE_ATTACHMENTS_BUCKET_ID ?? "attachments";

let _storage: Storage | null = null;

export function storage(): Storage {
  if (_storage) return _storage;
  const client = new Client()
    .setEndpoint(env.appwriteEndpoint())
    .setProject(env.appwriteProjectId())
    .setKey(env.appwriteApiKey());
  _storage = new Storage(client);
  return _storage;
}

// ── Transient-error retry ─────────────────────────────────
//
// Appwrite Cloud sits behind a CDN edge that occasionally returns
// "503 first byte timeout" (or 429/5xx) under bursts of sequential
// requests — exactly what a Meta sync produces. Retry those with
// exponential backoff + jitter instead of failing the whole request.

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(e: unknown): boolean {
  const err = e as { code?: number; message?: string };
  if (typeof err.code === "number" && RETRYABLE.has(err.code)) return true;
  // Network-level failures (no HTTP code) are also worth retrying.
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|first byte timeout/i.test(
    err.message ?? ""
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 5
): Promise<T> {
  let delay = 500;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1 || !isRetryable(e)) throw e;
      await sleep(delay + Math.random() * 250);
      delay = Math.min(delay * 2, 8000);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────

export async function listAll<T>(
  collectionId: string,
  queries: string[] = []
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  // Page through in batches of 500.
  for (;;) {
    const page = await withRetry(() =>
      db().listDocuments(DB(), collectionId, [
        Query.limit(500),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ...queries,
      ])
    );
    out.push(...(page.documents as unknown as T[]));
    if (page.documents.length < 500) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return out;
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
