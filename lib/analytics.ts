// ── Per-bot analytics (BotOps Phase 9) ────────────────────────────────────────
// Aggregates run through the SAME allowlisted SELECT guard as the NL-query path
// (never a raw runSql from a route). Queries use date_part/date_trunc (NOT
// `extract(.. from ..)`) so the guard's table extractor isn't confused by the
// `from` inside extract(). Pure assembly helpers are unit-tested.
import { introspect } from "./services/data-plane";
import { runGuardedSelect } from "./ai/nl-sql";
import { clientTables, type ClientDef } from "./registry";

export interface AnalyticsPayload {
  heatmap: number[][]; // [weekday 0..6][hour 0..23] message counts (Israel time)
  heatmapMax: number;
  revenue: { date: string; total: number }[];
  totals: { messages: number; orders: number; revenue: number };
  hasInbox: boolean;
  hasOrders: boolean;
}

interface HeatRow {
  dow?: unknown;
  hr?: unknown;
  n?: unknown;
}

/** Pure: assemble a 7×24 grid from grouped (dow, hr, n) rows. */
export function assembleHeatmap(rows: HeatRow[]): { heatmap: number[][]; max: number; total: number } {
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  let max = 0;
  let total = 0;
  for (const r of rows) {
    const d = Number(r.dow);
    const h = Number(r.hr);
    const n = Number(r.n ?? 0);
    if (Number.isInteger(d) && Number.isInteger(h) && d >= 0 && d < 7 && h >= 0 && h < 24) {
      heatmap[d][h] = n;
      total += n;
      if (n > max) max = n;
    }
  }
  return { heatmap, max, total };
}

export async function getAnalytics(client: ClientDef): Promise<AnalyticsPayload> {
  const schema = await introspect(client.supabaseRef);
  const allowed = clientTables(client, schema.tableNames);
  const allowedSet = new Set(allowed);
  const has = (t: string, col: string) =>
    allowedSet.has(t) && (schema.tables[t] ?? []).some((c) => c.name === col);

  let heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  let heatmapMax = 0;
  let messages = 0;
  const hasInbox = has("inbox", "created_at");
  if (hasInbox) {
    const rows = await runGuardedSelect(
      client.supabaseRef,
      `select date_part('dow', created_at at time zone 'Asia/Jerusalem')::int dow,
              date_part('hour', created_at at time zone 'Asia/Jerusalem')::int hr,
              count(*)::int n
         from public.inbox
        where created_at > now() - interval '30 days'
        group by 1, 2`,
      { allowedTables: allowed }
    );
    const a = assembleHeatmap(rows as HeatRow[]);
    heatmap = a.heatmap;
    heatmapMax = a.max;
    messages = a.total;
  }

  let revenue: { date: string; total: number }[] = [];
  let orders = 0;
  let revenueTotal = 0;
  const hasOrders = has("orders", "total");
  if (hasOrders) {
    const rows = await runGuardedSelect(
      client.supabaseRef,
      `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') date,
              coalesce(sum(total), 0)::numeric total, count(*)::int n
         from public.orders
        where created_at > now() - interval '30 days'
        group by 1 order by 1`,
      { allowedTables: allowed }
    );
    revenue = rows.map((r) => ({ date: String(r.date), total: Number(r.total ?? 0) }));
    for (const r of rows) {
      orders += Number(r.n ?? 0);
      revenueTotal += Number(r.total ?? 0);
    }
  }

  return {
    heatmap,
    heatmapMax,
    revenue,
    totals: { messages, orders, revenue: revenueTotal },
    hasInbox,
    hasOrders,
  };
}
