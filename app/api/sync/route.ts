/**
 * Meta → Appwrite sync endpoint.
 *
 * GET  /api/sync                    — sync all active companies (cron)
 * GET  /api/sync?company=<id>       — sync one company
 * GET  /api/sync?days=90            — override lookback window (default 30)
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` header (Vercel Cron sends
 * this automatically when CRON_SECRET is set). The admin UI calls the
 * server action instead (see runSync in app/actions.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { syncAll, syncOne } from "@/lib/sync";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = req.nextUrl.searchParams.get("company");
  const days = Math.min(
    Number(req.nextUrl.searchParams.get("days")) || 30,
    365
  );

  const results = companyId
    ? [await syncOne(companyId, days)]
    : await syncAll(days);

  const ok = results.every((r) => !r.error);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
}
