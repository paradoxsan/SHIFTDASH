import { ok, fail, parseBody } from "@/lib/api-helpers";
import { getClient, clientTables } from "@/lib/registry";
import { introspect } from "@/lib/services/data-plane";
import { generateSql, guardSelect, runGuardedSelect, logAiQuery } from "@/lib/ai/nl-sql";
import { auditedMutation } from "@/lib/services/audited";
import { getCurrentUser } from "@/lib/current-user";
import { env } from "@/lib/env";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  client: z.string().min(1),
  question: z.string().min(1).max(500),
});

// Natural-language query: Claude proposes a SELECT, the guard validates it
// (SELECT-only, allowlisted tables, row-capped), it runs read-only, and EVERY
// attempt (allowed or rejected) is logged. Operator-gated + audited.
export async function POST(req: Request) {
  try {
    const parsed = await parseBody(req, querySchema);
    if (!parsed.ok) return parsed.res;
    if (!env.aiConfigured()) return fail(new Error("AI not configured (ANTHROPIC_API_KEY missing)"), 503);

    const { client, question } = parsed.data;
    const c = getClient(client);
    if (!c) return fail(new Error(`Unknown client: ${client}`), 404);

    const actor = await getCurrentUser(req);
    const schema = await introspect(c.supabaseRef);
    const allowed = clientTables(c, schema.tableNames);
    const schemaHint = allowed
      .map((t) => `${t}(${(schema.tables[t] ?? []).map((col) => col.name).join(", ")})`)
      .join("\n");

    const result = await auditedMutation(
      { actor, minRole: "operator", action: "ai.query", targetType: client, payload: { question } },
      async () => {
        const sql = await generateSql(question, allowed, schemaHint);
        const guard = guardSelect(sql, { allowedTables: allowed, maxRows: 500 });
        if (!guard.ok) {
          await logAiQuery({ userEmail: actor?.email ?? null, prompt: question, sql, allowed: false, reason: guard.reason });
          throw new Error(`query rejected: ${guard.reason}`);
        }
        const rows = await runGuardedSelect(c.supabaseRef, sql, { allowedTables: allowed, maxRows: 500 });
        await logAiQuery({ userEmail: actor?.email ?? null, prompt: question, sql: guard.sql ?? sql, allowed: true, rowCount: rows.length });
        return { sql: guard.sql, rows };
      }
    );
    return ok(result);
  } catch (e) {
    return fail(e); // ForbiddenError → 403; guard rejection → 500 with reason
  }
}
