import { ok, fail } from "@/lib/api-helpers";
import { env } from "@/lib/env";
import { cronAuthorized } from "@/lib/monitor/runner";
import { buildMonthlyReport, lastCompleteMonth, monthWindow } from "@/lib/reports/monthly";
import { whatsappSummary } from "@/lib/reports/render";
import { signReportToken } from "@/lib/reports/token";
import { greenSendMessage, greenConfigured } from "@/lib/green-api";
import { originFromRequest } from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Monthly report → WhatsApp. Runs on the 1st of the month and covers the month
// that just ended. Gated by CRON_SECRET like the monitor cron (middleware lets
// /api/cron/* through precisely because these callers have no session cookie).
//
// Sends from Shift Digital's own Green API number, NOT a client's WHAPI channel —
// this is an agency report about the clients, and it must never originate from
// the phone number their customers talk to.
//
// `?dry=1` builds everything and returns the message without sending it.
function safeSecret(): string {
  try {
    return env.cronSecret();
  } catch {
    return "";
  }
}

async function handle(req: Request) {
  const url = new URL(req.url);
  if (!cronAuthorized(req.headers.get("authorization"), url.searchParams.get("secret"), safeSecret())) {
    return fail(new Error("unauthorized"), 401);
  }

  const month = url.searchParams.get("month") || lastCompleteMonth();
  try {
    monthWindow(month);
  } catch {
    return fail(new Error(`bad month "${month}" — expected YYYY-MM`), 400);
  }
  const dry = url.searchParams.get("dry") === "1";

  const report = await buildMonthlyReport(month);
  const origin = process.env.AUTH_BASE_URL?.replace(/\/+$/, "") || originFromRequest(req);
  const internalUrl = `${origin}/reports/${month}`;
  const clientLinks = Object.fromEntries(
    report.bots.map((b) => [b.id, `${origin}/r/${signReportToken({ month, clientId: b.id })}`])
  );
  const message = whatsappSummary(report, internalUrl);

  if (dry) return ok({ month, dry: true, message, internalUrl, clientLinks });

  // ⚠️ OWNER DECISION 2026-08-07 — THIS JOB HAS EXACTLY ONE RECIPIENT.
  // The report goes to REPORT_PHONE (the agency owner) and to nobody else, ever.
  // Client-facing reports exist only as signed /r/<token> links that a human
  // chooses to forward; nothing here may send to a client, and no per-client
  // recipient may be added to this route. If clients should ever receive their
  // report automatically, that is a separate, explicitly-approved job.
  const to = process.env.REPORT_PHONE?.trim();
  if (!to) return fail(new Error("REPORT_PHONE not configured"), 500);
  if (!greenConfigured()) return fail(new Error("Green API not configured"), 500);

  const sent = await greenSendMessage(to, message);
  return ok({ month, sentTo: to, messageId: sent.id, internalUrl, clientLinks });
}

export const GET = handle; // schedulers that only do GET
export const POST = handle; // n8n / manual trigger
