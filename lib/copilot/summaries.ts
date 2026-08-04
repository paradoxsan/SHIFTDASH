// Read-only data summaries for the founders' WhatsApp Copilot. Each function
// composes EXISTING lib/ logic into a compact, LLM-friendly JSON shape — no new
// data-access code, so the Copilot and the dashboard always agree. All client
// DB access goes through the data-plane seam (lib/services/data-plane).
import { listLeads } from "@/lib/leads-sheet";
import { todayInIsrael, parseReminder, bucketOf, relativeLabel } from "@/lib/reminders";
import { loadClients, clientTables } from "@/lib/registry";
import { introspect, runSql } from "@/lib/services/data-plane";
import { computeMetrics } from "@/lib/metrics";
import { listWorkflows, listExecutions } from "@/lib/n8n";

// ── Agency leads (Google Sheet is the source of truth) ────────────────────────
export interface LeadsSummary {
  total: number;
  byStatus: Record<string, number>;
  newToday: number;
  dueNow: { name: string; phone: string; status: string; due: string }[];
  generatedAt: string;
}

/** True if a free-form date cell (ISO or DD/MM/YYYY) resolves to today (Israel). */
function isTodayIsrael(raw: string | undefined, today: string): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  if (s.startsWith(today)) return true;
  const m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` === today;
  return false;
}

export async function leadsSummary(): Promise<LeadsSummary> {
  const { leads } = await listLeads();
  const today = todayInIsrael();
  const byStatus: Record<string, number> = {};
  const dueNow: LeadsSummary["dueNow"] = [];
  let newToday = 0;

  for (const l of leads) {
    const v = l.values;
    const status = (v["סטטוס"] || "—").trim();
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (isTodayIsrael(v["תאריך כניסה"], today)) newToday++;

    const rem = parseReminder(v["תזכורת"]);
    if (rem) {
      const bucket = bucketOf(rem, today);
      if (bucket === "overdue" || bucket === "today") {
        dueNow.push({
          name: v["שם"] || "—",
          phone: v["טלפון"] || "",
          status,
          due: relativeLabel(rem, today),
        });
      }
    }
  }
  return { total: leads.length, byStatus, newToday, dueNow, generatedAt: new Date().toISOString() };
}

// ── Clients (per-bot metrics) ─────────────────────────────────────────────────
export interface ClientSummary {
  id: string;
  name: string;
  workspace: string;
  health: string;
  messagesToday: number | null;
  failedMessages: number | null;
  openOrders: number | null;
  paidToday: number | null;
  revenueToday: number | null;
  newLeads: number | null;
  humanActive: number | null;
  lastActivityAt: string | null;
  error?: string;
}

export async function clientsSummary(): Promise<{ clients: ClientSummary[]; generatedAt: string }> {
  const clients = await loadClients();
  const out = await Promise.all(
    clients.map(async (c): Promise<ClientSummary> => {
      let tables: string[] = [];
      try {
        const schema = await introspect(c.supabaseRef);
        tables = clientTables(c, schema.tableNames);
      } catch {
        /* computeMetrics will carry the error */
      }
      const m = await computeMetrics(c.supabaseRef, tables.length ? tables : undefined);
      return {
        id: c.id,
        name: c.name,
        workspace: c.workspace,
        health: m.health,
        messagesToday: m.messagesToday,
        failedMessages: m.failedMessages,
        openOrders: m.openOrders,
        paidToday: m.paidToday,
        revenueToday: m.revenueToday,
        newLeads: m.newLeads,
        humanActive: m.humanActive,
        lastActivityAt: m.lastActivityAt,
        error: m.error,
      };
    })
  );
  return { clients: out, generatedAt: new Date().toISOString() };
}

// ── Bot / workflow health (n8n) ───────────────────────────────────────────────
export interface BotsStatus {
  totalWorkflows: number;
  active: number;
  inactive: number;
  activeNames: string[];
  inactiveNames: string[];
  recentErrors: { workflow: string | null; at: string | null; id: string }[];
  generatedAt: string;
}

export async function botsStatus(): Promise<BotsStatus> {
  const wfs = (await listWorkflows()).filter((w) => !w.archived);
  const active = wfs.filter((w) => w.active);
  const inactive = wfs.filter((w) => !w.active);

  let recentErrors: BotsStatus["recentErrors"] = [];
  try {
    recentErrors = (await listExecutions({ status: "error", limit: 15 })).map((e) => ({
      workflow: e.workflowName,
      at: e.startedAt,
      id: e.id,
    }));
  } catch {
    /* non-fatal: still return the workflow snapshot */
  }

  return {
    totalWorkflows: wfs.length,
    active: active.length,
    inactive: inactive.length,
    activeNames: active.map((w) => w.name),
    inactiveNames: inactive.map((w) => w.name),
    recentErrors,
    generatedAt: new Date().toISOString(),
  };
}

// ── Recent conversations (per client inbox, best-effort across payload shapes) ─
export interface ConversationsSummary {
  client: string;
  hasInbox: boolean;
  recent: { at: string | null; chatId: string | null; status: string | null; snippet: string | null }[];
  generatedAt: string;
}

const BODY_COLS = ["payload", "text", "body", "message", "content"] as const;

export async function conversationsSummary(
  clientId: string,
  limit = 15
): Promise<ConversationsSummary> {
  const client = (await loadClients()).find((c) => c.id === clientId);
  if (!client) throw new Error(`Unknown client: ${clientId}`);

  const schema = await introspect(client.supabaseRef);
  const allow = clientTables(client, schema.tableNames);
  const hasInbox = allow.includes("inbox") && schema.tableNames.includes("inbox");
  if (!hasInbox) {
    return { client: client.id, hasInbox: false, recent: [], generatedAt: new Date().toISOString() };
  }

  const cols = schema.tables["inbox"].map((x) => x.name);
  const tsCol = cols.includes("created_at") ? "created_at" : null;
  const chatCol = cols.includes("chat_id") ? "chat_id" : null;
  const statusCol = cols.includes("status") ? "status" : null;
  const bodyCol = BODY_COLS.find((x) => cols.includes(x)) ?? null;
  const n = Math.min(Math.max(Math.trunc(Number(limit) || 15), 1), 50);

  const sel = [
    chatCol ? `"${chatCol}" as chat_id` : `null as chat_id`,
    tsCol ? `"${tsCol}" as at` : `null as at`,
    statusCol ? `"${statusCol}" as status` : `null as status`,
    // ::text cast keeps this safe whether payload is jsonb or a plain text column.
    bodyCol ? `left("${bodyCol}"::text, 180) as snippet` : `null as snippet`,
  ].join(", ");
  const order = tsCol ? `order by "${tsCol}" desc` : "";

  const rows = await runSql<{
    chat_id: string | null;
    at: string | null;
    status: string | null;
    snippet: string | null;
  }>(client.supabaseRef, `select ${sel} from public.inbox ${order} limit ${n}`);

  return {
    client: client.id,
    hasInbox: true,
    recent: rows.map((r) => ({
      at: r.at,
      chatId: r.chat_id,
      status: r.status,
      snippet: r.snippet,
    })),
    generatedAt: new Date().toISOString(),
  };
}
