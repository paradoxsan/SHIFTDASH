import { describe, it, expect } from "vitest";
import {
  STAGES,
  nextState,
  stageFor,
  isCheckpoint,
  checkpointOf,
  canAutoAdvance,
  isTerminal,
  expectsCheckpoint,
  type ProvState,
} from "../../lib/provisioning/state-machine";

describe("provisioning state machine — pipeline ordering", () => {
  it("walks draft → pay → db → deploy → qr → prompt → activate → live in order", () => {
    const chain: ProvState[] = [];
    let s: ProvState | null = "draft";
    while (s && !isTerminal(s)) {
      const n = nextState(s);
      if (n) chain.push(n);
      s = n;
    }
    expect(chain).toEqual([
      "awaiting_pay_approval",
      "creating_db",
      "deploying_workflow",
      "awaiting_qr",
      "awaiting_prompt_approval",
      "activating",
      "live",
    ]);
  });
});

describe("provisioning state machine — checkpoint gating", () => {
  it("the FIRST stage is the 💲 checkpoint — no step runs before cost approval", () => {
    // Acceptance: starting a job halts at the $ checkpoint and creates NO paid resource.
    const first = STAGES[0];
    expect(first.state).toBe("awaiting_pay_approval");
    expect(first.type).toBe("checkpoint");
    expect(nextState("draft")).toBe("awaiting_pay_approval");
    expect(canAutoAdvance("awaiting_pay_approval")).toBe(false); // requires a human
  });

  it("the three checkpoints map to pay/qr/prompt and pause the runner", () => {
    expect(checkpointOf("awaiting_pay_approval")).toBe("pay_approval");
    expect(checkpointOf("awaiting_qr")).toBe("qr_pairing");
    expect(checkpointOf("awaiting_prompt_approval")).toBe("prompt_approval");
    for (const s of ["awaiting_pay_approval", "awaiting_qr", "awaiting_prompt_approval"] as ProvState[]) {
      expect(isCheckpoint(s)).toBe(true);
      expect(canAutoAdvance(s)).toBe(false);
    }
  });

  it("step stages auto-advance; terminals do not", () => {
    for (const s of ["creating_db", "deploying_workflow", "activating"] as ProvState[]) {
      expect(stageFor(s)?.type).toBe("step");
      expect(canAutoAdvance(s)).toBe(true);
    }
    expect(isTerminal("live")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(stageFor("live")?.type).toBe("terminal");
  });

  it("rejects a checkpoint decision aimed at the wrong stage", () => {
    expect(expectsCheckpoint("awaiting_qr", "qr_pairing")).toBe(true);
    expect(expectsCheckpoint("awaiting_qr", "pay_approval")).toBe(false);
    expect(expectsCheckpoint("creating_db", "prompt_approval")).toBe(false);
  });

  it("QR sits immediately before prompt — workflow is deployed but not active until both pass", () => {
    expect(nextState("deploying_workflow")).toBe("awaiting_qr");
    expect(nextState("awaiting_qr")).toBe("awaiting_prompt_approval");
    // activation is the LAST step, only reachable after prompt approval
    expect(nextState("awaiting_prompt_approval")).toBe("activating");
    expect(nextState("activating")).toBe("live");
  });
});
