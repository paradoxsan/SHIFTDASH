// ── Headless copilot ("ask") ──────────────────────────────────────────────────
// One question in, one answer out, for callers that are not a browser: the SDR
// manager agent in n8n, and any other workflow that wants the dashboard's brain
// rather than its own set of nodes.
//
// READ-ONLY, always. Not a configuration choice — a structural one. The
// interactive copilot's write tools are safe because a human sees an approval
// card before they run; there is no card here and no human in the loop, so a
// write reached this way would be an unattended production change triggered by
// a WhatsApp message. The agent describes what it would do and Daniel approves
// it in the dashboard, where the audit row and RBAC check exist.
//
// Delegation stays ON: fanning out to the client agents is the entire reason
// this endpoint is worth calling instead of the narrow /api/internal/* reads.
import { systemPrompt } from "./context";
import { runHeadlessTurn, type HeadlessResult } from "./subagent";
import { loadClients } from "../registry";
import type { Session } from "../auth";

/** Step budget. Higher than a sub-agent's because this turn may itself delegate
 *  and then has to synthesise; still bounded, since nobody is watching it run. */
const ASK_MAX_ITERATIONS = 6;

/** Answers land in a WhatsApp message, so they must stay readable there. */
const ASK_ANSWER_BUDGET = 3_000;

export interface AskResult extends HeadlessResult {
  /** Which agent answered — the agency copilot, or one client's. */
  agent: string;
}

/**
 * Ask the copilot a single question with no thread and no approval gate.
 *
 * With `client` set, the question goes to that client's agent (scoped to it).
 * Without, it goes to the agency copilot, which can delegate to every client
 * agent at once.
 */
export async function askCopilot(args: {
  question: string;
  client?: string | null;
  actor?: Session | null;
}): Promise<AskResult> {
  const client = args.client?.trim() || null;

  if (client) {
    // Validated here rather than left to systemPrompt so an unknown slug comes
    // back as a caller error naming the valid ones, not an opaque failure
    // inside a workflow with no one reading its logs.
    const known = await loadClients();
    if (!known.some((c) => c.id === client)) {
      throw new Error(
        `לקוח לא מוכר: ${client}. מזהים קיימים: ${known.map((c) => c.id).join(", ")}`
      );
    }
  }

  const system = await systemPrompt({ client, forSubAgent: false });
  const result = await runHeadlessTurn({
    question: args.question,
    system,
    actor: args.actor ?? null,
    boundClient: client,
    // noDelegation is deliberately NOT set for the agency copilot: fan-out is
    // the point. A client-bound ask cannot delegate anyway — toolAllowed denies
    // an agency-scoped tool to any bound thread.
    policy: { readOnly: true },
    maxIterations: ASK_MAX_ITERATIONS,
    answerBudget: ASK_ANSWER_BUDGET,
  });

  return { agent: client ?? "agency", ...result };
}
