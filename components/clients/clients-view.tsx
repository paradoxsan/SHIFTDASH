"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  SkeletonCard,
  StatusDot,
} from "@/components/ui";
import {
  BILLING_STATUS_LABEL,
  healthView,
  paymentView,
  urgencyRank,
  type ClientCardView,
} from "./shared";

interface ClientsData {
  clients: ClientCardView[];
  morningConnected: boolean;
  morningError: string | null;
  generatedAt: string;
}

function PaymentLine({ c }: { c: ClientCardView }) {
  const pv = paymentView(c.payment.state);
  const currency = c.contract?.currency ?? "ILS";

  if (c.payment.state === "overdue") {
    return (
      <span style={{ color: "var(--color-err)" }} className="font-semibold">
        {formatCurrency(c.payment.overdueAmount, currency)} בפיגור · {c.payment.daysOverdue} ימים
      </span>
    );
  }
  if (c.payment.state === "due") {
    return (
      <span style={{ color: "var(--color-warn)" }}>
        {formatCurrency(c.payment.openAmount, currency)} פתוח
        {c.payment.openCount > 1 ? ` · ${c.payment.openCount} חשבוניות` : ""}
      </span>
    );
  }
  if (c.payment.state === "awaiting") {
    return (
      <span style={{ color: "var(--color-warn)" }}>
        טרם שולם החודש
        {c.payment.lastPaidOn ? ` · אחרון ${formatDate(c.payment.lastPaidOn)}` : ""}
      </span>
    );
  }
  if (c.payment.state === "paid" && c.payment.lastPaidOn) {
    return (
      <span style={{ color: "var(--color-ok)" }}>
        שולם {formatDate(c.payment.lastPaidOn)}
      </span>
    );
  }
  return <span className="text-[var(--color-muted)]">{pv.label}</span>;
}

function ClientRow({ c }: { c: ClientCardView }) {
  const hv = healthView(c.health);
  const monthly = c.contract?.monthlyFee ?? null;

  return (
    <Card
      tone={c.health === "down" || c.payment.state === "overdue" ? "err" : undefined}
      className="p-0 overflow-hidden"
    >
      <Link href={`/clients/${c.id}`} className="block p-4 card-interactive">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {c.accent && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: c.accent }}
                  aria-hidden
                />
              )}
              <span className="font-bold truncate">{c.name}</span>
              {c.contract && c.contract.billingStatus !== "active" && (
                <Badge tone="muted">{BILLING_STATUS_LABEL[c.contract.billingStatus]}</Badge>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
              <span className="flex items-center gap-1.5">
                <StatusDot tone={hv.tone} pulse={c.health === "healthy"} />
                <span style={{ color: `var(--color-${hv.tone})` }} className="font-semibold">
                  {hv.label}
                </span>
              </span>
              {c.openAlertCount > 0 && (
                <span style={{ color: "var(--color-err)" }} className="font-semibold">
                  {c.openAlertCount} התראות
                </span>
              )}
              <span className="text-[var(--color-faint)]">·</span>
              <PaymentLine c={c} />
            </div>
          </div>

          <div className="shrink-0 text-left">
            {monthly !== null ? (
              <>
                <div className="text-sm font-bold tnum">
                  {formatCurrency(monthly, c.contract?.currency ?? "ILS")}
                </div>
                <div className="text-[10px] text-[var(--color-faint)]">לחודש</div>
              </>
            ) : (
              <Badge tone="muted">אין הסכם</Badge>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}

export function ClientsView() {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["clients-overview"],
    queryFn: () => fetchJson<ClientsData>("/api/clients/overview"),
    refetchInterval: 120_000,
  });

  const clients = data ? [...data.clients].sort((a, b) => urgencyRank(a) - urgencyRank(b)) : [];
  const needsAttention = clients.filter((c) => urgencyRank(c) <= 2).length;
  const mrr = clients.reduce(
    (s, c) => s + (c.contract?.billingStatus === "active" ? c.contract.monthlyFee ?? 0 : 0),
    0
  );

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="לקוחות"
        subtitle={
          data
            ? needsAttention > 0
              ? `${needsAttention} לקוחות דורשים טיפול · ${formatCurrency(mrr)} לחודש`
              : `${clients.length} לקוחות · ${formatCurrency(mrr)} לחודש`
            : "טוען…"
        }
        live={isFetching}
      />

      {error && <ErrorBanner message={error instanceof Error ? error.message : String(error)} />}

      {data && !data.morningConnected && (
        <Card tone="warn" className="p-3 mb-4 text-xs text-[var(--color-muted)]">
          Morning לא מחובר — מצב התשלומים לא זמין. צריך את ה-API key id <b>וגם</b> את ה-secret
          (MORNING_API_KEY_ID / MORNING_API_SECRET).
        </Card>
      )}
      {data?.morningError && (
        <Card tone="warn" className="p-3 mb-4 text-xs text-[var(--color-muted)]">
          Morning לא זמין כרגע: {data.morningError}
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : clients.length === 0 ? (
        <EmptyState text="אין לקוחות רשומים בטבלת הבקרה." icon="clients" />
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <ClientRow key={c.id} c={c} />
          ))}
        </div>
      )}

      <Link href="/money" className="btn w-full mt-4">
        <Icon name="money" size={15} />
        למסך הכסף
      </Link>
    </div>
  );
}
