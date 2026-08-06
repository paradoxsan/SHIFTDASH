"use client";

// One client, the three questions that matter: is the bot working, has he paid
// me, and what did we agree.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import { formatCurrency, formatDate, timeAgo } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
  Card,
  CardHeader,
  ErrorBanner,
  PageHeader,
  SkeletonCard,
  Stat,
  StatusDot,
} from "@/components/ui";
import { useCopilot } from "@/components/copilot/copilot-context";
import { ContractForm } from "./contract-form";
import {
  BILLING_STATUS_LABEL,
  healthView,
  paymentView,
  type AlertLike,
  type ClientCardView,
} from "./shared";

function AlertItem({ a }: { a: AlertLike }) {
  const { askAbout } = useCopilot();
  return (
    <Card tone={a.tone} className="p-3">
      <div className="flex items-start gap-2.5">
        <span style={{ color: `var(--color-${a.tone})` }} className="mt-0.5 shrink-0">
          <Icon name="alert" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm">{a.title}</div>
          <p className="text-xs text-[var(--color-muted)] mt-1 break-words">{a.detail}</p>
          <button onClick={() => askAbout(a.askPrompt)} className="btn btn-sm mt-2">
            <Icon name="ai" size={12} />
            שאל את Claude
          </button>
        </div>
        <span className="text-[10px] text-[var(--color-faint)] shrink-0">{timeAgo(a.createdAt)}</span>
      </div>
    </Card>
  );
}

function PaymentSection({ c }: { c: ClientCardView }) {
  const { askAbout } = useCopilot();
  const pv = paymentView(c.payment.state);
  const currency = c.contract?.currency ?? "ILS";
  const p = c.payment;

  return (
    <Card tone={p.state === "overdue" ? "err" : undefined}>
      <CardHeader
        title="תשלום מולי"
        icon={<Icon name="money" size={16} />}
        right={<Badge tone={pv.tone} solid>{pv.label}</Badge>}
      />
      <div className="px-4 pb-4">
        {p.state === "unlinked" ? (
          <p className="text-xs text-[var(--color-muted)]">
            הלקוח לא מקושר ללקוח ב-Morning, אז אי אפשר לדעת אם שילם. בוחרים אותו בשדה
            &quot;לקוח ב-Morning&quot; למטה.
          </p>
        ) : p.state === "no-contract" ? (
          <p className="text-xs text-[var(--color-muted)]">
            אין הסכם מוזן ללקוח הזה — ממלאים אותו למטה כדי לעקוב אחרי גבייה.
          </p>
        ) : p.state === "unknown" ? (
          <p className="text-xs text-[var(--color-muted)]">
            Morning לא מחובר — מצב התשלום לא זמין.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label="פתוח"
                value={formatCurrency(p.openAmount, currency)}
                tone={p.openAmount > 0 ? "warn" : undefined}
                hint={p.openCount > 0 ? `${p.openCount} חשבוניות` : undefined}
              />
              <Stat
                label="בפיגור"
                value={formatCurrency(p.overdueAmount, currency)}
                tone={p.overdueAmount > 0 ? "err" : undefined}
                hint={p.daysOverdue > 0 ? `${p.daysOverdue} ימים` : undefined}
              />
              <Stat
                label="חודשי"
                value={formatCurrency(c.contract?.monthlyFee ?? null, currency)}
              />
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-3">
              {p.lastPaidOn
                ? `התקבל לאחרונה ${formatCurrency(p.lastPaidAmount, currency)} ב-${formatDate(p.lastPaidOn)}`
                : "לא נרשם תשלום מהלקוח הזה ב-Morning"}
              {p.state === "awaiting" && " · טרם שולם החודש"}
            </p>
            {(p.state === "overdue" || p.state === "awaiting") && (
              <button
                onClick={() =>
                  askAbout(
                    p.state === "overdue"
                      ? `${c.name} בפיגור תשלום של ${formatCurrency(p.overdueAmount, currency)} כבר ${p.daysOverdue} ימים. נסח לי הודעת תזכורת מנומסת ללקוח.`
                      : `${c.name} עדיין לא שילם את דמי התחזוקה החודשיים (${formatCurrency(c.contract?.monthlyFee ?? null, currency)}). ` +
                        `התשלום האחרון שנרשם: ${p.lastPaidOn ? formatDate(p.lastPaidOn) : "אין"}. נסח לי הודעת תזכורת מנומסת.`
                  )
                }
                className="btn btn-ai btn-sm mt-3"
              >
                <Icon name="ai" size={12} />
                נסח תזכורת תשלום
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const { askAbout } = useCopilot();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["client-card", clientId],
    queryFn: () => fetchJson<ClientCardView>(`/api/clients/${clientId}/card`),
    refetchInterval: 120_000,
  });

  const hv = data ? healthView(data.health) : null;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link href="/clients" className="btn btn-sm btn-ghost mb-3">
        <Icon name="back" size={14} />
        כל הלקוחות
      </Link>

      <PageHeader
        title={data?.name ?? clientId}
        subtitle={
          data?.contract?.billingStatus && data.contract.billingStatus !== "active"
            ? BILLING_STATUS_LABEL[data.contract.billingStatus]
            : data?.contract?.contactName ?? undefined
        }
        live={isFetching}
      />

      {error && <ErrorBanner message={error instanceof Error ? error.message : String(error)} />}

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !data ? null : (
        <div className="space-y-4">
          {/* Health — my SLA to this client */}
          <Card tone={data.health === "down" ? "err" : undefined}>
            <CardHeader
              title="בריאות הבוט"
              subtitle={
                data.healthCheckedAt ? `נבדק ${timeAgo(data.healthCheckedAt)}` : "עוד לא נבדק"
              }
              icon={<Icon name="bot" size={16} />}
              right={
                hv && (
                  <span className="flex items-center gap-1.5">
                    <StatusDot tone={hv.tone} pulse={data.health === "healthy"} />
                    <span
                      className="text-xs font-bold"
                      style={{ color: `var(--color-${hv.tone})` }}
                    >
                      {hv.label}
                    </span>
                  </span>
                )
              }
            />
            <div className="px-4 pb-4">
              {data.alerts.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">אין התראות פתוחות.</p>
              ) : (
                <div className="space-y-2">
                  {data.alerts.map((a) => (
                    <AlertItem key={a.id} a={a} />
                  ))}
                </div>
              )}
              <button
                onClick={() =>
                  askAbout(`תן לי סקירה על הבוט של ${data.name} — מה מצבו ומה קרה לאחרונה.`)
                }
                className="btn btn-sm mt-3"
              >
                <Icon name="ai" size={12} />
                שאל את Claude על הלקוח הזה
              </button>
            </div>
          </Card>

          <PaymentSection c={data} />

          <ContractForm clientId={clientId} contract={data.contract} />
        </div>
      )}
    </div>
  );
}
