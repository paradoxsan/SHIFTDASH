// n8n tools — the automation layer every bot runs on. Reads are free; toggling a
// workflow is a write because it takes a live customer's bot on- or off-line.
import { z } from "zod";
import { defineTool } from "./types";
import { listWorkflows, listExecutions, getExecutionDetail, setWorkflowActive } from "@/lib/n8n";
import { listEvents, setEventStatus } from "@/lib/events";

export const workflowsTool = defineTool({
  name: "n8n_workflows",
  description: "רשימת ה-workflows ב-n8n ומצב ההפעלה שלהם. אפשר לסנן לפי טקסט בשם.",
  risk: "read" as const,
  schema: z.object({
    search: z.string().optional().describe("סינון לפי טקסט בשם ה-workflow"),
    onlyInactive: z.boolean().optional().describe("להחזיר רק workflows כבויים"),
  }),
  summarize: () => "רשימת אוטומציות",
  async run({ search, onlyInactive }) {
    let list = await listWorkflows();
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(q));
    }
    if (onlyInactive) list = list.filter((w) => !w.active);
    return list.map((w) => ({ id: w.id, name: w.name, active: w.active, updatedAt: w.updatedAt }));
  },
});

export const executionsTool = defineTool({
  name: "n8n_executions",
  description:
    "ריצות אחרונות ב-n8n. השתמש ב-status='error' כדי לראות מה נכשל — זו הדרך המהירה " +
    "ביותר לאתר בוט שבור.",
  risk: "read" as const,
  schema: z.object({
    status: z.enum(["success", "error", "waiting"]).optional(),
    workflowId: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  summarize: () => "ריצות אחרונות",
  async run({ status, workflowId, limit }) {
    const rows = await listExecutions({ status, workflowId, limit: limit ?? 25 });
    return rows.map((e) => ({
      id: e.id,
      workflow: e.workflowName,
      status: e.status,
      startedAt: e.startedAt,
      durationMs: e.durationMs,
    }));
  },
});

export const executionDetailTool = defineTool({
  name: "n8n_execution_detail",
  description:
    "פירוט ריצה שנכשלה: איזה node נפל, הודעת השגיאה, והפריט שהוא עבד עליו. " +
    "השתמש בזה כדי לאבחן שורש של תקלה לפני שאתה מציע פתרון.",
  risk: "read" as const,
  schema: z.object({ executionId: z.string() }),
  summarize: (i) => `פירוט ריצה ${i.executionId}`,
  async run({ executionId }) {
    return getExecutionDetail(executionId);
  },
});

export const toggleWorkflowTool = defineTool({
  name: "n8n_toggle_workflow",
  description:
    "הפעלה או כיבוי של workflow ב-n8n. כיבוי משבית בוט חי של לקוח — השתמש רק כשזה מה שהמשתמש ביקש.",
  risk: "write" as const,
  schema: z.object({
    workflowId: z.string(),
    active: z.boolean().describe("true = להפעיל, false = לכבות"),
    workflowName: z.string().optional().describe("שם ה-workflow, לתצוגה באישור"),
  }),
  summarize: (i) =>
    `${i.active ? "להפעיל" : "לכבות"} את ה-workflow ${i.workflowName ?? i.workflowId}`,
  audit: (i) => ({
    action: "n8n.workflow.toggle",
    targetType: "workflow",
    targetId: i.workflowId,
  }),
  async run({ workflowId, active }) {
    return setWorkflowActive(workflowId, active);
  },
});

export const listEventsTool = defineTool({
  name: "list_events",
  description:
    "התראות המערכת (בוט נפל, תור תקוע, ריכוז שגיאות, בעיית credentials). " +
    "ברירת המחדל היא התראות פתוחות בלבד.",
  risk: "read" as const,
  schema: z.object({
    status: z.enum(["open", "ack", "resolved"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  summarize: () => "התראות פתוחות",
  async run({ status, limit }) {
    const rows = await listEvents({ status: status ?? "open", limit: limit ?? 50 });
    return rows.map((e) => ({
      id: e.id,
      type: e.type,
      severity: e.severity,
      status: e.status,
      botId: e.bot_id,
      payload: e.payload,
      createdAt: e.created_at,
    }));
  },
});

export const ackEventTool = defineTool({
  name: "ack_event",
  description: "סימון התראה כטופלה או כנסגרה.",
  risk: "write" as const,
  schema: z.object({
    eventId: z.number().int(),
    status: z.enum(["ack", "resolved"]),
  }),
  summarize: (i) =>
    `לסמן התראה #${i.eventId} כ${i.status === "ack" ? "בטיפול" : "סגורה"}`,
  audit: (i) => ({ action: "event.status", targetType: "event", targetId: String(i.eventId) }),
  async run({ eventId, status }) {
    await setEventStatus(eventId, status);
    return { eventId, status };
  },
});
