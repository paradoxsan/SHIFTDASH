// The copilot's complete capability list. Adding a tool here is the ONLY way to
// give the agent a new power, which keeps the blast radius reviewable in one file.
import type { ToolDef, AnthropicToolSpec } from "./types";
import { toolSpec } from "./types";
import { auditedMutation } from "@/lib/services/audited";
import { listClientsTool, clientHealthTool } from "./clients";
import {
  workflowsTool,
  executionsTool,
  executionDetailTool,
  toggleWorkflowTool,
  listEventsTool,
  ackEventTool,
} from "./automation";
import {
  chatsTool,
  messagesTool,
  sendWhatsappTool,
  humanModeTool,
  humanModeStatusTool,
} from "./whatsapp";
import { describeTablesTool, queryDataTool } from "./data";
import { leadsListTool, leadUpdateTool, leadSendTool } from "./leads";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous input types
const ALL = [
  listClientsTool,
  clientHealthTool,
  workflowsTool,
  executionsTool,
  executionDetailTool,
  toggleWorkflowTool,
  listEventsTool,
  ackEventTool,
  chatsTool,
  messagesTool,
  sendWhatsappTool,
  humanModeTool,
  humanModeStatusTool,
  describeTablesTool,
  queryDataTool,
  leadsListTool,
  leadUpdateTool,
  leadSendTool,
] as unknown as ToolDef<never>[];

const BY_NAME = new Map(ALL.map((t) => [t.name, t]));

export function allTools(): ToolDef<never>[] {
  return ALL;
}

export function getTool(name: string): ToolDef<never> | undefined {
  return BY_NAME.get(name);
}

export function isWriteTool(name: string): boolean {
  return BY_NAME.get(name)?.risk === "write";
}

/** Tool specs in the shape the Messages API expects. */
export function anthropicTools(): AnthropicToolSpec[] {
  return ALL.map(toolSpec);
}

/**
 * Validate then execute a tool. Two things happen here rather than in each
 * handler, so neither can be forgotten when a tool is added:
 *   • input is validated at the boundary, so a malformed model call comes back
 *     as a readable tool error the model can correct instead of a crash;
 *   • every WRITE runs inside auditedMutation, which is what actually enforces
 *     RBAC and records the action — the agent has no path around it.
 */
export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: { actor: import("@/lib/auth").Session | null }
): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) throw new Error(`כלי לא מוכר: ${name}`);

  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    throw new Error(`קלט שגוי ל-${name}: ${msg}`);
  }
  const input = parsed.data as never;

  if (tool.risk === "read") return tool.run(input, ctx);

  // A write tool without audit coordinates is a programming error, and failing
  // closed is the only safe reading of it.
  if (!tool.audit) throw new Error(`כלי כתיבה ${name} חסר הגדרת audit`);
  const target = tool.audit(input);

  return auditedMutation(
    {
      actor: ctx.actor,
      minRole: "operator",
      action: target.action,
      targetType: target.targetType,
      targetId: target.targetId,
      payload: { via: "copilot", input: rawInput },
    },
    () => tool.run(input, ctx)
  );
}

/** The approval-card line for a proposed write. Falls back to raw JSON. */
export function summarizeTool(name: string, rawInput: unknown): string {
  const tool = getTool(name);
  if (!tool) return name;
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) return `${name}: ${JSON.stringify(rawInput)}`;
  try {
    return tool.summarize(parsed.data as never);
  } catch {
    return `${name}: ${JSON.stringify(rawInput)}`;
  }
}
