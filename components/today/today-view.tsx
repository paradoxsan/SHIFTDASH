"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import { Icon } from "@/components/icons";
import { Badge, Card, EmptyState, ErrorBanner, PageHeader, SkeletonCard, StatusDot } from "@/components/ui";
import { useCopilot } from "@/components/copilot/copilot-context";
import type { AlertView } from "@/lib/alerts";

interface TodayLead {
  rowIndex: number;
  name: string;
  phone: string;
  status: string;
  bucket: string;
  label: string;
}
interface TodayBot {
  id: string;
  name: string;
  status: string;
  checkedAt: string | null;
}
interface TodayData {
  generatedAt: string;
  alerts: AlertView[];
  bots: TodayBot[];
  leads: TodayLead[];
  leadsError: string | null;
  counts: {
    critical: number;
    high: number;
    other: number;
    leadsDue: number;
    botsDown: number;
  };
}

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  healthy: { label: "תקין", tone: "ok" },
  degraded: { label: "לא תקין", tone: "warn" },
  down: { label: "נפל", tone: "err" },
  unknown: { label: "לא ידוע", tone: "muted" },
};

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  if (hour < 12) return "בוקר טוב";
  if (hour < 18) return "צהריים טובים";
  return "ערב טוב";
}

function AlertRow({ alert }: { alert: AlertView }) {
  const { askAbout } = useCopilot();
  return (
    <Card tone={alert.tone} className="p-3.5">
      <div className="flex items-start gap-3">
        <span style={{ color: `var(--color-${alert.tone})` }} className="mt-0.5 shrink-0">
          <Icon name="alert" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm">{alert.title}</div>
          <p className="text-xs text-[var(--color-muted)] mt-1 break-words">{alert.detail}</p>
          <div className="flex items-center gap-2 mt-2.5">
            <button onClick={() => askAbout(alert.askPrompt)} className="btn btn-sm">
              <Icon name="ai" size={13} />
              שאל את Claude
            </button>
            {alert.clientId && (
              <Link href={`/clients/${alert.clientId}`} className="btn btn-sm btn-ghost">
                לכרטיס הלקוח
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function TodayView() {
  const { askAbout } = useCopilot();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["today"],
    queryFn: () => fetchJson<TodayData>("/api/today"),
    refetchInterval: 60_000,
  });

  const counts = data?.counts;
  const allClear = data && data.alerts.length === 0 && data.counts.botsDown === 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <PageHeader
        title={`${greeting()}, דניאל`}
        subtitle={
          counts
            ? counts.critical + counts.high > 0
              ? `${counts.critical + counts.high} דברים דורשים טיפול`
              : "הכל רגוע"
            : "בודק את המערכות…"
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
        <div className="space-y-6">
          {/* Bot health strip — the SLA at a glance */}
          <section>
            <h2 className="text-xs font-bold text-[var(--color-muted)] mb-2">הבוטים</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.bots.length === 0 ? (
                <p className="text-xs text-[var(--color-faint)]">אין בוטים רשומים בטבלת הבקרה.</p>
              ) : (
                data.bots.map((b) => {
                  const meta = STATUS_META[b.status] ?? STATUS_META.unknown;
                  return (
                    <Link
                      key={b.id}
                      href={`/clients/${b.id}`}
                      className="card card-interactive p-3 flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-sm truncate">{b.name}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <StatusDot tone={meta.tone} pulse={b.status === "healthy"} />
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: `var(--color-${meta.tone === "muted" ? "muted" : meta.tone})` }}
                        >
                          {meta.label}
                        </span>
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          {/* Alerts */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-[var(--color-muted)]">דורש טיפול</h2>
              {data.alerts.length > 0 && (
                <Badge tone="err" solid>
                  {data.alerts.length}
                </Badge>
              )}
            </div>
            {data.alerts.length === 0 ? (
              <Card className="p-6">
                <div className="text-center">
                  <span style={{ color: "var(--color-ok)" }} className="inline-flex mb-2">
                    <Icon name="check" size={22} />
                  </span>
                  <p className="text-sm text-[var(--color-muted)]">
                    {allClear ? "אין התראות פתוחות. כל הבוטים עונים." : "אין התראות פתוחות."}
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.alerts.map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
              </div>
            )}
          </section>

          {/* My pipeline */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-[var(--color-muted)]">לידים לטיפול היום</h2>
              <Link href="/leads" className="text-xs text-[var(--color-brand)] font-semibold">
                לכל הלידים
              </Link>
            </div>
            {data.leadsError ? (
              <Card tone="warn" className="p-3 text-xs text-[var(--color-muted)]">
                לא ניתן לקרוא את שיט הלידים: {data.leadsError}
              </Card>
            ) : data.leads.length === 0 ? (
              <EmptyState text="אין תזכורות להיום." />
            ) : (
              <div className="space-y-2">
                {data.leads.map((l) => (
                  <Card key={l.rowIndex} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{l.name || l.phone}</div>
                      <div className="text-[11px] text-[var(--color-muted)]">
                        {l.status} · {l.label}
                      </div>
                    </div>
                    <Badge tone={l.bucket === "overdue" ? "err" : "warn"} solid>
                      {l.bucket === "overdue" ? "באיחור" : "היום"}
                    </Badge>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <button
            onClick={() => askAbout("תן לי סיכום קצר של מצב העסק עכשיו — מה דורש תשומת לב ומה יכול לחכות.")}
            className="btn btn-ai w-full"
          >
            <Icon name="ai" size={15} />
            סיכום של Claude
          </button>
        </div>
      )}
    </div>
  );
}
