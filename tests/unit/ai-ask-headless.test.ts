// The headless "ask" path is the agent with nobody watching it — reached from
// an n8n workflow, ultimately from a WhatsApp message. Its safety rests on one
// property: it can never execute a write, because there is no approval card and
// no human to click it. These tests pin that, plus the two things that make it
// worth calling at all (delegation stays on, and the answer stays WhatsApp-sized).
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentEvent, RunAgentArgs } from "../../lib/ai/agent";

const calls: RunAgentArgs[] = [];
let script: AgentEvent[] = [];

vi.mock("../../lib/ai/agent", () => ({
  runAgent: (args: RunAgentArgs) => {
    calls.push(args);
    return (async function* () {
      for (const e of script) yield e;
    })();
  },
}));

vi.mock("../../lib/ai/context", () => ({
  systemPrompt: vi.fn(async (o: { client?: string | null }) => `SYSTEM:${o.client ?? "agency"}`),
}));

vi.mock("../../lib/registry", () => ({
  loadClients: vi.fn(async () => [{ id: "t-center" }, { id: "brjewelry" }]),
}));

import { askCopilot } from "../../lib/ai/ask";

beforeEach(() => {
  calls.length = 0;
  script = [
    { type: "tool_start", id: "1", name: "client_health", input: {} },
    { type: "text", text: "הכל תקין." },
    { type: "done" },
  ];
});

describe("askCopilot", () => {
  it("runs READ-ONLY — nothing reached this way can change production", async () => {
    await askCopilot({ question: "מה שלום הבוטים?" });
    expect(calls[0].policy?.readOnly).toBe(true);
  });

  it("keeps delegation ON for the agency copilot", async () => {
    // Fan-out to the client agents is the whole reason to call this instead of
    // the narrow /api/internal/* summaries.
    await askCopilot({ question: "מה שלום הבוטים?" });
    expect(calls[0].policy?.noDelegation).toBeFalsy();
    expect(calls[0].boundClient).toBeNull();
  });

  it("binds the turn to one client when asked", async () => {
    const r = await askCopilot({ question: "מה נשבר?", client: "t-center" });
    expect(calls[0].boundClient).toBe("t-center");
    expect(calls[0].system).toBe("SYSTEM:t-center");
    expect(r.agent).toBe("t-center");
  });

  it("rejects an unknown client and names the real ones", async () => {
    // The caller is a workflow whose logs nobody reads, so the error has to be
    // self-explanatory at the point it is returned.
    await expect(askCopilot({ question: "מה?", client: "tcenter" })).rejects.toThrow(/t-center/);
    expect(calls).toHaveLength(0);
  });

  it("reports which tools ran, so an unchecked answer is visible as one", async () => {
    const r = await askCopilot({ question: "מה שלום הבוטים?" });
    expect(r.toolsUsed).toEqual(["client_health"]);
    expect(r.answer).toBe("הכל תקין.");
    expect(r.ok).toBe(true);
  });

  it("caps the answer so it stays readable as a WhatsApp message", async () => {
    script = [{ type: "text", text: "x".repeat(9_000) }, { type: "done" }];
    const r = await askCopilot({ question: "ספר לי הכל" });
    expect(r.answer.length).toBeLessThan(3_200);
    expect(r.answer).toContain("קוצרה");
  });

  it("returns ok:false instead of throwing when the turn fails", async () => {
    script = [{ type: "error", message: "Anthropic 429" }];
    const r = await askCopilot({ question: "מה שלום הבוטים?" });
    expect(r.ok).toBe(false);
    expect(r.answer).toContain("429");
  });

  it("does not pass an empty answer off as a successful one", async () => {
    script = [{ type: "done" }];
    const r = await askCopilot({ question: "מה שלום הבוטים?" });
    expect(r.ok).toBe(false);
  });

  it("reports a stalled approval rather than returning a half answer", async () => {
    // Unreachable while readOnly strips writes from the spec list — but if it
    // ever is reached, the turn stopped waiting for a click nobody will make.
    script = [
      { type: "text", text: "מכבה את הבוט" },
      { type: "approval_required", id: "1", name: "n8n_toggle_workflow", input: {}, summary: "s" },
    ];
    const r = await askCopilot({ question: "כבה את הבוט" });
    expect(r.ok).toBe(false);
    expect(r.answer).toContain("n8n_toggle_workflow");
  });

  it("gives the headless turn a bounded step budget", async () => {
    await askCopilot({ question: "מה שלום הבוטים?" });
    expect(calls[0].maxIterations).toBeGreaterThan(0);
    expect(calls[0].maxIterations).toBeLessThanOrEqual(8);
  });
});
