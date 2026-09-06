function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

/**
 * A Meta app secret is exactly 32 lowercase hex characters. Anything else is
 * a paste error — most often an access token, which is far longer. Reject it
 * here rather than letting it through: a bad secret makes every Graph call
 * fail with "Invalid appsecret_proof", so ignoring it keeps lead syncing
 * working (the proof is optional) while the webhook still fails closed.
 */
let warnedAppSecret = false;

function validAppSecret(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (/^[0-9a-f]{32}$/.test(v.trim())) return v.trim();
  // Once per process — this is read on every Graph call.
  if (!warnedAppSecret) {
    warnedAppSecret = true;
    console.warn(
      `[env] META_APP_SECRET is ${v.length} chars — expected a 32-character hex ` +
        `app secret (App settings → Basic → App secret), not an access token. ` +
        `Ignoring it: appsecret_proof will be omitted and the Meta webhook will reject deliveries.`
    );
  }
  return undefined;
}

export const env = {
  appwriteEndpoint: () => req("APPWRITE_ENDPOINT"),
  appwriteProjectId: () => req("APPWRITE_PROJECT_ID"),
  appwriteApiKey: () => req("APPWRITE_API_KEY"),
  databaseId: () => req("APPWRITE_DATABASE_ID"),
  metaAccessToken: () => req("META_ACCESS_TOKEN"),
  metaApiVersion: () => process.env.META_API_VERSION ?? "v21.0",
  cronSecret: () => req("CRON_SECRET"),
  // ── Meta Lead Ads ──
  // Deliberately NOT req(): these gate the webhook only. A missing secret must
  // make /api/meta/webhook fail closed (403), not crash the poll path — which
  // needs nothing beyond META_ACCESS_TOKEN.
  metaAppSecret: () => validAppSecret(process.env.META_APP_SECRET),
  metaWebhookVerifyToken: () => process.env.META_WEBHOOK_VERIFY_TOKEN || undefined,
  /** Kill switch. Opt-out rather than opt-in — set to "false" to stop ingesting. */
  metaLeadsEnabled: () => process.env.META_LEADS_ENABLED !== "false",
  // ── SMS (AfroMessage) ──
  // Note: AFROMESSAGE_TOKEN is deliberately NOT exposed here — lib/sms/client.ts
  // reads it directly via process.env so a missing token degrades to a
  // graceful CONFIG result instead of throwing (SMS_ENABLED/SMS_DRY_RUN must
  // keep working even before a token is configured).
  afromessageSender: () => process.env.AFROMESSAGE_SENDER ?? "",
  afromessageIdentifierId: () => process.env.AFROMESSAGE_IDENTIFIER_ID || undefined,
  afromessageBaseUrl: () => process.env.AFROMESSAGE_BASE_URL || "https://api.afromessage.com",
  // Deliberately NOT req() — provider callbacks/status-tracking are a nice-to-have
  // on top of the reconciliation poll, not a precondition for sending. A missing
  // secret means callback URLs are omitted (see lib/sms/afromessage.ts's
  // buildSmsCallbackUrl) and the two callback routes fail closed (403) instead
  // of crashing, rather than blocking every send with an unhandled throw.
  afromessageCallbackSecret: () => process.env.AFROMESSAGE_CALLBACK_SECRET || undefined,
  smsEnabled: () => process.env.SMS_ENABLED === "true",
  smsDryRun: () => process.env.SMS_DRY_RUN === "true",
  /** Reused as the callback base URL — already this app's public base. */
  appUrl: () => req("APP_URL"),
};
