import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildAuthUrl, originFromRequest, redirectUriFor } from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = originFromRequest(req);
  if (!env.googleConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=google_not_configured`);
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(redirectUriFor(origin), state));
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
