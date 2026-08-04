import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the data-plane + send + audit + control-plane layers so we test the
// operator service's ORCHESTRATION (RBAC ordering, eligibility gating, the
// mutation it issues, human-mode honouring, stale-order + cooldown guards)
// without touching a live bot. vi.hoisted so the fns exist when vi.mock hoists.
const { selectRows, updateRowByPk, sendText, auditedMutation, wasActionedRecently } = vi.hoisted(() => ({
  selectRows: vi.fn(),
  updateRowByPk: vi.fn(),
  sendText: vi.fn(),
  auditedMutation: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  wasActionedRecently: vi.fn(),
}));

vi.mock("../../lib/services/query-builder", async () => {
  const actual = await vi.importActual<typeof import("../../lib/services/query-builder")>(
    "../../lib/services/query-builder"
  );
  return { ...actual, selectRows, updateRowByPk };
});
vi.mock("../../lib/whapi", () => ({ sendText }));
vi.mock("../../lib/services/audited", () => ({ auditedMutation }));
vi.mock("../../lib/control-plane", () => ({ wasActionedRecently }));

import { requeueInboxRow, chaseOrder, OperatorError } from "../../lib/services/operator";
import { ForbiddenError } from "../../lib/rbac";

const actor = { email: "op@shift.com", role: "operator" as const };

// Differentiate selectRows calls by table + predicate shape.
function hasWhere(opts: { where?: { column: string; op: string }[] }, column: string, op?: string): boolean {
  return Boolean(opts.where?.some((p) => p.column === column && (!op || p.op === op)));
}

beforeEach(() => {
  selectRows.mockReset();
  updateRowByPk.mockReset();
  sendText.mockReset();
  wasActionedRecently.mockReset();
  auditedMutation.mockClear();
  updateRowByPk.mockResolvedValue({ updated: ["status", "error"] });
  sendText.mockResolvedValue({ id: "m1", sent: true });
  wasActionedRecently.mockResolvedValue(false);
});

describe("requeueInboxRow — RBAC-first, PK-scoped, gated, audited mutation", () => {
  it("requeues a failed row: status→new, error→null, action inbox.requeue", async () => {
    selectRows.mockResolvedValue({ rows: [{ id: 7, status: "failed", attempts: 1 }] });
    const out = await requeueInboxRow({ ref: "p", id: 7, actor });
    expect(out.requeued).toBe(true);
    expect(updateRowByPk).toHaveBeenCalledTimes(1);
    expect(updateRowByPk.mock.calls[0][0]).toMatchObject({
      ref: "p",
      table: "inbox",
      pk: { id: 7 },
      set: { status: "new", error: null },
      minRole: "operator",
      action: "inbox.requeue",
    });
  });

  it("denies a viewer BEFORE any data-plane read (RBAC ordering)", async () => {
    await expect(
      requeueInboxRow({ ref: "p", id: 7, actor: { email: "v@x.com", role: "viewer" } })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(selectRows).not.toHaveBeenCalled();
    expect(updateRowByPk).not.toHaveBeenCalled();
  });

  it("refuses a healthy ('new') row and never mutates", async () => {
    selectRows.mockResolvedValue({ rows: [{ id: 8, status: "new", attempts: 0 }] });
    await expect(requeueInboxRow({ ref: "p", id: 8, actor })).rejects.toBeInstanceOf(OperatorError);
    expect(updateRowByPk).not.toHaveBeenCalled();
  });

  it("refuses when the row is missing", async () => {
    selectRows.mockResolvedValue({ rows: [] });
    await expect(requeueInboxRow({ ref: "p", id: 9, actor })).rejects.toBeInstanceOf(OperatorError);
    expect(updateRowByPk).not.toHaveBeenCalled();
  });
});

describe("chaseOrder — open + newest + link + no human takeover + cooldown, then audited send", () => {
  const openOrder = {
    id: 171,
    chat_id: "972507828242@s.whatsapp.net",
    status: "open",
    payment_link: "https://www.ezcount.co.il/dp/?key=abc",
    invoice_name: "איתמר",
    total: 350,
    created_at: "2026-06-28T09:00:00Z",
  };

  // orders-by-id → the order; orders newer-check → []; human_mode → configurable.
  function wireOrder(order: typeof openOrder, humanRows: unknown[] = []) {
    selectRows.mockImplementation((_ref: string, table: string, opts: { where?: { column: string; op: string }[] }) => {
      if (table === "orders") {
        if (hasWhere(opts, "id", "gt")) return Promise.resolve({ rows: [] }); // no newer order
        return Promise.resolve({ rows: [order] }); // by-id load
      }
      if (table === "human_mode") return Promise.resolve({ rows: humanRows });
      return Promise.resolve({ rows: [] });
    });
  }

  it("sends the reminder for an eligible order, wrapped in auditedMutation", async () => {
    wireOrder(openOrder);
    const out = await chaseOrder({ ref: "p", orderId: 171, actor });
    expect(out.sent).toBe(true);
    expect(out.to).toBe("972507828242@s.whatsapp.net");
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(auditedMutation).toHaveBeenCalledTimes(1);
    expect(auditedMutation.mock.calls[0][0]).toMatchObject({ action: "order.chase", minRole: "operator" });
  });

  it("denies a viewer before any read", async () => {
    await expect(
      chaseOrder({ ref: "p", orderId: 171, actor: { email: "v@x.com", role: "viewer" } })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(selectRows).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("refuses to message a chat under active human takeover", async () => {
    wireOrder(openOrder, [{ chat_id: openOrder.chat_id, active: true }]);
    await expect(chaseOrder({ ref: "p", orderId: 171, actor })).rejects.toBeInstanceOf(OperatorError);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("refuses when a NEWER open order exists for the chat (no stale dunning)", async () => {
    selectRows.mockImplementation((_ref: string, table: string, opts: { where?: { column: string; op: string }[] }) => {
      if (table === "orders" && hasWhere(opts, "id", "gt")) return Promise.resolve({ rows: [{ id: 999 }] });
      if (table === "orders") return Promise.resolve({ rows: [openOrder] });
      return Promise.resolve({ rows: [] });
    });
    await expect(chaseOrder({ ref: "p", orderId: 171, actor })).rejects.toBeInstanceOf(OperatorError);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("refuses when the order was chased within the cooldown window", async () => {
    wireOrder(openOrder);
    wasActionedRecently.mockResolvedValue(true);
    await expect(chaseOrder({ ref: "p", orderId: 171, actor })).rejects.toBeInstanceOf(OperatorError);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("refuses a non-open order", async () => {
    wireOrder({ ...openOrder, status: "paid" });
    await expect(chaseOrder({ ref: "p", orderId: 171, actor })).rejects.toBeInstanceOf(OperatorError);
    expect(sendText).not.toHaveBeenCalled();
  });
});
