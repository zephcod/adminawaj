import { Resend } from "resend";
import {
  telegramImport,
  telegramMetaLeads,
  telegramNewContact,
  telegramNewLead,
} from "./telegram";

/**
 * Internal notifications — the single fan-out point for the team.
 *
 * Each notify* function below delivers on two channels in parallel: email
 * via Resend (same account/domain as the outreach app, to NOTIFY_EMAILS
 * from the transactional identity) and Telegram via lib/telegram.ts.
 * Either channel silently no-ops when unconfigured, so running with just
 * one of NOTIFY_EMAILS / TELEGRAM_CHAT_ID set is fine.
 *
 * Failures are logged, never thrown — neither a broken email nor a
 * Telegram outage may block contact creation or a lead sync.
 */

let _resend: Resend | null = null;
function resend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Missing RESEND_API_KEY");
    _resend = new Resend(key);
  }
  return _resend;
}

/* Awaj ET brand tokens (brand guide v1.0) — matches outreach email layout */
const brand = {
  gold: "#F0A93B",
  amber: "#C97D1E",
  navy: "#12121C",
  charcoal: "#2B2B33",
  mist: "#F7F3EC",
  smoke: "#6B6873",
  line: "rgba(43,43,51,0.12)",
};

function recipients(): string[] {
  return (process.env.NOTIFY_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function from(): string {
  return process.env.FROM_TRANSACTIONAL ?? "Awaj ET <no-reply@awajet.com>";
}

function appUrl(): string {
  return process.env.APP_URL ?? "";
}

function shell(title: string, rows: string, footer: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px 0;background:${brand.mist};font-family:'Inter',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:24px;">
      <tr><td style="padding:24px;">
        <p style="margin:0 0 4px;font-family:'Space Grotesk','Segoe UI',Arial,sans-serif;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${brand.amber};">Mission Control</p>
        <p style="margin:0 0 20px;font-family:'Space Grotesk','Segoe UI',Arial,sans-serif;font-size:22px;font-weight:700;color:${brand.charcoal};letter-spacing:-0.01em;">${title}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${brand.charcoal};">${rows}</table>
        ${footer}
        <hr style="border:none;border-top:1px solid ${brand.line};margin:28px 0 12px;">
        <p style="margin:0;font-size:12px;color:${brand.smoke};">Awaj ET · Internal notification from the lead management app.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${brand.smoke};white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:${brand.charcoal};">${value}</td>
  </tr>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface NewContactInfo {
  firstName: string;
  lastName?: string;
  email: string;
  company?: string;
  phone?: string;
  source: string;
}

export async function notifyNewContact(c: NewContactInfo): Promise<void> {
  await Promise.all([emailNewContact(c), telegramNewContact(c)]);
}

async function emailNewContact(c: NewContactInfo): Promise<void> {
  const to = recipients();
  if (to.length === 0) return;

  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const rows = [
    row("Name", esc(name)),
    row("Email", esc(c.email)),
    c.company ? row("Company", esc(c.company)) : "",
    c.phone ? row("Phone", esc(c.phone)) : "",
    row("Source", esc(c.source.replace(/_/g, " "))),
  ].join("");

  const cta = appUrl()
    ? `<p style="margin:24px 0 0;"><a href="${appUrl()}/contacts" style="background:${brand.gold};color:${brand.navy};padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;font-family:'Space Grotesk','Segoe UI',Arial,sans-serif;text-decoration:none;">Open contacts</a></p>`
    : "";

  try {
    await resend().emails.send({
      from: from(),
      to,
      subject: `New contact: ${name}${c.company ? ` — ${c.company}` : ""}`,
      html: shell("New contact landed", rows, cta),
    });
  } catch (e) {
    console.error("[notify] new-contact email failed:", e);
  }
}

export interface NewLeadInfo {
  name: string;
  /** Omitted for phone-only leads, whose address is a synthesized placeholder. */
  email?: string;
  phone?: string;
  /** The lead's own company, as stored on their contact record. */
  company?: string;
  /** The Awaj client whose Page the lead came from — a different thing. */
  clientCompany?: string;
  formName?: string;
  /** Pipeline lead id, for a deep link straight to the card. */
  leadId: string;
}

/**
 * One Meta lead, as it lands. Used by the webhook path only — the poll
 * imports in batches and sends notifyMetaLeads() as a single digest
 * instead, so the two never double-notify for the same lead.
 */
export async function notifyNewLead(l: NewLeadInfo): Promise<void> {
  await Promise.all([emailNewLead(l), telegramNewLead(l)]);
}

async function emailNewLead(l: NewLeadInfo): Promise<void> {
  const to = recipients();
  if (to.length === 0) return;

  const rows = [
    row("Name", esc(l.name)),
    row("Phone", esc(l.phone || "—")),
    row("Email", esc(l.email || "—")),
    l.company ? row("Company", esc(l.company)) : "",
    l.formName ? row("Form", esc(l.formName)) : "",
    // Only when it adds something — the contact's company falls back to the
    // client's name, and repeating it as "Client" would be noise.
    l.clientCompany && l.clientCompany !== l.company
      ? row("Client", esc(l.clientCompany))
      : "",
    row("Source", "Meta Lead Ads"),
  ].join("");

  const cta = appUrl()
    ? `<p style="margin:24px 0 0;"><a href="${appUrl()}/leads/${l.leadId}" style="background:${brand.gold};color:${brand.navy};padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;font-family:'Space Grotesk','Segoe UI',Arial,sans-serif;text-decoration:none;">Open lead</a></p>`
    : "";

  try {
    await resend().emails.send({
      from: from(),
      to,
      subject: `New Meta lead: ${l.name}`,
      html: shell("New lead from Meta", rows, cta),
    });
  } catch (e) {
    console.error("[notify] new-lead email failed:", e);
  }
}

/** One digest per Meta Lead Ads sync run — never one notification per lead. */
export async function notifyMetaLeads(imported: number, failed: number): Promise<void> {
  if (imported === 0) return;
  await Promise.all([
    emailMetaLeads(imported, failed),
    telegramMetaLeads(imported, failed),
  ]);
}

async function emailMetaLeads(imported: number, failed: number): Promise<void> {
  const to = recipients();
  if (to.length === 0) return;

  const rows = [
    row("Imported", String(imported)),
    failed > 0 ? row("Failed", `${failed} (see the company's Meta Lead Ads card)`) : "",
    row("Source", "Meta Lead Ads"),
  ].join("");

  const cta = appUrl()
    ? `<p style="margin:24px 0 0;"><a href="${appUrl()}/pipeline" style="background:${brand.gold};color:${brand.navy};padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;font-family:'Space Grotesk','Segoe UI',Arial,sans-serif;text-decoration:none;">Open pipeline</a></p>`
    : "";

  try {
    await resend().emails.send({
      from: from(),
      to,
      subject: `Meta Lead Ads: ${imported} new lead${imported === 1 ? "" : "s"}`,
      html: shell("Meta leads landed", rows, cta),
    });
  } catch (e) {
    console.error("[notify] meta-leads email failed:", e);
  }
}

export async function notifyImport(imported: number, skipped: number): Promise<void> {
  if (imported === 0) return;
  await Promise.all([emailImport(imported, skipped), telegramImport(imported, skipped)]);
}

async function emailImport(imported: number, skipped: number): Promise<void> {
  const to = recipients();
  if (to.length === 0) return;

  const rows = [
    row("Imported", String(imported)),
    row("Skipped", `${skipped} (duplicates/invalid)`),
    row("Source", "CSV import"),
  ].join("");

  const cta = appUrl()
    ? `<p style="margin:24px 0 0;"><a href="${appUrl()}/contacts" style="background:${brand.gold};color:${brand.navy};padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;font-family:'Space Grotesk','Segoe UI',Arial,sans-serif;text-decoration:none;">Review contacts</a></p>`
    : "";

  try {
    await resend().emails.send({
      from: from(),
      to,
      subject: `Contact import: ${imported} new contact${imported === 1 ? "" : "s"}`,
      html: shell("CSV import finished", rows, cta),
    });
  } catch (e) {
    console.error("[notify] import email failed:", e);
  }
}
