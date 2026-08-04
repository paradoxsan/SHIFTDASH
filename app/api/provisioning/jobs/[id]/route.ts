import { ok, fail } from "@/lib/api-helpers";
import { jobStatus, retryJob, ProvisioningError } from "@/lib/provisioning/runner";
import { getCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Job status (job + checkpoints).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await jobStatus(id));
  } catch (e) {
    if (e instanceof ProvisioningError) return fail(e, 404);
    return fail(e);
  }
}

// Retry a failed step from the current state (idempotent). Operator+.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await getCurrentUser(_req);
    const job = await retryJob(id, actor);
    return ok({ job });
  } catch (e) {
    if (e instanceof ProvisioningError) return fail(e, 400);
    return fail(e); // ForbiddenError → 403
  }
}
