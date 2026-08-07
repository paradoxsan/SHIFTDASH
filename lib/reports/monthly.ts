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

async function payloadType(ref: string): Promise<string | null> {
  const rows = await runSql<{ data_type: string }>(
    ref,
    `select data_type from information_schema.columns
      where table_schema='public' and table_name='inbox' and column_name='payload' limit 1`
  );
  return rows[0]?.data_type ?? null;
}

async function volumeFor(ref: string, je: string, w: Window): Promise<Volume> {
  const rows = await runSql<Record<string, unknown>>(
    ref,
    `with b as (
       select chat_id,
         (${je}->'messages'->0->>'from_me')='true' as from_me,
         ${je}->'messages'->0->>'source' as source
       from inbox
       where created_at >= '${w.from}' and created_at < '${w.to}'
         and chat_id not like '%@g.us'
     )
     select count(*) as msgs,
            count(*) filter (where not from_me) as inbound,
            count(*) filter (where from_me and source='api') as bot_out,
            count(*) filter (where from_me and source in ('mobile','web')) as human_out,
            count(distinct chat_id) as chats
     from b`
  );
  const r = rows[0] ?? {};
  const botOut = num(r.bot_out);
  const humanOut = num(r.human_out);
  return {
    msgs: num(r.msgs),
    inbound: num(r.inbound),
    botOut,
    humanOut,
    chats: num(r.chats),
    botShare: share(botOut, humanOut),
  };
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

async function ordersFor(ref: string, w: Window): Promise<OrderStats | null> {
  // `superseded` rows are an order that was replaced by a later revision — counting
  // them would double-count the same job. `paid` is NOT a collection signal: auto
  // paid-marking was deliberately disabled, so this is order VALUE, not cash in.
  const rows = await runSql<Record<string, unknown>>(
    ref,
    `select count(*) as n, coalesce(sum(total),0) as revenue
       from orders
      where created_at >= '${w.from}' and created_at < '${w.to}'
        and status in ('open','paid')`
  );
  const r = rows[0];
  if (!r) return null;
  const count = num(r.n);
  const revenue = num(r.revenue);
  return { count, revenue, avg: count ? Math.round(revenue / count) : 0 };
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

async function countIn(
  ref: string,
  table: string,
  col: string,
  w: Window
): Promise<number | null> {
  try {
    const rows = await runSql<{ n: unknown }>(
      ref,
      `select count(*) as n from ${table} where ${col} >= '${w.from}' and ${col} < '${w.to}'`
    );
    return num(rows[0]?.n);
  } catch {
    return null;
  }
}

async function botMonthly(c: ClientDef, w: Window, pw: Window): Promise<BotMonthly> {
  const notes: string[] = [];
  const pt = await payloadType(c.supabaseRef);
  if (!pt) {
    return {
      id: c.id, name: c.name, accent: c.accent,
      volume: { msgs: 0, inbound: 0, botOut: 0, humanOut: 0, chats: 0, botShare: null },
      prevVolume: null, orders: null, prevOrders: null,
      escalations: [], escalationTotal: 0, daily: [], extras: [],
      notes: ["לא נמצאה טבלת inbox בפרויקט — אין נתוני תנועה."],
    };
  }
  const je = jsonExpr(pt);
  const schema = await introspect(c.supabaseRef);

  const [volume, prevVolume, daily] = await Promise.all([
    volumeFor(c.supabaseRef, je, w),
    volumeFor(c.supabaseRef, je, pw),
    dailyFor(c.supabaseRef, je, w),
  ]);

  const hasOrders = hasTable(schema, "orders");
  const [orders, prevOrders, escalations] = await Promise.all([
    hasOrders ? ordersFor(c.supabaseRef, w) : Promise.resolve(null),
    hasOrders ? ordersFor(c.supabaseRef, pw) : Promise.resolve(null),
    escalationsFor(c.supabaseRef, je, w),
  ]);

  const extras: { label: string; value: string; note?: string }[] = [];
  const add = async (label: string, table: string, col: string, note?: string) => {
    if (!hasTable(schema, table)) return;
    const n = await countIn(c.supabaseRef, table, col, w);
    if (n !== null) extras.push({ label, value: n.toLocaleString("en-US"), note });
  };
  await add("קבצי גרפיקה שהתקבלו", "graphics", "created_at");
  await add("השתלטויות אנושיות", "human_mode", "updated_at");
  await add("טיוטות הזמנה", "order_drafts", "created_at");
  await add("לידים חדשים", "leads", "created_at");
  await add('בקשות "תחזרו אליי"', "callbacks", "created_at");
  await add("לידי קמפיין (CTWA)", "campaign_contacts", "first_seen");

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
    volume, prevVolume, orders, prevOrders,
    escalations,
    escalationTotal: escalations.reduce((a, e) => a + e.n, 0),
    daily, extras, notes,
  };
}

/** Build the full report for a calendar month (default: the last complete one). */
export async function buildMonthlyReport(month = lastCompleteMonth()): Promise<MonthlyReport> {
  const window = monthWindow(month);
  const prevWindow = monthWindow(prevMonth(month));
  const clients = getClients().filter((c) => c.workspace === "clients");
  const bots: BotMonthly[] = [];
  for (const c of clients) {
    // Sequential on purpose: the Management SQL endpoint is rate-limited, and a
    // failed tenant must not take the whole report down.
    try {
      bots.push(await botMonthly(c, window, prevWindow));
    } catch (e) {
      bots.push({
        id: c.id, name: c.name, accent: c.accent,
        volume: { msgs: 0, inbound: 0, botOut: 0, humanOut: 0, chats: 0, botShare: null },
        prevVolume: null, orders: null, prevOrders: null,
        escalations: [], escalationTotal: 0, daily: [], extras: [],
        notes: [`שליפת הנתונים נכשלה: ${e instanceof Error ? e.message : String(e)}`],
      });
    }
  }
  return {
    month,
    label: monthLabel(month),
    window,
    prevWindow,
    generatedAt: new Date().toISOString(),
    bots,
  };
}
