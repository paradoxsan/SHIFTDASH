import { ok, fail } from "@/lib/api-helpers";
import { sendText } from "@/lib/whapi";
import { getCurrentUser } from "@/lib/current-user";
import { auditedMutation } from "@/lib/services/audited";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const body = (await req.json().catch(() => ({}))) as { to?: string; body?: string };
    if (!body.to || !body.body) return fail(new Error("to and body are required"), 400);
    const to = body.to;
    const text = body.body;
    const actor = await getCurrentUser(req);
    const result = await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "whapi.send",
        targetType: ref,
        targetId: to,
        payload: { length: text.length },
      },
      () => sendText(ref, to, text)
    );
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
