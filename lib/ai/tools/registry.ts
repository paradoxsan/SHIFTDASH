// The copilot's complete capability list. Adding a tool here is the ONLY way to
// give the agent a new power, which keeps the blast radius reviewable in one file.
import type { ToolDef, AnthropicToolSpec, ToolContext, ToolPolicy } from "./types";
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
import { readKnowledgeTool, rememberTool } from "./knowledge";
import { askClientAgentsTool } from "./delegate";

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
  readKnowledgeTool,
  rememberTool,
  askClientAgentsTool,
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

/**
 * Is this tool allowed to run under `policy`, for a thread bound to
 * `boundClient`? Shared by the spec list and by executeTool so the model is
 * never offered a tool the executor would then refuse.
 */
export function toolAllowed(
  tool: ToolDef<never>,
  policy: ToolPolicy | undefined,
  boundClient: string | null | undefined
): boolean {
  if (policy?.readOnly && tool.risk === "write") return false;
  // Delegation is the agency copilot's power alone. A client's agent calling it
  // would be a way around assertClientInScope, since the question it delegates
  // is free text and carries no `client` field for the guard to check.
  if (tool.scope === "agency" && (boundClient || policy?.noDelegation)) return false;
  return true;
}

export interface ToolListOptions {
  policy?: ToolPolicy;
  boundClient?: string | null;
}

/** Tool specs in the shape the Messages API expects, narrowed to what may run. */
export function anthropicTools(opts: ToolListOptions = {}): AnthropicToolSpec[] {
  return ALL.filter((t) => toolAllowed(t, opts.policy, opts.boundClient)).map(toolSpec);
}

/**
 * Refuse a call that reaches outside the client this thread is pinned to.
 *
 * REJECTS rather than silently rewriting the argument to the bound client. A
 * coerced call would answer a question about BRJewelry with T center's numbers
 * and read as authoritative; a rejection costs one turn and the model corrects
 * itself. Wrong-but-confident is the worse failure by far.
 *
 * Tools with no `client` field (list_clients, list_events) are portfolio-level
 * and stay available — the agent is scoped, not blindfolded.
 */
export function assertClientInScope(
  name: string,
  rawInput: unknown,
  boundClient: string | null | undefined
): void {
  if (!boundClient) return;
  if (typeof rawInput !== "object" || rawInput === null) return;

  const asked = (rawInput as { client?: unknown }).client;
  if (typeof asked !== "string" || asked === "" || asked === boundClient) return;

  throw new Error(
    `אתה הסוכן של ${boundClient} ואין לך גישה לנתונים של ${asked}. ` +
      `קרא ל-${name} עם client="${boundClient}", או אמור למשתמש לפנות לסוכן של ${asked}.`
  );
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
  ctx: ToolContext
): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) throw new Error(`כלי לא מוכר: ${name}`);

  // Checked here and not only when building the spec list: a model can name a
  // tool it was never offered, and this is the layer that actually runs it.
  if (!toolAllowed(tool, ctx.policy, ctx.boundClient)) {
    throw new Error(
      ctx.policy?.readOnly && tool.risk === "write"
        ? `הכלי ${name} משנה מצב ולא זמין לך בהקשר הזה. תאר מה צריך לעשות ומי שקרא לך יציע את זה לאישור.`
        : `הכלי ${name} לא זמין לך בהקשר הזה.`
    );
  }

  assertClientInScope(name, rawInput, ctx.boundClient);

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
