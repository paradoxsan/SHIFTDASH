// ── Sub-agents ────────────────────────────────────────────────────────────────
// Runs a client's dedicated agent as a nested, non-interactive turn and returns
// its answer as text. This is what turns the copilot from one agent holding
// twenty tools into an orchestrator that asks specialists: "מה קורה עם כל
// הבוטים?" fans out to every client agent in parallel, each already carrying its
// own dossier, instead of one agent making thirty sequential tool calls.
//
// Three properties make nesting safe rather than a hole in the approval gate:
//   • sub-agents run READ-ONLY — there is no user watching a nested turn, so
//     there is nobody who could approve a write. A fix is described back to the
//     orchestrator, which proposes it to Daniel through the normal gate.
//   • sub-agents cannot delegate, so the recursion is exactly one level deep.
//   • each sub-agent is bound to its client, so executeTool rejects any call
//     reaching outside it — the same guard the interactive client agents use.
import { systemPrompt } from "./context";
import { loadClients } from "../registry";
import type { Session } from "../auth";

/** Step budget for a nested turn. Lower than the interactive copilot's 8: a
 *  sub-agent answers one scoped question, and a runaway costs the orchestrator
 *  its own turn as well as its own. */
const SUBAGENT_MAX_ITERATIONS = 5;

/** Per-answer character cap. Six of these land in the orchestrator's context at
 *  once, so an unbounded answer would push out the question that prompted it. */
const ANSWER_BUDGET = 4_000;

/** Most clients one delegation may fan out to. */
export const MAX_FANOUT = 6;

export interface HeadlessResult {
  ok: boolean;
  /** The agent's answer, or the failure reason when ok is false. */
  answer: string;
  /** Tools it actually ran. Reported rather than kept internal, because it is
   *  how "confident answer built on zero tool calls" becomes visible instead of
   *  reading exactly like a checked one. */
  toolsUsed: string[];
}

function clip(text: string, budget: number): string {
  const t = text.trim();
  return t.length > budget ? `${t.slice(0, budget)}\n…[התשובה קוצרה]` : t;
}

/**
 * Run one agent turn with nobody watching, and reduce it to text.
 *
 * Shared by sub-agents and by the internal ask endpoint (lib/ai/ask.ts) because
 * both are headless in the same way: no stream to render, no approval click
 * available, and one question in / one answer out. Never throws — a failure is
 * `ok: false`, so one broken agent cannot take down a fan-out around it.
 */
export async function runHeadlessTurn(args: {
  question: string;
  system: string;
  actor: Session | null;
  boundClient?: string | null;
  policy?: { readOnly?: boolean; noDelegation?: boolean };
  maxIterations?: number;
  answerBudget?: number;
}): Promise<HeadlessResult> {
  const toolsUsed: string[] = [];
  let text = "";
  let error: string | null = null;

  try {
    // Imported here, not at module scope, to cut the cycle
    // registry → delegate → subagent → agent → registry. That cycle resolves
    // today only because every cross-edge use happens inside a function body;
    // one top-level use would leave the tool registry holding an undefined
    // entry, with no error until a tool call misses.
    const { runAgent } = await import("./agent");

    for await (const event of runAgent({
      messages: [{ role: "user", content: [{ type: "text", text: args.question }] }],
      system: args.system,
      actor: args.actor,
      boundClient: args.boundClient ?? null,
      policy: args.policy,
      maxIterations: args.maxIterations,
    })) {
      switch (event.type) {
        case "text":
          text += event.text;
          break;
        case "tool_start":
          toolsUsed.push(event.name);
          break;
        case "error":
          error = event.message;
          break;
        case "approval_required":
          // Unreachable while a readOnly policy strips writes from the spec
          // list, but if it ever is reached the turn has stalled with nobody to
          // approve — say so rather than return a half answer as complete.
          error = `הסוכן ביקש פעולה שמשנה מצב (${event.name}), ואין כאן מי שיאשר אותה.`;
          break;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) return { ok: false, answer: `שגיאה: ${error}`, toolsUsed };
  if (!text.trim()) return { ok: false, answer: "הסוכן לא החזיר תשובה.", toolsUsed };
  return { ok: true, answer: clip(text, args.answerBudget ?? ANSWER_BUDGET), toolsUsed };
}

export interface SubAgentResult extends HeadlessResult {
  client: string;
}

/** Ask one client's agent a question, read-only and unable to delegate further. */
export async function askClientAgent(args: {
  client: string;
  question: string;
  actor: Session | null;
}): Promise<SubAgentResult> {
  const { client, question, actor } = args;
  let system: string;
  try {
    system = await systemPrompt({ client, forSubAgent: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { client, ok: false, answer: `שגיאה: ${msg}`, toolsUsed: [] };
  }

  const result = await runHeadlessTurn({
    question,
    system,
    actor,
    boundClient: client,
    policy: { readOnly: true, noDelegation: true },
    maxIterations: SUBAGENT_MAX_ITERATIONS,
  });
  return { client, ...result };
}

export interface FanOutResult {
  results: SubAgentResult[];
  /** Set when the requested set was trimmed — stated rather than silent, so an
   *  answer covering 6 of 9 clients cannot read as covering all of them. */
  note?: string;
}

/**
 * Ask several client agents the same question, concurrently. Concurrency is the
 * entire point: runAgent executes an orchestrator's tool calls one after
 * another, so fanning out inside a single tool is what makes three specialists
 * take one specialist's wall-clock instead of three.
 */
export async function askClientAgents(args: {
  clients?: string[];
  question: string;
  actor: Session | null;
}): Promise<FanOutResult> {
  const all = await loadClients();
  const known = new Set(all.map((c) => c.id));

  let note: string | undefined;
  let targets: string[];

  if (args.clients?.length) {
    const unknown = args.clients.filter((c) => !known.has(c));
    if (unknown.length) {
      throw new Error(
        `לקוחות לא מוכרים: ${unknown.join(", ")}. הרץ list_clients כדי לראות את המזהים.`
      );
    }
    targets = [...new Set(args.clients)];
    if (targets.length > MAX_FANOUT) {
      throw new Error(
        `אפשר לשאול עד ${MAX_FANOUT} לקוחות בקריאה אחת (ביקשת ${targets.length}). פצל לשתי קריאות.`
      );
    }
  } else {
    targets = all.map((c) => c.id);
    if (targets.length > MAX_FANOUT) {
      const dropped = targets.slice(MAX_FANOUT);
      targets = targets.slice(0, MAX_FANOUT);
      note = `נשאלו ${MAX_FANOUT} לקוחות בלבד מתוך ${all.length}. לא נשאלו: ${dropped.join(", ")}.`;
    }
  }

  const results = await Promise.all(
    targets.map((client) => askClientAgent({ client, question: args.question, actor: args.actor }))
  );

  return note ? { results, note } : { results };
}
