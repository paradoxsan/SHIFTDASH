// ── Monitor detectors (BotOps Phase 8) — PURE ────────────────────────────────
// Given a bot's current signals (gathered by the cron via the Phase-4 least-priv
// read path), compute the typed events to raise. No I/O here, so the alerting
// rules are unit-testable. Each event carries a STABLE dedup_key so an ongoing
// condition produces exactly one open event (the partial-unique index dedups
// re-runs); a resolved condition can recur later.

export type EventType =
  | "BOT_DOWN"
  | "QUEUE_STUCK"
  | "FAILED_SPIKE"
  | "N8N_ERROR_SPIKE"
  | "RLS_REGRESSION"
  | "CREDENTIAL_EXPIRED"
  | "CHANNEL_DOWN"
  | "BOT_SILENT"
  | "INTEGRATION_DOWN";

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

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

/** Pure: roll a bot's signals up to one health status for the Overview badge. */
export function rollupHealth(sig: BotSignals): HealthStatus {
  if (sig.workflowActive === false) return "down";
  // A dead credential or a disconnected channel means the bot is not answering,
  // even though n8n still reports the workflow as active.
  if (sig.channelOk === false) return "down";
  if ((sig.recentErrorMessages ?? []).some(looksLikeCredentialFailure)) return "down";
  if (sig.workflowActive == null) return "unknown";
  const degraded =
    (sig.oldestNewAgeMin != null && sig.oldestNewAgeMin >= STUCK_MIN) ||
    sig.queueFailed >= FAILED_SPIKE ||
    (sig.n8nErrorRate24h != null && sig.n8nErrorRate24h >= N8N_ERR_RATE) ||
    (sig.rlsDisabledTables != null && sig.rlsDisabledTables > 0) ||
    (sig.lastInboundAgeMin != null &&
      sig.lastInboundAgeMin >= SILENT_MIN &&
      (sig.inbound7d ?? 0) >= ACTIVE_7D);
  return degraded ? "degraded" : "healthy";
}
