// ── Provisioning persistence (BotOps Phase 7) ─────────────────────────────────
// CRUD for provisioning_jobs / provisioning_checkpoints / deployments in the
// control-plane. Every transition is persisted so a killed job resumes.
import { runSql } from "../supabase-management";
import { controlPlaneRef } from "../control-plane";
import { sqlString } from "../sql";
import type { ProvState, CheckpointKind } from "./state-machine";

export interface ProvJob {
  id: string;
  tenant_name: string;
  template_id: string;
  bot_id: string | null;
  state: ProvState;
  params: Record<string, unknown>;
  error: string | null;
  mode: "live" | "simulate";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProvCheckpoint {
  id: string;
  job_id: string;
  kind: CheckpointKind;
  status: "pending" | "approved" | "rejected";
  approver_user_id: string | null;
  decided_at: string | null;
  note: string | null;
  created_at: string;
}

const cp = () => controlPlaneRef();

export async function createJob(args: {
  tenantName: string;
  templateId: string;
  mode: "live" | "simulate";
}): Promise<ProvJob> {
  const rows = await runSql<ProvJob>(
    cp(),
    `insert into botops.provisioning_jobs (tenant_name, template_id, mode)
       values (${sqlString(args.tenantName)}, ${sqlString(args.templateId)}, ${sqlString(args.mode)})
     returning *`
  );
  return rows[0];
}

export async function getJob(id: string): Promise<ProvJob | null> {
  const rows = await runSql<ProvJob>(cp(), `select * from botops.provisioning_jobs where id = ${sqlString(id)}::uuid limit 1`);
  return rows[0] ?? null;
}

export async function listJobs(): Promise<ProvJob[]> {
  return runSql<ProvJob>(cp(), `select * from botops.provisioning_jobs order by created_at desc limit 100`);
}

export async function updateJob(
  id: string,
  patch: { state?: ProvState; params?: Record<string, unknown>; error?: string | null; bot_id?: string | null }
): Promise<void> {
  const sets: string[] = ["updated_at = now()"];
  if (patch.state !== undefined) sets.push(`state = ${sqlString(patch.state)}`);
  if (patch.params !== undefined) sets.push(`params = ${sqlString(JSON.stringify(patch.params))}::jsonb`);
  if (patch.error !== undefined) sets.push(`error = ${patch.error === null ? "null" : sqlString(patch.error)}`);
  if (patch.bot_id !== undefined) sets.push(`bot_id = ${patch.bot_id === null ? "null" : `${sqlString(patch.bot_id)}::uuid`}`);
  await runSql(cp(), `update botops.provisioning_jobs set ${sets.join(", ")} where id = ${sqlString(id)}::uuid`);
}

/** Locate-or-create a pending checkpoint (idempotent — re-entry won't duplicate). */
export async function ensureCheckpoint(jobId: string, kind: CheckpointKind): Promise<void> {
  await runSql(
    cp(),
    `insert into botops.provisioning_checkpoints (job_id, kind, status)
       select ${sqlString(jobId)}::uuid, ${sqlString(kind)}, 'pending'
       where not exists (
         select 1 from botops.provisioning_checkpoints
          where job_id = ${sqlString(jobId)}::uuid and kind = ${sqlString(kind)} and status = 'pending'
       )`
  );
}

export async function decideCheckpoint(
  jobId: string,
  kind: CheckpointKind,
  status: "approved" | "rejected",
  approverEmail: string | null,
  note?: string
): Promise<void> {
  await runSql(
    cp(),
    `update botops.provisioning_checkpoints
        set status = ${sqlString(status)},
            decided_at = now(),
            note = ${note ? sqlString(note) : "null"},
            approver_user_id = (select id from botops.app_users where lower(email) = lower(${sqlString(approverEmail ?? "")}) limit 1)
      where job_id = ${sqlString(jobId)}::uuid and kind = ${sqlString(kind)} and status = 'pending'`
  );
}

export async function listCheckpoints(jobId: string): Promise<ProvCheckpoint[]> {
  return runSql<ProvCheckpoint>(
    cp(),
    `select * from botops.provisioning_checkpoints where job_id = ${sqlString(jobId)}::uuid order by created_at`
  );
}

export async function recordDeployment(args: {
  botId: string | null;
  jobId: string;
  n8nWorkflowId: string | null;
  versionId?: number | null;
  activated?: boolean;
}): Promise<void> {
  await runSql(
    cp(),
    `insert into botops.deployments (bot_id, job_id, n8n_workflow_id, version_id, activated_at)
       values (
         ${args.botId ? `${sqlString(args.botId)}::uuid` : "null"},
         ${sqlString(args.jobId)}::uuid,
         ${args.n8nWorkflowId ? sqlString(args.n8nWorkflowId) : "null"},
         ${args.versionId != null ? String(Math.floor(args.versionId)) : "null"},
         ${args.activated ? "now()" : "null"}
       )`
  );
}
