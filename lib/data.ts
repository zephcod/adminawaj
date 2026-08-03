import { COLLECTIONS, db, DB, ID, listAll, Query, withRetry } from "./appwrite";
import {
  Activity,
  CampaignCost,
  Company,
  CompanyDeposit,
  Contact,
  CostCategory,
  InsightDaily,
  Issue,
  IssueStatus,
  Lead,
  LeadStage,
  LEAD_STAGES,
  LeadWithContact,
  ReportCampaign,
} from "./domain";

export type { LeadWithContact };
export { contactName, money, STAGE_LABELS } from "./domain";

export async function getContacts(): Promise<Contact[]> {
  return listAll<Contact>(COLLECTIONS.contacts, [Query.orderDesc("$createdAt")]);
}

export async function getLeads(): Promise<LeadWithContact[]> {
  const [leads, contacts] = await Promise.all([
    listAll<Lead>(COLLECTIONS.leads, [Query.orderDesc("$createdAt")]),
    getContacts(),
  ]);
  const byId = new Map(contacts.map((c) => [c.$id, c]));
  return leads.map((l) => ({ ...l, contact: byId.get(l.contactId) }));
}

export async function getLead(id: string): Promise<LeadWithContact | null> {
  try {
    const lead = (await db().getDocument(DB(), COLLECTIONS.leads, id)) as unknown as Lead;
    let contact: Contact | undefined;
    try {
      contact = (await db().getDocument(
        DB(),
        COLLECTIONS.contacts,
        lead.contactId
      )) as unknown as Contact;
    } catch {
      contact = undefined;
    }
    return { ...lead, contact };
  } catch {
    return null;
  }
}

export async function getActivities(leadId: string): Promise<Activity[]> {
  return listAll<Activity>(COLLECTIONS.activities, [
    Query.equal("leadId", leadId),
    Query.orderDesc("occurredAt"),
  ]);
}

// ── Dashboard metrics ─────────────────────────────────────

export interface DashboardMetrics {
  openPipelineValue: number;
  wonValueThisMonth: number;
  openLeadCount: number;
  activeContacts: number;
  stageCounts: Record<LeadStage, number>;
  sourceCounts: { source: string; count: number }[];
  overdueFollowUps: LeadWithContact[];
  recentLeads: LeadWithContact[];
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [leads, contacts] = await Promise.all([getLeads(), getContacts()]);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const open = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const won = leads.filter((l) => l.stage === "won");

  const stageCounts = Object.fromEntries(
    LEAD_STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length])
  ) as Record<LeadStage, number>;

  const sourceMap = new Map<string, number>();
  for (const l of leads) {
    const src = l.contact?.source ?? "unknown";
    sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
  }

  return {
    openPipelineValue: open.reduce((s, l) => s + (l.value || 0), 0),
    wonValueThisMonth: won
      .filter((l) => l.closedAt && new Date(l.closedAt) >= monthStart)
      .reduce((s, l) => s + (l.value || 0), 0),
    openLeadCount: open.length,
    activeContacts: contacts.filter((c) => c.status === "active").length,
    stageCounts,
    sourceCounts: [...sourceMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    overdueFollowUps: open
      .filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) < now)
      .sort(
        (a, b) =>
          new Date(a.nextFollowUpAt!).getTime() - new Date(b.nextFollowUpAt!).getTime()
      ),
    recentLeads: leads.slice(0, 6),
  };
}

// ── Companies ─────────────────────────────────────────────

export async function getCompanies(): Promise<Company[]> {
  return listAll<Company>(COLLECTIONS.companies, [Query.orderAsc("name")]);
}

export async function getCompany(id: string): Promise<Company | null> {
  try {
    return (await db().getDocument(
      DB(),
      COLLECTIONS.companies,
      id
    )) as unknown as Company;
  } catch {
    return null;
  }
}

export async function createCompany(
  data: Partial<Omit<Company, "$id" | "$createdAt">> & {
    name: string;
    pin: string;
  }
): Promise<Company> {
  return (await db().createDocument(DB(), COLLECTIONS.companies, ID.unique(), {
    currency: "ETB",
    active: true,
    ...data,
  })) as unknown as Company;
}

export async function updateCompany(
  id: string,
  data: Partial<Omit<Company, "$id" | "$createdAt">>
): Promise<void> {
  await db().updateDocument(DB(), COLLECTIONS.companies, id, data);
}

