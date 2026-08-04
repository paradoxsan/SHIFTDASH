import { ok, fail } from "@/lib/api-helpers";
import { setWorkflowActive } from "@/lib/n8n";
import { getCurrentUser } from "@/lib/current-user";
import { auditedMutation } from "@/lib/services/audited";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { active?: boolean };
    if (typeof body.active !== "boolean") {
      return fail(new Error("Body must include { active: boolean }"), 400);
    }
    const active = body.active;
    const actor = await getCurrentUser(req);
    const workflow = await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "n8n.workflow.toggle",
        targetType: "workflow",
        targetId: id,
        payload: { active },
      },
      () => setWorkflowActive(id, active)
    );
    return ok({ workflow });
  } catch (e) {
    return fail(e);
  }
}
