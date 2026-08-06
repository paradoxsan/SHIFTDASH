// The unified WhatsApp inbox — every bot channel in one stream (phase 4).
// Read-only: sending, muting and reading a thread stay on the existing
// per-channel routes (/api/whapi/[ref]/*, /api/clients/[client]/human-mode).
import { ok, fail } from "@/lib/api-helpers";
import { loadInbox } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await loadInbox());
  } catch (e) {
    return fail(e);
  }
}
