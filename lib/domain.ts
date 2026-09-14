/**
 * Client-safe domain types, constants, and formatters.
 * No server-only imports here — safe to use in "use client" components.
 */

export type ContactStatus = "active" | "unsubscribed" | "bounced" | "complained";

export interface Contact {
  $id: string;
  $createdAt: string;
  email: string;
  firstName: string;
  lastName?: string;
  company?: string;
  phone?: string;
  jobTitle?: string;
  status: ContactStatus;
  source:
    | "cold"
    | "lead_magnet"
    | "manual"
    | "import"
    | "referral"
    | "website"
    | "meta_lead_ads";
  tags: string[];
  notes?: string;
}

export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_SERVICES = [
  "strategy",
  "content",
  "paid_media",
  "social",
  "email",
  "web",
  "branding",
  "full_service",
] as const;
export type LeadService = (typeof LEAD_SERVICES)[number];

export interface Lead {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  contactId: string;
  title: string;
  stage: LeadStage;
  value: number;
  currency: string;
  score?: number;
  services: string[];
  owner?: string;
  priority: "low" | "medium" | "high";
  nextFollowUpAt?: string;
  closedAt?: string;
  lostReason?: string;
}

export type ActivityType =
  | "note"
  | "call"
  | "email"
  | "meeting"
  | "task"
  | "stage_change";

export interface Activity {
  $id: string;
  $createdAt: string;
  leadId: string;
  contactId: string;
  type: ActivityType;
  body: string;
  createdBy?: string;
  occurredAt: string;
}

