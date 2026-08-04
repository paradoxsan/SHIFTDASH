import { ok, fail, parseBody } from "@/lib/api-helpers";
import { approveCheckpoint, rejectCheckpoint, ProvisioningError } from "@/lib/provisioning/runner";
import { checkpointDecisionSchema } from "@/lib/validation/provisioning";
import { getCurrentUser } from "@/lib/current-user";
import type { CheckpointKind } from "@/lib/provisioning/state-machine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<CheckpointKind>(["pay_approval", "qr_pairing", "prompt_approval"]);

// Approve / reject a checkpoint. pay_approval = owner; qr/prompt = operator.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  try {
    const { id, kind } = await params;
    if (!KINDS.has(kind as CheckpointKind)) return fail(new Error(`Unknown checkpoint: ${kind}`), 404);

    const parsed = await parseBody(req, checkpointDecisionSchema);
    if (!parsed.ok) return parsed.res;
    const actor = await getCurrentUser(req);
    const cp = { jobId: id, kind: kind as CheckpointKind, actor, note: parsed.data.note };

    const job =
      parsed.data.decision === "approve" ? await approveCheckpoint(cp) : await rejectCheckpoint(cp);
    return ok({ job });
  } catch (e) {
    if (e instanceof ProvisioningError) return fail(e, 400);
    return fail(e); // ForbiddenError → 403
  }
}
