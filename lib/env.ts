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
};
