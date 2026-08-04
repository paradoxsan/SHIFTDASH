// Direct read access to a client's Supabase project, for technical diagnosis
// ("why did the bot stop processing that chat?"). The model writes the SQL and
// the existing guard validates it: single SELECT, allowlisted tables only, row
// capped, every attempt logged. The guard is the security boundary — not the
// model's good intentions.
import { z } from "zod";
import { defineTool } from "./types";
import { loadClients, getClient, clientTables } from "@/lib/registry";
import { introspect } from "@/lib/services/data-plane";
import { guardSelect, runGuardedSelect, logAiQuery } from "@/lib/ai/nl-sql";

const MAX_ROWS = 200;

async function allowedTablesFor(clientId: string) {
  await loadClients();
  const c = getClient(clientId);
  if (!c) throw new Error(`לקוח לא מוכר: ${clientId}`);
  const schema = await introspect(c.supabaseRef);
  return { client: c, schema, allowed: clientTables(c, schema.tableNames) };
}

export const describeTablesTool = defineTool({
  name: "describe_tables",
  description:
    "הטבלאות והעמודות שזמינות לשאילתה עבור לקוח. קרא לזה לפני query_data כדי לכתוב SQL נכון.",
  risk: "read" as const,
  schema: z.object({ client: z.string() }),
  summarize: (i) => `מבנה הטבלאות של ${i.client}`,
  async run({ client }) {
    const { schema, allowed } = await allowedTablesFor(client);
    return allowed.map((t) => ({
      table: t,
      columns: (schema.tables[t] ?? []).map((c) => `${c.name}:${c.type}`),
    }));
  },
});

export const queryDataTool = defineTool({
  name: "query_data",
  description:
    "הרצת שאילתת SELECT בודדת על הדאטהבייס של לקוח, לצורך אבחון טכני. " +
    "מותר SELECT בלבד, רק על טבלאות הלקוח, ועד 200 שורות. אין UPDATE/INSERT/DELETE.",
  risk: "read" as const,
  schema: z.object({
    client: z.string(),
    sql: z.string().describe("שאילתת SELECT אחת, בלי נקודה-פסיק ובלי הערות"),
  }),
  summarize: (i) => `שאילתה על ${i.client}`,
  async run({ client, sql }, ctx) {
    const { client: c, allowed } = await allowedTablesFor(client);
    const guard = guardSelect(sql, { allowedTables: allowed, maxRows: MAX_ROWS });
    if (!guard.ok) {
      await logAiQuery({
        userEmail: ctx.actor?.email ?? null,
        prompt: `[copilot] ${client}`,
        sql,
        allowed: false,
        reason: guard.reason,
      });
      throw new Error(`השאילתה נדחתה: ${guard.reason}. הטבלאות המותרות: ${allowed.join(", ")}`);
    }
    const rows = await runGuardedSelect(c.supabaseRef, sql, {
      allowedTables: allowed,
      maxRows: MAX_ROWS,
    });
    await logAiQuery({
      userEmail: ctx.actor?.email ?? null,
      prompt: `[copilot] ${client}`,
      sql: guard.sql ?? sql,
      allowed: true,
      rowCount: rows.length,
    });
    return { sql: guard.sql, rowCount: rows.length, rows };
  },
});
