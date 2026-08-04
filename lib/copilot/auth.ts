// Auth for the internal Copilot API (BotOps — founders' WhatsApp Copilot).
// These endpoints are read-only and are called server-to-server by the n8n
// Copilot workflow, NOT by a logged-in browser. They authenticate with a shared
// bearer secret (COPILOT_SECRET) instead of the session cookie. The matching
// allowlist for /api/internal/* lives in middleware.ts.
import { fail } from "@/lib/api-helpers";
import { env } from "@/lib/env";
import type { NextResponse } from "next/server";

/** Constant-time string compare so a wrong secret can't be timed out byte-by-byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Validate `Authorization: Bearer <COPILOT_SECRET>`. Returns a ready response to
 * return early (401/503) when the request is not authorized, or null when it is.
 */
export function checkCopilotAuth(req: Request): NextResponse | null {
  let expected: string;
  try {
    expected = env.copilotSecret();
  } catch {
    return fail("Copilot API not configured (COPILOT_SECRET missing)", 503);
  }
  const header = req.headers.get("authorization") ?? "";
  const got = header.replace(/^Bearer\s+/i, "").trim();
  if (!got || !safeEqual(got, expected)) return fail("Unauthorized", 401);
  return null;
}
