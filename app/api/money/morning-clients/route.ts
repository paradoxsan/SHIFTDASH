// Morning's own customer list, for the one-time "which Morning client is this?"
// link on a client card. Read-only, and deliberately a separate endpoint so the
// clients screen doesn't pay for it on every load.
import { ok, fail } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { listMorningClients, morningConfigured } from "@/lib/morning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "owner");
    if (!morningConfigured()) return ok({ connected: false, clients: [] });
    return ok({ connected: true, clients: await listMorningClients() });
  } catch (e) {
    return fail(e);
  }
}
