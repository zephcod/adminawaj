/**
 * Meta `leadgen` webhook — the real-time path for Lead Ads.
 *
 * GET   — Meta's subscription handshake (hub.mode/hub.verify_token/hub.challenge).
 * POST  — one notification per submitted lead. The payload carries only the
 *         leadgen_id, so we fetch the answers ourselves before ingesting.
 *
 * Auth: HMAC-SHA256 over the RAW request body, compared against the
 * X-Hub-Signature-256 header. Fails closed when META_APP_SECRET is unset.
 *
 * Bypasses the session cookie — see the middleware matcher exclusion.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCompanies } from "@/lib/data";
import { env } from "@/lib/env";
import { fetchLead, fetchPageAccessToken } from "@/lib/meta";
import { ingestLead } from "@/lib/meta-leads";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const expected = env.metaWebhookVerifyToken();
  const provided = params.get("hub.verify_token");

  if (
    !expected ||
    params.get("hub.mode") !== "subscribe" ||
    !provided ||
    !safeEqual(provided, expected)
  ) {
    return new NextResponse("forbidden", { status: 403 });
  }
  // Meta expects the challenge echoed back as bare text.
  return new NextResponse(params.get("hub.challenge") ?? "", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

interface LeadgenChange {
  field?: string;
  value?: {
    leadgen_id?: string;
    page_id?: string;
    form_id?: string;
  };
}

export async function POST(req: NextRequest) {
  const secret = env.metaAppSecret();
  // Read the raw text — re-serializing parsed JSON would not reproduce the
  // exact bytes Meta signed.
  const raw = await req.text();

  if (!secret || !verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (!env.metaLeadsEnabled()) {
    return new NextResponse("disabled", { status: 200 });
  }

  let body: { entry?: { changes?: LeadgenChange[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const changes = (body.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .filter((c) => c.field === "leadgen" && c.value?.leadgen_id && c.value?.page_id);

  if (changes.length > 0) {
    const companies = await getCompanies();
    for (const change of changes) {
      const pageId = change.value!.page_id!;
      const leadgenId = change.value!.leadgen_id!;
      const company = companies.find((c) => c.fbPageId?.trim() === pageId);
      try {
        const pageToken = await fetchPageAccessToken(pageId);
        const lead = await fetchLead(leadgenId, pageToken);
        await ingestLead(lead, { pageId, company, deliveredBy: "webhook" });
      } catch (e) {
        // Swallow: answering non-200 makes Meta retry and eventually disable
        // the subscription. The backfill poll picks this lead up instead.
        console.error("[meta-webhook] ingest failed for", leadgenId, e);
      }
    }
  }

  return new NextResponse("ok", { status: 200 });
}

function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  return safeEqual(header.slice("sha256=".length), expected);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch — check first, and accept
  // that the length itself is not secret.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
