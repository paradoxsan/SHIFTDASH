import { ok, fail } from "@/lib/api-helpers";
import { env } from "@/lib/env";
import { getClients, clientTables, toPublic, WORKSPACES } from "@/lib/registry";
import { introspect } from "@/lib/supabase-management";
import { computeMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tokens = env.whapiTokens();
    const clients = await Promise.all(
      getClients().map(async (c) => {
        let tables: string[] = [];
        try {
          const schema = await introspect(c.supabaseRef);
          tables = clientTables(c, schema.tableNames);
        } catch {
          /* metrics call will carry the error */
        }
        const metrics = await computeMetrics(c.supabaseRef, tables.length ? tables : undefined);
        const whapiKey = c.whapiKey ?? c.supabaseRef;
        return {
          ...toPublic(c),
          supabaseRef: c.supabaseRef,
          whapiKey,
          hasWhapi: Boolean(tokens[whapiKey]),
          tables,
          metrics,
        };
      })
    );
    return ok({ workspaces: WORKSPACES, clients });
  } catch (e) {
    return fail(e);
  }
}
