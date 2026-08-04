// Internal Copilot API — recent inbox conversations per client (read-only, bearer auth).
// Query: ?client=<clientId>&limit=<1..50>  (defaults: t-center, 15)
import { ok, fail } from "@/lib/api-helpers";
import { checkCopilotAuth } from "@/lib/copilot/auth";
import { conversationsSummary } from "@/lib/copilot/summaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = checkCopilotAuth(req);
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const client = url.searchParams.get("client") ?? "t-center";
    const limit = Number(url.searchParams.get("limit") ?? "15");
    return ok(await conversationsSummary(client, Number.isFinite(limit) ? limit : 15));
  } catch (e) {
    return fail(e);
  }
}
