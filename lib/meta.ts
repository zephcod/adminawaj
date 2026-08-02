/**
 * Meta Marketing API client — campaign metadata and daily campaign-level
 * insights for a client ad account. Uses a long-lived system-user token
 * (META_ACCESS_TOKEN) with `ads_read` on each client ad account.
 */
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

/** Follow pagination until exhausted. */
async function metaGetAll<T>(firstUrl: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const page: { data: T[]; paging?: MetaPaging } = await metaGet<T>(url);
    out.push(...(page.data ?? []));
    url = page.paging?.next;
  }
  return out;
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
