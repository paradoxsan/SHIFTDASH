// ── Provisioning state machine (BotOps Phase 7) — PURE ────────────────────────
// No I/O here, so the pipeline ordering + checkpoint gating are unit-testable
// without a DB or any external call. The runner (provisioning/runner.ts) drives
// this against the persisted job + idempotent steps.
//
// Pipeline (draft is the implicit start):
//   awaiting_pay_approval [💲 checkpoint]
//   creating_db           [step: locate-or-create project + apply migrations]
//   deploying_workflow    [step: creds + compile + PUT workflow DEACTIVATED]
//   awaiting_qr           [📱 checkpoint: pair the WhatsApp number]
//   awaiting_prompt_approval [📝 checkpoint: approve the rendered prompt]
//   activating            [step: activate the workflow]
//   live                  [terminal]

export type ProvState =
  | "draft"
  | "awaiting_pay_approval"
  | "creating_db"
  | "deploying_workflow"
  | "awaiting_qr"
  | "awaiting_prompt_approval"
  | "activating"
  | "live"
  | "failed"
  | "rejected"
  | "cancelled";

export type CheckpointKind = "pay_approval" | "qr_pairing" | "prompt_approval";
export type StepName = "create_db" | "deploy_workflow" | "activate";

export type Stage =
  | { state: ProvState; type: "checkpoint"; checkpoint: CheckpointKind }
  | { state: ProvState; type: "step"; step: StepName }
  | { state: ProvState; type: "terminal" };

// The ORDERED pipeline. draft → STAGES[0]; each stage's `state` is what the job
// sits in while that stage is pending.
export const STAGES: Stage[] = [
  { state: "awaiting_pay_approval", type: "checkpoint", checkpoint: "pay_approval" },
  { state: "creating_db", type: "step", step: "create_db" },
  { state: "deploying_workflow", type: "step", step: "deploy_workflow" },
  { state: "awaiting_qr", type: "checkpoint", checkpoint: "qr_pairing" },
  { state: "awaiting_prompt_approval", type: "checkpoint", checkpoint: "prompt_approval" },
  { state: "activating", type: "step", step: "activate" },
  { state: "live", type: "terminal" },
];

const TERMINALS = new Set<ProvState>(["live", "failed", "rejected", "cancelled"]);

export function isTerminal(state: ProvState): boolean {
  return TERMINALS.has(state);
}

export function stageFor(state: ProvState): Stage | null {
  return STAGES.find((s) => s.state === state) ?? null;
}

export function isCheckpoint(state: ProvState): boolean {
  return stageFor(state)?.type === "checkpoint";
}

export function checkpointOf(state: ProvState): CheckpointKind | null {
  const s = stageFor(state);
  return s && s.type === "checkpoint" ? s.checkpoint : null;
}

/** The state a job enters AFTER the current stage completes (step done or
 *  checkpoint approved). `draft` starts the pipeline at STAGES[0]. */
export function nextState(state: ProvState): ProvState | null {
  if (state === "draft") return STAGES[0].state;
  const i = STAGES.findIndex((s) => s.state === state);
  if (i < 0 || i + 1 >= STAGES.length) return null;
  return STAGES[i + 1].state;
}

/** Can the runner auto-advance from here, or must it wait for a human? */
export function canAutoAdvance(state: ProvState): boolean {
  const s = stageFor(state);
  return s?.type === "step";
}

/** Validate a checkpoint decision is for the stage the job is actually in. */
export function expectsCheckpoint(state: ProvState, kind: CheckpointKind): boolean {
  return checkpointOf(state) === kind;
}
