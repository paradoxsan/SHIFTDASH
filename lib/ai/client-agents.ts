// ── Client agent records (migration 0012) ─────────────────────────────────────
// Optional per-client overrides for the agent's name and prompt. A client with
// no row here still HAS an agent — one built from its control-plane record and
// its dossier — so onboarding a client never requires remembering to create its
// agent. This table only carries what cannot be derived.
import { runSql } from "../supabase-management";
import { controlPlaneRef } from "../control-plane";
import { sqlString } from "../sql";

const cp = () => controlPlaneRef();

export interface ClientAgent {
  tenantId: string;
  slug: string;
  displayName: string | null;
  persona: string | null;
  enabled: boolean;
}

interface AgentRow {
  tenant_id: string;
  slug: string;
  display_name: string | null;
  persona: string | null;
  enabled: boolean | null;
  has_row: boolean;
}

function toAgent(r: AgentRow): ClientAgent {
  return {
    tenantId: r.tenant_id,
    slug: r.slug,
    displayName: r.display_name,
    persona: r.persona,
    // A missing row means "default agent", which is enabled. Only an explicit
    // row can turn an agent off.
    enabled: r.has_row ? r.enabled !== false : true,
  };
}

const SELECT = `select t.id as tenant_id, b.slug, a.display_name, a.persona, a.enabled,
                       (a.tenant_id is not null) as has_row
                  from botops.bots b
                  join botops.tenants t on t.id = b.tenant_id
                  left join botops.client_agents a on a.tenant_id = t.id
                 where b.status <> 'archived' and t.status <> 'archived'`;

/** Every client that has an agent, keyed by bot slug. */
export async function listClientAgents(): Promise<ClientAgent[]> {
  const rows = await runSql<AgentRow>(cp(), `${SELECT} order by b.slug`);
  return rows.map(toAgent).filter((a) => a.enabled);
}

export async function getClientAgent(slug: string): Promise<ClientAgent | null> {
  const rows = await runSql<AgentRow>(cp(), `${SELECT} and b.slug = ${sqlString(slug)} limit 1`);
  const row = rows[0];
  return row ? toAgent(row) : null;
}

export interface ClientAgentPatch {
  displayName?: string | null;
  persona?: string | null;
  enabled?: boolean;
}

/**
 * NOT audited here on purpose — the caller wraps this in auditedMutation so RBAC
 * and the audit row are enforced at one boundary (see lib/services/audited.ts).
 */
export async function upsertClientAgent(tenantId: string, patch: ClientAgentPatch): Promise<void> {
  const cols: Array<[string, string]> = [];
  if (patch.displayName !== undefined)
    cols.push(["display_name", patch.displayName ? sqlString(patch.displayName) : "null"]);
  if (patch.persona !== undefined)
    cols.push(["persona", patch.persona ? sqlString(patch.persona) : "null"]);
  if (patch.enabled !== undefined) cols.push(["enabled", patch.enabled ? "true" : "false"]);
  if (cols.length === 0) return;

  const names = ["tenant_id", ...cols.map(([c]) => c)].join(", ");
  const values = [`${sqlString(tenantId)}::uuid`, ...cols.map(([, v]) => v)].join(", ");
  const updates = [...cols.map(([c]) => `${c} = excluded.${c}`), "updated_at = now()"].join(", ");

  await runSql(
    cp(),
    `insert into botops.client_agents (${names})
       values (${values})
     on conflict (tenant_id) do update set ${updates}`
  );
}
