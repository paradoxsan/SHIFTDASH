// ── Provisioning runner (BotOps Phase 7) ──────────────────────────────────────
// Drives the pure state machine against the persisted job + idempotent steps.
// Human-triggered transitions (start / approve / reject / retry) are RBAC-gated
// and audited; the three checkpoints are non-skippable. Starting a job creates
// NO paid resource — it halts at the 💲 checkpoint.
import { auditedMutation } from "../services/audited";
import { requireRole } from "../rbac";
import type { Session } from "../auth";
import {
  nextState,
  stageFor,
  expectsCheckpoint,
  isTerminal,
  type CheckpointKind,
} from "./state-machine";
import {
  createJob,
  getJob,
  updateJob,
  ensureCheckpoint,
  decideCheckpoint,
  listCheckpoints,
  type ProvJob,
  type ProvCheckpoint,
} from "./store";
import { STEPS, ProvisioningError } from "./steps";

export { ProvisioningError } from "./steps";

const CHECKPOINT_MIN_ROLE: Record<CheckpointKind, "owner" | "operator"> = {
  pay_approval: "owner", // approving spend is owner-only
  qr_pairing: "operator",
  prompt_approval: "operator",
};

/** Start a provisioning job. Owner-only. Halts at the 💲 checkpoint — no step
 *  runs, so NO paid resource is created until an owner approves the cost. */
export async function startJob(args: {
  tenantName: string;
  templateId: string;
  mode?: "live" | "simulate";
  actor: Session | null;
}): Promise<ProvJob> {
  requireRole(args.actor?.role, "owner");
  const job = await createJob({ tenantName: args.tenantName, templateId: args.templateId, mode: args.mode ?? "live" });
  await auditedMutation(
    {
      actor: args.actor,
      minRole: "owner",
      action: "provisioning.start",
      targetType: "provisioning_job",
      targetId: job.id,
      payload: { tenantName: args.tenantName, templateId: args.templateId, mode: job.mode },
    },
    async () => {
      await updateJob(job.id, { state: nextState("draft")! }); // → awaiting_pay_approval
      await ensureCheckpoint(job.id, "pay_approval");
    }
  );
  return (await getJob(job.id))!;
}

/** Run consecutive STEP stages until the next checkpoint or terminal. Each step
 *  is idempotent, so a resumed run never duplicates a created resource. On a step
 *  error the job keeps its state (retryable) and records the error. */
export async function runUntilPause(jobId: string, actor: Session | null): Promise<ProvJob> {
  for (;;) {
    const job = await getJob(jobId);
    if (!job) throw new ProvisioningError(`job ${jobId} not found`);
    const stage = stageFor(job.state);
    if (!stage || stage.type !== "step") return job; // checkpoint or terminal → pause

    try {
      const out = await auditedMutation(
        {
          actor,
          minRole: "operator",
          action: `provisioning.step.${stage.step}`,
          targetType: "provisioning_job",
          targetId: job.id,
          payload: { state: job.state },
        },
        () => STEPS[stage.step](job)
      );
      await updateJob(jobId, { params: { ...job.params, ...out }, state: nextState(job.state)!, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateJob(jobId, { error: msg }); // keep state — retryable
      return (await getJob(jobId))!;
    }
  }
}

/** Approve a checkpoint: validate the job is awaiting exactly this kind, record
 *  the decision (who/when), advance past it, then auto-run following steps. */
export async function approveCheckpoint(args: {
  jobId: string;
  kind: CheckpointKind;
  actor: Session | null;
  note?: string;
}): Promise<ProvJob> {
  const minRole = CHECKPOINT_MIN_ROLE[args.kind];
  requireRole(args.actor?.role, minRole); // explicit gate (don't rely only on auditedMutation)
  const job = await getJob(args.jobId);
  if (!job) throw new ProvisioningError(`job ${args.jobId} not found`);
  if (!expectsCheckpoint(job.state, args.kind)) {
    throw new ProvisioningError(`job is in '${job.state}', not awaiting '${args.kind}'`);
  }
  await auditedMutation(
    {
      actor: args.actor,
      minRole,
      action: `provisioning.checkpoint.approve.${args.kind}`,
      targetType: "provisioning_job",
      targetId: job.id,
      payload: { kind: args.kind },
    },
    async () => {
      await decideCheckpoint(args.jobId, args.kind, "approved", args.actor?.email ?? null, args.note);
      await updateJob(args.jobId, { state: nextState(job.state)! });
      // surface the NEXT checkpoint as pending if the next pause is one
      const ns = nextState(job.state)!;
      const nextStage = stageFor(ns);
      if (nextStage?.type === "checkpoint") await ensureCheckpoint(args.jobId, nextStage.checkpoint);
    }
  );
  const after = await runUntilPause(args.jobId, args.actor);
  // entering a checkpoint via a step run → make sure it's surfaced
  const st = stageFor(after.state);
  if (st?.type === "checkpoint") await ensureCheckpoint(after.id, st.checkpoint);
  return (await getJob(args.jobId))!;
}

/** Reject a checkpoint: record it; the job STAYS in the awaiting state (e.g. a
 *  rejected prompt leaves the bot in awaiting_prompt_approval — never live). */
export async function rejectCheckpoint(args: {
  jobId: string;
  kind: CheckpointKind;
  actor: Session | null;
  note?: string;
}): Promise<ProvJob> {
  requireRole(args.actor?.role, CHECKPOINT_MIN_ROLE[args.kind]); // explicit gate
  const job = await getJob(args.jobId);
  if (!job) throw new ProvisioningError(`job ${args.jobId} not found`);
  if (!expectsCheckpoint(job.state, args.kind)) {
    throw new ProvisioningError(`job is in '${job.state}', not awaiting '${args.kind}'`);
  }
  await auditedMutation(
    {
      actor: args.actor,
      minRole: CHECKPOINT_MIN_ROLE[args.kind],
      action: `provisioning.checkpoint.reject.${args.kind}`,
      targetType: "provisioning_job",
      targetId: job.id,
      payload: { kind: args.kind, note: args.note },
    },
    async () => {
      await decideCheckpoint(args.jobId, args.kind, "rejected", args.actor?.email ?? null, args.note);
      // no state change — stays paused at this checkpoint
    }
  );
  return (await getJob(args.jobId))!;
}

/** Retry a failed step from the current state (idempotent). */
export async function retryJob(jobId: string, actor: Session | null): Promise<ProvJob> {
  requireRole(actor?.role, "operator");
  await updateJob(jobId, { error: null });
  return runUntilPause(jobId, actor);
}

export interface JobStatus {
  job: ProvJob;
  checkpoints: ProvCheckpoint[];
  terminal: boolean;
}
export async function jobStatus(jobId: string): Promise<JobStatus> {
  const job = await getJob(jobId);
  if (!job) throw new ProvisioningError(`job ${jobId} not found`);
  return { job, checkpoints: await listCheckpoints(jobId), terminal: isTerminal(job.state) };
}
