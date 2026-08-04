import { ok, fail } from "@/lib/api-helpers";
import { listWorkflows } from "@/lib/n8n";
import { getClient, workflowMatchesClient } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const clientId = new URL(req.url).searchParams.get("client");
    const client = clientId ? getClient(clientId) : null;
    let workflows = await listWorkflows();
    if (client) workflows = workflows.filter((w) => workflowMatchesClient(client, w.name));
    return ok({ workflows });
  } catch (e) {
    return fail(e);
  }
}
