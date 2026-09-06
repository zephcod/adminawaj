/**
 * Meta Graph API client. Two concerns share one long-lived system-user
 * token (META_ACCESS_TOKEN):
 *
 *  - Marketing API: campaign metadata and daily campaign-level insights
 *    for a client ad account. Needs `ads_read` on each ad account.
 *  - Lead Ads: the actual submissions behind the `leads` insight count.
 *    Needs `leads_retrieval` on each client *Page*, and runs against a
 *    Page access token exchanged from the system-user token.
 */
import { createHmac } from "node:crypto";
import { env } from "./env";

const BASE = () => `https://graph.facebook.com/${env.metaApiVersion()}`;

/**
 * Meta ad accounts must be addressed as "act_<id>". Accept bare numeric
 * IDs (a common copy-paste from Ads Manager) and normalize them —
 * querying "/<id>/campaigns" without the prefix fails with
 * "(#100) Tried accessing nonexisting field (campaigns)".
 */
export function normalizeAdAccountId(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

interface MetaPaging {
  next?: string;
}

async function metaGet<T>(url: string): Promise<{ data: T[]; paging?: MetaPaging }> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Meta API error: ${msg}`);
  }
  return json;
}

/**
 * Follow pagination until exhausted, or until `maxPages` is reached.
 * Ad-account edges are shallow; the Lead Ads `/leads` edge is not, so
 * callers reading leads pass a bound rather than looping indefinitely.
 */
async function metaGetAll<T>(firstUrl: string, maxPages = Infinity): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = firstUrl;
  for (let page = 0; url && page < maxPages; page++) {
    const res: { data: T[]; paging?: MetaPaging } = await metaGet<T>(url);
    out.push(...(res.data ?? []));
    url = res.paging?.next;
  }
  return out;
}

/**
 * Single-object GET. `metaGet` assumes the `{ data: [...] }` list envelope;
 * node endpoints like /{page-id} and /{leadgen-id} return a bare object.
 */
async function metaGetOne<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Meta API error: ${msg}`);
  }
  return json as T;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  effective_status?: string;
}

export async function fetchCampaigns(adAccountId: string): Promise<MetaCampaign[]> {
  const params = new URLSearchParams({
    fields: "id,name,objective,effective_status",
    limit: "100",
    access_token: env.metaAccessToken(),
  });
  return metaGetAll<MetaCampaign>(
    `${BASE()}/${normalizeAdAccountId(adAccountId)}/campaigns?${params}`
  );
}

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  campaign_id: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: MetaAction[];
}

export interface DailyCampaignInsight {
  metaCampaignId: string;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  calls: number;
  /** leads + calls + follows + engagement + messaging conversations. */
  results: number;
}

const LEAD_ACTION_TYPES = new Set([
  "lead",
  "leadgen_grouped",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
]);

const CALL_ACTION_TYPES = new Set([
  "click_to_call_call_confirm",
  "onsite_conversion.click_to_call_call_confirm",
  "click_to_call_native_call_placed",
  "onsite_conversion.click_to_call_native_call_placed",
  "phone_number_clicks",
]);

// Page follows / likes.
const FOLLOW_ACTION_TYPES = new Set([
  "like", // page likes
  "onsite_conversion.follow",
  "follow",
]);

// Post / page engagement.
const ENGAGEMENT_ACTION_TYPES = new Set(["post_engagement", "page_engagement"]);

// Messaging conversations started.
const MESSAGE_ACTION_TYPES = new Set([
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
]);

/**
 * Meta reports overlapping action types for the same event; take the max
 * to avoid double counting.
 */
function extractMax(actions: MetaAction[] | undefined, types: Set<string>): number {
  if (!actions) return 0;
  let max = 0;
  for (const a of actions) {
    if (types.has(a.action_type)) {
      max = Math.max(max, Number(a.value) || 0);
    }
  }
  return max;
}

/**
 * Daily, campaign-level insights for the given inclusive date range
 * (YYYY-MM-DD strings).
 */
export async function fetchDailyInsights(
  adAccountId: string,
  since: string,
  until: string
): Promise<DailyCampaignInsight[]> {
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: "campaign_id,spend,impressions,reach,clicks,actions",
    limit: "500",
    access_token: env.metaAccessToken(),
  });
  const rows = await metaGetAll<MetaInsightRow>(
    `${BASE()}/${normalizeAdAccountId(adAccountId)}/insights?${params}`
  );
  return rows.map((r) => {
    const leads = extractMax(r.actions, LEAD_ACTION_TYPES);
    const calls = extractMax(r.actions, CALL_ACTION_TYPES);
    const follows = extractMax(r.actions, FOLLOW_ACTION_TYPES);
    const engagement = extractMax(r.actions, ENGAGEMENT_ACTION_TYPES);
    const messages = extractMax(r.actions, MESSAGE_ACTION_TYPES);
    return {
      metaCampaignId: r.campaign_id,
      date: r.date_start,
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      reach: Number(r.reach) || 0,
      clicks: Number(r.clicks) || 0,
      leads,
      calls,
      results: leads + calls + follows + engagement + messages,
    };
  });
}

