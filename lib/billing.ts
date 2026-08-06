// ── Billing / money logic (PURE) ──────────────────────────────────────────────
// Everything the כסף screen and the client payment badge compute, with no I/O,
// so it is unit-testable against fixtures instead of against a live accounting
// account. `lib/morning.ts` does the fetching and hands raw JSON to
// `normalizeDocument` here.
//
// The Morning (Green Invoice) payload is normalised defensively: field names
// differ between document endpoints and between API versions, and a money
// screen that silently reads `undefined` as 0 is worse than one that says it
// doesn't know. Anything unparseable is dropped and counted, never guessed.

/** Green Invoice document types we care about. Others (quotes, delivery notes) are noise. */
export const DOC_TYPE = {
  PROFORMA: 300, // חשבונית עסקה — not yet income
  TAX_INVOICE: 305, // חשבונית מס
  INVOICE_RECEIPT: 320, // חשבונית מס קבלה — issued and paid in one document
  CREDIT_INVOICE: 330, // חשבונית זיכוי — negative
  RECEIPT: 400, // קבלה
} as const;

/** Types that represent money earned when the business issues invoices. A
 *  receipt is excluded here: it settles an invoice that was already counted, so
 *  counting both double-books revenue. See `incomeDocs` for the exception. */
export const INCOME_TYPES: readonly number[] = [
  DOC_TYPE.TAX_INVOICE,
  DOC_TYPE.INVOICE_RECEIPT,
  DOC_TYPE.CREDIT_INVOICE,
];

/** What income looks like for a business that issues no invoices at all. */
const RECEIPT_INCOME_TYPES: readonly number[] = [DOC_TYPE.RECEIPT, DOC_TYPE.CREDIT_INVOICE];

/**
 * The documents that represent income in this particular set.
 *
 * An עוסק פטור issues no חשבונית מס — a קבלה IS the income document, and Shift
 * Digital's live books are exactly that: every document is type 400. Excluding
 * receipts unconditionally reported ₪0 income against real revenue. So the rule
 * is evidence-based rather than fixed: when a set contains no invoice of any
 * kind, its receipts are the income; the moment a real invoice appears, receipts
 * go back to being settlements of documents already counted.
 */
export function incomeDocs(docs: MorningDoc[]): readonly MorningDoc[] {
  const live = docs.filter((d) => !d.cancelled);
  const types = live.some((d) => INCOME_TYPES.includes(d.type))
    ? INCOME_TYPES
    : RECEIPT_INCOME_TYPES;
  return live.filter((d) => types.includes(d.type));
}

/** Document types that are settled at the moment they are issued. */
const SELF_SETTLING: readonly number[] = [DOC_TYPE.INVOICE_RECEIPT, DOC_TYPE.RECEIPT];

/**
 * Types that can represent an unpaid debt to me. A proforma is included — it is
 * a demand for payment even though it is not yet income — and a credit invoice
 * is not, because it is money going the other way. Single definition so the
 * money screen's "open" total and a client's overdue badge always agree.
 */
export const RECEIVABLE_TYPES: readonly number[] = [
  DOC_TYPE.TAX_INVOICE,
  DOC_TYPE.INVOICE_RECEIPT,
  DOC_TYPE.PROFORMA,
];

/** Unpaid, uncancelled, positive documents — the debt in a set of documents. */
export function openReceivables(docs: MorningDoc[]): MorningDoc[] {
  return docs.filter(
    (d) => !d.paid && !d.cancelled && d.amount > 0 && RECEIVABLE_TYPES.includes(d.type)
  );
}

export interface MorningDoc {
  id: string;
  number: string;
  type: number;
  clientId: string | null;
  clientName: string | null;
  /** Total including VAT, in `currency`. Credit invoices are negative. */
  amount: number;
  currency: string;
  /** Issue date, `YYYY-MM-DD`. */
  date: string;
  /** Payment due date, `YYYY-MM-DD`, when the document carries one. */
  dueDate: string | null;
  paid: boolean;
  cancelled: boolean;
}

export interface MorningExpense {
  id: string;
  supplierName: string | null;
  /** In shekels — a foreign-currency expense is converted at Morning's rate. */
  amount: number;
  currency: string;
  date: string;
  /** False for an expense deleted in Morning; it must not reach the totals. */
  active: boolean;
}

// ── Raw-payload helpers ───────────────────────────────────────────────────────

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** First key that carries a usable value — tolerates naming drift between endpoints. */
function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Every total on the money screen is in shekels, so a foreign-currency row has
 * to be converted before it is summed. Morning reports those twice — `amount` in
 * the document's own currency and `amountLocal` in shekels (a live expense:
 * $25 with amountLocal 73.38 at rate 2.935). Reading `amount` counted that as
 * ₪25 and understated the month by two thirds. ILS rows are left untouched, so
 * a missing or zeroed `amountLocal` can never damage a shekel figure.
 */
