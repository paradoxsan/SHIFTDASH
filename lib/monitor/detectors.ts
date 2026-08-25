// ── Monitor detectors (BotOps Phase 8) — PURE ────────────────────────────────
// Given a bot's current signals (gathered by the cron via the Phase-4 least-priv
// read path), compute the typed events to raise. No I/O here, so the alerting
// rules are unit-testable. Each event carries a STABLE dedup_key so an ongoing
// condition produces exactly one open event (the partial-unique index dedups
// re-runs); a resolved condition can recur later.
import { isReportable, summarizeOutput, type OutputFinding } from "./output-quality";

export type EventType =
  | "BOT_DOWN"
  | "QUEUE_STUCK"
  | "FAILED_SPIKE"
  | "N8N_ERROR_SPIKE"
  | "RLS_REGRESSION"
  | "CREDENTIAL_EXPIRED"
  | "CHANNEL_DOWN"
  | "BOT_SILENT"
  | "BOT_NOT_ANSWERING"
  | "INTEGRATION_DOWN"
  | "PAYMENT_OVERDUE"
  | "BAD_BOT_OUTPUT";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface BotSignals {
  botId: string;
  ref: string;
  workflowActive: boolean | null; // is the n8n workflow active? null = unknown
  queueFailed: number; // failed/error inbox rows
  oldestNewAgeMin: number | null; // age of the oldest unprocessed 'new' row (min)
  n8nErrorRate24h: number | null; // 0..1
  rlsDisabledTables?: number; // count of public tables with RLS off (regression)
  /** Error text sampled from this bot's recent failed n8n runs. */
  recentErrorMessages?: string[];
  /** WhatsApp channel probe: null = not configured / not checked. */
  channelOk?: boolean | null;
  channelDetail?: string;
  /** Minutes since the last INBOUND customer message (null = unknown). */
  lastInboundAgeMin?: number | null;
  /** Inbound messages over the last 7 days — distinguishes "silent" from "quiet". */
  inbound7d?: number | null;
  /** Conversations that had an inbound message in the last 24h. */
  activeChats24h?: number | null;
  /** Of those, the ones the BOT itself answered. */
  answeredChats24h?: number | null;
  /** The same ratio over the preceding week — this bot's own normal.
   *  null = not enough history to judge, which is not the same as bad. */
  coverageBaseline?: number | null;
  /** Garbage the bot SENT to customers in the recent window (raw JSON, stack
   *  traces, unrendered templates). Undefined = this bot's outbound text could
   *  not be read, which is not the same as clean. */
  outputFindings?: OutputFinding[];
}

export interface DetectedEvent {
  type: EventType;
  severity: Severity;
  dedupKey: string;
  payload: Record<string, unknown>;
}

// Thresholds (tuneable). A stuck queue and a downed bot are high-severity.
export const STUCK_MIN = 15; // oldest 'new' older than this → queue stuck
export const FAILED_SPIKE = 20; // failed rows at/above this → spike
export const N8N_ERR_RATE = 0.25; // 24h error rate at/above this → spike
export const SILENT_MIN = 12 * 60; // no inbound for this long → possibly silent
export const ACTIVE_7D = 20; // inbound msgs/week above which a bot counts as busy

// Answer coverage: the share of a day's conversations the bot itself answered.
// Judged against the bot's OWN past week, never a fixed number — a human-heavy
// מוקד runs at a permanently low coverage without being broken, and a shop bot
// that normally carries 60% of its chats is broken at 10%.
export const COVERAGE_MIN_CHATS = 5; // below this a day is too small to read
export const COVERAGE_WAS_WORKING = 0.35; // baseline under this → never bot-led
export const COVERAGE_DROP = 0.5; // at/below half its own baseline → collapsed

/**
 * Expired OAuth credentials are the single most expensive recurring failure we
 * have: the SDR bot died twice on a lapsed Google refresh token, and each time
 * it looked like a generic run failure. Matching the error text turns hours of
 * digging into one alert. Kept as an exported constant so the patterns are
 * reviewable and testable in isolation.
 */
export const CREDENTIAL_PATTERNS: RegExp[] = [
  /invalid[_ ]grant/i,
  /refresh[_ ]token/i,
  /token (has )?expired/i,
  /credentials? (are )?(not )?(invalid|expired|missing)/i,
  /unauthorized/i,
  /\b401\b/,
  /oauth2?\b.*(fail|error|expired)/i,
  /reconnect .*(credential|account)/i,
];

