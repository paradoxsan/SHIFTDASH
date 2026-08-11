// ── Tool contract ─────────────────────────────────────────────────────────────
// Every capability the copilot has is declared here with an explicit risk level.
// The agent loop treats `risk` as law: a "read" tool runs on sight, a "write"
// tool is never executed until an approval row exists for it. Because writes go
// through auditedMutation inside their handler, the agent also cannot escape
// RBAC or the audit log.
import { z, type ZodType } from "zod";
import type { Session } from "@/lib/auth";

export type ToolRisk = "read" | "write";

/**
 * Extra limits on which tools may run in a given turn, on top of `risk`.
 *
 * Enforced in executeTool, NOT only by trimming the spec list handed to the
 * model — a model can name a tool it was never offered, and the filtered list
 * is an affordance while this is the control.
 */
export interface ToolPolicy {
  /** Deny every write. Sub-agents run under this: there is no user watching a
   *  nested turn, so there is nobody to approve. */
  readOnly?: boolean;
  /** Deny tools marked `scope: "agency"` — what stops a sub-agent delegating
   *  to another sub-agent forever. */
  noDelegation?: boolean;
}

export interface ToolContext {
  actor: Session | null;
  /**
   * Bot slug this conversation is pinned to, when the thread belongs to a
   * client's dedicated agent. executeTool refuses any call carrying a different
   * `client`, so scoping is a property of the runtime rather than a promise the
   * system prompt makes.
   */
  boundClient?: string | null;
  /** Restrictions for this turn. Absent means the ordinary interactive copilot. */
  policy?: ToolPolicy;
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
  /**
   * "agency" marks a tool only the unbound agency copilot may call. Today that
   * is delegation: a client's agent must not be able to reach another client's
   * agent, and a sub-agent must not be able to spawn more sub-agents.
   */
  scope?: "agency";
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
