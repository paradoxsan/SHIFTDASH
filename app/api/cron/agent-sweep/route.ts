// Autonomous agent sweep. Gated by CRON_SECRET like the other crons (middleware
// lets /api/cron/* through precisely because these callers have no session).
//
// Complements /api/cron/monitor rather than replacing it: the detectors run
// cheaply and often on known failure shapes; this runs rarely and reasons about
// what no rule anticipated. Both raise into dashboard_events.
//
// `?dry=1` runs the sweep and returns what it found WITHOUT raising events —
// for checking the prompt without filling the alert inbox.
import { ok, fail } from "@/lib/api-helpers";
import { env } from "@/lib/env";
import { cronAuthorized } from "@/lib/monitor/runner";
import { runAgentSweep, parseSweep, SWEEP_INSTRUCTIONS } from "@/lib/ai/sweep";
import { askClientAgents } from "@/lib/ai/subagent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A sweep delegates to every client agent and then synthesises; it needs the
// same headroom as the interactive chat route.
export const maxDuration = 300;

function safeSecret(): string {
  try {
    return env.cronSecret();
  } catch {
    return ""; // CRON_SECRET not configured → endpoint disabled
  }
}

async function handle(req: Request) {
  try {
    const url = new URL(req.url);
    if (!cronAuthorized(req.headers.get("authorization"), url.searchParams.get("secret"), safeSecret())) {
      return fail(new Error("unauthorized"), 401);
    }
    if (!env.aiConfigured()) return fail(new Error("AI לא מוגדר (חסר ANTHROPIC_API_KEY)"), 503);

    if (url.searchParams.get("dry") === "1") {
      const { results } = await askClientAgents({ question: SWEEP_INSTRUCTIONS, actor: null });
      return ok({
        dry: true,
        agents: results.map((r) => ({
          client: r.client,
          ok: r.ok,
          toolsUsed: r.toolsUsed,
          // Attribution is stamped from WHICH agent replied, never read from
          // the model's output — same call the real sweep makes.
          ...parseSweep(r.answer, r.client),
          answer: r.answer,
        })),
      });
    }

    return ok(await runAgentSweep());
  } catch (e) {
    return fail(e);
  }
}

export const GET = handle; // Vercel Cron uses GET
export const POST = handle; // manual trigger
