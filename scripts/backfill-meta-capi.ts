/**
 * One-off Conversions API backfill: resend the last 7 days of Meta lead
 * history in the Conversions API for CRM shape.
 *
 * Why: events sent before the CRM-spec fix omitted the required
 * `custom_data.event_source` / `lead_event_source`, never included the raw
 * lead stage, and could not send 17-digit lead ids. Meta accepts events up
 * to 7 days old, so anything older is gone for good — run oldest first.
 *
 * Sends, each filtered by its OWN timestamp (not the lead's):
 *   - `Lead` for every imported Meta lead generated in the window
 *   - one event per real stage change in the window, at its original time
 * Excludes stage changes marked "(bulk update)" — a bulk tidy-up is not
 * real funnel movement — and stages with no Meta event (moves back to New).
 *
 * Uses lib/meta-capi.ts, so payloads come from exactly the code live events
 * use. Idempotent: events already `sent` are skipped, so a re-run after a
 * partial failure only sends what's missing.
 *
 * Usage:
 *   npx tsx scripts/backfill-meta-capi.ts --dry-run
 *   npx tsx scripts/backfill-meta-capi.ts --test [--limit 2]   # Test Events, no rows
 *   npx tsx scripts/backfill-meta-capi.ts --send               # production
 */
import "dotenv/config";
import { COLLECTIONS, listAll, Query } from "../lib/appwrite";
import {
  LEAD_EVENT,
  STAGE_EVENTS,
  STAGE_LABELS,
  type Activity,
  type LeadStage,
  type MetaLead,
} from "../lib/domain";
import {
  isWithinCapiWindow,
  reportLeadCreated,
  reportLeadStage,
  supersedeLegacyEvent,
  type CapiMode,
  type SendOutcome,
} from "../lib/meta-capi";

type Item =
  | { kind: "lead"; at: number; ml: MetaLead & { leadId: string } }
  | { kind: "stage"; at: number; leadId: string; stage: LeadStage; eventName: string };

const LABEL_TO_STAGE = Object.fromEntries(
  Object.entries(STAGE_LABELS).map(([stage, label]) => [label, stage as LeadStage])
);

const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function parseStage(body: string): LeadStage | null {
  const moved = body.match(/^Moved from \w+ to (\w+)/);
  if (moved) return LABEL_TO_STAGE[moved[1]] ?? null;
  if (/^Marked lost/.test(body)) return "lost";
  return null;
}

function describe(item: Item): string {
  return item.kind === "lead"
    ? `${LEAD_EVENT.padEnd(12)} lead ${item.ml.leadId} (leadgen ${item.ml.leadgenId})`
    : `${item.eventName.padEnd(12)} lead ${item.leadId}`;
}

async function buildItems(): Promise<Item[]> {
  const metaLeads = (
    await listAll<MetaLead>(COLLECTIONS.metaLeads, [Query.equal("state", "imported")])
  ).filter((m): m is MetaLead & { leadId: string } => !!m.leadId);

  const leadItems: Item[] = metaLeads
    // +1s matches reportLeadCreated's event_time, so the window check agrees.
    .map((ml) => ({ kind: "lead" as const, at: seconds(ml.createdTimeMeta) + 1, ml }))
    .filter((i) => isWithinCapiWindow(i.at));

  const metaLeadIds = new Set(metaLeads.map((m) => m.leadId));
  const activities = await listAll<Activity>(COLLECTIONS.activities, [
    Query.equal("type", "stage_change"),
  ]);

  const stageItems: Item[] = [];
  for (const a of activities) {
    if (!metaLeadIds.has(a.leadId)) continue; // non-Meta leads have no lead_id
    if (/\(bulk update\)/.test(a.body)) continue; // not real funnel movement
    const stage = parseStage(a.body);
    const eventName = stage ? STAGE_EVENTS[stage] : undefined;
    if (!stage || !eventName) continue; // unparseable, or a move back to New
    const at = seconds(a.occurredAt);
    if (!isWithinCapiWindow(at)) continue;
    stageItems.push({ kind: "stage", at, leadId: a.leadId, stage, eventName });
  }

  // Oldest first: the events closest to expiring go out before the rest.
  return [...leadItems, ...stageItems].sort((a, b) => a.at - b.at);
}

