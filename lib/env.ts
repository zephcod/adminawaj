function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export const env = {
  appwriteEndpoint: () => req("APPWRITE_ENDPOINT"),
  appwriteProjectId: () => req("APPWRITE_PROJECT_ID"),
  appwriteApiKey: () => req("APPWRITE_API_KEY"),
  databaseId: () => req("APPWRITE_DATABASE_ID"),
  metaAccessToken: () => req("META_ACCESS_TOKEN"),
  metaApiVersion: () => process.env.META_API_VERSION ?? "v21.0",
  cronSecret: () => req("CRON_SECRET"),
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
