// ── Outbound message quality (PURE) ───────────────────────────────────────────
// Everything else in the monitor asks "is the bot running". This asks "is what
// the bot SAID fit for a customer to read".
//
// Written because T-CENTER spent days replying to real customers with raw JSON
// and nothing in the system noticed: n8n was green, the queue was empty, the
// channel was connected, the workflow was active. Every infrastructure signal
// said healthy while the product was broken. The only place the failure was
// visible was in the text itself.
//
// Deliberately pattern-based rather than model-based: these failures are
// mechanical (a serialised object, an unrendered template, a stack trace), the
// check has to run on every message cheaply, and a regex that fires the same way
// every time is something you can trust at 3am. Judgement calls about tone or
// correctness are a different job — that's what asking Claude is for.

export type OutputIssue =
  | "raw_json" // a serialised object reached the customer
  | "template_leak" // an n8n/handlebars expression was never rendered
  | "marker_leak" // an internal control marker like [ORDER] wasn't stripped
  | "placeholder_leak" // undefined / null / [object Object] / NaN
  | "error_text" // a stack trace or error string was sent as the reply
  | "empty"; // the bot "replied" with nothing

export interface BotMessage {
  id: string;
  chatId: string;
  text: string | null;
  at: string;
}

export interface OutputFinding {
  id: string;
  chatId: string;
  at: string;
  issue: OutputIssue;
  /** A short, safe slice of the offending text so the alert can show it. */
  excerpt: string;
}

/** Worst first — this is the order the alert should describe them in. */
export const ISSUE_RANK: OutputIssue[] = [
  "raw_json",
  "error_text",
  "template_leak",
  "marker_leak",
  "placeholder_leak",
  "empty",
];

export const ISSUE_LABEL: Record<OutputIssue, string> = {
  raw_json: "JSON גולמי",
  error_text: "טקסט שגיאה",
  template_leak: "ביטוי n8n שלא עובד",
  marker_leak: "מרקר פנימי שלא הוסר",
  placeholder_leak: "ערך ריק (undefined/null)",
  empty: "הודעה ריקה",
};

/** Label for an issue that arrived as a plain string (out of an event payload). */
export function issueLabel(issue: string): string {
  return ISSUE_LABEL[issue as OutputIssue] ?? "פלט לא תקין";
}

/** n8n expressions and JS template literals that were sent instead of rendered. */
const TEMPLATE_PATTERNS: RegExp[] = [
  /\{\{[\s\S]{0,200}?\}\}/, // {{ $json.foo }}
  /\$json\b/,
  /\$node\s*\[/,
  /\$\{[^}]{0,100}\}/, // ${...}
];

/** Internal control markers the agent emits for the workflow to parse. If one
 *  reaches WhatsApp, the parser downstream stopped working — the exact shape of
 *  the T-CENTER [ORDER] outage. */
const MARKER_PATTERNS: RegExp[] = [
  /\[\/?ORDER(_[A-Z]+)?\]/,
  /\[\/?[A-Z][A-Z_]{2,}\]/, // any bracketed ALL_CAPS control token
];

const ERROR_PATTERNS: RegExp[] = [
  /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b/,
  /\bCannot read propert(y|ies)\b/i,
  /\bECONNREFUSED\b|\bETIMEDOUT\b|\bENOTFOUND\b/,
  /^\s*Error:\s/m,
  /\bat\s+(Object|Function|Module)\.[^\s]+\s+\(/, // stack frame
  /\bTraceback \(most recent call last\)/,
  /\brequest to .* failed\b/i,
  /\b(Internal Server Error|Bad Gateway|Service Unavailable)\b/i,
];

/** Values that mean "a variable was empty" — only meaningful as standalone
 *  tokens, so `undefined` inside a longer sentence still counts but the Hebrew
 *  word for a URL containing "null" does not. */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[object Object\]/,
  /(^|\s)undefined(\s|$|[.,!?])/,
  /(^|\s)NaN(\s|$|[.,!?])/,
];

/** JSON-ish keys that betray a serialised agent/tool payload. */
const JSON_KEY_PATTERN =
  /"(role|content|tool_use|tool_result|output|message|messages|choices|function_call|arguments)"\s*:/;

function looksLikeJson(t: string): boolean {
  const s = t.trim();
  if (s === "") return false;

  // The classic: the whole reply is an object or array literal.
  const bracketed = /^[{[]/.test(s) && /[}\]]\s*$/.test(s);
  if (bracketed) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (typeof parsed === "object" && parsed !== null) return true;
    } catch {
      // Truncated JSON is still leaked JSON — a quoted key clinches it.
    }
    if (/"[^"]+"\s*:/.test(s)) return true;
  }

  // A payload embedded mid-message (e.g. prose followed by the tool result).
  return JSON_KEY_PATTERN.test(s);
}

/**
 * The single worst thing wrong with one outbound message, or null if it reads
 * like something a person would send. Order matters: a stack trace wrapped in
 * JSON should be reported as JSON, the more alarming symptom.
 */
export function inspectBotMessage(text: string | null | undefined): OutputIssue | null {
  if (text == null || text.trim() === "") return "empty";
  const t = text;

  if (looksLikeJson(t)) return "raw_json";
  if (ERROR_PATTERNS.some((re) => re.test(t))) return "error_text";
  if (TEMPLATE_PATTERNS.some((re) => re.test(t))) return "template_leak";
  if (MARKER_PATTERNS.some((re) => re.test(t))) return "marker_leak";
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(t))) return "placeholder_leak";
  // A reply that is literally the word null — distinct from prose mentioning it.
  if (t.trim().toLowerCase() === "null") return "placeholder_leak";

  return null;
}

/** Trim to something a Hebrew alert card can show without wrapping forever. */
export function excerpt(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

/** Every bad message in a batch of the bot's recent replies. */
export function scanBotOutput(messages: BotMessage[]): OutputFinding[] {
  const out: OutputFinding[] = [];
  for (const m of messages) {
    const issue = inspectBotMessage(m.text);
    if (!issue) continue;
    out.push({ id: m.id, chatId: m.chatId, at: m.at, issue, excerpt: excerpt(m.text) });
  }
  return out;
}

export interface OutputQualitySummary {
  total: number;
  /** How many messages of each kind went out, worst kind first. */
  byIssue: { issue: OutputIssue; count: number }[];
  worst: OutputIssue | null;
  /** The most alarming example, for the alert body. */
  example: OutputFinding | null;
  /** Distinct conversations affected — one chat is a glitch, twenty is an outage. */
  chats: number;
}

export function summarizeOutput(findings: OutputFinding[]): OutputQualitySummary {
  const counts = new Map<OutputIssue, number>();
  for (const f of findings) counts.set(f.issue, (counts.get(f.issue) ?? 0) + 1);

  const byIssue = ISSUE_RANK.filter((i) => counts.has(i)).map((issue) => ({
    issue,
    count: counts.get(issue) as number,
  }));
  const worst = byIssue[0]?.issue ?? null;

  return {
    total: findings.length,
    byIssue,
    worst,
    example: worst ? findings.find((f) => f.issue === worst) ?? null : null,
    chats: new Set(findings.map((f) => f.chatId)).size,
  };
}

/**
 * An empty reply is common and mostly benign (a media-only send, a debounced
 * no-op), so on its own it is not worth waking anyone. Anything else the
 * customer can actually read as garbage is.
 */
export function isReportable(summary: OutputQualitySummary): boolean {
  return summary.byIssue.some((b) => b.issue !== "empty");
}