/** Pure: does this n8n error text look like a dead credential rather than a bug? */
export function looksLikeCredentialFailure(message: string): boolean {
  return CREDENTIAL_PATTERNS.some((re) => re.test(message));
}

/** Pure: the events to raise for a bot's current signals. */
export function detectEvents(sig: BotSignals): DetectedEvent[] {
  const out: DetectedEvent[] = [];

  if (sig.workflowActive === false) {
    out.push({ type: "BOT_DOWN", severity: "high", dedupKey: `BOT_DOWN:${sig.botId}`, payload: {} });
  }

  if (sig.oldestNewAgeMin != null && sig.oldestNewAgeMin >= STUCK_MIN) {
    out.push({
      type: "QUEUE_STUCK",
      severity: "high",
      dedupKey: `QUEUE_STUCK:${sig.botId}`,
      payload: { oldestNewAgeMin: sig.oldestNewAgeMin },
    });
  }

  if (sig.queueFailed >= FAILED_SPIKE) {
    out.push({
      type: "FAILED_SPIKE",
      severity: "medium",
      dedupKey: `FAILED_SPIKE:${sig.botId}`,
      payload: { queueFailed: sig.queueFailed },
    });
  }

  if (sig.n8nErrorRate24h != null && sig.n8nErrorRate24h >= N8N_ERR_RATE) {
    out.push({
      type: "N8N_ERROR_SPIKE",
      severity: "medium",
      dedupKey: `N8N_ERROR_SPIKE:${sig.botId}`,
      payload: { errorRate24h: Number(sig.n8nErrorRate24h.toFixed(3)) },
    });
  }

  if (sig.rlsDisabledTables != null && sig.rlsDisabledTables > 0) {
    out.push({
      type: "RLS_REGRESSION",
      severity: "critical",
      dedupKey: `RLS_REGRESSION:${sig.botId}`,
      payload: { rlsDisabledTables: sig.rlsDisabledTables },
    });
  }

  // A dead credential silently stops a working bot — treat it as critical and
  // carry the matching message so the alert says what to reconnect.
  const credentialHit = (sig.recentErrorMessages ?? []).find(looksLikeCredentialFailure);
  if (credentialHit) {
    out.push({
      type: "CREDENTIAL_EXPIRED",
      severity: "critical",
      dedupKey: `CREDENTIAL_EXPIRED:${sig.botId}`,
      payload: { message: credentialHit.slice(0, 400) },
    });
  }

  if (sig.channelOk === false) {
    out.push({
      type: "CHANNEL_DOWN",
      severity: "critical",
      dedupKey: `CHANNEL_DOWN:${sig.botId}`,
      payload: { detail: sig.channelDetail ?? "" },
    });
  }

  // The bot is up, connected and answering — with garbage. Every other signal
  // here reads healthy in that state, which is exactly how T-CENTER shipped raw
  // JSON to customers for days unnoticed. Critical: a customer is reading it now.
  const output = summarizeOutput(sig.outputFindings ?? []);
  if (isReportable(output)) {
    out.push({
      type: "BAD_BOT_OUTPUT",
      severity: "critical",
      dedupKey: `BAD_BOT_OUTPUT:${sig.botId}`,
      payload: {
        total: output.total,
        chats: output.chats,
        worst: output.worst,
        byIssue: output.byIssue,
        example: output.example?.excerpt ?? "",
        exampleChatId: output.example?.chatId ?? "",
      },
    });
  }

  // The bot is up, connected, draining its queue — and has stopped answering.
  // Distinct from BOT_SILENT, which is about customers going quiet: here the
  // customers are still writing and it is the BOT that went missing. This is
  // the shape BRJewelry failed in for five days while every other signal here
  // read green, so it is deliberately measured against the bot's own history
  // rather than a threshold someone would have to tune per client.
  const coverage =
    sig.activeChats24h != null && sig.activeChats24h > 0 && sig.answeredChats24h != null
      ? sig.answeredChats24h / sig.activeChats24h
      : null;
  if (
    coverage != null &&
    (sig.activeChats24h ?? 0) >= COVERAGE_MIN_CHATS &&
    sig.coverageBaseline != null &&
    sig.coverageBaseline >= COVERAGE_WAS_WORKING &&
    coverage <= sig.coverageBaseline * COVERAGE_DROP
  ) {
    out.push({
      type: "BOT_NOT_ANSWERING",
      // Answering literally nobody is the outage; answering a few is the slide.
      severity: sig.answeredChats24h === 0 ? "critical" : "high",
      dedupKey: `BOT_NOT_ANSWERING:${sig.botId}`,
      payload: {
        activeChats24h: sig.activeChats24h,
        answeredChats24h: sig.answeredChats24h,
        coverage,
        baseline: sig.coverageBaseline,
      },
    });
  }

  // "Silent" only means something for a bot that normally has traffic — a
  // low-volume bot being quiet overnight is not an incident.
  if (
    sig.lastInboundAgeMin != null &&
    sig.lastInboundAgeMin >= SILENT_MIN &&
    (sig.inbound7d ?? 0) >= ACTIVE_7D
  ) {
    out.push({
      type: "BOT_SILENT",
      severity: "medium",
      dedupKey: `BOT_SILENT:${sig.botId}`,
      payload: { lastInboundAgeMin: sig.lastInboundAgeMin, inbound7d: sig.inbound7d },
    });
  }

  return out;
}

