// ── Agent sweep ───────────────────────────────────────────────────────────────
// The autonomous half of the copilot: on a schedule, the agency agent delegates
// to every client agent, judges what it gets back, and raises events for what a
// rule could not have anticipated.
//
// It does NOT replace lib/monitor — the detectors catch known failure shapes
// (queue stuck, workflow off, error rate) cheaply and deterministically, and
// they should stay. This catches the other kind: "this bot answered but the
// answer was nonsense", "this has been degrading for three days". Both write to
// the same dashboard_events table, so dedup, ack and the UI work unchanged.
//
// Two rules from expensive past failures shape the design:
//   • the machine-readable block is UNCONDITIONAL — required on every run, with
//     an explicit "nothing found" form. A tag emitted "when relevant" is skipped
//     roughly a third of the time on every model tier.
//   • CODE decides whether to alert, never the model. The model reports; the
//     mapping from report to severity to event lives here, where it is testable.
import { askClientAgents } from "./subagent";
import { loadClients } from "../registry";
import { listBotIdentity } from "../control-plane";
import { dispatchEvent, resolveEventsByPrefix, systemAudit } from "../events";
import { fanOutEvent } from "../notify";
import type { Severity } from "../monitor/detectors";

/** dedup_key namespace. resolveEventsByPrefix only ever clears keys under this. */
export const SWEEP_PREFIX = "AGENT_SWEEP:";

/** Cap on findings acted upon in one cycle, so a confused model cannot raise
 *  fifty events. Anything beyond is reported, never silently dropped. */
export const MAX_FINDINGS = 10;

export interface SweepFinding {
  /** Bot slug, or null for an agency-level finding. */
  client: string | null;
  /** Stable-ish SCREAMING_SNAKE identifier — the dedup key's discriminator. */
  code: string;
  level: "warn" | "crit";
  headline: string;
}

/**
 * Asked of EACH client agent separately, not of one orchestrator.
 *
 * That split is the attribution guarantee. A single agent synthesising all
 * clients demonstrably blends them — a live dry run put "SDR is failing" (Shift
 * Digital's workflow) on BRJewelry's row, and no code check could catch it
 * because `brjewelry` is a perfectly valid slug. Here each agent sees only its
 * own client and the caller stamps the slug from WHICH agent replied, so the
 * model never gets a say in attribution at all.
 */
export const SWEEP_INSTRUCTIONS = `בדוק עכשיו את מצב הבוט של הלקוח שאתה אחראי עליו, ודווח מה שבור. אף אחד לא קורא את זה בזמן אמת — מה שתסמן ייכנס לרשימת ההתראות של דניאל.

**מה לבדוק:** workflows כבויים, שגיאות בריצות האחרונות, התראות פתוחות, תורים תקועים, credentials שפגו. הרץ כלים — אל תענה מהתיק בלבד.

**מה נחשב ממצא:** משהו ששבור או מתדרדר ודורש טיפול. לא כל שגיאה בודדת היא ממצא — בוט שרץ 900 פעם עם שגיאה אחת בריא. תעדוף: הבוט לא עונה ללקוחות > שגיאות שחוזרות > תשתית.

**דווח רק על הלקוח שלך.** אם ראית משהו שנוגע ללקוח אחר — התעלם, יש לו סוכן משלו שנשאל במקביל.

**אל תדווח על אותה תקלה פעמיים.** אם אותו שורש (אותו workflow, אותו credential) מסביר כמה תסמינים — ממצא אחד.

**הפורמט — חובה בכל ריצה, גם כשהכל תקין:**
בסוף התשובה פלוט בלוק אחד או יותר בדיוק בצורה הזאת:

[FINDING]
code: <מזהה קצר באנגלית ב-SCREAMING_SNAKE שמתאר את סוג התקלה, למשל WORKFLOW_OFF או CREDENTIAL_EXPIRED או HIGH_ERROR_RATE>
level: warn | crit
headline: <שורה אחת בעברית, עד 120 תווים, מה שבור>
[/FINDING]

**אם הכל תקין** — פלוט בדיוק בלוק אחד כזה:

[FINDING]
code: NONE
level: warn
headline: הכל תקין
[/FINDING]

השתמש באותו code לאותה תקלה בין ריצות, כדי שלא תיווצר התראה חדשה בכל סריקה.

חזרה על ההוראה כי היא הכי חשובה: **חייב לצאת לפחות בלוק [FINDING] אחד בכל ריצה, גם כשאין ממצאים.** בלי הבלוק הסריקה נחשבת כושלת.`;

const CODE_MAX = 40;

/** Normalise a model-supplied code into something usable as a dedup discriminator. */
function normaliseCode(raw: string): string {
  const c = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return c.slice(0, CODE_MAX) || "UNSPECIFIED";
}

export interface ParsedSweep {
  findings: SweepFinding[];
  /** True when the model emitted the block at all. Its absence is a failure of
   *  the sweep, not an "all clear" — treating a missing block as healthy is how
   *  a silent monitor looks exactly like a passing one. */
  reported: boolean;
  /** Findings past MAX_FINDINGS, kept so the caller can say what it ignored. */
  dropped: number;
}

/**
 * Pull the machine-readable findings out of the agent's answer.
 *
 * Tolerant on purpose: models wrap blocks in markdown fences, translate the
 * field labels, and vary the casing. Strict where it matters — an unparseable
 * block is skipped rather than guessed at, and `reported` distinguishes "the
 * agent said all clear" from "the agent never answered in the format".
 */
