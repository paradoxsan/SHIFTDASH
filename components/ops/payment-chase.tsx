"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import { Spinner, ErrorBanner, EmptyState, Stat } from "@/components/ui";
import type { ChaseOrder } from "@/lib/types";

interface ChaseResp {
  supported: boolean;
  items: ChaseOrder[];
}

const REASON_HE: Record<string, string> = {
  "no payment link": "אין לינק תשלום",
  "chat under human takeover": "שיחה בהשתלטות אנושית",
  "order is not open": "הזמנה לא פתוחה",
};

export function PaymentChase({ botRef }: { botRef: string }) {
  const qc = useQueryClient();
  const key = ["chase", botRef];
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchJson<ChaseResp>(`/api/orders/${botRef}/chase?limit=200`),
    refetchInterval: 15_000,
  });

  const chase = useMutation({
    mutationFn: (orderId: ChaseOrder["id"]) => postJson(`/api/orders/${botRef}/chase`, { orderId }),
    onSuccess: (_d, orderId) => setSentIds((s) => new Set(s).add(String(orderId))),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBanner message={(q.error as Error).message} />;
  if (q.data && !q.data.supported)
    return <EmptyState text="לבוט הזה אין טבלת הזמנות (orders)" />;

  const items = q.data?.items ?? [];
  if (items.length === 0) return <EmptyState text="אין הזמנות פתוחות לגבייה" />;

  const chaseable = items.filter((o) => o.chaseable).length;
  const openTotal = items.reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="פתוחות" value={items.length} />
        <Stat label="ניתן לגבות" value={chaseable} tone="brand" />
        <Stat label="סה״כ פתוח" value={`${openTotal.toLocaleString()}₪`} tone="warn" />
      </div>

      <div className="flex flex-col gap-1.5">
        {items.map((o) => {
          const sent = sentIds.has(String(o.id));
          return (
            <div key={String(o.id)} className="card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">
                  {o.invoiceName ?? o.chatId?.split("@")[0] ?? `#${o.id}`}
                </div>
                <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  #{String(o.id)}
                  {o.total != null ? ` · ${o.total.toLocaleString()}₪` : ""}
                  {o.humanActive ? " · 🙋 אנושי" : ""}
                </div>
              </div>

              {o.chaseable ? (
                <button
                  onClick={() => chase.mutate(o.id)}
                  disabled={chase.isPending || sent}
                  className="chip shrink-0"
                  style={{
                    borderColor: sent ? "var(--color-ok)" : "var(--color-brand)",
                    color: sent ? "var(--color-ok)" : "var(--color-brand)",
                  }}
                >
                  {sent ? "נשלח ✓" : "שלח תזכורת תשלום"}
                </button>
              ) : (
                <span className="text-[10px] text-[var(--color-muted)] shrink-0 max-w-28 text-left">
                  {REASON_HE[o.reason ?? ""] ?? o.reason ?? "—"}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {chase.error && <ErrorBanner message={(chase.error as Error).message} />}
    </div>
  );
}
