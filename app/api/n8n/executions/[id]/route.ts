import { ok, fail } from "@/lib/api-helpers";
import { getExecutionDetail } from "@/lib/n8n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase 5: enriched drill-down — failed node + error + the item it processed +
// 24h failure rate for the workflow.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok({ detail: await getExecutionDetail(id) });
  } catch (e) {
    return fail(e);
  }
}
