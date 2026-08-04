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
  ExecutionDetail,
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

// ── Error drill-down (Phase 5) ────────────────────────────────────────────────
interface RawRunNode {
  error?: { message?: string; description?: string; stack?: string } | null;
  data?: { main?: unknown };
  source?: ({ previousNode?: string } | null)[];
}
interface RawExecutionDetail extends RawExecution {
  workflowData?: { name?: string };
  data?: {
    resultData?: {
      lastNodeExecuted?: string;
      error?: { message?: string; description?: string } | null;
      runData?: Record<string, RawRunNode[]>;
    };
  };
}

function firstItemJson(node: RawRunNode | undefined): unknown {
  // runData[node][0].data.main[0][0].json — the item the node emitted/worked on.
  const main = node?.data?.main as unknown;
  if (!Array.isArray(main)) return null;
  const branch = main[0];
  if (!Array.isArray(branch)) return null;
  const item = branch[0] as { json?: unknown } | undefined;
  return item?.json ?? null;
}

/**
 * Pure: distil a raw n8n execution (includeData=true) into the failed node, its
 * error, and the item it was working on. `names` maps workflowId → name.
 */
export function parseExecutionDetail(raw: RawExecutionDetail, names: Record<string, string> = {}): ExecutionDetail {
  const started = raw.startedAt ?? null;
  const stopped = raw.stoppedAt ?? null;
  const durationMs =
    started && stopped ? new Date(stopped).getTime() - new Date(started).getTime() : null;
  const wfId = raw.workflowId != null ? String(raw.workflowId) : null;

  const result = raw.data?.resultData;
  const runData = result?.runData ?? {};
  const lastNode = result?.lastNodeExecuted ?? null;

  // The failed node = lastNodeExecuted if it carries an error, else the first
  // node in runData with an error attached.
  let failedNode: string | null = null;
  if (lastNode && runData[lastNode]?.some((r) => r?.error)) {
    failedNode = lastNode;
  } else {
    for (const [name, runs] of Object.entries(runData)) {
      if (runs?.some((r) => r?.error)) {
        failedNode = name;
        break;
      }
    }
  }

  const failedRun = failedNode ? runData[failedNode]?.find((r) => r?.error) : undefined;
  const nodeErr = failedRun?.error ?? null;
  const errorMessage = nodeErr?.message ?? result?.error?.message ?? null;
  const errorDescription = nodeErr?.description ?? result?.error?.description ?? null;

  // Input the failed node was working on: prefer its own emitted item; a failing
  // node often emits nothing, so trace the node that FED it (runData `source`),
  // then fall back to the last node's item.
  const feedingNode = failedRun?.source?.find((s) => s?.previousNode)?.previousNode;
  const inputSample =
    firstItemJson(failedRun) ??
    (feedingNode ? firstItemJson(runData[feedingNode]?.[0]) : null) ??
    (lastNode && lastNode !== failedNode ? firstItemJson(runData[lastNode]?.[0]) : null);

  return {
    id: String(raw.id),
    workflowId: wfId,
    workflowName: (wfId && names[wfId]) || raw.workflowData?.name || null,
    status: mapStatus(raw),
    mode: raw.mode ?? null,
    startedAt: started,
    stoppedAt: stopped,
    durationMs,
    failedNode,
    errorMessage,
    errorDescription,
    lastNodeExecuted: lastNode,
    inputSample,
    failureRate24h: null,
  };
}

/** Enriched execution detail: parsed failure + 24h failure rate for its workflow. */
export async function getExecutionDetail(id: string): Promise<ExecutionDetail> {
  const u = new URL(url(`/executions/${id}`));
  u.searchParams.set("includeData", "true");
  const res = await fetch(u, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`n8n /executions/${id} ${res.status}: ${await res.text()}`);
  const raw = (await res.json()) as RawExecutionDetail;
  const detail = parseExecutionDetail(raw, await workflowNameMap());

  if (detail.workflowId) {
    try {
      const recent = await listExecutions({ workflowId: detail.workflowId, limit: 100 });
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const within = recent.filter((e) => e.startedAt && new Date(e.startedAt).getTime() >= cutoff);
      detail.failureRate24h = {
        errors: within.filter((e) => e.status === "error").length,
        total: within.length,
      };
    } catch {
      /* non-fatal: leave failureRate24h null */
    }
  }
  return detail;
}
