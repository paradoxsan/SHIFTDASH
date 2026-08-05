// One client's full card — health, open alerts, contract and payment state.
import { ok, fail } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { buildClientCard } from "@/lib/services/client-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "viewer");
    const card = await buildClientCard(client);
    if (!card) return fail(new Error(`Unknown client: ${client}`), 404);
    return ok(card);
  } catch (e) {
    return fail(e);
  }
}
