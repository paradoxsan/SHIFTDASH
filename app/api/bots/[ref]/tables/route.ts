import { ok, fail } from "@/lib/api-helpers";
import { introspect, runSql } from "@/lib/supabase-management";
import type { TableInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const schema = await introspect(ref);
    const counts = await runSql<{ relname: string; n_live_tup: number }>(
      ref,
      `select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public'`
    );
    const countMap = new Map(counts.map((c) => [c.relname, Number(c.n_live_tup)]));

    const tables: TableInfo[] = schema.tableNames.map((name) => ({
      name,
      columns: schema.tables[name],
      approxRows: countMap.has(name) ? countMap.get(name)! : null,
      primaryKeys: schema.pks[name] ?? [],
    }));
    return ok({ tables });
  } catch (e) {
    return fail(e);
  }
}
