// The agent roster for the copilot's picker: the agency assistant plus one
// dedicated agent per client. Every live client has an agent by default — the
// client_agents row only carries overrides — so this is derived from the
// registry rather than from a table someone has to remember to populate.
import { ok, fail } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { loadClients } from "@/lib/registry";
import { listClientAgents } from "@/lib/ai/client-agents";
import { knowledgeCountsBySlug } from "@/lib/ai/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "viewer");

    const [clients, agents, counts] = await Promise.all([
      loadClients(),
      listClientAgents().catch(() => []),
      knowledgeCountsBySlug().catch(() => ({}) as Record<string, number>),
    ]);
    const overrides = new Map(agents.map((a) => [a.slug, a]));
    const disabled = new Set(
      // listClientAgents already drops disabled agents, so anything in the
      // registry that it did not return is either off or missing a bot row.
      clients.map((c) => c.id).filter((id) => !overrides.has(id))
    );

    return ok({
      agents: clients
        .filter((c) => !disabled.has(c.id))
        .map((c) => ({
          client: c.id,
          name: overrides.get(c.id)?.displayName || c.name,
          workspace: c.workspace,
          accent: c.accent ?? null,
          knowledgeCount: counts[c.id] ?? 0,
        })),
    });
  } catch (e) {
    return fail(e);
  }
}
