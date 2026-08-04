import { describe, it, expect } from "vitest";
import { parseExecutionDetail } from "../../lib/n8n";

describe("parseExecutionDetail — n8n error drill-down", () => {
  const raw = {
    id: 99,
    status: "error",
    mode: "trigger",
    startedAt: "2026-06-28T10:00:00.000Z",
    stoppedAt: "2026-06-28T10:00:02.000Z",
    workflowId: "KIIGQZPxugci8i1j",
    workflowData: { name: "T-CENTER Sales bot" },
    data: {
      resultData: {
        lastNodeExecuted: "Supabase Insert",
        runData: {
          "Webhook": [{ data: { main: [[{ json: { chat_id: "972...@x", text: "היי" } }]] } }],
          "Supabase Insert": [
            {
              error: { message: "duplicate key value", description: "orders_pkey" },
              data: { main: [[]] },
              source: [{ previousNode: "Webhook" }],
            },
          ],
        },
      },
    },
  };

  it("identifies the failed node and its error", () => {
    const d = parseExecutionDetail(raw, { KIIGQZPxugci8i1j: "T-CENTER Sales bot V2" });
    expect(d.status).toBe("error");
    expect(d.failedNode).toBe("Supabase Insert");
    expect(d.errorMessage).toBe("duplicate key value");
    expect(d.errorDescription).toBe("orders_pkey");
    expect(d.workflowName).toBe("T-CENTER Sales bot V2"); // name map wins
    expect(d.durationMs).toBe(2000);
  });

  it("falls back to the input of the last node when the failed node has no item", () => {
    const d = parseExecutionDetail(raw);
    // Supabase Insert emitted [] → fall back to the Webhook's last-node item.
    expect(d.inputSample).toEqual({ chat_id: "972...@x", text: "היי" });
  });

  it("handles an execution with no runData without throwing", () => {
    const d = parseExecutionDetail({ id: 1, status: "success", workflowId: "w" });
    expect(d.failedNode).toBeNull();
    expect(d.errorMessage).toBeNull();
    expect(d.inputSample).toBeNull();
    expect(d.status).toBe("success");
  });

  it("scans runData for the errored node when lastNodeExecuted is clean", () => {
    const d = parseExecutionDetail({
      id: 2,
      status: "error",
      workflowId: "w",
      data: {
        resultData: {
          lastNodeExecuted: "Clean Node",
          runData: {
            "Clean Node": [{ data: { main: [[{ json: { ok: true } }]] } }],
            "Boom": [{ error: { message: "kaboom" } }],
          },
        },
      },
    });
    expect(d.failedNode).toBe("Boom");
    expect(d.errorMessage).toBe("kaboom");
  });
});
