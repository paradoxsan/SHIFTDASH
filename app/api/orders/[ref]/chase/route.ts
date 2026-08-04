import { ok, fail, parseBody } from "@/lib/api-helpers";
import { listChaseableOrders, chaseOrder, OperatorError } from "@/lib/services/operator";
import { chaseSchema } from "@/lib/validation/operator";
import { getCurrentUser } from "@/lib/current-user";
import { introspect } from "@/lib/services/data-plane";
import { assertKnownRef } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List open orders with a payment link, annotated with chase eligibility.
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    assertKnownRef(ref);
    const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 100), 1), 300);

    const schema = await introspect(ref);
    if (!schema.tableNames.includes("orders")) return ok({ supported: false, items: [] });

    return ok({ supported: true, items: await listChaseableOrders(ref, { limit }) });
  } catch (e) {
    return fail(e);
  }
}

// Resend the payment link for ONE open order via WHAPI. Honours human takeover.
// Audited (operator.chaseOrder → auditedMutation, action: order.chase).
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    assertKnownRef(ref);
    const parsed = await parseBody(req, chaseSchema);
    if (!parsed.ok) return parsed.res;

    const actor = await getCurrentUser(req);
    const out = await chaseOrder({ ref, orderId: parsed.data.orderId, actor, message: parsed.data.message });
    return ok({ ok: true, ...out });
  } catch (e) {
    if (e instanceof OperatorError) return fail(e, 400);
    return fail(e); // ForbiddenError → 403 via fail()
  }
}
