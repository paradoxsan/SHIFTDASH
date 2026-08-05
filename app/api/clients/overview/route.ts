// The לקוחות screen in one request: every client's bot health, open alerts,
// payment state and contract.
//
// Path note: this is a STATIC segment sitting next to `[client]`. Next resolves
// static before dynamic, so a client whose slug was literally "overview" would
// be shadowed. No slug comes close, and the alternative (a query flag on
// /api/clients) would mean one route returning two unrelated shapes.
import { ok, fail } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { buildClientCards } from "@/lib/services/client-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "viewer");
    return ok(await buildClientCards());
  } catch (e) {
    return fail(e);
  }
}
