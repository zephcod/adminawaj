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
  // Protect everything except the login page and static assets
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
