import { COLLECTIONS, db, DB, ID, listAll, Query, withRetry } from "@/lib/appwrite";
import type {
  SmsCampaign,
  SmsCampaignStatus,
  SmsEvent,
  SmsEventSource,
  SmsMessage,
  SmsMessageState,
  SmsSuppression,
  SmsSuppressionReason,
} from "@/lib/sms-types";
import { classify } from "./statusMap";

// ── Suppressions ──────────────────────────────────────────

export async function isPhoneSuppressed(phone: string): Promise<boolean> {
  const res = await db().listDocuments(DB(), COLLECTIONS.smsSuppressions, [
    Query.equal("phone", phone),
    Query.limit(1),
  ]);
  return res.total > 0;
}

export async function suppressPhone(phone: string, reason: SmsSuppressionReason): Promise<void> {
  if (await isPhoneSuppressed(phone)) return;
  await db().createDocument(DB(), COLLECTIONS.smsSuppressions, ID.unique(), {
    phone,
    reason,
  });
}

/** For UI display only (greying out opted-out contacts in the recipient
 * picker) — the real enforcement is the per-phone check in isPhoneSuppressed,
 * called server-side in the actual send paths. */
export async function listSuppressedPhones(): Promise<Set<string>> {
  const rows = await listAll<SmsSuppression>(COLLECTIONS.smsSuppressions);
  return new Set(rows.map((r) => r.phone));
}

// ── Campaigns ─────────────────────────────────────────────

export async function createSmsCampaignRow(input: {
  name: string;
  senderName: string;
  identifierId?: string;
  bodyTemplate?: string;
  recipientCount: number;
  estimatedCost?: number;
  createdBy?: string;
}): Promise<SmsCampaign> {
  return (await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.smsCampaigns, ID.unique(), {
      name: input.name,
      senderName: input.senderName,
      identifierId: input.identifierId,
      bodyTemplate: input.bodyTemplate,
      status: "draft",
      recipientCount: input.recipientCount,
      deliveredCount: 0,
      failedCount: 0,
      estimatedCost: input.estimatedCost ?? 0,
      actualCost: 0,
      createdBy: input.createdBy,
    })
  )) as unknown as SmsCampaign;
}

export async function setCampaignProviderId(campaignId: string, providerCampaignId: string): Promise<void> {
  await withRetry(() =>
    db().updateDocument(DB(), COLLECTIONS.smsCampaigns, campaignId, { providerCampaignId })
  );
}

export async function updateCampaignStatus(campaignId: string, status: SmsCampaignStatus): Promise<void> {
  await withRetry(() => db().updateDocument(DB(), COLLECTIONS.smsCampaigns, campaignId, { status }));
}

export async function incrementCampaignCounters(
  campaignId: string,
  delta: { delivered?: number; failed?: number }
): Promise<void> {
  const campaign = await getSmsCampaign(campaignId);
  if (!campaign) return;
  await withRetry(() =>
    db().updateDocument(DB(), COLLECTIONS.smsCampaigns, campaignId, {
      deliveredCount: campaign.deliveredCount + (delta.delivered ?? 0),
      failedCount: campaign.failedCount + (delta.failed ?? 0),
    })
  );
}

export async function getSmsCampaign(id: string): Promise<SmsCampaign | null> {
  try {
    return (await db().getDocument(DB(), COLLECTIONS.smsCampaigns, id)) as unknown as SmsCampaign;
  } catch {
    return null;
  }
}

export async function getSmsCampaignByProviderId(providerCampaignId: string): Promise<SmsCampaign | null> {
  const res = await db().listDocuments(DB(), COLLECTIONS.smsCampaigns, [
    Query.equal("providerCampaignId", providerCampaignId),
    Query.limit(1),
  ]);
  return (res.documents[0] as unknown as SmsCampaign) ?? null;
}

export async function listSmsCampaigns(limit = 50): Promise<SmsCampaign[]> {
  return listAll<SmsCampaign>(COLLECTIONS.smsCampaigns, [
    Query.orderDesc("$createdAt"),
    Query.limit(limit),
  ]);
}

// ── Messages ──────────────────────────────────────────────

/** Persist a message row BEFORE calling the provider — a crash mid-send must leave a recoverable trace, not an invisible charge. */
export async function createSmsMessageRow(input: {
  campaignId?: string;
  contactId?: string;
  toNumber: string;
  body: string;
}): Promise<SmsMessage> {
  return (await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.smsMessages, ID.unique(), {
      campaignId: input.campaignId,
      contactId: input.contactId,
      toNumber: input.toNumber,
      body: input.body,
      state: "pending",
      parts: 0,
      cost: 0,
    })
  )) as unknown as SmsMessage;
}

export async function setMessageProviderId(messageId: string, providerMessageId: string): Promise<void> {
  await withRetry(() =>
    db().updateDocument(DB(), COLLECTIONS.smsMessages, messageId, { providerMessageId })
  );
}

export async function markMessageFailed(
  messageId: string,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  await withRetry(() =>
    db().updateDocument(DB(), COLLECTIONS.smsMessages, messageId, {
      state: "failed",
      errorCode: errorCode.slice(0, 64),
      errorMessage: errorMessage.slice(0, 256),
    })
  );
}

export async function findMessageByProviderId(providerMessageId: string): Promise<SmsMessage | null> {
  const res = await db().listDocuments(DB(), COLLECTIONS.smsMessages, [
    Query.equal("providerMessageId", providerMessageId),
    Query.limit(1),
  ]);
  return (res.documents[0] as unknown as SmsMessage) ?? null;
}

