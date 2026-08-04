import { ok, fail } from "@/lib/api-helpers";
import { env } from "@/lib/env";
import { runMonitor, cronAuthorized } from "@/lib/monitor/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Always-on monitoring cycle. Gated by CRON_SECRET (Vercel Cron sends it as a
// bearer token). Reads only via the least-privilege seam + n8n REST — no MCP.
function safeSecret(): string {
  try {
    return env.cronSecret();
  } catch {
    return ""; // CRON_SECRET not configured → endpoint disabled
  }
}

async function handle(req: Request) {
  const auth = req.headers.get("authorization");
  const qp = new URL(req.url).searchParams.get("secret");
  if (!cronAuthorized(auth, qp, safeSecret())) return fail(new Error("unauthorized"), 401);
  const result = await runMonitor();
  return ok({ ok: true, ...result });
}

export const GET = handle; // Vercel Cron uses GET
export const POST = handle; // manual trigger
