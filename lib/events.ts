// ── Dashboard events store (BotOps Phase 8) ───────────────────────────────────
// Dispatch is idempotent: the partial-unique index on dedup_key (open/ack only)
// means re-raising an ongoing condition is a no-op, and `created` tells the
// caller whether to fan out a notification. The cron auto-resolves conditions
// that have cleared.
import { runSql } from "./supabase-management";
import { controlPlaneRef } from "./control-plane";
import { sqlString } from "./sql";
import type { Severity } from "./monitor/detectors";

const cp = () => controlPlaneRef();

export interface DashboardEvent {
  id: number;
  bot_id: string | null;
  tenant_id: string | null;
  type: string;
  severity: string;
  dedup_key: string;
  payload: Record<string, unknown> | null;
  status: "open" | "ack" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

/** Raise an event, deduped on dedup_key. Returns whether a NEW row was created. */
export async function dispatchEvent(e: {
  botId: string | null;
  tenantId?: string | null;
  type: string;
  severity: Severity;
  dedupKey: string;
  payload?: Record<string, unknown>;
}): Promise<{ created: boolean; id: number | null }> {
  const payloadSql = e.payload ? `${sqlString(JSON.stringify(e.payload))}::jsonb` : "null";
  const rows = await runSql<{ id: number }>(
    cp(),
    `insert into botops.dashboard_events (bot_id, tenant_id, type, severity, dedup_key, payload)
       values (
         ${e.botId ? `${sqlString(e.botId)}::uuid` : "null"},
         ${e.tenantId ? `${sqlString(e.tenantId)}::uuid` : "null"},
         ${sqlString(e.type)}, ${sqlString(e.severity)}, ${sqlString(e.dedupKey)}, ${payloadSql}
       )
     on conflict (dedup_key) where status <> 'resolved' do nothing
     returning id`
  );
  return { created: rows.length > 0, id: rows[0]?.id ?? null };
}

/** Auto-resolve a bot's OPEN events whose condition is no longer present. */
export async function resolveStaleEvents(botId: string, activeDedupKeys: string[]): Promise<void> {
  const keep = activeDedupKeys.length
    ? `and dedup_key not in (${activeDedupKeys.map(sqlString).join(", ")})`
    : "";
  await runSql(
    cp(),
    `update botops.dashboard_events
        set status = 'resolved', resolved_at = now()
      where bot_id = ${sqlString(botId)}::uuid and status <> 'resolved' ${keep}`
  );
}

/**
 * Auto-resolve bot-less events (agency integrations) whose probe passed this
 * cycle. `checked` is everything we probed; `stillFailing` is the subset that
 * failed — anything checked and not failing is closed.
 */
export async function resolveIntegrationEvents(
  checked: string[],
  stillFailing: string[]
): Promise<void> {
  const cleared = checked.filter((k) => !stillFailing.includes(k));
  if (cleared.length === 0) return;
  await runSql(
    cp(),
    `update botops.dashboard_events
        set status = 'resolved', resolved_at = now()
      where bot_id is null and status <> 'resolved'
        and dedup_key in (${cleared.map(sqlString).join(", ")})`
  );
}

export async function listEvents(opts: { status?: string; limit?: number } = {}): Promise<DashboardEvent[]> {
  const where = opts.status ? `where status = ${sqlString(opts.status)}` : "";
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  return runSql<DashboardEvent>(
    cp(),
    `select * from botops.dashboard_events ${where} order by created_at desc limit ${limit}`
  );
}

export async function setEventStatus(id: number, status: "ack" | "resolved"): Promise<void> {
  await runSql(
    cp(),
    `update botops.dashboard_events
        set status = ${sqlString(status)},
            resolved_at = ${status === "resolved" ? "now()" : "resolved_at"}
      where id = ${String(Math.floor(id))}`
  );
}

/** Upsert a bot's health rollup (powers Overview badges). */
export async function upsertBotHealth(h: {
  botId: string;
  queueFailed: number;
  oldestNewAgeMin: number | null;
  n8nErrorRate24h: number | null;
  workflowActive: boolean | null;
  status: string;
}): Promise<void> {
  await runSql(
    cp(),
    `insert into botops.bot_health (bot_id, last_checked, queue_failed, oldest_new_age_min, n8n_error_rate_24h, workflow_active, status, updated_at)
       values (${sqlString(h.botId)}::uuid, now(), ${String(Math.floor(h.queueFailed))},
         ${h.oldestNewAgeMin != null ? String(Math.floor(h.oldestNewAgeMin)) : "null"},
         ${h.n8nErrorRate24h != null ? String(h.n8nErrorRate24h) : "null"},
         ${h.workflowActive == null ? "null" : h.workflowActive ? "true" : "false"},
         ${sqlString(h.status)}, now())
     on conflict (bot_id) do update set
       last_checked = now(), queue_failed = excluded.queue_failed,
       oldest_new_age_min = excluded.oldest_new_age_min, n8n_error_rate_24h = excluded.n8n_error_rate_24h,
       workflow_active = excluded.workflow_active, status = excluded.status, updated_at = now()`
  );
}

export async function listBotHealth(): Promise<Record<string, { status: string; updated_at: string }>> {
  const rows = await runSql<{ bot_id: string; status: string; updated_at: string }>(
    cp(),
    `select bot_id, status, updated_at from botops.bot_health`
  );
  return Object.fromEntries(rows.map((r) => [r.bot_id, { status: r.status, updated_at: r.updated_at }]));
}

// ── Notification subscriptions ────────────────────────────────────────────────
export interface SubscriptionRow {
  id: string;
  user_id: string | null;
  channel: string;
  target: string | null;
  event_types: string[];
  min_severity: string;
}

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  return runSql<SubscriptionRow>(
    cp(),
    `select id, user_id, channel, target, event_types, min_severity
       from botops.notification_subscriptions order by created_at desc`
  );
}

export async function createSubscription(args: {
  userEmail: string | null;
  channel: string;
  target?: string | null;
  eventTypes?: string[];
  minSeverity?: string;
}): Promise<void> {
  const types = `array[${(args.eventTypes ?? []).map(sqlString).join(", ")}]::text[]`;
  await runSql(
    cp(),
    `insert into botops.notification_subscriptions (user_id, channel, target, event_types, min_severity)
       values (
         (select id from botops.app_users where lower(email) = lower(${sqlString(args.userEmail ?? "")}) limit 1),
         ${sqlString(args.channel)},
         ${args.target ? sqlString(args.target) : "null"},
         ${types},
         ${sqlString(args.minSeverity ?? "high")}
       )`
  );
}

/** The cron runs as a system actor (no user) — record its run in audit_log. */
export async function systemAudit(action: string, payload: Record<string, unknown>, result: string): Promise<void> {
  try {
    await runSql(
      cp(),
      `insert into botops.audit_log (actor_user_id, action, target_type, payload, result)
         values (null, ${sqlString(action)}, 'system', ${sqlString(JSON.stringify(payload))}::jsonb, ${sqlString(result)})`
    );
  } catch {
    // never block the cron on audit
  }
}
