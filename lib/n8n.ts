// n8n public REST API client.
//   • read: list workflows, list/inspect executions
//   • write: activate / deactivate a workflow (the only mutating calls)
import { env } from "./env";
import type {
  N8nWorkflow,
  N8nWorkflowDetail,
  N8nNode,
  N8nExecution,
  ExecStatus,
} from "./types";

function headers(): HeadersInit {
  return { "X-N8N-API-KEY": env.n8nApiKey(), accept: "application/json" };
}
function url(path: string): string {
  return `${env.n8nBaseUrl()}/api/v1${path}`;
}

interface RawWorkflow {
  id: string | number;
  name: string;
  active?: boolean;
  isArchived?: boolean;
  tags?: (string | { name: string })[];
  updatedAt?: string;
}

function mapWorkflow(w: RawWorkflow): N8nWorkflow {
  return {
    id: String(w.id),
    name: w.name,
    active: Boolean(w.active),
    archived: Boolean(w.isArchived),
    tags: (w.tags ?? []).map((t) => (typeof t === "string" ? t : t.name)),
    updatedAt: w.updatedAt ?? null,
  };
}

export async function listWorkflows(): Promise<N8nWorkflow[]> {
  const out: N8nWorkflow[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL(url("/workflows"));
    u.searchParams.set("limit", "250");
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`n8n /workflows ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { data?: RawWorkflow[]; nextCursor?: string | null };
    for (const w of data.data ?? []) out.push(mapWorkflow(w));
    cursor = data.nextCursor ?? undefined;
  } while (cursor);
  return out.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export async function setWorkflowActive(id: string, active: boolean): Promise<N8nWorkflow> {
  const action = active ? "activate" : "deactivate";
  const res = await fetch(url(`/workflows/${id}/${action}`), {
    method: "POST",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n ${action} ${id} ${res.status}: ${await res.text()}`);
  return mapWorkflow((await res.json()) as RawWorkflow);
}

export async function getWorkflow(id: string): Promise<N8nWorkflowDetail> {
  const res = await fetch(url(`/workflows/${id}`), { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`n8n /workflows/${id} ${res.status}: ${await res.text()}`);
  const w = (await res.json()) as RawWorkflow & {
    nodes?: { name: string; type: string; disabled?: boolean }[];
  };
  const nodes: N8nNode[] = (w.nodes ?? []).map((n) => ({
    name: n.name,
    type: String(n.type)
      .replace(/^n8n-nodes-base\./, "")
      .replace(/^@n8n\/n8n-nodes-langchain\./, "LangChain · "),
    disabled: Boolean(n.disabled),
  }));
  return { ...mapWorkflow(w), nodes };
}

// ── Executions ───────────────────────────────────────────────────────────────
let nameMapCache: { at: number; map: Record<string, string> } | null = null;
async function workflowNameMap(): Promise<Record<string, string>> {
  if (nameMapCache && Date.now() - nameMapCache.at < 60_000) return nameMapCache.map;
  const map: Record<string, string> = {};
  try {
    for (const w of await listWorkflows()) map[w.id] = w.name;
  } catch {
    /* non-fatal: executions still render with workflowData name fallback */
  }
  nameMapCache = { at: Date.now(), map };
  return map;
}

interface RawExecution {
  id: string | number;
  finished?: boolean;
  mode?: string;
  status?: string;
  startedAt?: string;
  stoppedAt?: string;
  workflowId?: string | number;
  workflowData?: { name?: string };
}

function mapStatus(e: RawExecution): ExecStatus {
  if (e.status) {
    const s = e.status.toLowerCase();
    if (s === "success") return "success";
    if (s === "error" || s === "crashed" || s === "failed") return "error";
    if (s === "running" || s === "new") return "running";
    if (s === "waiting") return "waiting";
  }
  if (e.finished === false && !e.stoppedAt) return "running";
  if (e.finished === true) return "success";
  return "unknown";
}

export async function listExecutions(
  opts: { status?: "success" | "error" | "waiting"; limit?: number; workflowId?: string } = {}
): Promise<N8nExecution[]> {
  const u = new URL(url("/executions"));
  u.searchParams.set("limit", String(opts.limit ?? 50));
  u.searchParams.set("includeData", "false");
  if (opts.status) u.searchParams.set("status", opts.status);
  if (opts.workflowId) u.searchParams.set("workflowId", opts.workflowId);

  const res = await fetch(u, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`n8n /executions ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data?: RawExecution[] };
  const names = await workflowNameMap();

  return (data.data ?? []).map((e) => {
    const started = e.startedAt ?? null;
    const stopped = e.stoppedAt ?? null;
    const durationMs =
      started && stopped ? new Date(stopped).getTime() - new Date(started).getTime() : null;
    const wfId = e.workflowId != null ? String(e.workflowId) : null;
    return {
      id: String(e.id),
      workflowId: wfId,
      workflowName: (wfId && names[wfId]) || e.workflowData?.name || null,
      status: mapStatus(e),
      mode: e.mode ?? null,
      startedAt: started,
      stoppedAt: stopped,
      durationMs,
    };
  });
}

export async function getExecution(id: string): Promise<unknown> {
  const u = new URL(url(`/executions/${id}`));
  u.searchParams.set("includeData", "true");
  const res = await fetch(u, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`n8n /executions/${id} ${res.status}: ${await res.text()}`);
  return res.json();
}