// ── Campaigns (Meta ad campaigns, reassignable between companies) ──

export async function getCampaigns(companyId: string): Promise<ReportCampaign[]> {
  return listAll<ReportCampaign>(COLLECTIONS.reportCampaigns, [
    Query.equal("companyId", companyId),
    Query.orderAsc("name"),
  ]);
}

export async function getAllCampaigns(): Promise<ReportCampaign[]> {
  return listAll<ReportCampaign>(COLLECTIONS.reportCampaigns, [Query.orderAsc("name")]);
}

/**
 * Upsert a campaign keyed by metaCampaignId alone. If the campaign already
 * exists, its company assignment is PRESERVED (an admin may have reassigned
 * it to a different company sharing the same ad account) and only metadata
 * is refreshed. Returns the companyId the campaign is assigned to.
 */
export async function upsertCampaign(c: {
  companyId: string;
  metaCampaignId: string;
  adAccountId?: string;
  name: string;
  adCount?: number;
  objective?: string;
  status?: string;
}): Promise<string> {
  const existing = await withRetry(() =>
    db().listDocuments(DB(), COLLECTIONS.reportCampaigns, [
      Query.equal("metaCampaignId", c.metaCampaignId),
      Query.limit(1),
    ])
  );
  if (existing.total > 0) {
    const doc = existing.documents[0] as unknown as ReportCampaign;
    await withRetry(() =>
      db().updateDocument(DB(), COLLECTIONS.reportCampaigns, doc.$id, {
        name: c.name,
        objective: c.objective ?? null,
        status: c.status ?? null,
        ...(c.adAccountId ? { adAccountId: c.adAccountId } : {}),
        ...(c.adCount !== undefined ? { adCount: c.adCount } : {}),
      })
    );
    return doc.companyId;
  }
  await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.reportCampaigns, ID.unique(), c)
  );
  return c.companyId;
}

/** Set (or clear) a campaign's parent-campaign group label. */
export async function setCampaignParent(
  campaignId: string,
  parentCampaign: string | null
): Promise<void> {
  await withRetry(() =>
    db().updateDocument(DB(), COLLECTIONS.reportCampaigns, campaignId, {
      parentCampaign,
    })
  );
}

/**
 * Move a campaign to another company and migrate its existing daily
 * insight rows so historical data follows the assignment.
 * Returns the number of insight rows migrated.
 */
export async function reassignCampaign(
  campaignId: string,
  newCompanyId: string
): Promise<number> {
  const campaign = (await db().getDocument(
    DB(),
    COLLECTIONS.reportCampaigns,
    campaignId
  )) as unknown as ReportCampaign;
  if (campaign.companyId === newCompanyId) return 0;

  await withRetry(() =>
    db().updateDocument(DB(), COLLECTIONS.reportCampaigns, campaignId, {
      companyId: newCompanyId,
    })
  );

  const rows = await listAll<InsightDaily>(COLLECTIONS.insights, [
    Query.equal("metaCampaignId", campaign.metaCampaignId),
  ]);
  let migrated = 0;
  for (const r of rows) {
    if (r.companyId === newCompanyId) continue;
    await withRetry(() =>
      db().updateDocument(DB(), COLLECTIONS.insights, r.$id, {
        companyId: newCompanyId,
      })
    );
    migrated++;
  }
  return migrated;
}

// ── Daily insights ────────────────────────────────────────

export async function getInsights(
  companyId: string,
  since: string,
  until: string
): Promise<InsightDaily[]> {
  return listAll<InsightDaily>(COLLECTIONS.insights, [
    Query.equal("companyId", companyId),
    Query.greaterThanEqual("date", since),
    Query.lessThanEqual("date", until),
    Query.orderAsc("date"),
  ]);
}

/** All-time insight rows for a company, no date bounds — used for lifetime ad-spend totals. */
export async function getAllInsights(companyId: string): Promise<InsightDaily[]> {
  return listAll<InsightDaily>(COLLECTIONS.insights, [
    Query.equal("companyId", companyId),
  ]);
}

export async function getInsight(id: string): Promise<InsightDaily | null> {
  try {
    return (await db().getDocument(
      DB(),
      COLLECTIONS.insights,
      id
    )) as unknown as InsightDaily;
  } catch {
    return null;
  }
}

