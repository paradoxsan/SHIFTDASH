// ── Signal gathering (BotOps Phase 8) ─────────────────────────────────────────
// Reads a bot's live signals via the Phase-4 LEAST-PRIVILEGE data-plane seam and
// the n8n REST client — NEVER an interactive MCP call (the cron is headless).
import { introspect, runSql } from "../services/data-plane";
import { workflowMatchesClient, clientTables, type ClientDef } from "../registry";
import { sqlString } from "../sql";
import { getExecutionDetail } from "../n8n";
import { hasWhapi, probeChannel } from "../whapi";
import type { N8nExecution, N8nWorkflow } from "../types";
import { COVERAGE_MIN_CHATS, type BotSignals } from "./detectors";
import { scanBotOutput, type BotMessage, type OutputFinding } from "./output-quality";

/** How far back to read the bot's own replies each cycle. Long enough that a
 *  burst isn't missed between runs, short enough that a fixed bug clears. */
const OUTPUT_WINDOW_HOURS = 6;
/** Cap the rows read per bot — a busy bot must not make the cron unbounded. */
const OUTPUT_LIMIT = 300;

interface OutboundRow {
  id: number | string;
  chat_id: string | null;
  txt: string | null;
  created_at: string;
}

/**
 * What the bot actually SAID recently, scanned for garbage.
 *
 * Source is the bot's own `audit_log` (the tcenter-sales template logs every
 * inbound and outbound message). `source = 'api'` is the discriminator that
 * matters: `from_me` alone also matches the owner replying by hand from their
 * phone, and flagging a human's message as bot output would be nonsense.
 *
 * Returns undefined — NOT an empty array — when this bot keeps no outbound log,
 * so "we didn't look" can't be mistaken for "we looked and it was clean".
 */
async function outputSignals(
  ref: string,
  allowedTables: string[],
  columns: { name: string }[]
): Promise<OutputFinding[] | undefined> {
  if (!allowedTables.includes("audit_log")) return undefined;
  const has = (c: string) => columns.some((x) => x.name === c);
  if (!has("from_me") || !has("payload") || !has("created_at")) return undefined;

  const sourceFilter = has("source") ? `and source = 'api'` : "";
  const typeFilter = has("msg_type") ? `and msg_type = 'text'` : "";

  // `payload` is jsonb, but a writer that inserts a JSON *string* (an n8n
  // expression returning JSON.stringify(...) is the easy way to do this by
  // accident) lands a string scalar in the column, and then `-> 'messages'`
  // silently yields null — the scanner would report a permanently clean bot.
  // Unwrap that case instead of trusting every producer to get it right.
  const body = `
    case when jsonb_typeof(payload) = 'string'
         then ((payload #>> '{}')::jsonb) -> 'messages' -> 0 -> 'text' ->> 'body'
         else payload -> 'messages' -> 0 -> 'text' ->> 'body'
    end`;

  const rows = await runSql<OutboundRow>(
    ref,
    `select id, chat_id, ${body} as txt, created_at
       from public.audit_log
      where from_me = true ${sourceFilter} ${typeFilter}
        and created_at >= now() - interval '${OUTPUT_WINDOW_HOURS} hours'
      order by created_at desc
      limit ${OUTPUT_LIMIT}`
  );

  const messages: BotMessage[] = rows
    // A null body here means a non-text send (link preview, media) rather than
    // an empty reply — those are not the bot failing to say anything.
    .filter((r) => r.txt !== null)
    .map((r) => ({
      id: String(r.id),
      chatId: r.chat_id ?? "",
      text: r.txt,
      at: r.created_at,
    }));

  return scanBotOutput(messages);
}

/** How long a customer may wait before we stop calling it "the bot answered".
 *  Generous on purpose: the message buffer batches a burst of messages and the
 *  agent takes its time, so a tight window would count healthy replies as misses. */
const ANSWER_WINDOW_MIN = 45;
/** The baseline window: the week BEFORE the day being judged. */
const BASELINE_DAYS = 8;

interface CoverageRow {
  win: string;
  chats: number;
  answered: number;
}

/**
 * The share of conversations the bot itself answered — last 24h, and the week
 * before it as this bot's own normal.
 *
 * Coverage is only readable where the bot LOGS what it sent. A bot that keeps
 * no outbound log would read as answering nobody, which is the same mistake
 * QUEUE_STUCK made on T-CENTER's append-only inbox: prove the log exists and is
 * being written before believing what it implies. So this returns nulls unless
 * the audit_log has actual api sends in the window.
 */
