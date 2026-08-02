import { getCompanies, getCompany, upsertCampaign, upsertInsight } from "./data";
import {
  fetchAdCounts,
  fetchCampaigns,
  fetchDailyInsights,
  normalizeAdAccountId,
} from "./meta";
import type { Company } from "./domain";

export interface CompanySyncResult {
  companyId: string;
  companyName: string;
  campaigns: number;
  created: number;
  updated: number;
  skippedEdited: number;
  error?: string;
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Sync one Meta ad account. An account may run campaigns for several
 * companies: each insight row is stored under the company its campaign is
 * assigned to (see reassignCampaign). Newly discovered campaigns default
 * to `defaultCompany` and can be reassigned in /campaigns.
 */
export async function syncAccount(
  adAccountId: string,
  defaultCompany: Company,
  daysBack = 30
): Promise<CompanySyncResult> {
  adAccountId = normalizeAdAccountId(adAccountId);
  const result: CompanySyncResult = {
    companyId: defaultCompany.$id,
    companyName: `${defaultCompany.name} (${adAccountId})`,
    campaigns: 0,
    created: 0,
    updated: 0,
    skippedEdited: 0,
  };
  try {
    const campaigns = await fetchCampaigns(adAccountId);
    result.campaigns = campaigns.length;

    // Ads per campaign (non-fatal if unavailable).
    let adCounts = new Map<string, number>();
    try {
      adCounts = await fetchAdCounts(adAccountId);
    } catch {
      // keep previous counts
    }

    // metaCampaignId → assigned companyId (assignments are preserved).
    const assignment = new Map<string, string>();
    for (const c of campaigns) {
      const assignedTo = await upsertCampaign({
        companyId: defaultCompany.$id,
        metaCampaignId: c.id,
        adAccountId,
        name: c.name,
        adCount: adCounts.size > 0 ? adCounts.get(c.id) ?? 0 : undefined,
        objective: c.objective,
        status: c.effective_status,
      });
      assignment.set(c.id, assignedTo);
    }

    const since = dateNDaysAgo(daysBack);
    const until = dateNDaysAgo(0);
    const rows = await fetchDailyInsights(adAccountId, since, until);
    for (const r of rows) {
      const companyId = assignment.get(r.metaCampaignId) ?? defaultCompany.$id;
      const outcome = await upsertInsight({ companyId, ...r });
      if (outcome === "created") result.created++;
      else if (outcome === "updated") result.updated++;
      else result.skippedEdited++;
    }
  } catch (e) {
    result.error = (e as Error).message;
  }
  return result;
}

export async function syncCompany(
  company: Company,
  daysBack = 30
): Promise<CompanySyncResult> {
  if (!company.metaAdAccountId) {
    return {
      companyId: company.$id,
      companyName: company.name,
      campaigns: 0,
      created: 0,
      updated: 0,
      skippedEdited: 0,
      error: "No Meta ad account configured",
    };
  }
  return syncAccount(company.metaAdAccountId, company, daysBack);
}

/**
 * Sync every active company's ad account. Accounts shared by multiple
 * companies are fetched only once (the first active company using the
 * account acts as the default for unassigned campaigns).
 */
export async function syncAll(daysBack = 30): Promise<CompanySyncResult[]> {
  const companies = (await getCompanies()).filter(
    (c) => c.active && c.metaAdAccountId
  );
  const results: CompanySyncResult[] = [];
  const seenAccounts = new Set<string>();
  for (const c of companies) {
    const account = normalizeAdAccountId(c.metaAdAccountId!);
    if (seenAccounts.has(account)) continue;
    seenAccounts.add(account);
    results.push(await syncAccount(account, c, daysBack));
  }
  return results;
}

export async function syncOne(
  companyId: string,
  daysBack = 30
): Promise<CompanySyncResult> {
  const company = await getCompany(companyId);
  if (!company) {
    return {
      companyId,
      companyName: "?",
      campaigns: 0,
      created: 0,
      updated: 0,
      skippedEdited: 0,
      error: "Company not found",
    };
  }
  return syncCompany(company, daysBack);
}
