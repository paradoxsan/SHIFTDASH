export interface ToolCall {
  id: string;
  name: string;
  status: "running" | "ok" | "error";
  preview?: string;
}

export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; tools: ToolCall[]; streaming?: boolean }
  | {
      kind: "approval";
      toolUseId: string;
      name: string;
      summary: string;
      decided?: "approved" | "rejected";
      failed?: string;
    }
  | { kind: "error"; message: string };

/** Server-sent events from /api/ai/chat. */
export type StreamEvent =
  | { type: "thread"; threadId: string }
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; ok: boolean; preview: string }
  | { type: "approval_required"; id: string; name: string; input: unknown; summary: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Hebrew labels for the tool trace — the raw tool names are English identifiers. */
export const TOOL_LABELS: Record<string, string> = {
  list_clients: "קורא את רשימת הלקוחות",
  client_health: "בודק בריאות בוט",
  n8n_workflows: "בודק אוטומציות",
  n8n_executions: "בודק ריצות",
  n8n_execution_detail: "מנתח ריצה שנכשלה",
  n8n_toggle_workflow: "משנה מצב אוטומציה",
  list_events: "קורא התראות",
  ack_event: "מסמן התראה",
  whatsapp_chats: "קורא שיחות",
  whatsapp_messages: "קורא הודעות",
  whatsapp_send: "שולח וואטסאפ",
  set_human_mode: "משנה השתקת בוט",
  get_human_mode: "בודק השתקת בוט",
  describe_tables: "בודק מבנה נתונים",
  query_data: "מריץ שאילתה",
  leads_list: "קורא לידים",
  lead_update: "מעדכן ליד",
  lead_send_message: "שולח הודעה לליד",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}
