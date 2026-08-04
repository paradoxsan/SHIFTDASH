import { ok, fail } from "@/lib/api-helpers";
import { getWorkflow, listExecutions } from "@/lib/n8n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [workflow, executions] = await Promise.all([
      getWorkflow(id),
      listExecutions({ workflowId: id, limit: 10 }),
    ]);
    return ok({ workflow, executions });
  } catch (e) {
    return fail(e);
  }
}
