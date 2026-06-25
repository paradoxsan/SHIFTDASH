import { type NextRequest, NextResponse } from "next/server";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Password login is disabled by default — only allowlisted Google accounts.
  // Set ENABLE_PASSWORD_LOGIN=true (Vercel env) to temporarily re-enable.
  if (process.env.ENABLE_PASSWORD_LOGIN !== "true") {
    return NextResponse.json({ error: "כניסה בסיסמה מושבתת — היכנס עם Google" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!checkPassword(body.password)) {
    return NextResponse.json({ error: "סיסמה שגויה" }, { status: 401 });
  }
  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return res;
}