// ── Lead Ads ────────────────────────────────────────────────
//
// Retrieving the people who filled in a lead form is a Page-scoped
// operation: it needs `leads_retrieval` on a *Page* access token, not the
// ad-account `ads_read` the insights calls above use. So every call here
// exchanges the system-user token for a page token first.

/**
 * Apps with "Require App Secret" enabled reject calls without an
 * `appsecret_proof` (HMAC-SHA256 of the access token, keyed by the app
 * secret). Added only when META_APP_SECRET is configured — harmless on
 * apps that don't require it, and the whole Lead Ads poll still works
 * without the secret set.
 */
function withProof(params: URLSearchParams, token: string): URLSearchParams {
  // env.metaAppSecret() rejects anything that isn't a real 32-hex app secret,
  // so a paste error can't turn every lead call into "Invalid appsecret_proof".
  const secret = env.metaAppSecret();
  if (secret) {
    params.set("appsecret_proof", createHmac("sha256", secret).update(token).digest("hex"));
  }
  return params;
}

function leadParams(token: string, extra: Record<string, string> = {}): URLSearchParams {
  return withProof(new URLSearchParams({ ...extra, access_token: token }), token);
}

// Page tokens don't expire while the system user's token is valid, so one
// exchange per page per process is plenty (same shape as the SMS balance cache).
const pageTokenCache = new Map<string, string>();

/**
 * Exchange the system-user token for a Page access token. Falls back to the
 * system token when Meta returns no `access_token` field — some setups grant
 * lead access directly, and failing here would block the whole page's sync.
 */
export async function fetchPageAccessToken(pageId: string): Promise<string> {
  const cached = pageTokenCache.get(pageId);
  if (cached) return cached;

  const system = env.metaAccessToken();
  const params = leadParams(system, { fields: "access_token" });
  const res = await metaGetOne<{ access_token?: string }>(
    `${BASE()}/${pageId}?${params}`
  );
  const token = res.access_token || system;
  pageTokenCache.set(pageId, token);
  return token;
}

export interface MetaLeadgenForm {
  id: string;
  name?: string;
  status?: string;
}

/** Every lead form on a Page (including archived ones — filter by `status`). */
export async function fetchLeadgenForms(
  pageId: string,
  pageToken: string
): Promise<MetaLeadgenForm[]> {
  const params = leadParams(pageToken, { fields: "id,name,status", limit: "100" });
  return metaGetAll<MetaLeadgenForm>(`${BASE()}/${pageId}/leadgen_forms?${params}`, 20);
}

export interface MetaLeadField {
  name: string;
  values: string[];
}

export interface MetaLeadRow {
  id: string;
  created_time: string;
  field_data: MetaLeadField[];
}

// Ad/adset/campaign attribution is deliberately not requested: the insights
// sync already reports campaign-level lead counts, and storing it per lead
// would widen meta_leads for no reader.
const LEAD_FIELDS = "id,created_time,field_data";

/** Leads submitted on `formId` after `sinceUnix` (seconds). */
export async function fetchFormLeads(
  formId: string,
  pageToken: string,
  sinceUnix: number
): Promise<MetaLeadRow[]> {
  const params = leadParams(pageToken, {
    fields: LEAD_FIELDS,
    limit: "100",
    filtering: JSON.stringify([
      { field: "time_created", operator: "GREATER_THAN", value: sinceUnix },
    ]),
  });
  return metaGetAll<MetaLeadRow>(`${BASE()}/${formId}/leads?${params}`, 50);
}

/** One lead by id — the webhook payload carries only the id, not the answers. */
export async function fetchLead(
  leadgenId: string,
  pageToken: string
): Promise<MetaLeadRow> {
  const params = leadParams(pageToken, { fields: LEAD_FIELDS });
  return metaGetOne<MetaLeadRow>(`${BASE()}/${leadgenId}?${params}`);
}

/** Count ads per campaign across the ad account. */
export async function fetchAdCounts(
  adAccountId: string
): Promise<Map<string, number>> {
  const params = new URLSearchParams({
    fields: "campaign_id",
    limit: "500",
    access_token: env.metaAccessToken(),
  });
  const ads = await metaGetAll<{ campaign_id?: string }>(
    `${BASE()}/${normalizeAdAccountId(adAccountId)}/ads?${params}`
  );
  const counts = new Map<string, number>();
  for (const ad of ads) {
    if (!ad.campaign_id) continue;
    counts.set(ad.campaign_id, (counts.get(ad.campaign_id) ?? 0) + 1);
  }
  return counts;
}
