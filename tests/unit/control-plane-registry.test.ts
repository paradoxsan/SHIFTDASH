import { describe, it, expect, vi } from "vitest";

// Mock the control-plane reader so we test the registry mapping + fallback
// deterministically (no live DB). Live parity is covered by scripts/verify-live.mjs.
vi.mock("../../lib/control-plane", () => ({
  controlPlaneRef: () => "test-ref",
  loadBotRows: vi.fn(),
}));

import { loadBotRows } from "../../lib/control-plane";
import { loadClients, getClientsCached } from "../../lib/registry";

const mockedLoad = loadBotRows as unknown as ReturnType<typeof vi.fn>;

describe("registry ← control-plane (Phase 2)", () => {
  // Runs first while runtimeClients is still null, so we observe the seed fallback.
  it("falls back to the static seed when the control-plane is unreachable", async () => {
    mockedLoad.mockRejectedValueOnce(new Error("control-plane down"));
    const clients = await loadClients(true);
    expect(clients.some((c) => c.id === "t-center")).toBe(true);
    expect(clients.some((c) => c.id === "shift-digital")).toBe(true);
  });

  it("maps control-plane rows to ClientDef and exposes them via the sync cache", async () => {
    mockedLoad.mockResolvedValueOnce([
      {
        slug: "acme", name: "Acme", workspace: "clients", supabase_ref: "ref1",
        table_include: ["orders"], table_exclude: [], n8n_prefixes: ["ACME"],
        whapi_key: "ref1", sheet_id: null, channel: "whapi", accent: "#fff",
      },
    ]);
    const clients = await loadClients(true);
    const acme = clients.find((c) => c.id === "acme");
    expect(acme).toMatchObject({
      id: "acme", name: "Acme", workspace: "clients", supabaseRef: "ref1",
      tables: ["orders"], n8nPrefixes: ["ACME"], whapiKey: "ref1", accent: "#fff",
    });
    expect(acme?.excludeTables).toBeUndefined(); // empty array -> undefined
    expect(getClientsCached().some((c) => c.id === "acme")).toBe(true);
  });
});
