import { NextResponse } from "next/server";

// Public health probe (BotOps Phase 1) — used by CI smoke tests and, later, the
// Phase 8 monitoring runtime. Must stay unauthenticated (allowlisted in middleware).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    version: process.env.npm_package_version ?? "0.1.0",
    gitSha:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? null,
    time: new Date().toISOString(),
  });
}
