import { describe, it, expect } from "vitest";
import { assertClientInScope } from "@/lib/ai/tools/registry";
import { renderDossier, DOSSIER_BUDGET, type KnowledgeEntry } from "@/lib/ai/knowledge";

// A client's agent must not be able to read another client's data. The system
// prompt says so, but the prompt is not the enforcement — executeTool is. These
// tests pin the guard, because a regression here leaks one customer's data into
// another customer's conversation with no visible symptom.
describe("assertClientInScope", () => {
  it("allows any client when the thread is not bound to one (agency copilot)", () => {
    expect(() => assertClientInScope("client_health", { client: "t-center" }, null)).not.toThrow();
    expect(() =>
      assertClientInScope("client_health", { client: "brjewelry" }, undefined)
    ).not.toThrow();
  });

  it("allows a call for the bound client", () => {
    expect(() =>
      assertClientInScope("query_data", { client: "t-center", sql: "select 1" }, "t-center")
    ).not.toThrow();
  });

  it("REJECTS a call for a different client", () => {
    expect(() =>
      assertClientInScope("query_data", { client: "brjewelry", sql: "select 1" }, "t-center")
    ).toThrow(/brjewelry/);
  });

  it("names both clients in the error so the model can correct itself", () => {
    try {
      assertClientInScope("client_health", { client: "brjewelry" }, "t-center");
      throw new Error("should have thrown");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toContain("t-center");
      expect(msg).toContain("brjewelry");
      // It must tell the model what to do instead, or it burns turns retrying.
      expect(msg).toContain('client="t-center"');
    }
  });

  it("allows portfolio-level tools that take no client", () => {
    expect(() => assertClientInScope("list_clients", {}, "t-center")).not.toThrow();
    expect(() => assertClientInScope("list_events", { status: "open" }, "t-center")).not.toThrow();
  });

  it("ignores a non-string or empty client rather than throwing on malformed input", () => {
    // Schema validation reports these properly; the scope guard must not
    // pre-empt it with a confusing permissions error.
    expect(() => assertClientInScope("query_data", { client: 42 }, "t-center")).not.toThrow();
    expect(() => assertClientInScope("query_data", { client: "" }, "t-center")).not.toThrow();
    expect(() => assertClientInScope("query_data", null, "t-center")).not.toThrow();
  });

  it("does not silently rewrite the argument to the bound client", () => {
    // Coercion would answer a question about BRJewelry with T center's numbers.
    const input = { client: "brjewelry", sql: "select 1" };
    expect(() => assertClientInScope("query_data", input, "t-center")).toThrow();
    expect(input.client).toBe("brjewelry");
  });
});

function entry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 1,
    tenantId: "t",
    kind: "incident",
    title: "כותרת",
    body: "גוף",
    source: "human",
    pinned: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("renderDossier", () => {
  it("returns empty string for an empty dossier", () => {
    expect(renderDossier([])).toBe("");
  });

  it("groups entries under their kind heading", () => {
    const out = renderDossier([
      entry({ id: 1, kind: "architecture", title: "order_drafts" }),
      entry({ id: 2, kind: "incident", title: "QUEUE_STUCK" }),
    ]);
    expect(out).toContain("איך הבוט בנוי");
    expect(out).toContain("order_drafts");
    expect(out).toContain("תקלות שהיו");
    expect(out).toContain("QUEUE_STUCK");
  });

  it("puts architecture before incidents — the system before the symptoms", () => {
    const out = renderDossier([
      entry({ id: 1, kind: "incident", title: "INCIDENT_ONE" }),
      entry({ id: 2, kind: "architecture", title: "ARCH_ONE" }),
    ]);
    expect(out.indexOf("ARCH_ONE")).toBeLessThan(out.indexOf("INCIDENT_ONE"));
  });

  it("keeps pinned entries even when the budget is exhausted", () => {
    const filler = Array.from({ length: 50 }, (_, i) =>
      entry({ id: i + 10, title: `FILL_${i}`, body: "x".repeat(500), updatedAt: "2026-06-01T00:00:00Z" })
    );
    const pinned = entry({
      id: 1,
      title: "PINNED_FACT",
      body: "load bearing",
      pinned: true,
      // Oldest entry in the set — without the pin it would be first to go.
      updatedAt: "2020-01-01T00:00:00Z",
    });

    const out = renderDossier([...filler, pinned], 3_000);
    expect(out).toContain("PINNED_FACT");
  });

  it("drops oldest-first and says so, rather than truncating silently", () => {
    const entries = [
      entry({ id: 1, title: "NEWEST", body: "x".repeat(400), updatedAt: "2026-08-01T00:00:00Z" }),
      entry({ id: 2, title: "OLDEST", body: "x".repeat(400), updatedAt: "2020-01-01T00:00:00Z" }),
    ];
    const out = renderDossier(entries, 500);
    expect(out).toContain("NEWEST");
    expect(out).not.toContain("OLDEST");
    // An agent that knows its dossier is partial can go fetch the rest; one that
    // doesn't will answer confidently from a truncated history.
    expect(out).toContain("לא נכללו");
  });

  it("stays within a reasonable multiple of the budget", () => {
    const entries = Array.from({ length: 200 }, (_, i) =>
      entry({ id: i, title: `T${i}`, body: "y".repeat(300) })
    );
    expect(renderDossier(entries, DOSSIER_BUDGET).length).toBeLessThan(DOSSIER_BUDGET * 1.5);
  });
});
