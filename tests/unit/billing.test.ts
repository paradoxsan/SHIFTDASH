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

  // Live pair: #80005 (status 3, −150, "ביטול קבלה 80004") is the cancelling
  // document; #80004 (status 4, +150) is the receipt it cancelled. Flagging only
  // one of them left the voided +150 counted as income.
  it("flags both halves of a void — the cancelling document and the cancelled one", () => {
    expect(normalizeDocument(rawDoc({ number: 80005, status: 3, amount: -150 }))?.cancelled).toBe(
      true
    );
    expect(normalizeDocument(rawDoc({ number: 80004, status: 4, amount: 150 }))?.cancelled).toBe(
      true
    );
    expect(normalizeDocument(rawDoc({ status: 0 }))?.cancelled).toBe(false);
  });

  it("converts a foreign-currency document to shekels when Morning supplies the local amount", () => {
    expect(
      normalizeDocument(rawDoc({ amount: 100, currency: "USD", amountLocal: 293.5 }))
    ).toMatchObject({ amount: 293.5, currency: "ILS" });
    expect(normalizeDocument(rawDoc({ amount: 100, currency: "USD" }))).toMatchObject({
      amount: 100,
      currency: "USD",
    });
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

  // The real Supabase bill from the live books: $25 at rate 2.935 = ₪73.38.
  // Reading `amount` put ₪25 in a shekel total and understated the month.
  it("converts a foreign-currency expense to shekels via amountLocal", () => {
    const e = normalizeExpense({
      id: "74855aeb",
      amount: 25,
      currency: "USD",
      currencyRate: 2.935,
      amountLocal: 73.38,
      date: "2026-06-13",
      supplier: { name: "Supabase Pte. Ltd." },
    });
    expect(e).toMatchObject({ amount: 73.38, currency: "ILS" });
  });

  it("leaves a shekel expense alone even if amountLocal is absent or zero", () => {
    expect(
      normalizeExpense({ id: "e3", amount: 240, currency: "ILS", amountLocal: 0, date: "2026-06-03" })
    ).toMatchObject({ amount: 240, currency: "ILS" });
  });

  it("marks a deleted expense inactive rather than dropping it as unparseable", () => {
    expect(normalizeExpense({ id: "e4", amount: 10, date: "2026-06-03", active: false })).toMatchObject(
      { active: false }
    );
    expect(normalizeExpense({ id: "e5", amount: 10, date: "2026-06-03" })).toMatchObject({
      active: true,
    });
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
        { id: "e1", supplierName: "a", amount: 300, currency: "ILS", date: "2026-05-02", active: true },
        { id: "e2", supplierName: "b", amount: 500, currency: "ILS", date: "2026-06-02", active: true },
      ],
      months
    );
    expect(rows).toEqual([
      { month: "2026-05", income: 1000, expense: 300, profit: 700 },
      { month: "2026-06", income: 2000, expense: 500, profit: 1500 },
    ]);
  });

  it("keeps a deleted expense out of the totals", () => {
    const rows = summarizeByMonth(
      [],
      [
        { id: "e1", supplierName: "a", amount: 300, currency: "ILS", date: "2026-05-02", active: true },
        { id: "e2", supplierName: "b", amount: 900, currency: "ILS", date: "2026-05-03", active: false },
      ],
      ["2026-05"]
    );
    expect(rows[0].expense).toBe(300);
  });

  it("excludes cancelled documents, proformas and settled receipts from invoice income", () => {
    const rows = summarizeByMonth(
      [
        doc({ date: "2026-05-09", amount: 900 }),
        doc({ date: "2026-05-10", amount: 1000, cancelled: true }),
        doc({ date: "2026-05-11", amount: 700, type: DOC_TYPE.PROFORMA }),
        // A receipt settling the invoice above — counting it too would double-book.
        doc({ date: "2026-05-12", amount: 900, type: DOC_TYPE.RECEIPT }),
      ],
      [],
      ["2026-05"]
    );
    expect(rows[0].income).toBe(900);
  });

  // Shift Digital is an עוסק פטור: its live books contain type-400 receipts and
  // nothing else. Excluding receipts unconditionally reported ₪0 against real
  // revenue, so a set with no invoices treats its receipts as the income.
  it("counts receipts as income for a business that issues no invoices", () => {
    const rows = summarizeByMonth(
      [
        doc({ id: "80002", date: "2026-06-11", amount: 1150, type: DOC_TYPE.RECEIPT }),
        doc({ id: "80001", date: "2026-06-10", amount: 300, type: DOC_TYPE.RECEIPT }),
      ],
      [],
      ["2026-06"]
    );
    expect(rows[0].income).toBe(1450);
  });

  // The live void pair: receipt #80004 (+150, status 4) cancelled by #80005
  // (−150, status 3). Both halves are void, so the month nets to the ₪100 that
  // was really taken — not ₪250, and not ₪100 short.
  it("nets a voided receipt and its cancelling document to zero", () => {
    const rows = summarizeByMonth(
      [
        doc({ id: "80006", date: "2026-07-30", amount: 100, type: DOC_TYPE.RECEIPT }),
        doc({ id: "80004", date: "2026-07-18", amount: 150, type: DOC_TYPE.RECEIPT, cancelled: true }),
        doc({
          id: "80005",
          date: "2026-07-23",
          amount: -150,
          type: DOC_TYPE.RECEIPT,
          cancelled: true,
        }),
      ],
      [],
      ["2026-07"]
    );
    expect(rows[0].income).toBe(100);
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

  it("says paid when nothing is open and this month's money is in", () => {
    const s = clientPaymentStatus({
      ...base,
      contract,
      docs: [doc({ paid: true, type: DOC_TYPE.RECEIPT, date: "2026-08-02", amount: 500 })],
    });
    expect(s.state).toBe("paid");
    expect(s.lastPaidOn).toBe("2026-08-02");
    expect(s.lastPaidAmount).toBe(500);
  });

  // A receipt-only business never carries an open invoice, so "nothing open"
  // would read as "paid" forever — including for a retainer client who last paid
  // two months ago. That is the one thing the clients screen must not say.
  it("says awaiting for a retainer client with no payment this month", () => {
    const s = clientPaymentStatus({
      ...base,
      contract,
      docs: [doc({ paid: true, type: DOC_TYPE.RECEIPT, date: "2026-06-11", amount: 500 })],
    });
    expect(s.state).toBe("awaiting");
    expect(s.lastPaidOn).toBe("2026-06-11");
    expect(s.overdueAmount).toBe(0);
  });

  it("does not demand a monthly payment from a client who is not on a retainer", () => {
    expect(
      clientPaymentStatus({ ...base, contract: { ...contract, monthlyFee: null }, docs: [] }).state
    ).toBe("paid");
    expect(
      clientPaymentStatus({ ...base, contract: { ...contract, billingStatus: "paused" }, docs: [] })
        .state
    ).toBe("paid");
  });

  it("does not count a voided receipt as this month's payment", () => {
    const s = clientPaymentStatus({
      ...base,
      contract,
      docs: [
        doc({ type: DOC_TYPE.RECEIPT, date: "2026-08-01", amount: 500, cancelled: true, paid: true }),
      ],
    });
    expect(s.state).toBe("awaiting");
    expect(s.lastPaidOn).toBeNull();
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
