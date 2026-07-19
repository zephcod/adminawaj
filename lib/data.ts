import { COLLECTIONS, db, DB, listAll, Query } from "./appwrite";
import {
  Activity,
  Contact,
  Lead,
  LeadStage,
  LEAD_STAGES,
  LeadWithContact,
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