export interface LeadWithContact extends Lead {
  contact?: Contact;
}

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export function money(value: number, currency = "ETB"): string {
  return `${currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function contactName(c?: Contact): string {
  if (!c) return "Unknown contact";
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

// ── Companies / campaign reporting ──────────────────────────
// Shared with the standalone `reports` app (same Appwrite database).
// "Campaign" here means a Meta ad campaign — unrelated to the
// email-outreach "campaigns" collection used elsewhere in this app.

export interface Company {
  $id: string;
  $createdAt: string;
  name: string;
  /** Login PIN for the reports app's client report dashboard. */
  pin: string;
  /** Meta ad account id, e.g. "act_1234567890". */
  metaAdAccountId?: string;
  /** Facebook Page ID this company's ads run under. */
  fbPageId?: string;
  /**
   * Conversions API dataset (pixel) id that CRM outcomes are reported to.
   * Distinct from metaAdAccountId: several companies can share one ad
   * account, so the dataset is set per company rather than derived. Unset
   * means this company reports nothing to Meta.
   */
  metaDatasetId?: string;
  /** Matches the `company` attribute on leadgen contacts. */
  sourceCompany?: string;
  /** Shown in the client report footer: "Prepared by {accountManager} · Awaj ET". */
  accountManager?: string;
  currency: string;
  /**
   * Multiplier applied to Meta spend when displayed on the client report
   * (e.g. ad account bills in USD, report shows ETB). Default 250.
   * Raw synced values in Appwrite stay untouched.
   */
  currencyMultiplier?: number;
  active: boolean;
  notes?: string;
}

export const DEFAULT_CURRENCY_MULTIPLIER = 250;

export interface ReportCampaign {
  $id: string;
  $createdAt: string;
  /** The company this campaign's data is reported under (reassignable). */
  companyId: string;
  metaCampaignId: string;
  /** Ad account the campaign lives in — one account may serve many companies. */
  adAccountId?: string;
  /**
   * Free-text group label. Campaigns sharing a parent are grouped under
   * it on the client report's campaign table, parent name as the header.
   */
  parentCampaign?: string;
  name: string;
  /** Number of ads under this campaign (refreshed on sync). */
  adCount?: number;
  objective?: string;
  status?: string;
}

export interface InsightDaily {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  companyId: string;
  metaCampaignId: string;
  /** YYYY-MM-DD */
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  /** Calls placed (click-to-call). Optional: older rows predate this field. */
  calls?: number;
  /**
   * Total results = leads + calls + page follows + engagement + messaging
   * conversations started. Synced from Meta; optional for older rows.
   */
  results?: number;
  /** True when a value was manually edited — sync will not overwrite. */
  edited: boolean;
  notes?: string;
}

export const COST_CATEGORIES = [
  "creative_production",
  "strategy",
  "consultation",
  "management",
  "other",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  creative_production: "Creative production",
  strategy: "Strategy overhead",
  consultation: "Consultation",
  management: "Campaign management",
  other: "Other",
};

/**
 * Agency-side cost recorded against a company's parent-campaign group
 * (creative production, strategy overhead, consultation, …). Amounts are
 * entered in the company's report currency — the currency multiplier does
 * NOT apply. Grouped directly by `parentCampaign` (empty/unset = "Other
 * campaigns"), same as deposits — `metaCampaignId` is legacy, kept optional
 * only so pre-existing per-campaign cost rows still resolve to a group via
 * a campaign lookup.
 */
export interface CampaignCost {
  $id: string;
  $createdAt: string;
  companyId: string;
  /** Legacy: costs used to be tied to one specific campaign. */
  metaCampaignId?: string;
  /** Parent-campaign group this cost is charged against; empty = "Other campaigns". */
  parentCampaign?: string;
  category: CostCategory;
  description?: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
}

export const ISSUE_STATUSES = ["open", "in_progress", "resolved"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export interface Issue {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  companyId: string;
  title: string;
  body: string;
  status: IssueStatus;
  /** Awaj ET's reply, shown to the client. */
  response?: string;
}

// ── Meta Lead Ads ingestion ─────────────────────────────────
// Raw log of every lead Meta hands us, keyed by Meta's `leadgen_id`.
// Kept even though leads auto-create a Contact + pipeline Lead: it is what
// makes webhook and poll delivering the same lead safe, and it is the only
// place a form's custom questions survive verbatim.

export type MetaLeadState = "imported" | "duplicate" | "failed";
/** How we learned about the lead: pushed by Meta, or found by the poll. */
export type MetaLeadDelivery = "webhook" | "poll";

export interface MetaLead {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  /** Meta's lead id — the natural key, uniquely indexed. */
  leadgenId: string;
  pageId: string;
  formName?: string;
  /** Resolved from Company.fbPageId; unset when no company owns the page. */
  companyId?: string;
  /** Meta's own `created_time` for the submission. */
  createdTimeMeta: string;
  /**
   * JSON.stringify'd raw `field_data` (Appwrite has no JSON attribute type).
   * Every answer, standard and custom, lives here — the collection stays
   * narrow instead of growing a column per form question.
   */
  fieldData: string;
  contactId?: string;
  leadId?: string;
  state: MetaLeadState;
  error?: string;
  deliveredBy: MetaLeadDelivery;
}

// ── Meta Conversions API (outbound) ─────────────────────────
// The other half of the Lead Ads loop: Meta tells us a form was filled in,
// and these events tell Meta what the lead turned out to be worth, so ad
// accounts can optimise for Conversion Leads instead of raw form fills.

/**
 * Pipeline stage → Meta event name. Meta's CRM spec asks for every stage as
 * it happens, so all are mapped except `new`: the raw lead event is sent once
 * at import (LEAD_EVENT), and moving a lead back to New must not report a
 * second one.
 */
export const STAGE_EVENTS: Partial<Record<LeadStage, string>> = {
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Disqualified",
};

/** The raw-lead stage, sent when a Meta lead is imported. */
export const LEAD_EVENT = "Lead";

/** `custom_data.lead_event_source` — the CRM name Meta shows for these events. */
export const LEAD_EVENT_SOURCE = "Awaj CRM";

export type MetaCapiState = "sent" | "skipped" | "failed";

export interface MetaCapiEvent {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  /**
   * Meta's dedup key, uniquely indexed: `<leadId>:<eventName>:crm` for stage
   * events, `<leadgenId>:Lead:crm` for the raw lead. Rows without the `:crm`
   * suffix predate the CRM-spec fix and are marked superseded by the backfill.
   */
  eventId: string;
  leadId: string;
  /** Meta's lead_id, the match key that makes hashing unnecessary. */
  leadgenId: string;
  companyId?: string;
  datasetId: string;
  eventName: string;
  value?: number;
  currency?: string;
  /** Incremented when a Won event is re-sent carrying the deal value. */
  attempts: number;
  state: MetaCapiState;
  error?: string;
  sentAt: string;
}

/** Inclusive date range presets for the Manage-company daily data table. */
export const RANGE_PRESETS = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "14d", label: "Last 14 days", days: 14 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
] as const;
export type RangeKey = (typeof RANGE_PRESETS)[number]["key"];

export function rangeToDates(key: string): { since: string; until: string } {
  const preset = RANGE_PRESETS.find((p) => p.key === key) ?? RANGE_PRESETS[2];
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - (preset.days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

// ── Statement/invoice aggregates (client statement feature) ──

export interface MetricTotals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  calls: number;
  /** Total results = leads + calls. */
  results: number;
  ctr: number; // %
  cpc: number;
  cpl: number;
  /** Cost per call placed. */
  costPerCall: number;
  /** Cost per result = spend / (leads + calls). */
  cpr: number;
}

export function computeTotals(rows: InsightDaily[]): MetricTotals {
  const t = rows.reduce(
    (acc, r) => {
      acc.spend += r.spend;
      acc.impressions += r.impressions;
      acc.reach += r.reach;
      acc.clicks += r.clicks;
      acc.leads += r.leads;
      acc.calls += r.calls ?? 0;
      // Fall back to leads + calls for rows synced before `results` existed.
      acc.results += r.results ?? r.leads + (r.calls ?? 0);
      return acc;
    },
    { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, calls: 0, results: 0 }
  );
  const results = t.results;
  return {
    ...t,
    results,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpl: t.leads ? t.spend / t.leads : 0,
    costPerCall: t.calls ? t.spend / t.calls : 0,
    cpr: results ? t.spend / results : 0,
  };
}

// ── Ethiopian tax rules for statements ──
export const VAT_RATE = 0.15;
export const WHT_RATE = 0.03;
/** WHT applies only to payments above this amount (ETB). */
export const WHT_THRESHOLD = 10000;

export function num(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Sentinel parent-campaign key for campaigns/deposits with no group label. */
export const OTHER_PARENT = "__other__";

/**
 * A running top-up logged against a company, optionally scoped to one of
 * its parent-campaign groups (see `ReportCampaign.parentCampaign`) —
 * balance per group = deposits − ad spend − additional costs.
 */
export interface CompanyDeposit {
  $id: string;
  $createdAt: string;
  companyId: string;
  /** Parent-campaign group this funds; empty/unset = "Other campaigns". */
  parentCampaign?: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  note?: string;
}
