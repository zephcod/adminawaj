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
