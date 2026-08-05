"use client";

// הכנסות מול הוצאות, רווח לפי חודש, ומה עוד לא שולם לי.
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import { formatCurrency, formatDelta } from "@/lib/format";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, EmptyState, ErrorBanner, PageHeader, SkeletonCard, Stat } from "@/components/ui";
import { useCopilot } from "@/components/copilot/copilot-context";

interface MonthRow {
  month: string;
  income: number;
  expense: number;
  profit: number;
}
interface OpenInvoice {
  id: string;
  number: string;
  clientName: string | null;
  amount: number;
  currency: string;
  date: string;
  dueDate: string | null;
  overdue: boolean;
}
interface MoneyData {
  morningConnected: boolean;
  morningError: string | null;
  partial: boolean;
  months: MonthRow[];
  totals: { income: number; expense: number; profit: number };
  contracted: { mrr: number; setupBooked: number; activeClients: number; currency: string };
  openInvoices: OpenInvoice[];
  openTotal: number;
  overdueTotal: number;
}

const MONTH_NAMES = [
  "ינו", "פבר", "מרץ", "אפר", "מאי", "יונ",
  "יול", "אוג", "ספט", "אוק", "נוב", "דצמ",
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? month} ${String(y).slice(2)}`;
}

/** Income vs expense per month as paired bars, scaled to the biggest bar shown. */
function MonthBars({ months }: { months: MonthRow[] }) {
  const peak = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  return (
    <div className="flex items-end justify-between gap-2 h-36 px-1">
      {months.map((m) => (
        <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div className="flex items-end gap-0.5 h-24 w-full justify-center" title={`${formatCurrency(m.income)} הכנסות · ${formatCurrency(m.expense)} הוצאות`}>
            <div
              className="w-3 rounded-t transition-all"
              style={{
                height: `${Math.max(2, (m.income / peak) * 100)}%`,
                background: "var(--color-ok)",
              }}
            />
            <div
              className="w-3 rounded-t transition-all"
              style={{
                height: `${Math.max(2, (m.expense / peak) * 100)}%`,
                background: "var(--color-err)",
              }}
            />
          </div>
          <span className="text-[10px] text-[var(--color-muted)] truncate">
            {monthLabel(m.month)}
          </span>
          <span
            className="text-[10px] font-bold tnum truncate"
            style={{ color: m.profit >= 0 ? "var(--color-ok)" : "var(--color-err)" }}
          >
            {m.profit === 0 ? "—" : formatDelta(m.profit)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MoneyView() {
  const { askAbout } = useCopilot();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["money"],
    queryFn: () => fetchJson<MoneyData>("/api/money"),
    refetchInterval: 300_000,
  });

  const cur = data?.contracted.currency ?? "ILS";

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader
        title="כסף"
        subtitle={
          data
            ? `${formatCurrency(data.contracted.mrr, cur)} לחודש מ-${data.contracted.activeClients} לקוחות פעילים`
            : "טוען…"
        }
        live={isFetching}
      />

      {error && <ErrorBanner message={error instanceof Error ? error.message : String(error)} />}

      {data && !data.morningConnected && (
        <Card tone="warn" className="p-3.5 mb-4">
          <div className="flex items-start gap-2.5">
            <span style={{ color: "var(--color-warn)" }} className="mt-0.5 shrink-0">
              <Icon name="alert" size={16} />
            </span>
            <div className="text-xs text-[var(--color-muted)]">
              <b className="text-[var(--color-text)]">Morning לא מחובר.</b> המספרים החוזיים למטה
              אמיתיים; ההכנסות, ההוצאות והחשבוניות יתמלאו ברגע ש-<code>MORNING_API_KEY_ID</code> ו-
              <code>MORNING_API_SECRET</code> ייכנסו ל-env. Morning מנפיק זוג id+secret — ה-id לבדו
              לא מספיק לאימות.
            </div>
          </div>
        </Card>
      )}
      {data?.morningError && (
        <Card tone="warn" className="p-3 mb-4 text-xs text-[var(--color-muted)]">
          Morning החזיר שגיאה: {data.morningError}
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !data ? null : (
        <div className="space-y-4">
          {/* What clients committed to — true with or without Morning. */}
          <Card>
            <CardHeader title="לפי החוזים" subtitle="מה שהלקוחות התחייבו לשלם" icon={<Icon name="doc" size={16} />} />
            <div className="px-4 pb-4 grid grid-cols-3 gap-2">
              <Stat label="תחזוקה חודשית" value={formatCurrency(data.contracted.mrr, cur)} tone="brand" />
              <Stat label="הקמות בתקופה" value={formatCurrency(data.contracted.setupBooked, cur)} />
              <Stat label="לקוחות פעילים" value={data.contracted.activeClients} />
            </div>
          </Card>

          {/* What actually happened, per the books. */}
          <Card>
            <CardHeader
              title="בפועל — 6 חודשים"
              subtitle="הכנסות (ירוק) מול הוצאות (אדום), ורווח לכל חודש"
              icon={<Icon name="analytics" size={16} />}
              right={data.partial ? <Badge tone="warn">חלקי</Badge> : undefined}
            />
            <div className="px-4 pb-4">
              <MonthBars months={data.months} />
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Stat label="הכנסות" value={formatCurrency(data.totals.income, cur)} tone="ok" />
                <Stat label="הוצאות" value={formatCurrency(data.totals.expense, cur)} tone="err" />
                <Stat
                  label="רווח"
                  value={formatDelta(data.totals.profit, cur)}
                  tone={data.totals.profit >= 0 ? "ok" : "err"}
                />
              </div>
            </div>
          </Card>

          {/* Money owed to me. */}
          <Card tone={data.overdueTotal > 0 ? "err" : undefined}>
            <CardHeader
              title="חשבוניות פתוחות"
              subtitle={
                data.overdueTotal > 0
                  ? `${formatCurrency(data.overdueTotal, cur)} בפיגור מתוך ${formatCurrency(data.openTotal, cur)}`
                  : `${formatCurrency(data.openTotal, cur)} פתוח`
              }
              icon={<Icon name="clock" size={16} />}
            />
            <div className="px-4 pb-4">
              {data.openInvoices.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">
                  {data.morningConnected ? "אין חשבוניות פתוחות. הכול נגבה." : "—"}
                </p>
              ) : (
                <div className="space-y-2">
                  {data.openInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-2)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {inv.clientName ?? `חשבונית ${inv.number}`}
                        </div>
                        <div className="text-[11px] text-[var(--color-muted)]">
                          #{inv.number} · {inv.dueDate ? `לתשלום עד ${inv.dueDate}` : inv.date}
                        </div>
                      </div>
                      <div className="shrink-0 text-left">
                        <div
                          className="text-sm font-bold tnum"
                          style={{ color: inv.overdue ? "var(--color-err)" : undefined }}
                        >
                          {formatCurrency(inv.amount, inv.currency)}
                        </div>
                        {inv.overdue && (
                          <div className="text-[10px] font-semibold" style={{ color: "var(--color-err)" }}>
                            בפיגור
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {data.openInvoices.length === 0 && !data.morningConnected && (
            <EmptyState text="ברגע ש-Morning יחובר, כל התמונה הפיננסית תופיע כאן." icon="money" />
          )}

          <button
            onClick={() =>
              askAbout(
                "תעבור על מצב הכסף של הסוכנות — הכנסות מול הוצאות בחודשים האחרונים, מה חריג, ומי חייב לי כסף."
              )
            }
            className="btn btn-ai w-full"
          >
            <Icon name="ai" size={15} />
            ניתוח של Claude
          </button>
        </div>
      )}
    </div>
  );
}
