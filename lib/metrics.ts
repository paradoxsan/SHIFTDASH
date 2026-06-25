// Per-bot metrics, computed adaptively from whatever tables a project has.
// All reads go through the Management SQL endpoint (single PAT).
import { introspect, runSql, hasTable, hasColumn, type ProjectSchema } from "./supabase-management";
import type { BotMetrics, HealthState } from "./types";

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeHealth(lastActivityAt: string | null): HealthState {
  if (!lastActivityAt) return "unknown";
  const ageMs = Date.now() - new Date(lastActivityAt).getTime();
  if (Number.isNaN(ageMs)) return "unknown";
  if (ageMs <= 15 * 60_000) return "live"; // active in last 15 min
  if (ageMs <= 24 * 3600_000) return "idle"; // active today
  return "stale";
}

function emptyMetrics(ref: string, schema: ProjectSchema | null, error?: string): BotMetrics {
  return {
    ref,
    health: "unknown",
    lastActivityAt: null,
    messagesToday: null,
    failedMessages: null,
    openOrders: null,
    paidToday: null,
    revenueToday: null,
    newLeads: null,
    humanActive: null,
    tables: schema?.tableNames ?? [],
    error,
  };
}

export async function computeMetrics(ref: string, allow?: string[]): Promise<BotMetrics> {
  let schema: ProjectSchema | null = null;
  try {
    schema = await introspect(ref);
    // When a client owns only a subset of a project's tables, restrict to those.
    const inScope = (t: string) => !allow || allow.includes(t);
    const hasT = (t: string) => inScope(t) && hasTable(schema!, t);
    const scopedTables = schema.tableNames.filter(inScope);
    const sel: string[] = [];

    // Messages today + last inbox activity
    if (hasT("inbox") && hasColumn(schema, "inbox", "created_at")) {
      sel.push(
        `(select count(*) from public.inbox where created_at >= date_trunc('day', now())) as messages_today`,
        `(select max(created_at) from public.inbox) as last_inbox`
      );
    } else {
      sel.push(`null::bigint as messages_today`, `null::timestamptz as last_inbox`);
    }

    // Stuck / failed messages
    if (hasT("inbox") && hasColumn(schema, "inbox", "status")) {
      sel.push(`(select count(*) from public.inbox where status = 'failed') as failed_messages`);
    } else if (hasT("inbox") && hasColumn(schema, "inbox", "attempts")) {
      sel.push(`(select count(*) from public.inbox where attempts > 2) as failed_messages`);
    } else {
      sel.push(`null::bigint as failed_messages`);
    }

    // Orders
    if (hasT("orders") && hasColumn(schema, "orders", "status")) {
      sel.push(`(select count(*) from public.orders where status = 'open') as open_orders`);
      const stamp = hasColumn(schema, "orders", "updated_at")
        ? "updated_at"
        : hasColumn(schema, "orders", "created_at")
          ? "created_at"
          : null;
      if (stamp) {
        sel.push(
          `(select count(*) from public.orders where status = 'paid' and ${stamp} >= date_trunc('day', now())) as paid_today`
        );
        sel.push(
          hasColumn(schema, "orders", "total")
            ? `(select coalesce(sum(total),0) from public.orders where status = 'paid' and ${stamp} >= date_trunc('day', now())) as revenue_today`
            : `null::numeric as revenue_today`
        );
      } else {
        sel.push(`null::bigint as paid_today`, `null::numeric as revenue_today`);
      }
    } else {
      sel.push(
        `null::bigint as open_orders`,
        `null::bigint as paid_today`,
        `null::numeric as revenue_today`
      );
    }

    // Leads
    if (hasT("leads") && hasColumn(schema, "leads", "status")) {
      sel.push(`(select count(*) from public.leads where status = 'new') as new_leads`);
    } else {
      sel.push(`null::bigint as new_leads`);
    }

    // Human takeover
    if (hasT("human_mode") && hasColumn(schema, "human_mode", "active")) {
      sel.push(`(select count(*) from public.human_mode where active = true) as human_active`);
    } else {
      sel.push(`null::bigint as human_active`);
    }

    // Last audit activity
    if (hasT("audit_log") && hasColumn(schema, "audit_log", "created_at")) {
      sel.push(`(select max(created_at) from public.audit_log) as last_audit`);
    } else {
      sel.push(`null::timestamptz as last_audit`);
    }

    const rows = await runSql<Record<string, unknown>>(ref, `select ${sel.join(", ")}`);
    const r = rows[0] ?? {};

    const stamps = [r.last_inbox, r.last_audit]
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .sort();
    const lastActivityAt = stamps.length ? stamps[stamps.length - 1] : null;

    return {
      ref,
      health: computeHealth(lastActivityAt),
      lastActivityAt,
      messagesToday: num(r.messages_today),
      failedMessages: num(r.failed_messages),
      openOrders: num(r.open_orders),
      paidToday: num(r.paid_today),
      revenueToday: num(r.revenue_today),
      newLeads: num(r.new_leads),
      humanActive: num(r.human_active),
      tables: scopedTables,
    };
  } catch (e) {
    return emptyMetrics(ref, schema, e instanceof Error ? e.message : String(e));
  }
}
