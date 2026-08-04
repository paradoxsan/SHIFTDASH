import { ok, fail } from "@/lib/api-helpers";
import { getClient } from "@/lib/registry";
import { getAnalytics } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-bot analytics (heatmap + revenue + totals) via the allowlisted aggregate
// path (no direct runSql from the route). Read-only.
export async function GET(_req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    const c = getClient(client);
    if (!c) return fail(new Error(`Unknown client: ${client}`), 404);
    return ok(await getAnalytics(c));
  } catch (e) {
    return fail(e);
  }
}