async function coverageSignals(
  ref: string,
  allowedTables: string[],
  auditColumns: { name: string }[],
  inboxColumns: { name: string }[]
): Promise<{ active: number | null; answered: number | null; baseline: number | null }> {
  const empty = { active: null, answered: null, baseline: null };
  if (!allowedTables.includes("audit_log") || !allowedTables.includes("inbox")) return empty;
  const hasAudit = (c: string) => auditColumns.some((x) => x.name === c);
  const hasInbox = (c: string) => inboxColumns.some((x) => x.name === c);
  if (!hasAudit("chat_id") || !hasAudit("from_me") || !hasAudit("created_at")) return empty;
  if (!hasInbox("chat_id") || !hasInbox("created_at")) return empty;

  // `source = 'api'` is what separates the bot's own sends from the owner
  // answering by hand off their phone. Without that column we cannot tell the
  // two apart, and "a human covered for the bot" would read as a healthy bot.
  if (!hasAudit("source")) return empty;
  const sent = `from_me = true and source = 'api'`;

  const rows = await runSql<CoverageRow>(
    ref,
    `with recent as (
       select chat_id, max(created_at) as at
         from public.inbox
        where chat_id is not null and created_at >= now() - interval '24 hours'
        group by chat_id
     ),
     prior as (
       select chat_id, max(created_at) as at
         from public.inbox
        where chat_id is not null
          and created_at >= now() - interval '${BASELINE_DAYS} days'
          and created_at <  now() - interval '24 hours'
        group by chat_id
     ),
     judged as (
       select 'recent' as win, r.chat_id,
              exists (select 1 from public.audit_log a
                       where a.chat_id = r.chat_id and ${sent}
                         and a.created_at >= r.at
                         and a.created_at <  r.at + interval '${ANSWER_WINDOW_MIN} minutes') as ok
         from recent r
       union all
       select 'prior', p.chat_id,
              exists (select 1 from public.audit_log a
                       where a.chat_id = p.chat_id and ${sent}
                         and a.created_at >= p.at
                         and a.created_at <  p.at + interval '${ANSWER_WINDOW_MIN} minutes')
         from prior p
     )
     select win, count(*)::int as chats, count(*) filter (where ok)::int as answered
       from judged group by win`
  );

  const recent = rows.find((r) => r.win === "recent");
  const prior = rows.find((r) => r.win === "prior");
  // No history to compare against, or an outbound log that records nothing:
  // report "unknown", never a zero that reads as an outage.
  if (!prior || Number(prior.chats) < COVERAGE_MIN_CHATS) return empty;
  if (Number(prior.answered) === 0 && Number(recent?.answered ?? 0) === 0) return empty;

  return {
    active: recent ? Number(recent.chats) : 0,
    answered: recent ? Number(recent.answered) : 0,
    baseline: Number(prior.answered) / Number(prior.chats),
  };
}

/** How many failed runs to open per bot when sampling error text. Each costs an
 *  n8n round-trip, so keep it small — a recurring failure repeats anyway. */
const ERROR_SAMPLE = 2;

export interface ExecutionsContext {
  /** All recent executions, fetched once per cycle and shared across bots. */
  recent: N8nExecution[];
}

/** 24h error rate + sampled error text for the workflows belonging to one bot. */
async function n8nSignals(
  client: ClientDef,
  workflows: N8nWorkflow[],
  ctx: ExecutionsContext
): Promise<{ errorRate: number | null; messages: string[] }> {
  const ids = new Set(workflows.filter((w) => workflowMatchesClient(client, w.name)).map((w) => w.id));
  if (ids.size === 0) return { errorRate: null, messages: [] };

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const mine = ctx.recent.filter(
    (e) => e.workflowId && ids.has(e.workflowId) && e.startedAt && new Date(e.startedAt).getTime() >= cutoff
  );
  const failed = mine.filter((e) => e.status === "error");
  const errorRate = mine.length > 0 ? failed.length / mine.length : null;

  const messages: string[] = [];
  for (const e of failed.slice(0, ERROR_SAMPLE)) {
    try {
      const d = await getExecutionDetail(e.id);
      const text = [d.errorMessage, d.errorDescription, d.failedNode].filter(Boolean).join(" — ");
      if (text) messages.push(text);
    } catch {
      // A detail fetch failing must not cost us the rest of the signals.
    }
  }
  return { errorRate, messages };
}

