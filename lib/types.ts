// Shared types used by both server (lib) and client (components).
// No secrets, no server-only imports here.

export type HealthState = "live" | "idle" | "stale" | "unknown";

export interface Bot {
  ref: string; // Supabase project ref — the stable per-customer id
  name: string;
  region: string;
  status: string; // Supabase project status (e.g. ACTIVE_HEALTHY)
  createdAt: string | null;
  hasWhapi: boolean; // whether a WHAPI token is mapped for this bot
}

export interface BotMetrics {
  ref: string;
  health: HealthState;
  lastActivityAt: string | null;
  messagesToday: number | null;
  failedMessages: number | null;
  openOrders: number | null;
  paidToday: number | null;
  revenueToday: number | null;
  newLeads: number | null;
  humanActive: number | null;
  tables: string[];
  error?: string;
}

export interface BotWithMetrics extends Bot {
  metrics: BotMetrics;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  archived: boolean;
  tags: string[];
  updatedAt: string | null;
}

export interface N8nNode {
  name: string;
  type: string;
  disabled: boolean;
}

export interface N8nWorkflowDetail extends N8nWorkflow {
  nodes: N8nNode[];
}

export type ExecStatus = "success" | "error" | "running" | "waiting" | "unknown";

export interface N8nExecution {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  status: ExecStatus;
  mode: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  durationMs: number | null;
}

export interface WhapiChat {
  id: string; // chat_id
  name: string;
  lastMessage: string | null;
  timestamp: number | null; // unix seconds
  unread: number;
}

export interface WhapiMessage {
  id: string;
  fromMe: boolean;
  type: string;
  text: string | null;
  timestamp: number | null; // unix seconds
  caption: string | null;
  mediaUrl: string | null; // image/video/sticker link when present
}

export interface TableColumn {
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  columns: TableColumn[];
  approxRows: number | null;
  primaryKeys: string[];
}

export interface CrmPayload {
  kind: "leads" | "orders" | "none";
  table: string | null;
  pk: string | null;
  statuses: string[];
  records: Record<string, unknown>[];
  hasTotal: boolean;
}

export interface SheetLead {
  rowIndex: number; // actual Google Sheet row number (for writes)
  id: string; // "מזהה ליד" (LEAD-xxxx) or phone fallback
  values: Record<string, string>; // header -> cell value
}

export interface ApiError {
  error: string;
}

// ── Operator quick-wins (BotOps Phase 5) ──────────────────────────────────────
export interface QueueItem {
  id: number | string;
  chatId: string | null;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string | null;
  requeuable: boolean;
  reason?: string; // why it is NOT requeuable
}

export interface ChaseOrder {
  id: number | string;
  chatId: string | null;
  invoiceName: string | null;
  total: number | null;
  status: string;
  hasLink: boolean;
  humanActive: boolean; // a human took over this chat → don't auto-chase
  chaseable: boolean;
  reason?: string;
}

export interface WatchlistItem {
  chatId: string;
  active: boolean;
  silencedUntil: string | null;
  updatedAt: string | null;
  expired: boolean; // silenced_until is in the past (bot may have auto-resumed)
}

export interface ExecutionDetail {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  status: ExecStatus;
  mode: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  durationMs: number | null;
  failedNode: string | null;
  errorMessage: string | null;
  errorDescription: string | null;
  lastNodeExecuted: string | null;
  inputSample: unknown; // the item the failed node was working on, when available
  failureRate24h: { errors: number; total: number } | null;
}
