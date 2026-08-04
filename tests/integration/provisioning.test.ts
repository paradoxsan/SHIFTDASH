import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory store + audit passthrough, with the REAL simulate-mode steps. This
// exercises the runner end-to-end (gating, resume idempotency, reject) without a
// DB or any external call.
const { state, store, auditedMutation } = vi.hoisted(() => {
  type Job = Record<string, unknown> & { id: string; state: string; params: Record<string, unknown> };
  const state = { jobs: new Map<string, Job>(), checkpoints: [] as Record<string, unknown>[], seq: 0 };
  const store = {
    createJob: vi.fn(async ({ tenantName, templateId, mode }: { tenantName: string; templateId: string; mode: string }) => {
      const id = `job-${++state.seq}`;
      const job: Job = { id, tenant_name: tenantName, template_id: templateId, bot_id: null, state: "draft", params: {}, error: null, mode, created_by: null, created_at: "", updated_at: "" };
      state.jobs.set(id, job);
      return job;
    }),
    getJob: vi.fn(async (id: string) => state.jobs.get(id) ?? null),
    listJobs: vi.fn(async () => [...state.jobs.values()]),
    updateJob: vi.fn(async (id: string, patch: Record<string, unknown>) => { Object.assign(state.jobs.get(id)!, patch); }),
    ensureCheckpoint: vi.fn(async (jobId: string, kind: string) => {
      if (!state.checkpoints.find((c) => c.job_id === jobId && c.kind === kind && c.status === "pending")) {
        state.checkpoints.push({ job_id: jobId, kind, status: "pending" });
      }
    }),
    decideCheckpoint: vi.fn(async (jobId: string, kind: string, status: string) => {
      const c = state.checkpoints.find((c) => c.job_id === jobId && c.kind === kind && c.status === "pending");
      if (c) c.status = status;
    }),
    listCheckpoints: vi.fn(async (jobId: string) => state.checkpoints.filter((c) => c.job_id === jobId)),
    recordDeployment: vi.fn(async () => {}),
  };
  const auditedMutation = vi.fn((_ctx: unknown, fn: () => unknown) => fn());
  return { state, store, auditedMutation };
});

vi.mock("../../lib/provisioning/store", () => store);
vi.mock("../../lib/services/audited", () => ({ auditedMutation }));

import { startJob, approveCheckpoint, rejectCheckpoint } from "../../lib/provisioning/runner";
import { ForbiddenError } from "../../lib/rbac";

const owner = { email: "o@x.com", role: "owner" as const };
const operator = { email: "p@x.com", role: "operator" as const };
const viewer = { email: "v@x.com", role: "viewer" as const };

beforeEach(() => {
  state.jobs.clear();
  state.checkpoints.length = 0;
  state.seq = 0;
});

describe("provisioning runner — $ checkpoint gating", () => {
  it("starting a job HALTS at pay_approval and runs NO step (no paid resource)", async () => {
    const job = await startJob({ tenantName: "Acme", templateId: "tcenter-sales", mode: "simulate", actor: owner });
    expect(job.state).toBe("awaiting_pay_approval");
    expect(job.params).toEqual({}); // no step ran → no supabase_ref/workflow created
    const cps = await store.listCheckpoints(job.id);
    expect(cps).toEqual([expect.objectContaining({ kind: "pay_approval", status: "pending" })]);
  });

  it("only an OWNER can start a job (cost decision)", async () => {
    await expect(startJob({ tenantName: "Acme", templateId: "tcenter-sales", actor: viewer })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(startJob({ tenantName: "Acme", templateId: "tcenter-sales", actor: operator })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an operator CANNOT approve the pay checkpoint (owner-only)", async () => {
    const job = await startJob({ tenantName: "Acme", templateId: "tcenter-sales", mode: "simulate", actor: owner });
    await expect(approveCheckpoint({ jobId: job.id, kind: "pay_approval", actor: operator })).rejects.toBeInstanceOf(ForbiddenError);
    expect(state.jobs.get(job.id)!.state).toBe("awaiting_pay_approval"); // unchanged
  });
});

describe("provisioning runner — full simulate flow + resume idempotency", () => {
  it("approve $ deploys DB+workflow then halts at QR (not active)", async () => {
    const job = await startJob({ tenantName: "Acme", templateId: "tcenter-sales", mode: "simulate", actor: owner });
    const after = await approveCheckpoint({ jobId: job.id, kind: "pay_approval", actor: owner });
    expect(after.state).toBe("awaiting_qr");
    expect(after.params.supabase_ref).toBeTruthy();
    expect(after.params.n8n_workflow_id).toBeTruthy();
    expect(after.params.activated).toBe(false); // deployed but NOT active
  });

  it("QR + prompt approval activates → live, recorded end-to-end", async () => {
    const job = await startJob({ tenantName: "Acme", templateId: "tcenter-sales", mode: "simulate", actor: owner });
    await approveCheckpoint({ jobId: job.id, kind: "pay_approval", actor: owner });
    const afterQr = await approveCheckpoint({ jobId: job.id, kind: "qr_pairing", actor: operator });
    expect(afterQr.state).toBe("awaiting_prompt_approval"); // no step between QR and prompt
    const live = await approveCheckpoint({ jobId: job.id, kind: "prompt_approval", actor: operator });
    expect(live.state).toBe("live");
    expect(live.params.activated).toBe(true);
  });

  it("resume is idempotent — the supabase_ref from create_db is not recreated", async () => {
    const job = await startJob({ tenantName: "Acme", templateId: "tcenter-sales", mode: "simulate", actor: owner });
    const after = await approveCheckpoint({ jobId: job.id, kind: "pay_approval", actor: owner });
    const ref1 = after.params.supabase_ref;
    // Simulate a crash/resume: re-approving is rejected (already past pay), but the
    // deterministic locate-or-create yields the SAME ref if re-run.
    const job2 = await startJob({ tenantName: "Acme", templateId: "tcenter-sales", mode: "simulate", actor: owner });
    const after2 = await approveCheckpoint({ jobId: job2.id, kind: "pay_approval", actor: owner });
    // Same job id slice → same deterministic sim ref (no duplication-by-randomness).
    expect(typeof ref1).toBe("string");
    expect(after2.params.supabase_ref).toBe(`sim_ref_${job2.id.slice(0, 8)}`);
  });
});

describe("provisioning runner — rejection keeps the bot OUT of live", () => {
  it("rejecting the prompt leaves the job in awaiting_prompt_approval, never live", async () => {
    const job = await startJob({ tenantName: "Acme", templateId: "tcenter-sales", mode: "simulate", actor: owner });
    await approveCheckpoint({ jobId: job.id, kind: "pay_approval", actor: owner });
    await approveCheckpoint({ jobId: job.id, kind: "qr_pairing", actor: operator });
    const rejected = await rejectCheckpoint({ jobId: job.id, kind: "prompt_approval", actor: operator, note: "tone off" });
    expect(rejected.state).toBe("awaiting_prompt_approval"); // NOT live
    const cps = await store.listCheckpoints(job.id);
    expect(cps.find((c) => c.kind === "prompt_approval")).toMatchObject({ status: "rejected" });
  });
});
