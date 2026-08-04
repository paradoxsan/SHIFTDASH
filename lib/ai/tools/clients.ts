// Read tools describing the agency's client portfolio and each bot's health.
// Deliberately excludes the clients' own business metrics (order funnels, lead
// pipelines) — the dashboard exists to run the agency, not the clients.
import { z } from "zod";
import { defineTool } from "./types";
import { loadClients, getClient, workflowMatchesClient } from "@/lib/registry";
import { listBotIdentity } from "@/lib/control-plane";
import { listBotHealth, listEvents } from "@/lib/events";
import { listWorkflows, listExecutions } from "@/lib/n8n";
import { hasWhapi } from "@/lib/whapi";

export const listClientsTool = defineTool({
  name: "list_clients",
  description:
    "רשימת כל הלקוחות שהסוכנות מנהלת עבורם בוטים, כולל מזהה (slug), שם, סביבת עבודה, " +
    "ופרויקט ה-Supabase שלהם. נקודת הפתיחה לכל שאלה על לקוח מסוים.",
  risk: "read" as const,
  schema: z.object({}),
  summarize: () => "רשימת לקוחות",
  async run() {
    const clients = await loadClients();
    return clients.map((c) => ({
      id: c.id,
      name: c.name,
      workspace: c.workspace,
      supabaseRef: c.supabaseRef,
      hasWhatsapp: hasWhapi(c.whapiKey ?? c.supabaseRef),
      n8nPrefixes: c.n8nPrefixes,
    }));
  },
});

export const clientHealthTool = defineTool({
  name: "client_health",
  description:
    "מצב הבריאות של הבוט של לקוח: אילו workflows שלו פעילים/כבויים ב-n8n, כמה ריצות " +
    "נכשלו ב-24 השעות האחרונות, וההתראות הפתוחות שלו. זו האחריות התפעולית של הסוכנות.",
  risk: "read" as const,
  schema: z.object({
    client: z.string().describe("מזהה הלקוח (slug) מ-list_clients"),
  }),
  summarize: (i) => `בריאות הבוט של ${i.client}`,
  async run({ client }) {
    await loadClients();
    const c = getClient(client);
    if (!c) throw new Error(`לקוח לא מוכר: ${client}`);

    const [workflows, recent, health, identities, events] = await Promise.all([
      listWorkflows().catch(() => []),
      listExecutions({ limit: 250 }).catch(() => []),
      listBotHealth().catch(() => ({} as Record<string, { status: string; updated_at: string }>)),
      listBotIdentity().catch(() => []),
      listEvents({ status: "open", limit: 200 }).catch(() => []),
    ]);

    const mine = workflows.filter((w) => workflowMatchesClient(c, w.name));
    const ids = new Set(mine.map((w) => w.id));
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const runs = recent.filter(
      (e) => e.workflowId && ids.has(e.workflowId) && e.startedAt && new Date(e.startedAt).getTime() >= cutoff
    );
    const errors = runs.filter((e) => e.status === "error");

    const botId = identities.find((b) => b.slug === c.id)?.id ?? null;

    return {
      client: c.id,
      name: c.name,
      rollupStatus: botId ? health[botId]?.status ?? "unknown" : "unknown",
      workflows: mine.map((w) => ({ id: w.id, name: w.name, active: w.active })),
      inactiveWorkflows: mine.filter((w) => !w.active).map((w) => w.name),
      runs24h: runs.length,
      errors24h: errors.length,
      lastErrors: errors.slice(0, 5).map((e) => ({
        executionId: e.id,
        workflow: e.workflowName,
        at: e.startedAt,
      })),
      openEvents: events
        .filter((e) => !botId || e.bot_id === botId)
        .map((e) => ({ id: e.id, type: e.type, severity: e.severity, at: e.created_at })),
    };
  },
});