function inShekels(
  o: Record<string, unknown>,
  amount: number
): { amount: number; currency: string } {
  const currency = String(pick(o, ["currency"]) ?? "ILS");
  if (currency === "ILS") return { amount, currency };
  const local = asNumber(pick(o, ["amountLocal", "amountLocalCurrency"]));
  return local !== null ? { amount: local, currency: "ILS" } : { amount, currency };
}

/**
 * Morning dates arrive as `YYYY-MM-DD`, as an ISO timestamp, or as a unix
 * epoch (seconds). Normalise to a calendar date so month bucketing is stable.
 */
export function toDateOnly(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Seconds vs milliseconds: anything below ~1e11 is seconds.
    const ms = v < 1e11 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Green Invoice document status: 0 open · 1 closed/paid · 2 partial, plus the
 *  two halves of a void. Confirmed against the live books: document #80005
 *  (status 3, −150, "ביטול קבלה 80004") is the cancelling document, and #80004
 *  (status 4, +150) is the one it cancelled. Both halves are treated as void, so
 *  a reversal nets to zero however many of them a query returns — dropping only
 *  one half (the old behaviour) left the voided +150 counted as income. */
const STATUS_PAID = 1;
const VOID_STATUSES: readonly number[] = [3, 4];

/**
 * Raw Morning document → our shape, or null if it lacks the fields that make it
 * meaningful (id, amount, date). Never throws: one malformed row must not blank
 * the money screen.
 */
export function normalizeDocument(raw: unknown): MorningDoc | null {
  const o = rec(raw);
  if (!o) return null;

  const id = pick(o, ["id", "documentId", "uuid"]);
  const amount = asNumber(pick(o, ["amount", "total", "sum"]));
  const date = toDateOnly(pick(o, ["documentDate", "date", "creationDate"]));
  if (id === undefined || amount === null || !date) return null;

  const type = asNumber(pick(o, ["type", "documentType"])) ?? 0;
  const client = rec(o.client);
  const status = asNumber(pick(o, ["status", "documentStatus"]));
  const money = inShekels(o, amount);

  // "Nothing left to collect" is the most reliable paid signal when present;
  // fall back to the status enum, then to types that settle on issue.
  const open = asNumber(pick(o, ["amountOpened", "amountDue", "openAmount"]));
  const paid =
    open !== null
      ? open === 0
      : status === STATUS_PAID ||
        o.paid === true ||
        SELF_SETTLING.includes(type);

  return {
    id: String(id),
    number: String(pick(o, ["number", "documentNumber"]) ?? ""),
    type,
    clientId: client ? String(pick(client, ["id", "clientId"]) ?? "") || null : null,
    clientName: client ? String(pick(client, ["name"]) ?? "") || null : null,
    amount: money.amount,
    currency: money.currency,
    date,
    dueDate: toDateOnly(pick(o, ["dueDate", "paymentDueDate"])),
    paid,
    cancelled: (status !== null && VOID_STATUSES.includes(status)) || o.cancelled === true,
  };
}

export function normalizeExpense(raw: unknown): MorningExpense | null {
  const o = rec(raw);
  if (!o) return null;
  const id = pick(o, ["id", "expenseId", "uuid"]);
  const amount = asNumber(pick(o, ["amount", "total", "sum"]));
  const date = toDateOnly(pick(o, ["date", "documentDate", "paymentDate"]));
  if (id === undefined || amount === null || !date) return null;
  const supplier = rec(o.supplier);
  const money = inShekels(o, amount);
  return {
    id: String(id),
    supplierName: supplier
      ? String(pick(supplier, ["name"]) ?? "") || null
      : String(pick(o, ["supplierName", "name"]) ?? "") || null,
    amount: money.amount,
    currency: money.currency,
    date,
    // Morning keeps deleted expenses in the response with active=false. Absent
    // means active — only an explicit false takes a row out of the totals.
    active: o.active !== false,
  };
}

/** Normalize a batch, reporting how many rows were unusable rather than hiding it. */
export function normalizeAll<T>(
  rows: unknown[],
  fn: (raw: unknown) => T | null
): { items: T[]; skipped: number } {
  const items: T[] = [];
  let skipped = 0;
  for (const r of rows) {
    const v = fn(r);
    if (v) items.push(v);
    else skipped += 1;
  }
  return { items, skipped };
}

// ── Month rollups ─────────────────────────────────────────────────────────────

export interface MonthSummary {
  /** `YYYY-MM`. */
  month: string;
  income: number;
  expense: number;
  profit: number;
}

export function monthOf(dateOnly: string): string {
  return dateOnly.slice(0, 7);
}

/** The last `count` months ending at `endMonth` (`YYYY-MM`), oldest first. */
export function recentMonths(endMonth: string, count: number): string[] {
  const [y, m] = endMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Income minus expenses per month. Cancelled documents and non-income types
 *  are excluded; credit invoices reduce income because their amount is negative. */
export function summarizeByMonth(
  docs: MorningDoc[],
  expenses: MorningExpense[],
  months: string[]
): MonthSummary[] {
  const income = new Map<string, number>();
  const expense = new Map<string, number>();

  for (const d of incomeDocs(docs)) {
    const k = monthOf(d.date);
    income.set(k, (income.get(k) ?? 0) + d.amount);
  }
  for (const e of expenses) {
    if (!e.active) continue;
    const k = monthOf(e.date);
    expense.set(k, (expense.get(k) ?? 0) + e.amount);
  }

  return months.map((month) => {
    const i = round2(income.get(month) ?? 0);
    const x = round2(expense.get(month) ?? 0);
    return { month, income: i, expense: x, profit: round2(i - x) };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Per-client payment state ──────────────────────────────────────────────────

export type PaymentState =
  | "paid" // nothing open, and this month's retainer is in
  | "awaiting" // nothing open, but no payment recorded yet this month
  | "due" // open, nothing past its due date
  | "overdue" // at least one document past due
  | "no-contract" // no agreement recorded yet
  | "unlinked" // agreement exists but was never linked to a Morning client
  | "unknown"; // Morning not connected — we genuinely cannot say

export interface ContractLike {
  morningClientId: string | null;
  monthlyFee: number | null;
  billingStatus: string;
}

export interface PaymentStatus {
  state: PaymentState;
  openAmount: number;
  overdueAmount: number;
  /** Due date of the oldest unpaid document, `YYYY-MM-DD`. */
  oldestDueDate: string | null;
  /** Whole days the oldest unpaid document is past due; 0 when nothing is late. */
  daysOverdue: number;
  openCount: number;
  /** Date of the most recent money actually received, `YYYY-MM-DD`. */
  lastPaidOn: string | null;
  lastPaidAmount: number;
}

const EMPTY: Omit<PaymentStatus, "state"> = {
  openAmount: 0,
  overdueAmount: 0,
  oldestDueDate: null,
  daysOverdue: 0,
  openCount: 0,
  lastPaidOn: null,
  lastPaidAmount: 0,
};

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Where one client stands with me. `docs` must already be filtered to that
 * client's Morning id. `today` is `YYYY-MM-DD` so the caller controls the clock
 * (Israel time at the route, a fixture in tests).
 */
export function clientPaymentStatus(args: {
  contract: ContractLike | null;
  docs: MorningDoc[];
  today: string;
  morningConfigured: boolean;
}): PaymentStatus {
  const { contract, docs, today, morningConfigured } = args;

  if (!contract) return { state: "no-contract", ...EMPTY };
  if (!morningConfigured) return { state: "unknown", ...EMPTY };
  if (!contract.morningClientId) return { state: "unlinked", ...EMPTY };

  // Money actually received, newest first — the only evidence that a retainer
  // was honoured this month.
  const received = incomeDocs(docs)
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const last = received[0] ?? null;
  const paidHistory = {
    lastPaidOn: last?.date ?? null,
    lastPaidAmount: last ? round2(last.amount) : 0,
  };

  const open = openReceivables(docs);
  if (open.length === 0) {
    // A receipt-only business never carries an open invoice, so "nothing open"
    // would read as "paid" forever — including for a client who has not paid me
    // in months. For anyone on a monthly retainer the question is narrower: is
    // this month's money in?
    const onRetainer = contract.billingStatus === "active" && (contract.monthlyFee ?? 0) > 0;
    const paidThisMonth = received.some((d) => monthOf(d.date) === monthOf(today));
    return {
      state: onRetainer && !paidThisMonth ? "awaiting" : "paid",
      ...EMPTY,
      ...paidHistory,
    };
  }

  const late = open.filter((d) => d.dueDate !== null && d.dueDate < today);
  const oldestDueDate = late.reduce<string | null>(
    (acc, d) => (acc === null || (d.dueDate as string) < acc ? (d.dueDate as string) : acc),
    null
  );

  return {
    state: late.length > 0 ? "overdue" : "due",
    openAmount: round2(open.reduce((s, d) => s + d.amount, 0)),
    overdueAmount: round2(late.reduce((s, d) => s + d.amount, 0)),
    oldestDueDate,
    daysOverdue: oldestDueDate ? Math.max(0, daysBetween(oldestDueDate, today)) : 0,
    openCount: open.length,
    ...paidHistory,
  };
}

// ── Contract-derived recurring revenue ────────────────────────────────────────
// MRR comes from the agreements, not from invoices: it is what clients are
// committed to pay, which is the number that tells me whether the agency is
// growing. Invoice totals answer a different question (what actually came in)
// and are reported separately from Morning.

export function monthlyRecurring(contracts: ContractLike[]): number {
  return round2(
    contracts
      .filter((c) => c.billingStatus === "active")
      .reduce((s, c) => s + (c.monthlyFee ?? 0), 0)
  );
}