/** Agency-level integrations (Green API, Google Sheets) — not tied to one bot. */
export function detectIntegrationEvent(name: string, ok: boolean, detail?: string): DetectedEvent | null {
  if (ok) return null;
  return {
    type: "INTEGRATION_DOWN",
    severity: "high",
    dedupKey: `INTEGRATION_DOWN:${name}`,
    payload: { integration: name, detail: detail?.slice(0, 300) ?? "" },
  };
}

// A late invoice is a business incident, not a technical one, so it is detected
// separately from BotSignals: it is keyed on the CLIENT, and a bot can be
// perfectly healthy while its owner hasn't paid in two months.
export const OVERDUE_GRACE_DAYS = 3; // don't shout about an invoice that's a day late
export const OVERDUE_SERIOUS_DAYS = 30; // at a month late, escalate

/** Pure: should this client's unpaid balance raise an alert? */
export function detectPaymentEvent(args: {
  /** Client slug — the dedup key must be stable across cron runs. */
  clientId: string;
  daysOverdue: number;
  overdueAmount: number;
  currency?: string;
}): DetectedEvent | null {
  if (args.daysOverdue < OVERDUE_GRACE_DAYS || args.overdueAmount <= 0) return null;
  return {
    type: "PAYMENT_OVERDUE",
    severity: args.daysOverdue >= OVERDUE_SERIOUS_DAYS ? "high" : "medium",
    dedupKey: `PAYMENT_OVERDUE:${args.clientId}`,
    payload: {
      daysOverdue: Math.round(args.daysOverdue),
      overdueAmount: args.overdueAmount,
      currency: args.currency ?? "ILS",
    },
  };
}

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

/** Pure: roll a bot's signals up to one health status for the Overview badge. */
export function rollupHealth(sig: BotSignals): HealthStatus {
  if (sig.workflowActive === false) return "down";
  // A dead credential or a disconnected channel means the bot is not answering,
  // even though n8n still reports the workflow as active.
  if (sig.channelOk === false) return "down";
  if ((sig.recentErrorMessages ?? []).some(looksLikeCredentialFailure)) return "down";
  // Answering with garbage is not "healthy", whatever n8n reports.
  if (isReportable(summarizeOutput(sig.outputFindings ?? []))) return "degraded";
  if (sig.workflowActive == null) return "unknown";
  const coverageCollapsed =
    sig.activeChats24h != null &&
    sig.activeChats24h >= COVERAGE_MIN_CHATS &&
    sig.answeredChats24h != null &&
    sig.coverageBaseline != null &&
    sig.coverageBaseline >= COVERAGE_WAS_WORKING &&
    sig.answeredChats24h / sig.activeChats24h <= sig.coverageBaseline * COVERAGE_DROP;
  const degraded =
    coverageCollapsed ||
    (sig.oldestNewAgeMin != null && sig.oldestNewAgeMin >= STUCK_MIN) ||
    sig.queueFailed >= FAILED_SPIKE ||
    (sig.n8nErrorRate24h != null && sig.n8nErrorRate24h >= N8N_ERR_RATE) ||
    (sig.rlsDisabledTables != null && sig.rlsDisabledTables > 0) ||
    (sig.lastInboundAgeMin != null &&
      sig.lastInboundAgeMin >= SILENT_MIN &&
      (sig.inbound7d ?? 0) >= ACTIVE_7D);
  return degraded ? "degraded" : "healthy";
}