/** Used only by the create-callback route, to link a pre-created `pending` row (created before the provider ever assigned a message_id) to the message_id it just reported. */
export async function findPendingMessageByCampaignAndPhone(
  campaignId: string,
  toNumber: string
): Promise<SmsMessage | null> {
  const res = await db().listDocuments(DB(), COLLECTIONS.smsMessages, [
    Query.equal("campaignId", campaignId),
    Query.equal("toNumber", toNumber),
    Query.limit(1),
  ]);
  return (res.documents[0] as unknown as SmsMessage) ?? null;
}

export async function getSmsMessagesForCampaign(campaignId: string): Promise<SmsMessage[]> {
  return listAll<SmsMessage>(COLLECTIONS.smsMessages, [
    Query.equal("campaignId", campaignId),
    Query.orderAsc("toNumber"),
  ]);
}

function isTerminal(state: SmsMessageState): boolean {
  return state === "delivered" || state === "failed";
}

/**
 * Idempotent upsert keyed on providerMessageId, shared by both callback
 * routes and the reconciliation poll so the safety logic isn't duplicated:
 * - A duplicate callback for the same message_id/status is a no-op on
 *   campaign counters (only the state transition INTO a terminal state
 *   increments them, once).
 * - A stale non-terminal update never regresses an already-terminal state.
 * Always appends an sms_events row regardless (append-only audit trail).
 */
export async function upsertMessageStatus(input: {
  providerMessageId: string;
  statusRaw: string;
  description?: string;
  parts?: number;
  cost?: number;
  source: SmsEventSource;
}): Promise<{ messageId: string | null; changed: boolean }> {
  const existing = await findMessageByProviderId(input.providerMessageId);
  if (!existing) {
    // Nothing to attach the event to — most likely a callback for a
    // message this app never created a row for. Nothing else to do.
    return { messageId: null, changed: false };
  }

  const rawUpper = input.statusRaw.toUpperCase();
  const nextState: SmsMessageState =
    input.source === "create_callback" && rawUpper === "QUEUED" ? "queued" : classify(input.statusRaw);

  const wasTerminal = isTerminal(existing.state);
  const regress = wasTerminal && !isTerminal(nextState);

  if (!regress) {
    await withRetry(() =>
      db().updateDocument(DB(), COLLECTIONS.smsMessages, existing.$id, {
        state: nextState,
        providerStatusRaw: input.statusRaw,
        providerDescription: input.description ?? existing.providerDescription,
        parts: input.parts ?? existing.parts,
        cost: input.cost ?? existing.cost,
        lastPolledAt: input.source === "poll" ? new Date().toISOString() : existing.lastPolledAt,
      })
    );
    if (!wasTerminal && isTerminal(nextState) && existing.campaignId) {
      await incrementCampaignCounters(existing.campaignId, {
        [nextState === "delivered" ? "delivered" : "failed"]: 1,
      });
    }
  }

  await appendSmsEvent({
    messageId: existing.$id,
    source: input.source,
    statusRaw: input.statusRaw,
    payload: input,
  });

  return { messageId: existing.$id, changed: !regress };
}

// ── Events (append-only) ──────────────────────────────────

export async function appendSmsEvent(input: {
  messageId: string;
  source: SmsEventSource;
  statusRaw?: string;
  payload: unknown;
}): Promise<void> {
  await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.smsEvents, ID.unique(), {
      messageId: input.messageId,
      source: input.source,
      statusRaw: input.statusRaw,
      payload: JSON.stringify(input.payload).slice(0, 8192),
      receivedAt: new Date().toISOString(),
    })
  );
}

export async function getSmsEventsForMessage(messageId: string): Promise<SmsEvent[]> {
  return listAll<SmsEvent>(COLLECTIONS.smsEvents, [
    Query.equal("messageId", messageId),
    Query.orderDesc("receivedAt"),
  ]);
}

// ── Reconciliation query ──────────────────────────────────

/**
 * Non-terminal messages (pending or queued) whose lastPolledAt is older
 * than `olderThanMs`, oldest-first (never-polled rows sort first), capped
 * at `limit`. Never poll on a page render or per-row in a UI list — this
 * is a background reconciliation query only, consumed by the cron route.
 */
export async function listMessagesDueForReconciliation(
  olderThanMs: number,
  limit: number
): Promise<SmsMessage[]> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const nonTerminalStates: SmsMessageState[] = ["pending", "queued"];

  const batches = await Promise.all(
    nonTerminalStates.flatMap((state) => [
      db().listDocuments(DB(), COLLECTIONS.smsMessages, [
        Query.equal("state", state),
        Query.isNull("lastPolledAt"),
        Query.limit(limit),
      ]),
      db().listDocuments(DB(), COLLECTIONS.smsMessages, [
        Query.equal("state", state),
        Query.lessThanEqual("lastPolledAt", cutoff),
        Query.limit(limit),
      ]),
    ])
  );

  const byId = new Map<string, SmsMessage>();
  for (const batch of batches) {
    for (const doc of batch.documents as unknown as SmsMessage[]) {
      byId.set(doc.$id, doc);
    }
  }

  return [...byId.values()]
    .sort((a, b) => (a.lastPolledAt ?? "").localeCompare(b.lastPolledAt ?? ""))
    .slice(0, limit);
}
