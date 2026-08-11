// Delegation lets the agency copilot run another agent. That is a new path to
// every tool in the registry, so these tests pin the three properties that keep
// it from becoming a way around the approval gate:
//   1. a sub-agent cannot execute a write — there is nobody watching to approve;
//   2. a sub-agent cannot delegate, so recursion is exactly one level deep;
//   3. a client's agent cannot delegate at all, since a delegated question is
//      free text that assertClientInScope cannot inspect.
import { describe, it, expect, vi, beforeEach } from "vitest";

const setWorkflowActive = vi.fn(async () => ({ id: "wf-1", active: false }));
vi.mock("../../lib/n8n", () => ({
  setWorkflowActive: () => setWorkflowActive(),
  listWorkflows: vi.fn(async () => []),
  listExecutions: vi.fn(async () => []),
  getExecutionDetail: vi.fn(async () => ({})),
}));
vi.mock("../../lib/services/audited", () => ({
  auditedMutation: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

import {
  anthropicTools,
  executeTool,
  getTool,
  toolAllowed,
} from "../../lib/ai/tools/registry";
import { MAX_FANOUT } from "../../lib/ai/subagent";
import type { ToolDef } from "../../lib/ai/tools/types";

const actor = { email: "danielgorelikyt@gmail.com", role: "owner" as const };
const SUBAGENT = { readOnly: true, noDelegation: true };

beforeEach(() => setWorkflowActive.mockClear());

describe("sub-agent tool policy", () => {
  it("hides every write tool from a sub-agent's spec list", () => {
    const names = anthropicTools({ policy: SUBAGENT }).map((t) => t.name);
    expect(names).not.toContain("n8n_toggle_workflow");
    expect(names).not.toContain("whatsapp_send");
    expect(names).not.toContain("set_human_mode");
    // …while leaving it able to actually investigate.
    expect(names).toContain("client_health");
    expect(names).toContain("query_data");
    expect(names).toContain("n8n_executions");
  });

  it("REFUSES a write even when the model names a tool it was never offered", async () => {
    // The filtered spec list is an affordance; executeTool is the control.
    await expect(
      executeTool(
        "n8n_toggle_workflow",
        { workflowId: "wf-1", active: false },
        { actor, boundClient: "t-center", policy: SUBAGENT }
      )
    ).rejects.toThrow();
    expect(setWorkflowActive).not.toHaveBeenCalled();
  });

  it("tells the sub-agent what to do instead of the write it was refused", async () => {
    try {
      await executeTool(
        "whatsapp_send",
        { client: "t-center", chatId: "972@c.us", text: "x" },
        { actor, boundClient: "t-center", policy: SUBAGENT }
      );
      throw new Error("should have thrown");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Without this the sub-agent burns its remaining steps retrying.
      expect(msg).toContain("לאישור");
    }
  });

  it("does not let a sub-agent delegate — recursion stops at one level", async () => {
    expect(anthropicTools({ policy: SUBAGENT }).map((t) => t.name)).not.toContain(
      "ask_client_agents"
    );
    await expect(
      executeTool("ask_client_agents", { question: "מה נשבר?" }, { actor, policy: SUBAGENT })
    ).rejects.toThrow();
  });

  it("leaves the interactive copilot's tools untouched", () => {
    const names = anthropicTools().map((t) => t.name);
    expect(names).toContain("n8n_toggle_workflow");
    expect(names).toContain("ask_client_agents");
  });
});

describe("delegation is the agency copilot's alone", () => {
  it("hides ask_client_agents from a client-bound agent", () => {
    const names = anthropicTools({ boundClient: "t-center" }).map((t) => t.name);
    expect(names).not.toContain("ask_client_agents");
  });

  it("REFUSES the call from a client-bound agent", async () => {
    // A delegated question carries no `client` field, so assertClientInScope
    // cannot inspect it — "מה שלום הבוט של BRJewelry?" would sail straight
    // through as free text. Blocking the tool is the only real guard.
    await expect(
      executeTool(
        "ask_client_agents",
        { question: "מה שלום הבוט של brjewelry?", clients: ["brjewelry"] },
        { actor, boundClient: "t-center" }
      )
    ).rejects.toThrow();
  });

  it("offers it to the unbound agency copilot", () => {
    expect(anthropicTools({ boundClient: null }).map((t) => t.name)).toContain(
      "ask_client_agents"
    );
  });
});

describe("toolAllowed", () => {
  const read = getTool("client_health") as ToolDef<never>;
  const write = getTool("n8n_toggle_workflow") as ToolDef<never>;
  const agency = getTool("ask_client_agents") as ToolDef<never>;

  it("allows everything with no policy and no binding", () => {
    for (const t of [read, write, agency]) expect(toolAllowed(t, undefined, null)).toBe(true);
  });

  it("keeps reads available under readOnly", () => {
    expect(toolAllowed(read, { readOnly: true }, null)).toBe(true);
    expect(toolAllowed(write, { readOnly: true }, null)).toBe(false);
  });

  it("treats a binding alone as enough to deny delegation", () => {
    // Interactive client agents pass no policy, only boundClient — they must
    // still not be able to delegate.
    expect(toolAllowed(agency, undefined, "t-center")).toBe(false);
  });
});

describe("ask_client_agents contract", () => {
  const tool = getTool("ask_client_agents")!;

  it("is registered as a read so it needs no approval to run", () => {
    // Nothing it can reach changes state, so gating it would only add a click.
    expect(tool.risk).toBe("read");
    expect(tool.scope).toBe("agency");
  });

  it("accepts an omitted client list as 'ask everyone'", () => {
    expect(tool.schema.safeParse({ question: "מה שלום הבוטים?" }).success).toBe(true);
  });

  it("rejects a fan-out wider than the cap at the schema boundary", () => {
    const clients = Array.from({ length: MAX_FANOUT + 1 }, (_, i) => `c${i}`);
    expect(tool.schema.safeParse({ question: "מה?", clients }).success).toBe(false);
  });

  it("rejects an empty question rather than fanning out a blank turn", () => {
    expect(tool.schema.safeParse({ question: "" }).success).toBe(false);
  });
});