function send(item: Item, mode: CapiMode): Promise<SendOutcome> {
  return item.kind === "lead"
    ? reportLeadCreated(
        {
          leadId: item.ml.leadId,
          leadgenId: item.ml.leadgenId,
          companyId: item.ml.companyId,
          generatedAt: item.ml.createdTimeMeta,
        },
        { mode }
      )
    : reportLeadStage(item.leadId, item.stage, { mode, eventTime: item.at });
}

function summarize(items: Item[]) {
  const byEvent: Record<string, number> = {};
  for (const i of items) {
    const name = i.kind === "lead" ? LEAD_EVENT : i.eventName;
    byEvent[name] = (byEvent[name] ?? 0) + 1;
  }
  const seventeen = items.filter((i) => i.kind === "lead" && i.ml.leadgenId.length === 17);
  console.log(`events to send: ${items.length}  ${JSON.stringify(byEvent)}`);
  console.log(`17-digit lead ids among Lead events: ${seventeen.length}`);
  if (items.length) {
    const oldest = new Date(items[0].at * 1000);
    const expires = new Date(oldest.getTime() + 7 * 86400 * 1000);
    console.log(`oldest event: ${oldest.toISOString()} — expires ${expires.toISOString()}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode: CapiMode | null = args.includes("--send")
    ? "production"
    : args.includes("--test")
      ? "test"
      : args.includes("--dry-run")
        ? "dry-run"
        : null;
  if (!mode) {
    console.log("usage: tsx scripts/backfill-meta-capi.ts --dry-run | --test [--limit N] | --send");
    process.exit(1);
  }

  const items = await buildItems();
  summarize(items);

  if (mode === "dry-run") {
    // Three representative payloads rather than 139 lines of JSON.
    const samples = [
      items.find((i) => i.kind === "lead" && i.ml.leadgenId.length === 17),
      items.find((i) => i.kind === "stage" && i.eventName === "Qualified"),
      items.find((i) => i.kind === "stage" && i.eventName === "Contacted"),
    ].filter((i): i is Item => !!i);
    console.log(`\nsample payloads (${samples.length}):`);
    for (const s of samples) await send(s, "dry-run");
    return;
  }

  let chosen = items;
  if (mode === "test") {
    const limitArg = args.indexOf("--limit");
    const limit = limitArg >= 0 ? Number(args[limitArg + 1]) || 2 : 2;
    // Prove the precision fix: always include a 17-digit id when one exists.
    const long = items.find((i) => i.kind === "lead" && i.ml.leadgenId.length === 17);
    chosen = [...(long ? [long] : []), ...items.filter((i) => i !== long)].slice(0, limit);
  }

  console.log(`\n${mode === "test" ? "TEST EVENTS" : "PRODUCTION"}: sending ${chosen.length}\n`);
  const tally: Record<string, number> = {};
  const problems: string[] = [];
  let superseded = 0;

  // One event per request: Meta rejects a whole request if any event in it
  // is invalid, so batching would let one bad event sink the rest.
  for (const item of chosen) {
    const outcome = await send(item, mode);
    tally[outcome] = (tally[outcome] ?? 0) + 1;
    if (mode === "test") console.log(`  ${outcome.padEnd(10)} ${describe(item)}`);
    if (outcome === "failed" || outcome === "skipped") {
      problems.push(`${outcome.padEnd(8)} ${describe(item)}`);
    }
    if (mode === "production" && item.kind === "stage" && (outcome === "sent" || outcome === "duplicate")) {
      if (await supersedeLegacyEvent(item.leadId, item.eventName)) superseded++;
    }
  }

  console.log(`\noutcomes: ${JSON.stringify(tally)}`);
  if (mode === "production") console.log(`legacy rows superseded: ${superseded}`);
  if (problems.length) {
    console.log(`\nneeds attention (${problems.length}) — the reason is in meta_capi_events.error:`);
    for (const p of problems) console.log(`  ${p}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
