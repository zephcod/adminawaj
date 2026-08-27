/**
 * Typed document shapes for the SMS outreach subsystem (AfroMessage).
 * Kept separate from lib/domain.ts / lib/email-types.ts — a distinct,
 * fairly large subsystem, same rationale as email-types.ts.
 *
 * NOTE: `SmsCampaign` is intentionally NOT named `Campaign` — that name is
 * already taken by the email-outreach Campaign in lib/email-types.ts, and
 * by "Meta ad campaign" (ReportCampaign) in lib/domain.ts. See the existing
 * disambiguation comments at lib/appwrite.ts and lib/domain.ts.
 */

export type SmsCampaignStatus =
  | "draft"
  | "queued"
  | "sending"
  | "completed"
  | "failed";

export type SmsMessageState = "pending" | "queued" | "delivered" | "failed";

export type SmsEventSource =
  | "send_response"
  | "create_callback"
  | "status_callback"
  | "poll";

export type SmsSuppressionReason = "unsubscribe" | "manual";

export interface SmsCampaign {
  $id: string;
  $createdAt: string;
  /** AfroMessage campaign_id — filled in only after bulk send responds. */
  providerCampaignId?: string;
  /** Sent as the `campaign` param, visible in the AfroMessage dashboard. */
  name: string;
  senderName: string;
  identifierId?: string;
  /** Pre-personalization message text shown in the composer. */
  bodyTemplate?: string;
  status: SmsCampaignStatus;
  recipientCount: number;
  /** Denormalized counters, updated by upsertMessageStatus — avoids
   * recomputing from sms_messages on every list/detail view. */
  deliveredCount: number;
  failedCount: number;
  estimatedCost: number;
  actualCost: number;
  createdBy?: string;
}

export interface SmsMessage {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  /** Empty for single (non-campaign) sends. */
  campaignId?: string;
  contactId?: string;
  /** AfroMessage message_id — null until the send responds (bulk: until createCallback fires). */
  providerMessageId?: string;
  /** E.164 normalized. */
  toNumber: string;
  /** Exact text sent (post-personalization). */
  body: string;
  state: SmsMessageState;
  providerStatusRaw?: string;
  providerDescription?: string;
  parts: number;
  cost: number;
  errorCode?: string;
  errorMessage?: string;
  /** Null = never polled; reconciliation sorts these first. */
  lastPolledAt?: string;
}

/** Append-only audit trail — sms_events is the source of truth for
 * debugging, sms_message is the projection (per the AfroMessage brief). */
export interface SmsEvent {
  $id: string;
  messageId: string;
  source: SmsEventSource;
  statusRaw?: string;
  /** JSON.stringify'd raw payload — Appwrite has no JSON attribute type. */
  payload: string;
  receivedAt: string;
}

/** Mirrors the email `Suppression` collection exactly, keyed by phone. */
export interface SmsSuppression {
  $id: string;
  phone: string;
  reason: SmsSuppressionReason;
}
