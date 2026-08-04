import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The login endpoint must stay reachable while logged out.
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  // Public health probe (CI smoke + Phase 8 monitoring) — no auth.
  if (pathname === "/api/health") return NextResponse.next();

  // Internal Copilot API — read-only, authenticated by a bearer secret inside
  // each route handler (lib/copilot/auth.ts), not the session cookie.
  if (pathname.startsWith("/api/internal/")) return NextResponse.next();

  // Monitoring cron — authenticated by CRON_SECRET inside the route, not the
  // session cookie (Vercel Cron has no cookie).
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);
  const isLogin = pathname === "/login";

  if (!authed && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname && pathname !== "/" ? `?from=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  if (authed && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
