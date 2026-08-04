// ── Tool contract ─────────────────────────────────────────────────────────────
// Every capability the copilot has is declared here with an explicit risk level.
// The agent loop treats `risk` as law: a "read" tool runs on sight, a "write"
// tool is never executed until an approval row exists for it. Because writes go
// through auditedMutation inside their handler, the agent also cannot escape
// RBAC or the audit log.
import { z, type ZodType } from "zod";
import type { Session } from "@/lib/auth";

export type ToolRisk = "read" | "write";

export interface ToolContext {
  actor: Session | null;
}

export interface AuditTarget {
  action: string;
  targetType?: string;
  targetId?: string;
}

export interface ToolDef<T = unknown> {
  name: string;
  description: string;
  risk: ToolRisk;
  schema: ZodType<T>;
  /** One Hebrew line describing what will happen — shown on the approval card. */
  summarize: (input: T) => string;
  /**
   * Audit coordinates for a write. Required for risk: "write" — executeTool
   * wraps the handler in auditedMutation using this, so RBAC + the audit log
   * apply to every tool without each handler having to remember.
   */
  audit?: (input: T) => AuditTarget;
  run: (input: T, ctx: ToolContext) => Promise<unknown>;
}

/** Helper that keeps the input type inferred from the zod schema at the call site. */
export function defineTool<T>(def: ToolDef<T>): ToolDef<T> {
  return def;
}

export interface AnthropicToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Zod schema → the JSON Schema shape the Messages API expects. */
export function toolSpec(def: ToolDef<never>): AnthropicToolSpec {
  const json = z.toJSONSchema(def.schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return {
    name: def.name,
    // Telling the model which tools need approval keeps it from promising an
    // action is already done when it is in fact still waiting on a click.
    description:
      def.risk === "write"
        ? `${def.description}\n\n[פעולה משנה מצב — תוצג למשתמש לאישור לפני ביצוע.]`
        : def.description,
    input_schema: json,
  };
}
