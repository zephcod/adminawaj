import {
  getAllInsights,
  getCampaigns,
  getCompany,
  getCosts,
  getDeposits,
  getInsights,
} from "./data";
import {
  computeTotals,
  DEFAULT_CURRENCY_MULTIPLIER,
  OTHER_PARENT,
  rangeToDates,
  VAT_RATE,
  WHT_RATE,
  WHT_THRESHOLD,
  type CampaignCost,
  type Company,
  type InsightDaily,
  type ReportCampaign,
} from "./domain";

export { OTHER_PARENT };

/**
 * Which parent-campaign group a cost belongs to: its own `parentCampaign`
 * label (current model) if set, else a campaign lookup for legacy rows
 * that only carry `metaCampaignId`.
 */
export function costGroupKey(
  cost: Pick<CampaignCost, "parentCampaign" | "metaCampaignId">,
  campaigns: ReportCampaign[]
): string {
  if (cost.parentCampaign?.trim()) return cost.parentCampaign.trim();
  if (cost.metaCampaignId) {
    const c = campaigns.find((c) => c.metaCampaignId === cost.metaCampaignId);
    if (c?.parentCampaign?.trim()) return c.parentCampaign.trim();
  }
  return OTHER_PARENT;
}

export interface StatementGroupRow {
  id: string;
  name: string;
  ads: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  calls: number;
  spend: number;
}

export interface StatementData {
  company: Company;
  parentKey: string;
  parentLabel: string;
  since: string;
  until: string;
  cur: string;
  rows: StatementGroupRow[];
  totals: ReturnType<typeof computeTotals>;
  costTotal: number;
  subtotal: number;
  vat: number;
  wht: number;
  totalCharge: number;
  totalPayable: number;
  costs: { category: string; description?: string; date: string; amount: number }[];
  parentOptions: { value: string; label: string }[];
}

/**
 * Compute a single-parent-group statement. Shared by the statement page
 * and the email sender so the numbers always agree.
 */
