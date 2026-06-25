import { type NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForEmail,
  isAllowed,
  originFromRequest,
  redirectUriFor,
} from "@/lib/google-oauth";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = originFromRequest(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("oauth_state")?.value;
  const loginUrl = (err: string) => `${origin}/login?error=${err}`;

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(loginUrl("state"));
  }

  try {
    const { email } = await exchangeCodeForEmail(code, redirectUriFor(origin));
    if (!isAllowed(email)) {
      return NextResponse.redirect(loginUrl("unauthorized"));
    }
    const token = await createSessionToken();
    const res = NextResponse.redirect(origin + "/");
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SEC,
    });
    res.cookies.set("oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch {
    return NextResponse.redirect(loginUrl("google"));
  }
}
