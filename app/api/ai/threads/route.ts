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
    return ok({ threads: await listThreads(actor?.email ?? null) });
  } catch (e) {
    return fail(e);
  }
}
