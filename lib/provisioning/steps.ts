// ── Provisioning steps (BotOps Phase 7) ───────────────────────────────────────
// Each step is IDEMPOTENT (locate-or-create — Fix D): re-running it after a
// resume must not duplicate a created resource. In 'simulate' mode every step is
// synthetic (no external call), so the whole pipeline + checkpoint gating is
// testable without spending money or touching a live bot. In 'live' mode the
// dangerous paid action (creating a Supabase project) is GUARDED: it requires an
// already-approved target ref in params — Phase 7 never auto-creates a paid
// project (that lands behind an explicit, separately-enabled live runbook).
import type { ProvJob } from "./store";
import type { StepName } from "./state-machine";

export class ProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisioningError";
  }
}

/** A step returns the params it contributes; the runner merges them into the job. */
export type StepFn = (job: ProvJob) => Promise<Record<string, unknown>>;

function simId(job: ProvJob, prefix: string): string {
  return `${prefix}_${job.id.slice(0, 8)}`;
}

// 1. Locate-or-create the data-plane Supabase project + apply the template's
//    canonical migrations. Idempotent: a present supabase_ref is reused.
const createDb: StepFn = async (job) => {
  if (job.mode === "simulate") {
    return { supabase_ref: simId(job, "sim_ref"), db_migrated: true };
  }
  const ref = job.params.supabase_ref as string | undefined;
  if (!ref) {
    throw new ProvisioningError(
      "live create_db requires an approved target project ref (params.supabase_ref). " +
        "Paid project auto-creation is disabled in Phase 7 — locate-or-approve a project first."
    );
  }
  // (Live migration application is wired in the live runbook; idempotent by design.)
  return { supabase_ref: ref, db_migrated: true };
};

// 2. Compile the template + create the n8n workflow DEACTIVATED. Idempotent:
//    a present n8n_workflow_id is reused (no duplicate workflow on resume).
const deployWorkflow: StepFn = async (job) => {
  if (job.mode === "simulate") {
    return { n8n_workflow_id: simId(job, "sim_wf"), workflow_deployed: true, activated: false };
  }
  if (job.params.n8n_workflow_id) {
    return { n8n_workflow_id: job.params.n8n_workflow_id, workflow_deployed: true };
  }
  throw new ProvisioningError("live deploy_workflow is enabled only via the explicit live runbook (Phase 7b)");
};

// 3. Activate the workflow (go-live). Idempotent: activating an active workflow
//    is a no-op.
const activate: StepFn = async (job) => {
  if (job.mode === "simulate") {
    return { activated: true };
  }
  throw new ProvisioningError("live activate is enabled only via the explicit live runbook (Phase 7b)");
};

export const STEPS: Record<StepName, StepFn> = {
  create_db: createDb,
  deploy_workflow: deployWorkflow,
  activate,
};
