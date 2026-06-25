import { ok, fail } from "@/lib/api-helpers";
import { introspect, runSql } from "@/lib/supabase-management";
import { sqlValue } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string; table: string }> }
) {
  try {
    const { ref, table } = await params;
    const schema = await introspect(ref);
    if (!schema.tableNames.includes(table)) {
      return fail(new Error(`Unknown table: ${table}`), 404);
    }
    const cols = schema.tables[table];

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

    // Truncate large text/json columns so the explorer never ships megabytes
    // (e.g. base64 media in `graphics.file_b64`).
    const selectList = cols
      .map((c) => {
        const t = c.type.toLowerCase();
        if (t.includes("json")) return `left("${c.name}"::text, 500) as "${c.name}"`;
        if (t === "text" || t.includes("char")) return `left("${c.name}", 300) as "${c.name}"`;
        return `"${c.name}"`;
      })
      .join(", ");

    const orderCol =
      cols.find((c) => c.name === "created_at")?.name ??
      cols.find((c) => c.name === "updated_at")?.name ??
      cols.find((c) => c.name === "id")?.name ??
      cols[0]?.name;
    const orderClause = orderCol ? `order by "${orderCol}" desc` : "";

    const rows = await runSql(
      ref,
      `select ${selectList} from public."${table}" ${orderClause} limit ${limit} offset ${offset}`
    );
    return ok({ table, columns: cols, rows, limit, offset, primaryKeys: schema.pks[table] ?? [] });
  } catch (e) {
    return fail(e);
  }
}

// Update a single row, identified by its primary key.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ref: string; table: string }> }
) {
  try {
    const { ref, table } = await params;
    const schema = await introspect(ref);
    if (!schema.tableNames.includes(table)) return fail(new Error(`Unknown table: ${table}`), 404);

    const cols = schema.tables[table];
    const colType = new Map(cols.map((c) => [c.name, c.type]));
    const pks = schema.pks[table] ?? [];
    if (pks.length === 0) return fail(new Error("לטבלה אין מפתח ראשי — עריכה לא נתמכת"), 400);

    const body = (await req.json().catch(() => ({}))) as {
      pk?: Record<string, unknown>;
      set?: Record<string, unknown>;
    };
    const pk = body.pk ?? {};
    const set = body.set ?? {};

    for (const k of pks) {
      if (!(k in pk)) return fail(new Error(`חסר ערך מפתח: ${k}`), 400);
    }
    const setCols = Object.keys(set).filter((c) => colType.has(c) && !pks.includes(c));
    if (setCols.length === 0) return fail(new Error("אין שינויים לשמירה"), 400);

    const setClause = setCols
      .map((c) => `"${c}" = ${sqlValue(set[c], colType.get(c)!)}`)
      .join(", ");
    const whereClause = pks
      .map((k) => `"${k}" = ${sqlValue(pk[k], colType.get(k)!)}`)
      .join(" and ");

    await runSql(ref, `update public."${table}" set ${setClause} where ${whereClause}`);
    return ok({ ok: true, updated: setCols });
  } catch (e) {
    return fail(e);
  }
}