export async function gatherSignals(
  client: ClientDef,
  workflows: N8nWorkflow[],
  botId: string,
  ctx: ExecutionsContext = { recent: [] }
): Promise<BotSignals> {
  const matching = workflows.filter((w) => workflowMatchesClient(client, w.name));
  const workflowActive = matching.length === 0 ? null : matching.some((w) => w.active);

  let queueFailed = 0;
  let oldestNewAgeMin: number | null = null;
  let rlsDisabledTables = 0;
  let lastInboundAgeMin: number | null = null;
  let inbound7d: number | null = null;
  let outputFindings: OutputFinding[] | undefined;
  let activeChats24h: number | null = null;
  let answeredChats24h: number | null = null;
  let coverageBaseline: number | null = null;

  try {
    const schema = await introspect(client.supabaseRef);
    const allowed = clientTables(client, schema.tableNames); // only THIS bot's tables (shared-project safe)
    const inbox = schema.tables["inbox"] ?? [];
    const hasInbox = allowed.includes("inbox");
    const hasCreatedAt = inbox.some((c) => c.name === "created_at");

    if (hasInbox && inbox.some((c) => c.name === "status")) {
      const f = await runSql<{ n: number }>(
        client.supabaseRef,
        `select count(*)::int n from public.inbox where status in ('failed','error')`
      );
      queueFailed = Number(f[0]?.n ?? 0);
      if (hasCreatedAt) {
        // "Oldest row still in 'new'" only means a BACKLOG if this bot actually
        // drains the queue. T-CENTER's inbox is an append-only log: 135k rows,
        // every one of them 'new', none with processed_at — its n8n flow reads
        // the webhook and never writes the status back. Reading age-of-oldest-new
        // there yields "stuck for 47 days" forever, which is how QUEUE_STUCK sat
        // open and meaningless while real alerts had to compete with it.
        // So: prove the column is a work queue before believing it.
        const a = await runSql<{ age: number | null; drained: number }>(
          client.supabaseRef,
          `select extract(epoch from (now() - min(created_at) filter (where status = 'new'))) / 60 as age,
                  count(*) filter (where status <> 'new')::int as drained
             from public.inbox`
        );
        const drained = Number(a[0]?.drained ?? 0);
        oldestNewAgeMin = drained > 0 && a[0]?.age != null ? Math.floor(Number(a[0].age)) : null;
      }
    }

    // Traffic: how long since the last customer message, and is this bot busy at
    // all. Both come from one pass so a quiet bot isn't mistaken for a dead one.
    if (hasInbox && hasCreatedAt) {
      const t = await runSql<{ age: number | null; week: number }>(
        client.supabaseRef,
        `select extract(epoch from (now() - max(created_at))) / 60 as age,
                count(*) filter (where created_at >= now() - interval '7 days')::int as week
           from public.inbox`
      );
      lastInboundAgeMin = t[0]?.age != null ? Math.floor(Number(t[0].age)) : null;
      inbound7d = Number(t[0]?.week ?? 0);
    }

    // RLS regression: any of THIS bot's tables with row security OFF (Phase 4
    // hardened them on). Scoped to the bot's tables so a shared project's other
    // tables don't raise false alarms.
    if (allowed.length) {
      const inList = allowed.map(sqlString).join(", ");
      const r = await runSql<{ n: number }>(
        client.supabaseRef,
        `select count(*)::int n
           from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
          where ns.nspname = 'public' and c.relkind = 'r'
            and not c.relrowsecurity and c.relname in (${inList})`
      );
      rlsDisabledTables = Number(r[0]?.n ?? 0);
    }

    // What the bot said. Isolated so a missing/odd audit_log costs us this
    // signal only, and leaves it `undefined` rather than a false "all clean".
    try {
      outputFindings = await outputSignals(
        client.supabaseRef,
        allowed,
        schema.tables["audit_log"] ?? []
      );
    } catch {
      outputFindings = undefined;
    }

    // Is the bot still carrying the conversations, or has it quietly stopped?
    // Isolated like the output scan: losing this signal must not cost the rest.
    try {
      const cov = await coverageSignals(
        client.supabaseRef,
        allowed,
        schema.tables["audit_log"] ?? [],
        inbox
      );
      activeChats24h = cov.active;
      answeredChats24h = cov.answered;
      coverageBaseline = cov.baseline;
    } catch {
      activeChats24h = null;
      answeredChats24h = null;
      coverageBaseline = null;
    }
  } catch {
    // bot has no inbox / unreachable — leave signals at defaults
  }

  const { errorRate, messages } = await n8nSignals(client, workflows, ctx).catch(() => ({
    errorRate: null,
    messages: [] as string[],
  }));

  // Probe the WhatsApp channel itself: n8n can be perfectly healthy while the
  // number is disconnected, and nothing else in the system would notice.
  const whapiKey = client.whapiKey ?? client.supabaseRef;
  let channelOk: boolean | null = null;
  let channelDetail: string | undefined;
  if (hasWhapi(whapiKey)) {
    const probe = await probeChannel(whapiKey);
    channelOk = probe.ok;
    channelDetail = probe.detail;
  }

  return {
    botId,
    ref: client.supabaseRef,
    workflowActive,
    queueFailed,
    oldestNewAgeMin,
    n8nErrorRate24h: errorRate,
    rlsDisabledTables,
    recentErrorMessages: messages,
    channelOk,
    channelDetail,
    lastInboundAgeMin,
    inbound7d,
    activeChats24h,
    answeredChats24h,
    coverageBaseline,
    outputFindings,
  };
}
