import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the control-plane SQL layer so we can assert the dedup wiring without a DB.
const runSql = vi.hoisted(() => vi.fn());
vi.mock("../../lib/supabase-management", () => ({ runSql }));
vi.mock("../../lib/control-plane", () => ({ controlPlaneRef: () => "cp" }));

import { dispatchEvent } from "../../lib/events";

beforeEach(() => runSql.mockReset());

describe("dispatchEvent — dedup wiring (Phase 8)", () => {
  it("emits an ON CONFLICT … WHERE status <> 'resolved' DO NOTHING insert", async () => {
    runSql.mockResolvedValueOnce([{ id: 5 }]);
    const r = await dispatchEvent({ botId: "b", type: "BOT_DOWN", severity: "high", dedupKey: "BOT_DOWN:b" });
    expect(r).toEqual({ created: true, id: 5 });
    const sql = runSql.mock.calls[0][1] as string;
    expect(sql).toMatch(/on conflict \(dedup_key\) where status <> 'resolved' do nothing/);
    expect(sql).toContain("returning id");
  });

  it("a deduped re-run returns created=false (no new row → no fan-out)", async () => {
    runSql.mockResolvedValueOnce([]); // conflict → nothing returned
    const r = await dispatchEvent({ botId: "b", type: "BOT_DOWN", severity: "high", dedupKey: "BOT_DOWN:b" });
    expect(r).toEqual({ created: false, id: null });
  });

  it("binds the dedup_key and severity safely (single-quote escaping)", async () => {
    runSql.mockResolvedValueOnce([{ id: 1 }]);
    await dispatchEvent({ botId: "b", type: "X", severity: "high", dedupKey: "k'inject" });
    expect(runSql.mock.calls[0][1] as string).toContain("'k''inject'");
  });
});
