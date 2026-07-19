/**
 * Typed document shapes for the existing email outreach system.
 * Unchanged from the original schema.
 */

export interface Campaign {
  $id: string;
  name: string;
  type: "cold" | "lead_magnet" | "nurture";
  status: "draft" | "active" | "paused" | "completed";
  sequenceId: string;
  fromEmail: string;
  dailyLimit: number;
  sentToday: number;
  sentTodayDate: string; // YYYY-MM-DD, resets daily
}

export interface Sequence {
  $id: string;
  name: string;
  description?: string;
}

export interface SequenceStep {
  $id: string;
  sequenceId: string;
  order: number;
  templateKey: string;
  subject: string;
  delayHours: number; // delay after the previous step (0 for first step)
  condition: "always" | "no_reply" | "no_open";
}

export interface Enrollment {
  $id: string;
  contactId: string;
  campaignId: string;
  sequenceId: string;
  currentStep: number; // order of the NEXT step to send
  status: "active" | "completed" | "paused" | "replied" | "stopped";
  nextSendAt: string; // ISO datetime
}

export interface Send {
  $id: string;
  contactId: string;
  campaignId?: string;
  templateKey: string;
  subject: string;
  resendId?: string;
  category: "cold" | "lead_magnet" | "transactional" | "warmup" | "nurture";
  status: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained";
  sentAt: string;
}

export interface Suppression {
  $id: string;
  email: string;
  reason: "unsubscribe" | "bounce" | "complaint" | "manual";
}

export interface WarmupState {
  $id: string;
  day: number;
  targetVolume: number;
  sentToday: number;
  date: string; // YYYY-MM-DD
  status: "active" | "paused" | "completed";
  startedAt: string;
}
