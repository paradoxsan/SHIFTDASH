import { ok, fail } from "@/lib/api-helpers";
import { listTablesWithCounts } from "@/lib/services/query-builder";
import { assertKnownRef } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    assertKnownRef(ref);
    const tables = await listTablesWithCounts(ref);
    return ok({ tables });
  } catch (e) {
    return fail(e);
  }
}
