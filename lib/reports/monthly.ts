// Monthly bot report — data layer.
//
// Gathers one calendar month of activity per bot, plus the month before it for
// comparison. Everything reads through the Supabase Management SQL seam
// (lib/supabase-management#runSql), so no service-role keys are needed and the
// same PAT that powers the rest of the dashboard covers every tenant.
//
// Payload shape differs per project and MUST NOT be assumed: T-CENTER's
// `inbox.payload` is jsonb (occasionally a stringified jsonb), BRJewelry's is
// plain text holding JSON. `jsonExpr()` normalises both to jsonb.
import { runSql, introspect, hasTable } from "../supabase-management";
import { getClients, type ClientDef } from "../registry";

export interface Window {
  from: string; // inclusive, YYYY-MM-DD
  to: string; // exclusive, YYYY-MM-DD
}

export interface Volume {
  msgs: number;
  inbound: number;
  botOut: number;
  humanOut: number;
  chats: number;
  /** Share of OUTBOUND messages the bot produced, 0–100. Null when nothing went out. */
  botShare: number | null;
}

export interface OrderStats {
  count: number;
  revenue: number;
  avg: number;
}

export interface DailyPoint {
  d: string; // MM-DD
  inbound: number;
  bot: number;
  human: number;
}

export interface BotMonthly {
  id: string;
  name: string;
  accent?: string;
  volume: Volume;
  prevVolume: Volume | null;
  orders: OrderStats | null;
  prevOrders: OrderStats | null;
  escalations: { reason: string; n: number }[];
  escalationTotal: number;
  daily: DailyPoint[];
  extras: { label: string; value: string; note?: string }[];
  /** Measurement caveats that must travel with the numbers. */
  notes: string[];
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  label: string; // e.g. "יולי 2026"
  window: Window;
  prevWindow: Window;
  generatedAt: string;
  bots: BotMonthly[];
}

const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

