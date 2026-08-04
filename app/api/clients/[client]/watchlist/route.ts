import { ok, fail } from "@/lib/api-helpers";
import { getClient } from "@/lib/registry";
import { introspect } from "@/lib/services/data-plane";
import { listHumanModeActive } from "@/lib/human-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Human-takeover watchlist for a client: chats a human is handling, newest
// first, flagging those whose silence window has elapsed. Read-only.
export async function GET(_req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    const c = getClient(client);
    if (!c) return fail(new Error(`Unknown client: ${client}`), 404);

    const schema = await introspect(c.supabaseRef);
    if (!schema.tableNames.includes("human_mode")) return ok({ supported: false, items: [] });

    return ok({ supported: true, items: await listHumanModeActive(c.supabaseRef) });
  } catch (e) {
    return fail(e);
  }
}
