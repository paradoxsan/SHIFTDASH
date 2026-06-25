import { ok, fail } from "@/lib/api-helpers";
import { listProjects } from "@/lib/supabase-management";
import { computeMetrics } from "@/lib/metrics";
import type { BotWithMetrics } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bots = await listProjects();
    const withMetrics: BotWithMetrics[] = await Promise.all(
      bots.map(async (b) => ({ ...b, metrics: await computeMetrics(b.ref) }))
    );
    return ok({ bots: withMetrics });
  } catch (e) {
    return fail(e);
  }
}