/** "2026-07" → { from: "2026-07-01", to: "2026-08-01" }. */
export function monthWindow(month: string): Window {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`bad month "${month}" (expected YYYY-MM)`);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { from: `${y}-${pad(m)}-01`, to: `${ny}-${pad(nm)}-01` };
}

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${HE_MONTHS[m - 1]} ${y}`;
}

/** The most recent COMPLETE calendar month, in Israel time. */
export function lastCompleteMonth(now = new Date()): string {
  const il = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  return prevMonth(`${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, "0")}`);
}

/**
 * Normalise `inbox.payload` to jsonb regardless of how the bot stores it.
 * jsonb column that may hold a stringified document → unwrap; text column → cast.
 */
function jsonExpr(payloadType: string): string {
  return payloadType === "text"
    ? "payload::jsonb"
    : "(case when jsonb_typeof(payload)='string' then (payload #>> '{}')::jsonb else payload end)";
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function share(botOut: number, humanOut: number): number | null {
  const out = botOut + humanOut;
  return out === 0 ? null : (botOut / out) * 100;
}

/**
 * BOTH windows in one round trip. The first cut ran a query per window per bot
 * and the whole report took 47 s in production — long enough for Railway's edge
 * proxy to give up with "Application failed to respond". Every query below is
 * written to cover the current AND previous window in a single pass; combined
 * with parallel bots and the report cache this lands in single-digit seconds.
 */
async function volumesFor(ref: string, je: string, w: Window, pw: Window): Promise<[Volume, Volume]> {
  const rows = await runSql<Record<string, unknown>>(
    ref,
    `with b as (
       select chat_id, created_at,
         (${je}->'messages'->0->>'from_me')='true' as from_me,
         ${je}->'messages'->0->>'source' as source
       from inbox
       where created_at >= '${pw.from}' and created_at < '${w.to}'
         and chat_id not like '%@g.us'
     ), t as (
       select *, (created_at >= '${w.from}') as cur from b
     )
     select
       count(*) filter (where cur) as msgs,
       count(*) filter (where cur and not from_me) as inbound,
       count(*) filter (where cur and from_me and source='api') as bot_out,
       count(*) filter (where cur and from_me and source in ('mobile','web')) as human_out,
       count(distinct chat_id) filter (where cur) as chats,
       count(*) filter (where not cur) as p_msgs,
       count(*) filter (where not cur and not from_me) as p_inbound,
       count(*) filter (where not cur and from_me and source='api') as p_bot_out,
       count(*) filter (where not cur and from_me and source in ('mobile','web')) as p_human_out,
       count(distinct chat_id) filter (where not cur) as p_chats
     from t`
  );
  const r = rows[0] ?? {};
  const mk = (p: string): Volume => {
    const botOut = num(r[`${p}bot_out`]);
    const humanOut = num(r[`${p}human_out`]);
    return {
      msgs: num(r[`${p}msgs`]),
      inbound: num(r[`${p}inbound`]),
      botOut,
      humanOut,
      chats: num(r[`${p}chats`]),
      botShare: share(botOut, humanOut),
    };
  };
  return [mk(""), mk("p_")];
}

async function dailyFor(ref: string, je: string, w: Window): Promise<DailyPoint[]> {
  const rows = await runSql<Record<string, unknown>>(
    ref,
    `with b as (
       select chat_id, created_at,
         (${je}->'messages'->0->>'from_me')='true' as from_me,
         ${je}->'messages'->0->>'source' as source
       from inbox
       where created_at >= '${w.from}' and created_at < '${w.to}'
         and chat_id not like '%@g.us'
     )
     select to_char((created_at at time zone 'Asia/Jerusalem')::date,'MM-DD') as d,
            count(*) filter (where not from_me) as inbound,
            count(*) filter (where from_me and source='api') as bot,
            count(*) filter (where from_me and source in ('mobile','web')) as human
     from b group by 1 order by 1`
  );
  return rows.map((r) => ({
    d: String(r.d),
    inbound: num(r.inbound),
    bot: num(r.bot),
    human: num(r.human),
  }));
}

async function ordersFor(ref: string, w: Window, pw: Window): Promise<[OrderStats, OrderStats]> {
  // `superseded` rows are an order that was replaced by a later revision — counting
  // them would double-count the same job. `paid` is NOT a collection signal: auto
  // paid-marking was deliberately disabled, so this is order VALUE, not cash in.
  const rows = await runSql<Record<string, unknown>>(
    ref,
    `select
       count(*) filter (where created_at >= '${w.from}') as n,
       coalesce(sum(total) filter (where created_at >= '${w.from}'),0) as revenue,
       count(*) filter (where created_at < '${w.from}') as p_n,
       coalesce(sum(total) filter (where created_at < '${w.from}'),0) as p_revenue
     from orders
     where created_at >= '${pw.from}' and created_at < '${w.to}'
       and status in ('open','paid')`
  );
  const r = rows[0] ?? {};
  const mk = (p: string): OrderStats => {
    const count = num(r[`${p}n`]);
    const revenue = num(r[`${p}revenue`]);
    return { count, revenue, avg: count ? Math.round(revenue / count) : 0 };
  };
  return [mk(""), mk("p_")];
}

async function escalationsFor(
  ref: string,
  je: string,
  w: Window
): Promise<{ reason: string; n: number }[]> {
  const rows = await runSql<Record<string, unknown>>(
    ref,
    `with g as (
       select coalesce(${je}->'messages'->0->'text'->>'body',
                       ${je}->'messages'->0->'link_preview'->>'body') as body
       from inbox
       where created_at >= '${w.from}' and created_at < '${w.to}' and chat_id like '%@g.us'
     )
     select coalesce(substring(body from 'סוג הפנייה: ([^\n]+)'),'(אחר)') as reason, count(*) as n
       from g where body like '%לקוח מבקש מענה אישי%'
      group by 1 order by 2 desc limit 12`
  );
  return rows.map((r) => ({ reason: String(r.reason), n: num(r.n) }));
}

/** Every optional per-bot counter in ONE query — six round trips became one. */
const EXTRA_COUNTS: { label: string; table: string; col: string }[] = [
  { label: "קבצי גרפיקה שהתקבלו", table: "graphics", col: "created_at" },
  { label: "השתלטויות אנושיות", table: "human_mode", col: "updated_at" },
  { label: "טיוטות הזמנה", table: "order_drafts", col: "created_at" },
  { label: "לידים חדשים", table: "leads", col: "created_at" },
  { label: 'בקשות "תחזרו אליי"', table: "callbacks", col: "created_at" },
  { label: "לידי קמפיין (CTWA)", table: "campaign_contacts", col: "first_seen" },
];

async function extrasFor(
  ref: string,
  schema: { tableNames: string[] },
  w: Window
): Promise<{ label: string; value: string }[]> {
  const present = EXTRA_COUNTS.filter((e) => schema.tableNames.includes(e.table));
  if (!present.length) return [];
  const selects = present.map(
    (e, i) =>
      `(select count(*) from ${e.table} where ${e.col} >= '${w.from}' and ${e.col} < '${w.to}') as c${i}`
  );
  try {
    const rows = await runSql<Record<string, unknown>>(ref, `select ${selects.join(", ")}`);
    const r = rows[0] ?? {};
    return present.map((e, i) => ({ label: e.label, value: num(r[`c${i}`]).toLocaleString("en-US") }));
  } catch {
    return [];
  }
}

const emptyBot = (c: ClientDef, notes: string[]): BotMonthly => ({
  id: c.id, name: c.name, accent: c.accent,
  volume: { msgs: 0, inbound: 0, botOut: 0, humanOut: 0, chats: 0, botShare: null },
  prevVolume: null, orders: null, prevOrders: null,
  escalations: [], escalationTotal: 0, daily: [], extras: [], notes,
});

async function botMonthly(c: ClientDef, w: Window, pw: Window): Promise<BotMonthly> {
  const notes: string[] = [];
  // introspect is cached for 5 min and already carries column types, so the
  // payload shape comes free instead of costing its own round trip.
  const schema = await introspect(c.supabaseRef);
  const payloadCol = schema.tables["inbox"]?.find((col) => col.name === "payload");
  if (!payloadCol) return emptyBot(c, ["לא נמצאה טבלת inbox בפרויקט — אין נתוני תנועה."]);
  const je = jsonExpr(payloadCol.type);
  const hasOrders = hasTable(schema, "orders");

  const [volumes, daily, orderPair, escalations, extras] = await Promise.all([
    volumesFor(c.supabaseRef, je, w, pw),
    dailyFor(c.supabaseRef, je, w),
    hasOrders ? ordersFor(c.supabaseRef, w, pw) : Promise.resolve(null),
    escalationsFor(c.supabaseRef, je, w),
    extrasFor(c.supabaseRef, schema, w),
  ]);
  const [volume, prevVolume] = volumes;

  // Outbound logging is not universal. If a bot logs no outbound at all, say so
  // rather than letting a reader infer the bot was silent.
  if (volume.botOut === 0 && volume.inbound > 0) {
    notes.push(
      "לוג ההודעות היוצאות של הבוט הזה חלקי — טבלת inbox רושמת רק תנועה נכנסת, ולכן אי אפשר לספור תשובות בוט מכאן. אין להסיק מכך שהבוט לא ענה."
    );
  }
  if (hasOrders) {
    notes.push(
      'שווי הזמנות = ערך ההזמנות שנפתחו, לא כסף שנגבה. סימון "שולם" אוטומטי מושבת במכוון, והזמנות superseded אינן נכללות.'
    );
  }

  return {
    id: c.id, name: c.name, accent: c.accent,
    volume, prevVolume,
    orders: orderPair?.[0] ?? null,
    prevOrders: orderPair?.[1] ?? null,
    escalations,
    escalationTotal: escalations.reduce((a, e) => a + e.n, 0),
    daily, extras, notes,
  };
}

// ── report cache ─────────────────────────────────────────────────────────────
// A COMPLETED calendar month is immutable — its numbers can never change again —
// so it is cached hard. The in-progress month still moves, so it gets a short
// TTL. Without this every page view re-ran the whole gather and the client link
// timed out behind Railway's edge proxy.
const CACHE = new Map<string, { at: number; report: MonthlyReport }>();
const COMPLETE_TTL = 12 * 60 * 60 * 1000;
const LIVE_TTL = 5 * 60 * 1000;

function ttlFor(month: string): number {
  return month <= lastCompleteMonth() ? COMPLETE_TTL : LIVE_TTL;
}

/** Build the full report for a calendar month (default: the last complete one). */
export async function buildMonthlyReport(
  month = lastCompleteMonth(),
  opts: { fresh?: boolean } = {}
): Promise<MonthlyReport> {
  const hit = CACHE.get(month);
  if (!opts.fresh && hit && Date.now() - hit.at < ttlFor(month)) return hit.report;

  const window = monthWindow(month);
  const prevWindow = monthWindow(prevMonth(month));
  const clients = getClients().filter((c) => c.workspace === "clients");

  // Parallel across bots: two tenants is well inside the Management API's
  // limits, and serialising them was most of the 47 s.
  const bots = await Promise.all(
    clients.map(async (c) => {
      try {
        return await botMonthly(c, window, prevWindow);
      } catch (e) {
        // One tenant failing must never take the whole report down.
        return emptyBot(c, [`שליפת הנתונים נכשלה: ${e instanceof Error ? e.message : String(e)}`]);
      }
    })
  );

  const report: MonthlyReport = {
    month,
    label: monthLabel(month),
    window,
    prevWindow,
    generatedAt: new Date().toISOString(),
    bots,
  };
  CACHE.set(month, { at: Date.now(), report });
  if (CACHE.size > 24) CACHE.delete([...CACHE.keys()][0]);
  return report;
}
