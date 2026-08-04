// ── Signal gathering (BotOps Phase 8) ─────────────────────────────────────────
// Reads a bot's live signals via the Phase-4 LEAST-PRIVILEGE data-plane seam and
// the n8n REST client — NEVER an interactive MCP call (the cron is headless).
import { introspect, runSql } from "../services/data-plane";
import { workflowMatchesClient, clientTables, type ClientDef } from "../registry";
import { sqlString } from "../sql";
import { getExecutionDetail } from "../n8n";
import { hasWhapi, probeChannel } from "../whapi";
import type { N8nExecution, N8nWorkflow } from "../types";
import type { BotSignals } from "./detectors";

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
        const a = await runSql<{ age: number | null }>(
          client.supabaseRef,
          `select extract(epoch from (now() - min(created_at))) / 60 as age from public.inbox where status = 'new'`
        );
        oldestNewAgeMin = a[0]?.age != null ? Math.floor(Number(a[0].age)) : null;
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
  };
}
