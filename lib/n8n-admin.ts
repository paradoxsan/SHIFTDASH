// ── n8n workflow admin (BotOps Phase 6) ───────────────────────────────────────
// Productizes the proven GET→patch→PUT flow for deploying/updating a workflow.
// Two hard-won rules from the live SDR/T-CENTER work:
//   1. NEVER re-serialize or rebuild `connections` — pass them through verbatim
//      (reconstructing them drops edges / corrupts the graph).
//   2. The n8n PUBLIC API PUT accepts only {name, nodes, connections, settings}
//      and REJECTS extra settings props (binaryMode/availableInMCP) and top-level
//      fields (id/active/tags) — so settings must be cleaned before PUT.
import { env } from "./env";

function headers(): HeadersInit {
  return { "X-N8N-API-KEY": env.n8nApiKey(), accept: "application/json", "content-type": "application/json" };
}
function url(path: string): string {
  return `${env.n8nBaseUrl()}/api/v1${path}`;
}

/** Full RAW workflow (all node params + connections), unlike lib/n8n getWorkflow. */
export async function getRawWorkflow(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(url(`/workflows/${id}`), { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`n8n GET workflow ${id} ${res.status}: ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>;
}

// Settings keys the public PUT API accepts. Anything else (binaryMode,
// availableInMCP, …) is dropped — sending them 400s.
const ALLOWED_SETTINGS = [
  "executionOrder",
  "saveDataErrorExecution",
  "saveDataSuccessExecution",
  "saveManualExecutions",
  "saveExecutionProgress",
  "executionTimeout",
  "errorWorkflow",
  "timezone",
  "callerPolicy",
] as const;

export function cleanSettings(settings: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (settings && typeof settings === "object") {
    for (const k of ALLOWED_SETTINGS) {
      if (k in (settings as Record<string, unknown>)) out[k] = (settings as Record<string, unknown>)[k];
    }
  }
  if (!("executionOrder" in out)) out.executionOrder = "v1";
  return out;
}

/** The PUT body the public API accepts — connections passed through verbatim. */
export function toPutBody(wf: Record<string, unknown>): {
  name: unknown;
  nodes: unknown;
  connections: unknown;
  settings: Record<string, unknown>;
} {
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections, // verbatim — never rebuilt
    settings: cleanSettings(wf.settings),
  };
}

/**
 * Non-destructive update: snapshot the current live workflow FIRST (returned to
 * the caller for the rollback target), then PUT the new one. The caller is
 * responsible for persisting the snapshot as a bot_artifacts version.
 */
export async function putWorkflow(
  id: string,
  next: Record<string, unknown>
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> {
  const before = await getRawWorkflow(id);
  const res = await fetch(url(`/workflows/${id}`), {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(toPutBody(next)),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n PUT workflow ${id} ${res.status}: ${await res.text()}`);
  return { before, after: (await res.json()) as Record<string, unknown> };
}
