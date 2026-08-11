import { ok, fail } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { listThreads } from "@/lib/ai/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "viewer");

    // ?client=t-center → that agent's threads. ?client=agency → the agency
    // copilot's own. Absent → everything, which is what the old dock expects.
    const raw = new URL(req.url).searchParams.get("client");
    const client = raw === null ? undefined : raw === "agency" ? null : raw;

    return ok({ threads: await listThreads(actor?.email ?? null, { client }) });
  } catch (e) {
    return fail(e);
  }
}
