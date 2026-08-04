// Internal Copilot API — per-client bot metrics summary (read-only, bearer auth).
import { ok, fail } from "@/lib/api-helpers";
import { checkCopilotAuth } from "@/lib/copilot/auth";
import { clientsSummary } from "@/lib/copilot/summaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = checkCopilotAuth(req);
  if (denied) return denied;
  try {
    return ok(await clientsSummary());
  } catch (e) {
    return fail(e);
  }
}
