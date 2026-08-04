import { type NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForEmail,
  isAllowed,
  originFromRequest,
  redirectUriFor,
} from "@/lib/google-oauth";
import { createSessionTokenV2, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";
import { getUserByEmail, upsertUser } from "@/lib/control-plane";

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
    const { email, verified } = await exchangeCodeForEmail(code, redirectUriFor(origin));
    if (!verified) {
      return NextResponse.redirect(loginUrl("unverified")); // don't trust an unverified Google email
    }
    if (!isAllowed(email)) {
      return NextResponse.redirect(loginUrl("unauthorized"));
    }
    // Resolve role from the control-plane; seed an allowlisted user as owner on
    // first login. Fail-open: if the control-plane is down, allowlisted => owner.
    let role: "owner" | "operator" | "viewer" = "owner";
    try {
      const existing = await getUserByEmail(email);
      role = existing?.role ?? "owner";
      await upsertUser(email, role);
    } catch {
      /* control-plane unreachable — allowlisted user keeps owner */
    }
    const token = await createSessionTokenV2({ email, role });
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
