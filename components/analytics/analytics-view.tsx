"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import { PageHeader, Spinner, ErrorBanner, EmptyState, Stat } from "@/components/ui";
import { useClientCtx } from "@/components/client-context";

interface Analytics {
  heatmap: number[][];
  heatmapMax: number;
  revenue: { date: string; total: number }[];
  totals: { messages: number; orders: number; revenue: number };
  hasInbox: boolean;
  hasOrders: boolean;
}
interface Digest {
  kpis: { botId: string; name: string; messages: number; orders: number; revenue: number }[];
  brief: string | null;
  cached: boolean;
}

const DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function Heatmap({ grid, max }: { grid: number[][]; max: number }) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `auto repeat(24, 10px)` }}>
        {grid.map((row, d) => (
          <div key={d} className="contents">
            <div className="text-[9px] text-[var(--color-muted)] pl-1 leading-[10px] self-center">{DAYS[d]}</div>
            {row.map((n, h) => (
              <div
                key={h}
                title={`${DAYS[d]} ${h}:00 · ${n}`}
                className="w-[10px] h-[10px] rounded-[2px]"
                style={{ background: n === 0 ? "var(--color-surface-2)" : `color-mix(in srgb, var(--color-brand) ${Math.round((n / Math.max(max, 1)) * 100)}%, var(--color-surface-2))` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const { activeClient } = useClientCtx();
  const clientId = activeClient?.id;
  const [question, setQuestion] = useState("");

  const digestQ = useQuery({ queryKey: ["digest"], queryFn: () => fetchJson<Digest>("/api/digest") });
  const aQ = useQuery({
    queryKey: ["analytics", clientId],
    queryFn: () => fetchJson<Analytics>(`/api/clients/${clientId}/analytics`),
    enabled: Boolean(clientId),
  });
  const ask = useMutation({
    mutationFn: () => postJson<{ sql: string; rows: Record<string, unknown>[] }>("/api/ai/query", { client: clientId, question }),
  });

  const a = aQ.data;
  const maxRev = Math.max(1, ...(a?.revenue ?? []).map((r) => r.total));

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader title="אנליטיקה" subtitle="ביצועים פר-בוט · סיכום AI חוצה-בוטים" />

      {/* Cross-bot digest */}
      <div className="card p-4 mb-5">
        <div className="text-sm font-bold mb-2">סיכום יומי (כל הבוטים)</div>
        {digestQ.isLoading ? (
          <Spinner />
        ) : digestQ.error ? (
          <ErrorBanner message={(digestQ.error as Error).message} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(digestQ.data?.kpis ?? []).map((k) => (
                <div key={k.botId} className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2">
                  <div className="text-[11px] text-[var(--color-muted)] truncate">{k.name}</div>
                  <div className="text-sm font-bold">{k.messages.toLocaleString()} הודעות</div>
                  <div className="text-[11px] text-[var(--color-muted)]">{k.orders} הזמנות · {k.revenue.toLocaleString()}₪</div>
                </div>
              ))}
            </div>
            {digestQ.data?.brief ? (
              <div className="text-[13px] whitespace-pre-wrap text-[var(--color-fg)]">{digestQ.data.brief}</div>
            ) : (
              <div className="text-[11px] text-[var(--color-muted)]">סיכום AI לא זמין (הגדר ANTHROPIC_API_KEY).</div>
            )}
          </>
        )}
      </div>

      {/* Per-bot analytics */}
      {!activeClient ? (
        <EmptyState text="בחר לקוח לניתוח פר-בוט" />
      ) : aQ.isLoading ? (
        <Spinner />
      ) : aQ.error ? (
        <ErrorBanner message={(aQ.error as Error).message} />
      ) : a ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="הודעות (30י)" value={a.totals.messages.toLocaleString()} />
            <Stat label="הזמנות" value={a.totals.orders} tone="brand" />
            <Stat label="הכנסה" value={`${a.totals.revenue.toLocaleString()}₪`} tone="ok" />
          </div>

          {a.hasInbox && (
            <div className="card p-3">
              <div className="text-[11px] text-[var(--color-muted)] mb-2">פעילות לפי יום ושעה (30 ימים)</div>
              <Heatmap grid={a.heatmap} max={a.heatmapMax} />
            </div>
          )}

          {a.hasOrders && a.revenue.length > 0 && (
            <div className="card p-3">
              <div className="text-[11px] text-[var(--color-muted)] mb-2">הכנסה יומית</div>
              <div className="flex items-end gap-0.5 h-24">
                {a.revenue.map((r) => (
                  <div key={r.date} title={`${r.date}: ${r.total}₪`} className="flex-1 rounded-t bg-[var(--color-ok)]" style={{ height: `${(r.total / maxRev) * 100}%`, minHeight: 2 }} />
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {a.hasOrders && (
              <a href={`/api/clients/${clientId}/export?table=orders`} className="chip">ייצוא הזמנות CSV</a>
            )}
            {a.hasInbox && (
              <a href={`/api/clients/${clientId}/export?table=inbox`} className="chip">ייצוא inbox CSV</a>
            )}
          </div>

          {/* NL query */}
          <div className="card p-3">
            <div className="text-[11px] text-[var(--color-muted)] mb-2">שאל את הדאטה (שפה טבעית → SELECT מאובטח)</div>
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="כמה הזמנות פתוחות יש?"
                className="flex-1 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none"
              />
              <button onClick={() => ask.mutate()} disabled={!question.trim() || ask.isPending} className="chip" style={{ borderColor: "var(--color-brand)", color: "var(--color-brand)" }}>
                שאל
              </button>
            </div>
            {ask.error && <div className="text-[11px] mt-2" style={{ color: "var(--color-err)" }}>{(ask.error as Error).message}</div>}
            {ask.data && (
              <div className="mt-3">
                <pre className="text-[10px] bg-[var(--color-surface-2)] rounded-lg p-2 overflow-auto">{ask.data.sql}</pre>
                <div className="text-[11px] text-[var(--color-muted)] mt-1">{ask.data.rows.length} שורות</div>
                {ask.data.rows[0] && (
                  <pre className="text-[10px] overflow-auto max-h-48 mt-1">{JSON.stringify(ask.data.rows.slice(0, 20), null, 1)}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
