import { Resend } from "resend";
import { ReactElement } from "react";
import { COLLECTIONS, DB, ID, db, isSuppressed } from "./appwrite";
import type { Send } from "./email-types";

let _resend: Resend | null = null;
export function resendClient(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Missing RESEND_API_KEY");
    _resend = new Resend(key);
  }
  return _resend;
}

/** The outreach app hosts /api/unsubscribe and the email logo. */
function outreachUrl(): string {
  return process.env.OUTREACH_APP_URL ?? "https://cold.awajet.com";
}

export interface SendEmailInput {
  to: string;
  subject: string;
  react: ReactElement;
  category: Send["category"];
  from?: string;
  replyTo?: string;
  contactId?: string;
  campaignId?: string;
  templateKey: string;
  /** Transactional email must be delivered even without marketing consent. */
  skipSuppressionCheck?: boolean;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string }[];
}

const FROM_BY_CATEGORY: Record<Send["category"], () => string> = {
  cold: () => process.env.FROM_COLD ?? "Awaj ET <hello@awajet.com>",
  warmup: () => process.env.FROM_COLD ?? "Awaj ET <hello@awajet.com>",
  lead_magnet: () => process.env.FROM_MARKETING ?? "Awaj ET <hello@awajet.com>",
  nurture: () => process.env.FROM_MARKETING ?? "Awaj ET <hello@awajet.com>",
  transactional: () => process.env.FROM_TRANSACTIONAL ?? "Awaj ET <no-reply@awajet.com>",
};

/**
 * Central send function — same pipeline as the outreach app: suppression
 * check, send log (shared `sends` collection), and List-Unsubscribe headers
 * always apply. Unsubscribe links point at the outreach app, which hosts
 * the /api/unsubscribe endpoint.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<{ id: string | null; skipped?: string }> {
  const to = input.to.toLowerCase().trim();

  if (!input.skipSuppressionCheck && (await isSuppressed(to))) {
    return { id: null, skipped: "suppressed" };
  }

  const unsubscribeUrl = `${outreachUrl()}/api/unsubscribe?email=${encodeURIComponent(to)}`;
  const isMarketing = input.category !== "transactional";

  const { data, error } = await resendClient().emails.send({
    from: input.from ?? FROM_BY_CATEGORY[input.category](),
    to,
    subject: input.subject,
    react: input.react,
    replyTo: input.replyTo ?? process.env.REPLY_TO,
    attachments: input.attachments,
    headers: {
      ...(isMarketing
        ? {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : {}),
      ...input.headers,
    },
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  await db().createDocument(DB(), COLLECTIONS.sends, ID.unique(), {
    contactId: input.contactId ?? "",
    campaignId: input.campaignId ?? "",
    templateKey: input.templateKey,
    subject: input.subject,
    resendId: data?.id ?? "",
    category: input.category,
    status: "sent",
    sentAt: new Date().toISOString(),
  });

  return { id: data?.id ?? null };
}
