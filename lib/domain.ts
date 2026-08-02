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
  source: "cold" | "lead_magnet" | "manual" | "import" | "referral" | "website";
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
 * Agency-side cost recorded against a campaign (creative production,
 * strategy overhead, consultation, …). Amounts are entered in the
 * company's report currency — the currency multiplier does NOT apply.
 */
export interface CampaignCost {
  $id: string;
  $createdAt: string;
  companyId: string;
  metaCampaignId: string;
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
