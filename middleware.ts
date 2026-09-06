import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken, safeEqual } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && safeEqual(token, await expectedToken())) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except the login page, static assets, the Meta sync
  // cron endpoint, the Meta Lead Ads webhook + backfill cron, and the SMS
  // provider callback + reconcile-cron endpoints (all called without a
  // session cookie — see app/api/sync/route.ts, app/api/meta/**/route.ts,
  // app/api/sms/callback/*/route.ts, app/api/sms/reconcile/route.ts).
  // Each enforces its own signature/secret check.
  matcher: [
    "/((?!login|api/sync|api/meta|api/sms/callback|api/sms/reconcile|_next/static|_next/image|favicon.ico).*)",
  ],
};
