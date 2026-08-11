// Internal Copilot API — ask the agent a question (read-only, bearer auth).
// Called server-to-server by n8n, principally the SDR manager agent's HTTP tool.
// Unlike the other /api/internal/* routes, which return one fixed summary each,
// this hands the caller the whole copilot: its tool registry, the client
// dossiers, and delegation to the per-client agents.
import { z } from "zod";
import { ok, fail, parseBody } from "@/lib/api-helpers";
import { checkCopilotAuth } from "@/lib/copilot/auth";
import { env } from "@/lib/env";
import { askCopilot } from "@/lib/ai/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A delegating turn runs several nested agents; it needs the same headroom as
// the interactive chat route.
export const maxDuration = 300;

const bodySchema = z.object({
  question: z.string().min(3).max(2000),
  /** Bot slug to scope the answer to one client. Omit for the agency copilot. */
  client: z.string().min(1).max(64).nullish(),
});

export async function POST(req: Request) {
  const denied = checkCopilotAuth(req);
  if (denied) return denied;

  try {
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    if (!env.aiConfigured()) return fail(new Error("AI לא מוגדר (חסר ANTHROPIC_API_KEY)"), 503);

    // actor is null: this caller has no session. Harmless because askCopilot is
    // read-only — nothing here can reach auditedMutation, so there is no
    // unattributed write to worry about.
    const result = await askCopilot({
      question: parsed.data.question,
      client: parsed.data.client ?? null,
    });

    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