/**
 * Upsert a daily insight row keyed by (companyId, metaCampaignId, date).
 * Rows flagged `edited` are preserved unless `force` is set — manual
 * corrections survive subsequent Meta syncs.
 */
export async function upsertInsight(
  row: Omit<InsightDaily, "$id" | "$createdAt" | "$updatedAt" | "edited"> & {
    edited?: boolean;
  },
  opts: { force?: boolean } = {}
): Promise<"created" | "updated" | "skipped"> {
  const existing = await withRetry(() =>
    db().listDocuments(DB(), COLLECTIONS.insights, [
      Query.equal("companyId", row.companyId),
      Query.equal("metaCampaignId", row.metaCampaignId),
      Query.equal("date", row.date),
      Query.limit(1),
    ])
  );
  if (existing.total > 0) {
    const doc = existing.documents[0] as unknown as InsightDaily;
    if (doc.edited && !opts.force) return "skipped";
    await withRetry(() =>
      db().updateDocument(DB(), COLLECTIONS.insights, doc.$id, {
        spend: row.spend,
        impressions: row.impressions,
        reach: row.reach,
        clicks: row.clicks,
        leads: row.leads,
        calls: row.calls ?? 0,
        results: row.results ?? row.leads + (row.calls ?? 0),
        edited: row.edited ?? false,
        ...(row.notes !== undefined ? { notes: row.notes } : {}),
      })
    );
    return "updated";
  }
  await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.insights, ID.unique(), {
      ...row,
      edited: row.edited ?? false,
    })
  );
  return "created";
}

export async function updateInsight(
  id: string,
  data: Partial<
    Pick<
      InsightDaily,
      | "spend"
      | "impressions"
      | "reach"
      | "clicks"
      | "leads"
      | "calls"
      | "results"
      | "notes"
    >
  >
): Promise<void> {
  await db().updateDocument(DB(), COLLECTIONS.insights, id, {
    ...data,
    edited: true,
  });
}

// ── Additional campaign costs ─────────────────────────────

export async function getCosts(
  companyId: string,
  since?: string,
  until?: string
): Promise<CampaignCost[]> {
  return listAll<CampaignCost>(COLLECTIONS.costs, [
    Query.equal("companyId", companyId),
    ...(since ? [Query.greaterThanEqual("date", since)] : []),
    ...(until ? [Query.lessThanEqual("date", until)] : []),
    Query.orderDesc("date"),
  ]);
}

export async function createCost(data: {
  companyId: string;
  parentCampaign?: string;
  category: CostCategory;
  description?: string;
  amount: number;
  date: string;
}): Promise<CampaignCost> {
  return (await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.costs, ID.unique(), data)
  )) as unknown as CampaignCost;
}

export async function deleteCost(id: string): Promise<void> {
  await withRetry(() => db().deleteDocument(DB(), COLLECTIONS.costs, id));
}

// ── Deposits (account-balance ledger, per parent-campaign group) ──

export async function getDeposits(
  companyId: string,
  since?: string,
  until?: string
): Promise<CompanyDeposit[]> {
  return listAll<CompanyDeposit>(COLLECTIONS.deposits, [
    Query.equal("companyId", companyId),
    ...(since ? [Query.greaterThanEqual("date", since)] : []),
    ...(until ? [Query.lessThanEqual("date", until)] : []),
    Query.orderDesc("date"),
  ]);
}

export async function createDeposit(data: {
  companyId: string;
  parentCampaign?: string;
  amount: number;
  date: string;
  note?: string;
}): Promise<CompanyDeposit> {
  return (await withRetry(() =>
    db().createDocument(DB(), COLLECTIONS.deposits, ID.unique(), data)
  )) as unknown as CompanyDeposit;
}

export async function deleteDeposit(id: string): Promise<void> {
  await withRetry(() => db().deleteDocument(DB(), COLLECTIONS.deposits, id));
}

// ── Issues ────────────────────────────────────────────────

export async function getIssues(companyId?: string): Promise<Issue[]> {
  return listAll<Issue>(COLLECTIONS.issues, [
    ...(companyId ? [Query.equal("companyId", companyId)] : []),
    Query.orderDesc("$createdAt"),
  ]);
}

export async function updateIssue(
  id: string,
  data: { status?: IssueStatus; response?: string }
): Promise<void> {
  await withRetry(() => db().updateDocument(DB(), COLLECTIONS.issues, id, data));
}