export function parseSweep(answer: string, forceClient?: string | null): ParsedSweep {
  const blocks = [...answer.matchAll(/\[FINDING\]([\s\S]*?)\[\/FINDING\]/gi)];
  if (blocks.length === 0) return { findings: [], reported: false, dropped: 0 };

  const all: SweepFinding[] = [];
  for (const [, body] of blocks) {
    const field = (name: string): string => {
      const m = body.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "im"));
      return m ? m[1].trim().replace(/^\*+|\*+$/g, "").trim() : "";
    };

    const code = normaliseCode(field("code"));
    // The explicit all-clear form. Recognised by code, not by headline text,
    // so a translated or reworded headline cannot turn "all clear" into an alert.
    if (code === "NONE") continue;

    const headline = field("headline");
    if (!headline) continue; // unparseable — better skipped than alerted on blindly

    // When the caller knows which agent produced this answer, that wins outright
    // — the model's own `client` field is not consulted, so it cannot put one
    // customer's outage on another customer's row.
    let client: string | null;
    if (forceClient !== undefined) {
      client = forceClient;
    } else {
      const rawClient = field("client");
      client = !rawClient || rawClient === "-" ? null : rawClient;
    }
    const level = /crit/i.test(field("level")) ? "crit" : "warn";

    all.push({ client, code, level, headline: headline.slice(0, 200) });
  }

  return {
    findings: all.slice(0, MAX_FINDINGS),
    reported: true,
    dropped: Math.max(0, all.length - MAX_FINDINGS),
  };
}

/** warn/crit → the severity enum the events table and subscriptions already use. */
export function severityFor(level: SweepFinding["level"]): Severity {
  return level === "crit" ? "high" : "medium";
}

export function dedupKeyFor(f: SweepFinding): string {
  return `${SWEEP_PREFIX}${f.client ?? "agency"}:${f.code}`;
}

export interface SweepResult {
  reported: boolean;
  /** How many client agents were actually asked. */
  agents: number;
  findings: number;
  raised: number;
  notified: number;
  dropped: number;
  answer: string;
}

/**
 * One sweep cycle. Safe to run on a schedule: every event is deduped on
 * dedup_key, so an ongoing problem notifies once and a cleared one auto-resolves.
 */
export async function runAgentSweep(): Promise<SweepResult> {
  // Fans out to the client agents DIRECTLY rather than asking an orchestrator to
  // do it and summarise. Cheaper (no synthesising turn) and, more importantly,
  // it is what makes attribution structural — see SWEEP_INSTRUCTIONS.
  const { results } = await askClientAgents({ question: SWEEP_INSTRUCTIONS, actor: null });

  const findings: SweepFinding[] = [];
  let dropped = 0;
  let silent = 0;

  for (const r of results) {
    if (!r.ok) {
      // An agent that could not answer is a finding in its own right, decided
      // here rather than by any model: we do not know the state of that bot.
      findings.push({
        client: r.client,
        code: "AGENT_UNREACHABLE",
        level: "warn",
        headline: `לא הצלחתי לבדוק את הבוט של ${r.client}: ${r.answer.slice(0, 90)}`,
      });
      continue;
    }

    const parsed = parseSweep(r.answer, r.client);
    if (!parsed.reported) {
      // The agent answered but never emitted the block, so "no findings" here
      // means "did not report", not "healthy". Surfacing it low-severity keeps a
      // silently-degrading sweep visible without crying wolf.
      silent++;
      findings.push({
        client: r.client,
        code: "SWEEP_NO_REPORT",
        level: "warn",
        headline: `הסוכן של ${r.client} ענה אבל לא בפורמט — מצב הבוט לא נבדק בפועל`,
      });
      continue;
    }
    findings.push(...parsed.findings);
    dropped += parsed.dropped;
  }

  const capped = findings.slice(0, MAX_FINDINGS);
  dropped += Math.max(0, findings.length - MAX_FINDINGS);

  // Slug → bot id, so a finding lands on the client's row in the UI. A finding
  // for an unknown slug still raises, just without a bot attached — losing it
  // would be worse than showing it unattributed.
  const [clients, identities] = await Promise.all([
    loadClients().catch(() => []),
    listBotIdentity().catch(() => [] as { id: string; slug: string; tenant_id?: string }[]),
  ]);
  const known = new Set(clients.map((c) => c.id));
  const idBySlug = new Map(identities.map((i) => [i.slug, i]));

  let raised = 0;
  let notified = 0;
  const activeKeys: string[] = [];

  for (const f of capped) {
    const dedupKey = dedupKeyFor(f);
    activeKeys.push(dedupKey);

    const identity = f.client && known.has(f.client) ? idBySlug.get(f.client) : undefined;
    const severity = severityFor(f.level);
    const type = "AGENT_FINDING";

    const { created, id } = await dispatchEvent({
      botId: identity?.id ?? null,
      tenantId: identity?.tenant_id ?? null,
      type,
      severity,
      dedupKey,
      payload: { code: f.code, headline: f.headline, client: f.client, source: "agent_sweep" },
    });
    if (created && id != null) {
      raised++;
      const out = await fanOutEvent({ id, type, severity });
      notified += out.notified;
    }
  }

  // Clear only what a previous sweep raised and this one no longer sees. Scoped
  // by prefix so the detector cron's events are untouched.
  await resolveEventsByPrefix(SWEEP_PREFIX, activeKeys);

  await systemAudit("ai.sweep", { agents: results.length, findings: capped.length, raised, notified, dropped, silent }, "ok");

  return {
    reported: results.length > 0,
    agents: results.length,
    findings: capped.length,
    raised,
    notified,
    dropped,
    answer: results.map((r) => `[${r.client}] ${r.answer}`).join("\n\n---\n\n"),
  };
}
