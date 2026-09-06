/**
 * Meta Lead Ads backfill poll.
 *
 * GET  /api/meta/leads/sync                 — every active company with an fbPageId
 * GET  /api/meta/leads/sync?company=<id>    — one company
 * GET  /api/meta/leads/sync?days=30         — override lookback (default 7)
 *
 * The `leadgen` webhook is the primary path; this catches anything Meta
 * dropped or that failed mid-ingest. Ingestion is idempotent, so overlapping
 * runs are harmless.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Kept separate from /api/sync
 * so lead pulls and insight pulls can run on different schedules.
 */
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncMetaLeads } from "@/lib/meta-leads";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.metaLeadsEnabled()) {
    return NextResponse.json({ ok: true, disabled: true, results: [] });
  }

  const companyId = req.nextUrl.searchParams.get("company") ?? undefined;
  const days = Math.min(Number(req.nextUrl.searchParams.get("days")) || 7, 90);

  const results = await syncMetaLeads(days, companyId);

  const ok = results.every((r) => !r.error);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
}
