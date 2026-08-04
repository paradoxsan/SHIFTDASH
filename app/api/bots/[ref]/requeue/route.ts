import { ok, fail, parseBody } from "@/lib/api-helpers";
import { requeueInboxRow, OperatorError } from "@/lib/services/operator";
import { requeueSchema } from "@/lib/validation/operator";
import { getCurrentUser } from "@/lib/current-user";
import { assertKnownRef } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Requeue ONE failed/stuck inbox row by id. PK-scoped, attempts-capped, audited
// (the mutation funnels through operator.requeueInboxRow → updateRowByPk).
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    assertKnownRef(ref);
    const parsed = await parseBody(req, requeueSchema);
    if (!parsed.ok) return parsed.res;

    const actor = await getCurrentUser(req);
    const out = await requeueInboxRow({ ref, id: parsed.data.id, actor });
    return ok({ ok: true, ...out });
  } catch (e) {
    if (e instanceof OperatorError) return fail(e, 400);
    return fail(e); // ForbiddenError → 403 via fail()
  }
}
