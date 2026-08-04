// The copilot's core safety property: a state-changing tool NEVER executes
// without an explicit approval. These tests drive the real agent loop against a
// canned Anthropic stream and assert on whether the underlying n8n call happened.
import { describe, it, expect, vi, beforeEach } from "vitest";

const setWorkflowActive = vi.fn(async (id: string, active: boolean) => ({
  id,
  name: "T-CENTER Processor",
  active,
  archived: false,
  tags: [],
  updatedAt: null,
}));

vi.mock("../../lib/n8n", () => ({
  setWorkflowActive: (id: string, active: boolean) => setWorkflowActive(id, active),
  listWorkflows: vi.fn(async () => []),
  listExecutions: vi.fn(async () => []),
  getExecutionDetail: vi.fn(async () => ({})),
}));

// Pass-through so the test exercises the gate, not the audit plumbing (which has
// its own tests in audited.test.ts) — but recorded, so we can assert the write
// actually went through the audited seam.
const auditedMutation = vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn());
vi.mock("../../lib/services/audited", () => ({
  auditedMutation: (ctx: unknown, fn: () => Promise<unknown>) => auditedMutation(ctx, fn),
}));

import { runAgent, type AgentEvent } from "../../lib/ai/agent";

function frame(obj: unknown): string {
  return `event: ${(obj as { type: string }).type}\ndata: ${JSON.stringify(obj)}\n\n`;
}

/** A turn where the model says something and then calls n8n_toggle_workflow. */
function toolUseTurn(): string {
  return [
    frame({ type: "message_start" }),
    frame({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    frame({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "מכבה את הבוט." },
    }),
    frame({ type: "content_block_stop", index: 0 }),
    frame({
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "toolu_1", name: "n8n_toggle_workflow", input: {} },
    }),
    // Split mid-token on purpose: input arrives as JSON fragments.
    frame({
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"workflowId":"wf-1","act' },
    }),
    frame({
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: 'ive":false}' },
    }),
    frame({ type: "content_block_stop", index: 1 }),
    frame({ type: "message_delta", delta: { stop_reason: "tool_use" } }),
    frame({ type: "message_stop" }),
  ].join("");
}

function textTurn(text: string): string {
  return [
    frame({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    frame({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }),
    frame({ type: "content_block_stop", index: 0 }),
    frame({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
    frame({ type: "message_stop" }),
  ].join("");
}

function streamResponse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Chunk it so the SSE parser's partial-frame buffering is exercised.
      const bytes = new TextEncoder().encode(body);
      for (let i = 0; i < bytes.length; i += 17) controller.enqueue(bytes.slice(i, i + 17));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function mockTurns(...bodies: string[]) {
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => streamResponse(bodies[Math.min(n++, bodies.length - 1)]))
  );
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const baseArgs = {
  messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "כבה את הבוט" }] }],
  system: "test",
  actor: { email: "danielgorelikyt@gmail.com", role: "owner" as const },
};

beforeEach(() => {
  setWorkflowActive.mockClear();
  auditedMutation.mockClear();
  vi.unstubAllGlobals();
});

describe("agent approval gate", () => {
  it("stops at an unapproved write and does NOT execute it", async () => {
    mockTurns(toolUseTurn());
    const events = await collect(runAgent(baseArgs));

    const approval = events.find((e) => e.type === "approval_required");
    expect(approval).toBeDefined();
    expect(approval).toMatchObject({ name: "n8n_toggle_workflow", id: "toolu_1" });
    expect(setWorkflowActive).not.toHaveBeenCalled();

    // No tool ran, so no tool_result should have been emitted either.
    expect(events.some((e) => e.type === "tool_result")).toBe(false);
  });

  it("reassembles the streamed tool input and surfaces it for review", async () => {
    mockTurns(toolUseTurn());
    const events = await collect(runAgent(baseArgs));
    const approval = events.find((e) => e.type === "approval_required");
    expect(approval && "input" in approval && approval.input).toEqual({
      workflowId: "wf-1",
      active: false,
    });
  });

  it("executes the write once — and only once — after approval", async () => {
    mockTurns(toolUseTurn(), textTurn("כובה."));
    const events = await collect(
      runAgent({ ...baseArgs, approvedToolUseIds: new Set(["toolu_1"]) })
    );

    expect(setWorkflowActive).toHaveBeenCalledTimes(1);
    expect(setWorkflowActive).toHaveBeenCalledWith("wf-1", false);

    // The write must have gone through the audited seam, with the operator
    // requirement and a resolvable action — not straight to the n8n client.
    expect(auditedMutation).toHaveBeenCalledTimes(1);
    expect(auditedMutation.mock.calls[0][0]).toMatchObject({
      minRole: "operator",
      action: "n8n.workflow.toggle",
      targetId: "wf-1",
    });

    const result = events.find((e) => e.type === "tool_result");
    expect(result).toMatchObject({ name: "n8n_toggle_workflow", ok: true });
    expect(events.some((e) => e.type === "approval_required")).toBe(false);
  });

  it("does not execute a rejected write, and tells the model it was rejected", async () => {
    mockTurns(toolUseTurn(), textTurn("בסדר, לא נגעתי."));
    const events = await collect(
      runAgent({ ...baseArgs, rejectedToolUseIds: new Set(["toolu_1"]) })
    );

    expect(setWorkflowActive).not.toHaveBeenCalled();
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ ok: false });

    // The tool_result fed back to the model must say it was rejected, so the
    // model reports it accurately instead of claiming success.
    const toolResultMsg = events
      .filter((e) => e.type === "message")
      .find((e) => "message" in e && e.message.role === "user");
    const content = toolResultMsg && "message" in toolResultMsg ? toolResultMsg.message.content : [];
    expect(JSON.stringify(content)).toContain("דחה");
    expect(content[0]).toMatchObject({ type: "tool_result", is_error: true });
  });

  it("streams assistant text as it arrives", async () => {
    mockTurns(toolUseTurn());
    const events = await collect(runAgent(baseArgs));
    const text = events
      .filter((e) => e.type === "text")
      .map((e) => ("text" in e ? e.text : ""))
      .join("");
    expect(text).toBe("מכבה את הבוט.");
  });

  it("emits every message that must be persisted, in order", async () => {
    mockTurns(toolUseTurn(), textTurn("כובה."));
    const events = await collect(
      runAgent({ ...baseArgs, approvedToolUseIds: new Set(["toolu_1"]) })
    );
    const roles = events
      .filter((e) => e.type === "message")
      .map((e) => ("message" in e ? e.message.role : ""));
    // assistant(tool_use) → user(tool_result) → assistant(final text)
    expect(roles).toEqual(["assistant", "user", "assistant"]);
  });

  it("reports an API failure as an error event instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 }))
    );
    const events = await collect(runAgent(baseArgs));
    expect(events.at(-1)?.type).toBe("error");
  });
});
