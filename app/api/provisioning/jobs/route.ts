import { ok, fail, parseBody } from "@/lib/api-helpers";
import { startJob, ProvisioningError } from "@/lib/provisioning/runner";
import { listJobs } from "@/lib/provisioning/store";
import { startJobSchema } from "@/lib/validation/provisioning";
import { getCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ jobs: await listJobs() });
  } catch (e) {
    return fail(e);
  }
}

// Start a provisioning job. Owner-only (initiates the cost decision). Halts at
// the 💲 checkpoint — creates NO paid resource until an owner approves.
export async function POST(req: Request) {
  try {
    const parsed = await parseBody(req, startJobSchema);
    if (!parsed.ok) return parsed.res;
    const actor = await getCurrentUser(req);
    const job = await startJob({ ...parsed.data, actor });
    return ok({ job });
  } catch (e) {
    if (e instanceof ProvisioningError) return fail(e, 400);
    return fail(e); // ForbiddenError → 403
  }
}
