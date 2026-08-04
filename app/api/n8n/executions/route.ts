import { ok, fail } from "@/lib/api-helpers";
import { listExecutions } from "@/lib/n8n";
import { getClient, workflowMatchesClient } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("status");
    const status =
      raw === "success" || raw === "error" || raw === "waiting" ? raw : undefined;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
    const clientId = url.searchParams.get("client");
    const client = clientId ? getClient(clientId) : null;

    // When scoped to a client, fetch a wider window then filter by workflow name.
    let executions = await listExecutions({ status, limit: client ? 200 : limit });
    if (client) {
      executions = executions
        .filter((e) => e.workflowName && workflowMatchesClient(client, e.workflowName))
        .slice(0, limit);
    }
    return ok({ executions });
  } catch (e) {
    return fail(e);
  }
}
