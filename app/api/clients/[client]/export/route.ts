import { fail } from "@/lib/api-helpers";
import { getClient, clientTables } from "@/lib/registry";
import { introspect } from "@/lib/services/data-plane";
import { selectRows } from "@/lib/services/query-builder";
import { toCsv } from "@/lib/exports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Export a client table to CSV via the allowlisted, row-capped select path.
export async function GET(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    const c = getClient(client);
    if (!c) return fail(new Error(`Unknown client: ${client}`), 404);

    const table = new URL(req.url).searchParams.get("table") ?? "";
    const schema = await introspect(c.supabaseRef);
    const allowed = clientTables(c, schema.tableNames);
    if (!table || !allowed.includes(table)) {
      return fail(new Error(`table not allowed for this client: ${table || "(missing)"}`), 400);
    }

    const result = await selectRows(c.supabaseRef, table, { limit: 5000 });
    const csv = toCsv(result.rows, result.columns.map((col) => col.name));
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${client}-${table}.csv"`,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
