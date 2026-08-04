import { ok, fail, parseBody } from "@/lib/api-helpers";
import { selectRows, updateRowByPk, QueryBuilderError } from "@/lib/services/query-builder";
import { tablePatchSchema } from "@/lib/validation/table-patch";
import { getCurrentUser } from "@/lib/current-user";
import { assertKnownRef } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string; table: string }> }
) {
  try {
    const { ref, table } = await params;
    assertKnownRef(ref);
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

    // Truncate large text/json columns so the explorer never ships megabytes
    // (e.g. base64 media in `graphics.file_b64`).
    const result = await selectRows(ref, table, { limit, offset, truncateText: true });
    return ok(result);
  } catch (e) {
    if (e instanceof QueryBuilderError) return fail(e, 404);
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
    assertKnownRef(ref);
    const parsed = await parseBody(req, tablePatchSchema);
    if (!parsed.ok) return parsed.res;
    const { pk, set } = parsed.data;

    const actor = await getCurrentUser(req);
    // The query builder validates identifiers against live introspection,
    // enforces PK-scoping, and audits the mutation (RBAC: operator).
    const { updated } = await updateRowByPk({ ref, table, pk, set, actor });
    return ok({ ok: true, updated });
  } catch (e) {
    if (e instanceof QueryBuilderError) return fail(e, 400);
    return fail(e);
  }
}
