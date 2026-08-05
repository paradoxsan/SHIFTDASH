import { describe, it, expect } from "vitest";
import {
  clientPaymentStatus,
  daysBetween,
  DOC_TYPE,
  monthlyRecurring,
  monthOf,
  normalizeAll,
  normalizeDocument,
  normalizeExpense,
  openReceivables,
  recentMonths,
  summarizeByMonth,
  toDateOnly,
  type MorningDoc,
} from "@/lib/billing";

// A realistic Green Invoice document, used as the base for variations.
function rawDoc(over: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    number: 1042,
    type: DOC_TYPE.TAX_INVOICE,
    documentDate: "2026-06-01",
    dueDate: "2026-07-01",
    amount: 1170,
    currency: "ILS",
    status: 0,
    client: { id: "mc-1", name: "BRJewelry" },
    ...over,
  };
}

function doc(over: Partial<MorningDoc> = {}): MorningDoc {
  return {
    id: "d",
    number: "1",
    type: DOC_TYPE.TAX_INVOICE,
    clientId: "mc-1",
    clientName: "BRJewelry",
    amount: 1000,
    currency: "ILS",
    date: "2026-06-01",
    dueDate: "2026-07-01",
    paid: false,
    cancelled: false,
    ...over,
  };
}

describe("toDateOnly", () => {
  it("passes through a calendar date", () => {
    expect(toDateOnly("2026-06-01")).toBe("2026-06-01");
  });
  it("truncates an ISO timestamp", () => {
    expect(toDateOnly("2026-06-01T22:15:00.000Z")).toBe("2026-06-01");
  });
  it("reads a unix timestamp in seconds", () => {
    expect(toDateOnly(1780358400)).toBe("2026-06-02");
  });
  it("rejects junk instead of inventing a date", () => {
    expect(toDateOnly("not a date")).toBeNull();
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly(undefined)).toBeNull();
  });
});

describe("normalizeDocument", () => {
  it("maps a standard document", () => {
    const d = normalizeDocument(rawDoc());
    expect(d).toMatchObject({
      id: "doc-1",
      number: "1042",
      type: DOC_TYPE.TAX_INVOICE,
      clientId: "mc-1",
      clientName: "BRJewelry",
      amount: 1170,
      date: "2026-06-01",
      dueDate: "2026-07-01",
      paid: false,
      cancelled: false,
    });
  });

  it("drops a row missing the fields that make it meaningful", () => {
    expect(normalizeDocument(rawDoc({ id: undefined }))).toBeNull();
    expect(normalizeDocument(rawDoc({ amount: undefined }))).toBeNull();
    expect(normalizeDocument(rawDoc({ documentDate: undefined, date: undefined }))).toBeNull();
    expect(normalizeDocument(null)).toBeNull();
    expect(normalizeDocument("nope")).toBeNull();
    expect(normalizeDocument([1, 2])).toBeNull();
  });

  it("accepts alternative field names", () => {
    const d = normalizeDocument({
      documentId: "x",
      total: "500.5",
      date: "2026-05-09",
      documentType: DOC_TYPE.PROFORMA,
    });
    expect(d).toMatchObject({ id: "x", amount: 500.5, date: "2026-05-09" });
  });

  it("treats a zero open balance as paid, whatever the status says", () => {
    expect(normalizeDocument(rawDoc({ amountOpened: 0, status: 0 }))?.paid).toBe(true);
    expect(normalizeDocument(rawDoc({ amountOpened: 1170, status: 1 }))?.paid).toBe(false);
  });

  it("falls back to the status enum, then to self-settling types", () => {
    expect(normalizeDocument(rawDoc({ status: 1 }))?.paid).toBe(true);
    expect(
      normalizeDocument(rawDoc({ status: undefined, type: DOC_TYPE.INVOICE_RECEIPT }))?.paid
    ).toBe(true);
    expect(normalizeDocument(rawDoc({ status: undefined }))?.paid).toBe(false);
  });

  it("flags cancelled documents", () => {
    expect(normalizeDocument(rawDoc({ status: 3 }))?.cancelled).toBe(true);
  });

  it("tolerates a missing client block", () => {
    const d = normalizeDocument(rawDoc({ client: undefined }));
    expect(d?.clientId).toBeNull();
    expect(d?.clientName).toBeNull();
  });
});

describe("normalizeExpense", () => {
  it("maps a supplier expense", () => {
    const e = normalizeExpense({
      id: "e1",
      amount: 240,
      date: "2026-06-03",
      supplier: { name: "Vercel" },
    });
    expect(e).toMatchObject({ id: "e1", amount: 240, date: "2026-06-03", supplierName: "Vercel" });
  });
  it("drops unusable rows", () => {
    expect(normalizeExpense({ id: "e2", date: "2026-06-03" })).toBeNull();
  });
});