export async function buildStatement(
  companyId: string,
  rangeKey: string | undefined,
  parentParam: string | undefined
): Promise<StatementData | null> {
  const company = await getCompany(companyId);
  if (!company) return null;

  const { since, until } = rangeToDates(rangeKey ?? "30d");
  const [rawRows, campaigns, allCosts] = await Promise.all([
    getInsights(companyId, since, until),
    getCampaigns(companyId),
    getCosts(companyId, since, until),
  ]);

  const multiplier = company.currencyMultiplier ?? DEFAULT_CURRENCY_MULTIPLIER;
  const allRows = rawRows.map((r) => ({ ...r, spend: r.spend * multiplier }));
  const cur = company.currency || "ETB";
  const campaignName = new Map(campaigns.map((c) => [c.metaCampaignId, c.name]));
  const adCountOf = new Map(campaigns.map((c) => [c.metaCampaignId, c.adCount ?? 0]));

  const groupKeys = [
    ...new Set([
      ...campaigns.map((c) => c.parentCampaign?.trim() || OTHER_PARENT),
      ...allCosts.map((c) => costGroupKey(c, campaigns)),
    ]),
  ].sort((a, b) => {
    if (a === OTHER_PARENT) return 1;
    if (b === OTHER_PARENT) return -1;
    return a.localeCompare(b);
  });
  if (groupKeys.length === 0) groupKeys.push(OTHER_PARENT);

  const parentKey = groupKeys.includes(parentParam ?? "")
    ? (parentParam as string)
    : groupKeys[0];
  const parentLabel = parentKey === OTHER_PARENT ? "Other campaigns" : parentKey;

  const groupCampaignIds = new Set(
    campaigns
      .filter((c) => (c.parentCampaign?.trim() || OTHER_PARENT) === parentKey)
      .map((c) => c.metaCampaignId)
  );
  const rows = allRows.filter((r) => groupCampaignIds.has(r.metaCampaignId));
  const costs = allCosts.filter((c) => costGroupKey(c, campaigns) === parentKey);

  const byCampaign = new Map<string, InsightDaily[]>();
  for (const r of rows) {
    const list = byCampaign.get(r.metaCampaignId) ?? [];
    list.push(r);
    byCampaign.set(r.metaCampaignId, list);
  }
  const groupRows: StatementGroupRow[] = [...byCampaign.entries()]
    .map(([id, list]) => {
      const t = computeTotals(list);
      return {
        id,
        name: campaignName.get(id) ?? id,
        ads: adCountOf.get(id) ?? 0,
        impressions: t.impressions,
        reach: t.reach,
        clicks: t.clicks,
        leads: t.leads,
        calls: t.calls,
        spend: t.spend,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const totals = computeTotals(rows);
  const costTotal = costs.reduce((n, c) => n + c.amount, 0);
  const subtotal = totals.spend + costTotal;
  const vat = subtotal * VAT_RATE;
  const wht = subtotal > WHT_THRESHOLD ? subtotal * WHT_RATE : 0;
  const totalCharge = subtotal + vat;
  const totalPayable = totalCharge - wht;

  return {
    company,
    parentKey,
    parentLabel,
    since,
    until,
    cur,
    rows: groupRows,
    totals,
    costTotal,
    subtotal,
    vat,
    wht,
    totalCharge,
    totalPayable,
    costs: costs.map((c) => ({
      category: c.category,
      description: c.description,
      date: c.date,
      amount: c.amount,
    })),
    parentOptions: groupKeys.map((k) => ({
      value: k,
      label: k === OTHER_PARENT ? "Other campaigns" : k,
    })),
  };
}

export interface CompanyBalanceGroup {
  parentKey: string;
  parentLabel: string;
  deposits: number;
  adSpend: number;
  costs: number;
  balance: number;
}

export interface CompanyBalance {
  total: number;
  byGroup: CompanyBalanceGroup[];
}

/**
 * Lifetime account balance per parent-campaign group: deposits − ad spend
 * − additional costs. `total` sums every group. A group can exist purely
 * from a logged deposit even before any campaign is assigned to it.
 */
export async function computeCompanyBalance(companyId: string): Promise<CompanyBalance> {
  const company = await getCompany(companyId);
  if (!company) return { total: 0, byGroup: [] };

  const [campaigns, allInsights, allCosts, allDeposits] = await Promise.all([
    getCampaigns(companyId),
    getAllInsights(companyId),
    getCosts(companyId),
    getDeposits(companyId),
  ]);

  const multiplier = company.currencyMultiplier ?? DEFAULT_CURRENCY_MULTIPLIER;
  const groupOf = (v: string | undefined) => v?.trim() || OTHER_PARENT;

  const groupKeys = new Set<string>();
  for (const c of campaigns) groupKeys.add(groupOf(c.parentCampaign));
  for (const c of allCosts) groupKeys.add(costGroupKey(c, campaigns));
  for (const d of allDeposits) groupKeys.add(groupOf(d.parentCampaign));

  const byGroup: CompanyBalanceGroup[] = [...groupKeys].map((key) => {
    const campaignIds = new Set(
      campaigns.filter((c) => groupOf(c.parentCampaign) === key).map((c) => c.metaCampaignId)
    );
    const adSpend = allInsights
      .filter((r) => campaignIds.has(r.metaCampaignId))
      .reduce((n, r) => n + r.spend * multiplier, 0);
    const costs = allCosts
      .filter((c) => costGroupKey(c, campaigns) === key)
      .reduce((n, c) => n + c.amount, 0);
    const deposits = allDeposits
      .filter((d) => groupOf(d.parentCampaign) === key)
      .reduce((n, d) => n + d.amount, 0);
    return {
      parentKey: key,
      parentLabel: key === OTHER_PARENT ? "Other campaigns" : key,
      deposits,
      adSpend,
      costs,
      balance: deposits - adSpend - costs,
    };
  });

  return { total: byGroup.reduce((n, g) => n + g.balance, 0), byGroup };
}
