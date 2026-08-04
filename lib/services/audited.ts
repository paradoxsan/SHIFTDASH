// ── Audited mutation wrapper (BotOps Phase 3) ─────────────────────────────────
// The single enforcement point for control-plane/data-plane mutations: check the
// actor's role (RBAC), run the mutation, and record it in botops.audit_log with
// the actor. Phase 4 adds the least-privilege query path beneath this. Route
// handlers MUST funnel any mutation through auditedMutation().
import { runSql } from "../supabase-management";
import { controlPlaneRef } from "../control-plane";
import { sqlString } from "../sql";
import { requireRole, type Role } from "../rbac";
import type { Session } from "../auth";

export interface MutationContext {
  actor: Session | null;
  minRole: Role;
  action: string; // e.g. "n8n.workflow.toggle"
  targetType?: string;
  targetId?: string;
  payload?: unknown;
}

async function writeAudit(ctx: MutationContext, result: string): Promise<void> {
  try {
    const email = ctx.actor?.email ?? "";
    const payloadJson = ctx.payload === undefined ? null : JSON.stringify(ctx.payload);
    await runSql(
      controlPlaneRef(),
      `insert into botops.audit_log (actor_user_id, action, target_type, target_id, payload, result)
       values (
         (select id from botops.app_users where lower(email) = lower(${sqlString(email)}) limit 1),
         ${sqlString(ctx.action)},
         ${ctx.targetType ? sqlString(ctx.targetType) : "null"},
         ${ctx.targetId ? sqlString(ctx.targetId) : "null"},
         ${payloadJson ? `${sqlString(payloadJson)}::jsonb` : "null"},
         ${sqlString(result)}
       )`
    );
  } catch {
    // Audit must never block the request path.
  }
}

/** Enforce RBAC + audit around a mutation. Throws ForbiddenError if denied. */
export async function auditedMutation<T>(ctx: MutationContext, fn: () => Promise<T>): Promise<T> {
  try {
    requireRole(ctx.actor?.role, ctx.minRole);
  } catch (e) {
    await writeAudit(ctx, `denied (${ctx.actor?.email ?? "anonymous"})`);
    throw e;
  }
  try {
    const out = await fn();
    await writeAudit(ctx, "ok");
    return out;
  } catch (e) {
    await writeAudit(ctx, `error: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
