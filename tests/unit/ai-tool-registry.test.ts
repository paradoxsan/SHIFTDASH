import { describe, it, expect } from "vitest";
import { allTools, anthropicTools, getTool, isWriteTool, summarizeTool } from "../../lib/ai/tools/registry";

describe("copilot tool registry", () => {
  it("has unique tool names", () => {
    const names = allTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("declares every tool as read or write", () => {
    for (const t of allTools()) {
      expect(["read", "write"]).toContain(t.risk);
    }
  });

  it("classifies the state-changing tools as writes", () => {
    // These reach live customers or take a bot offline — they MUST be gated.
    for (const name of [
      "n8n_toggle_workflow",
      "whatsapp_send",
      "set_human_mode",
      "lead_update",
      "lead_send_message",
      "ack_event",
    ]) {
      expect(getTool(name), `${name} should exist`).toBeDefined();
      expect(isWriteTool(name), `${name} should be a write`).toBe(true);
    }
  });

  it("classifies the inspection tools as reads", () => {
    for (const name of [
      "list_clients",
      "client_health",
      "n8n_executions",
      "query_data",
      "whatsapp_messages",
      "leads_list",
    ]) {
      expect(isWriteTool(name), `${name} should be a read`).toBe(false);
    }
  });

  it("produces a valid object JSON schema for every tool", () => {
    for (const spec of anthropicTools()) {
      expect(spec.name).toBeTruthy();
      expect(spec.description.length).toBeGreaterThan(10);
      expect(spec.input_schema.type).toBe("object");
      expect(spec.input_schema.$schema).toBeUndefined();
    }
  });

  it("tells the model which tools need approval", () => {
    const toggle = anthropicTools().find((t) => t.name === "n8n_toggle_workflow");
    expect(toggle?.description).toContain("אישור");
    const read = anthropicTools().find((t) => t.name === "list_clients");
    expect(read?.description).not.toContain("אישור");
  });

  it("gives every write tool audit coordinates", () => {
    // executeTool refuses to run a write without these, so a tool missing them
    // would be dead on arrival rather than silently unaudited — this catches it
    // at build time instead.
    for (const t of allTools().filter((t) => t.risk === "write")) {
      expect(t.audit, `${t.name} must declare audit()`).toBeTypeOf("function");
      const target = t.audit!({} as never);
      expect(target.action, `${t.name} audit action`).toMatch(/^[a-z0-9_.]+$/);
    }
  });

  it("summarises a proposed write in readable Hebrew", () => {
    const s = summarizeTool("set_human_mode", {
      client: "t-center",
      chatId: "9725@c.us",
      active: true,
      silenceMinutes: 120,
    });
    expect(s).toContain("להשתיק");
    expect(s).toContain("9725@c.us");
    expect(s).toContain("120");
  });

  it("falls back to JSON rather than throwing on malformed input", () => {
    expect(summarizeTool("set_human_mode", { nonsense: true })).toContain("set_human_mode");
    expect(summarizeTool("no_such_tool", {})).toBe("no_such_tool");
  });
});
