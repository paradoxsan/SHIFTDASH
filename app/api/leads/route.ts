import { ok, fail } from "@/lib/api-helpers";
import { listLeads, updateLeadCells } from "@/lib/leads-sheet";
import { getCurrentUser } from "@/lib/current-user";
import { auditedMutation } from "@/lib/services/audited";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await listLeads());
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      rowIndex?: number;
      updates?: Record<string, string>;
    };
    if (!body.rowIndex || !body.updates || typeof body.updates !== "object") {
      return fail(new Error("rowIndex and updates are required"), 400);
    }
    const rowIndex = body.rowIndex;
    const updates = body.updates;
    const actor = await getCurrentUser(req);
    await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "leads.update",
        targetType: "lead",
        targetId: String(rowIndex),
        payload: { fields: Object.keys(updates) },
      },
      () => updateLeadCells(rowIndex, updates)
    );
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
