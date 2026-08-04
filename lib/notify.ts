// ── Notification fan-out (BotOps Phase 8) ─────────────────────────────────────
// Channel-agnostic dispatch with dedup-by-construction: the cron only fans out
// for NEWLY-created events (an ongoing condition is deduped upstream, and acking
// an event stops repeats since no new event is raised while it is open). Real
// channels (web push / Telegram / email) are stubbed here — they record to
// notification_log so the wiring is exercised; live delivery lands in 8b.
import { runSql } from "./supabase-management";
import { controlPlaneRef } from "./control-plane";
import { sqlString } from "./sql";
import type { Severity } from "./monitor/detectors";

const cp = () => controlPlaneRef();

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

interface Subscription {
  id: string;
  channel: string;
  target: string | null;
  event_types: string[];
  min_severity: string;
}

/** Subscriptions that match an event's type + severity. */
export function matchSubscriptions(
  subs: Subscription[],
  event: { type: string; severity: Severity }
): Subscription[] {
  const sev = SEVERITY_RANK[event.severity] ?? 0;
  return subs.filter((s) => {
    const typeOk = !s.event_types?.length || s.event_types.includes(event.type);
    const sevOk = sev >= (SEVERITY_RANK[(s.min_severity as Severity) ?? "info"] ?? 0);
    return typeOk && sevOk;
  });
}

/** Fan a newly-created event out to matching subscriptions; record each attempt. */
export async function fanOutEvent(event: {
  id: number;
  type: string;
  severity: Severity;
}): Promise<{ notified: number }> {
  const subs = await runSql<Subscription>(
    cp(),
    `select id, channel, target, event_types, min_severity from botops.notification_subscriptions`
  );
  const matched = matchSubscriptions(subs, event);
  for (const s of matched) {
    // Stub delivery: only the 'log' channel "sends"; others are recorded skipped
    // until the real adapters land. Failures here never block the cron.
    const status = s.channel === "log" ? "sent" : "skipped";
    const detail = s.channel === "log" ? "logged" : `channel '${s.channel}' not yet wired`;
    await runSql(
      cp(),
      `insert into botops.notification_log (event_id, subscription_id, channel, status, detail)
         values (${String(Math.floor(event.id))}, ${sqlString(s.id)}::uuid, ${sqlString(s.channel)}, ${sqlString(status)}, ${sqlString(detail)})`
    ).catch(() => {});
  }
  return { notified: matched.length };
}
