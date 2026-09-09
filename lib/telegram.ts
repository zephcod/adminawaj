/**
 * Telegram notifications for the Awaj ET team — the same bot pattern the
 * portal app uses: a bot token (from @BotFather) plus the chat id of the
 * team group/DM. Runs alongside the Resend emails in lib/notify.ts, which
 * is the single fan-out point; nothing calls this module directly.
 *
 * Setup:
 *   1. @BotFather → /newbot → copy the token
 *   2. Add the bot to your team group (or DM it /start)
 *   3. Get the chat id: https://api.telegram.org/bot<TOKEN>/getUpdates
 *      (group ids are negative numbers)
 *   4. .env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *
 * Read straight from process.env rather than lib/env.ts, matching the
 * convention documented there for optional secrets (see AFROMESSAGE_TOKEN
 * in lib/sms/client.ts): unconfigured must degrade to a silent no-op, never
 * throw. Notifications are best-effort — a Telegram outage must not block a
 * contact being created or a lead sync finishing.
 */
import type { NewContactInfo, NewLeadInfo } from "./notify";

function configured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function appUrl(): string {
  return process.env.APP_URL ?? "";
}

/** `<a>` to a path in this app, or plain text when APP_URL isn't set. */
function link(path: string, label: string): string {
  const base = appUrl();
  return base ? `<a href="${base}${path}">${esc(label)}</a>` : esc(label);
}

/** Send an HTML-formatted message to the team chat. Never throws. */
export async function sendTelegram(html: string): Promise<void> {
  if (!configured()) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: html,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      // Never log the URL — it carries the bot token.
      console.error("[telegram] sendMessage failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[telegram] notification error:", e);
  }
}

/** New contact — manual entries are filtered out upstream, same as the email. */
export async function telegramNewContact(c: NewContactInfo): Promise<void> {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const lines = [
    `🆕 <b>New contact</b>`,
    `<b>${esc(name)}</b>${c.company ? ` — ${esc(c.company)}` : ""}`,
    "",
    `📧 ${esc(c.email)}`,
    c.phone ? `📞 ${esc(c.phone)}` : "",
    `<i>Source: ${esc(c.source.replace(/_/g, " "))}</i>`,
    "",
    link("/contacts", "Open contacts"),
  ];
  await sendTelegram(lines.filter((l) => l !== "").join("\n"));
}

/**
 * One Meta lead as it arrives via the webhook — this is the hot-lead ping,
 * so the phone number leads and the pipeline card is one tap away.
 */
export async function telegramNewLead(l: NewLeadInfo): Promise<void> {
  const lines = [
    `🔥 <b>New Meta lead</b>`,
    `<b>${esc(l.name)}</b>`,
    "",
    l.phone ? `📞 <b>${esc(l.phone)}</b>` : "",
    l.email ? `📧 ${esc(l.email)}` : "",
    l.company ? `🏢 ${esc(l.company)}` : "",
    l.formName ? `<i>Form: ${esc(l.formName)}</i>` : "",
    l.clientCompany && l.clientCompany !== l.company
      ? `<i>Client: ${esc(l.clientCompany)}</i>`
      : "",
    "",
    link(`/leads/${l.leadId}`, "Open lead"),
  ];
  await sendTelegram(lines.filter((line) => line !== "").join("\n"));
}

/** One digest per CSV import, not one per row. */
export async function telegramImport(imported: number, skipped: number): Promise<void> {
  await sendTelegram(
    `📥 <b>CSV import finished</b>\n` +
      `${imported} new contact${imported === 1 ? "" : "s"}\n` +
      `<i>${skipped} skipped (duplicates/invalid)</i>\n\n` +
      link("/contacts", "Review contacts")
  );
}

/** One digest per Meta Lead Ads sync run, not one per lead. */
export async function telegramMetaLeads(imported: number, failed: number): Promise<void> {
  await sendTelegram(
    `🎯 <b>Meta Lead Ads</b>\n` +
      `${imported} new lead${imported === 1 ? "" : "s"} in the pipeline\n` +
      (failed > 0
        ? `<i>⚠️ ${failed} failed — see the company's Meta Lead Ads card</i>\n`
        : "") +
      `\n${link("/pipeline", "Open pipeline")}`
  );
}