describe("normalizeAll", () => {
  it("counts what it could not parse instead of hiding it", () => {
    const { items, skipped } = normalizeAll([rawDoc(), null, { junk: true }], normalizeDocument);
    expect(items).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe("recentMonths", () => {
  it("walks back across a year boundary", () => {
    expect(recentMonths("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("returns the month itself for a window of one", () => {
    expect(recentMonths("2026-08", 1)).toEqual(["2026-08"]);
  });
  it("monthOf takes the YYYY-MM prefix", () => {
    expect(monthOf("2026-08-05")).toBe("2026-08");
  });
});

describe("summarizeByMonth", () => {
  const months = ["2026-05", "2026-06"];

  it("nets income against expenses per month", () => {
    const rows = summarizeByMonth(
      [doc({ date: "2026-05-10", amount: 1000 }), doc({ date: "2026-06-10", amount: 2000 })],
      [
        { id: "e1", supplierName: "a", amount: 300, currency: "ILS", date: "2026-05-02" },
        { id: "e2", supplierName: "b", amount: 500, currency: "ILS", date: "2026-06-02" },
      ],
      months
    );
    expect(rows).toEqual([
      { month: "2026-05", income: 1000, expense: 300, profit: 700 },
      { month: "2026-06", income: 2000, expense: 500, profit: 1500 },
    ]);
  });

  it("excludes cancelled documents and proformas from income", () => {
    const rows = summarizeByMonth(
      [
        doc({ date: "2026-05-10", amount: 1000, cancelled: true }),
        doc({ date: "2026-05-11", amount: 700, type: DOC_TYPE.PROFORMA }),
        doc({ date: "2026-05-12", amount: 400, type: DOC_TYPE.RECEIPT }),
      ],
      [],
      ["2026-05"]
    );
    expect(rows[0].income).toBe(0);
  });

  it("lets a credit invoice reduce income", () => {
    const rows = summarizeByMonth(
      [
        doc({ date: "2026-05-10", amount: 1000 }),
        doc({ date: "2026-05-20", amount: -250, type: DOC_TYPE.CREDIT_INVOICE }),
      ],
      [],
      ["2026-05"]
    );
    expect(rows[0].income).toBe(750);
  });

  it("reports a requested month with no activity as zero, not missing", () => {
    const rows = summarizeByMonth([], [], months);
    expect(rows.map((r) => r.month)).toEqual(months);
    expect(rows.every((r) => r.income === 0 && r.profit === 0)).toBe(true);
  });
});

describe("openReceivables", () => {
  it("counts unpaid invoices and proformas, not credits or cancellations", () => {
    const open = openReceivables([
      doc({ id: "a" }),
      doc({ id: "b", type: DOC_TYPE.PROFORMA }),
      doc({ id: "c", paid: true }),
      doc({ id: "d", cancelled: true }),
      doc({ id: "e", type: DOC_TYPE.CREDIT_INVOICE, amount: -100 }),
      doc({ id: "f", type: DOC_TYPE.RECEIPT }),
    ]);
    expect(open.map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("clientPaymentStatus", () => {
  const contract = { morningClientId: "mc-1", monthlyFee: 500, billingStatus: "active" };
  const base = { today: "2026-08-05", morningConfigured: true };

  it("says no-contract before an agreement exists", () => {
    expect(clientPaymentStatus({ ...base, contract: null, docs: [] }).state).toBe("no-contract");
  });

  it("says unlinked when the client was never tied to a Morning customer", () => {
    expect(
      clientPaymentStatus({ ...base, contract: { ...contract, morningClientId: null }, docs: [] })
        .state
    ).toBe("unlinked");
  });

  it("says unknown — never paid — when Morning could not be read", () => {
    const s = clientPaymentStatus({
      ...base,
      morningConfigured: false,
      contract,
      docs: [doc({ dueDate: "2026-01-01" })],
    });
    expect(s.state).toBe("unknown");
    expect(s.overdueAmount).toBe(0);
  });

  it("says paid when nothing is open", () => {
    expect(clientPaymentStatus({ ...base, contract, docs: [doc({ paid: true })] }).state).toBe(
      "paid"
    );
  });

  it("says due for an invoice that is open but not yet late", () => {
    const s = clientPaymentStatus({
      ...base,
      contract,
      docs: [doc({ amount: 1200, dueDate: "2026-09-01" })],
    });
    expect(s.state).toBe("due");
    expect(s.openAmount).toBe(1200);
    expect(s.overdueAmount).toBe(0);
    expect(s.daysOverdue).toBe(0);
  });

  it("says overdue and measures from the OLDEST late invoice", () => {
    const s = clientPaymentStatus({
      ...base,
      contract,
      docs: [
        doc({ id: "x", amount: 1000, dueDate: "2026-07-06" }),
        doc({ id: "y", amount: 500, dueDate: "2026-06-05" }),
        doc({ id: "z", amount: 300, dueDate: "2026-09-01" }),
      ],
    });
    expect(s.state).toBe("overdue");
    expect(s.openAmount).toBe(1800);
    expect(s.overdueAmount).toBe(1500);
    expect(s.oldestDueDate).toBe("2026-06-05");
    expect(s.daysOverdue).toBe(61);
    expect(s.openCount).toBe(3);
  });

  it("treats an open invoice with no due date as due, not overdue", () => {
    const s = clientPaymentStatus({ ...base, contract, docs: [doc({ dueDate: null })] });
    expect(s.state).toBe("due");
  });

  it("does not count a document due today as late", () => {
    const s = clientPaymentStatus({ ...base, contract, docs: [doc({ dueDate: "2026-08-05" })] });
    expect(s.state).toBe("due");
  });
});

describe("daysBetween", () => {
  it("counts whole days and survives a DST shift", () => {
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-08-05", "2026-08-05")).toBe(0);
  });
});

describe("monthlyRecurring", () => {
  it("sums active monthly fees only", () => {
    expect(
      monthlyRecurring([
        { morningClientId: null, monthlyFee: 500, billingStatus: "active" },
        { morningClientId: null, monthlyFee: 1200, billingStatus: "active" },
        { morningClientId: null, monthlyFee: 900, billingStatus: "paused" },
        { morningClientId: null, monthlyFee: 400, billingStatus: "churned" },
        { morningClientId: null, monthlyFee: null, billingStatus: "active" },
      ])
    ).toBe(1700);
  });
});
