// The כסף screen: what came in, what went out, what's still owed to me.
//
// Two different numbers live here and they are deliberately NOT merged:
//   • contracted MRR — the sum of active monthly fees. What clients committed to.
//   • booked income — what Morning says was actually invoiced. What happened.
// A gap between them is the interesting signal (a client I forgot to bill), so
// collapsing them into one "revenue" figure would hide the thing worth seeing.
//
// Morning being unconfigured is a normal state, not an error: the contract-side
// numbers still render and the accounting side says so.
import { ok, fail } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { listContractsBySlug } from "@/lib/contracts";
import { listDocuments, listExpenses, morningConfigured } from "@/lib/morning";
import {
  openReceivables,
  monthlyRecurring,
  monthOf,
  recentMonths,
  summarizeByMonth,
  type MonthSummary,
  type MorningDoc,
} from "@/lib/billing";
import { todayInIsrael } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTHS_SHOWN = 6;

export interface OpenInvoice {
  id: string;
  number: string;
  clientName: string | null;
  amount: number;
  currency: string;
  date: string;
  dueDate: string | null;
  overdue: boolean;
}

export async function GET(req: Request) {
  try {
    const actor = await getCurrentUser(req);
    // Revenue and expenses are the agency's own books — owner-only.
    requireRole(actor?.role, "owner");

    const today = todayInIsrael();
    const months = recentMonths(monthOf(today), MONTHS_SHOWN);
    const fromDate = `${months[0]}-01`;

    const contracts = Object.values(await listContractsBySlug().catch(() => ({}))).filter(
      (c): c is NonNullable<typeof c> => c !== null
    );
    const mrr = monthlyRecurring(contracts);
    const setupBooked = contracts
      .filter((c) => c.startedOn != null && c.startedOn >= fromDate)
      .reduce((s, c) => s + (c.setupFee ?? 0), 0);

    const connected = morningConfigured();
    let byMonth: MonthSummary[] = months.map((month) => ({
      month,
      income: 0,
      expense: 0,
      profit: 0,
    }));
    let openInvoices: OpenInvoice[] = [];
    let morningError: string | null = null;
    let partial = false;

    if (connected) {
      try {
        const [docsRes, expRes] = await Promise.all([
          listDocuments(fromDate, today),
          // Expenses are a separate endpoint and a separate failure: no expense
          // data should not cost us the income chart.
          listExpenses(fromDate, today).catch(() => ({
            expenses: [],
            skipped: 0,
            truncated: false,
          })),
        ]);
        byMonth = summarizeByMonth(docsRes.docs, expRes.expenses, months);
        openInvoices = toOpenInvoices(docsRes.docs, today);
        partial = docsRes.truncated || expRes.truncated || docsRes.skipped > 0;
      } catch (e) {
        morningError = e instanceof Error ? e.message : String(e);
      }
    }

    const totals = byMonth.reduce(
      (acc, m) => ({
        income: acc.income + m.income,
        expense: acc.expense + m.expense,
        profit: acc.profit + m.profit,
      }),
      { income: 0, expense: 0, profit: 0 }
    );

    return ok({
      generatedAt: new Date().toISOString(),
      morningConnected: connected,
      morningError,
      /** True when a page cap or an unparseable row means the figures are incomplete. */
      partial,
      months: byMonth,
      totals,
      contracted: {
        mrr,
        setupBooked,
        activeClients: contracts.filter((c) => c.billingStatus === "active").length,
        currency: contracts[0]?.currency ?? "ILS",
      },
      openInvoices,
      openTotal: openInvoices.reduce((s, i) => s + i.amount, 0),
      overdueTotal: openInvoices.filter((i) => i.overdue).reduce((s, i) => s + i.amount, 0),
    });
  } catch (e) {
    return fail(e);
  }
}

/** What is still owed to me, oldest debt first. */
function toOpenInvoices(docs: MorningDoc[], today: string): OpenInvoice[] {
  return openReceivables(docs)
    .map((d) => ({
      id: d.id,
      number: d.number,
      clientName: d.clientName,
      amount: d.amount,
      currency: d.currency,
      date: d.date,
      dueDate: d.dueDate,
      overdue: d.dueDate !== null && d.dueDate < today,
    }))
    // Oldest debt first — that's the one to chase.
    .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date));
}
