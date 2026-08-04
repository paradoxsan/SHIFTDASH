"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import { Spinner } from "@/components/ui";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { ExecutionDetail } from "@/lib/types";

export function ErrorDrilldown({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["execution-detail", id],
    queryFn: () => fetchJson<{ detail: ExecutionDetail }>(`/api/n8n/executions/${id}`),
  });
  const d = q.data?.detail;

  return (
    <div
      className="fixed inset-0 z-30 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-6"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg)] w-full md:max-w-xl md:rounded-2xl rounded-t-2xl border border-[var(--color-border)] max-h-[85dvh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--color-bg)] flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="font-bold">פירוט שגיאה · ריצה {id}</h2>
          <button onClick={onClose} className="chip">
            סגור
          </button>
        </div>

        <div className="p-4">
          {q.isLoading ? (
            <Spinner />
          ) : q.error ? (
            <div className="text-sm text-[var(--color-err)]">{(q.error as Error).message}</div>
          ) : !d ? (
            <div className="text-sm text-[var(--color-muted)]">אין נתונים</div>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <div className="text-[11px] text-[var(--color-muted)]">אוטומציה</div>
                <div className="font-semibold">{d.workflowName ?? d.workflowId ?? "—"}</div>
                <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  {formatDateTime(d.startedAt)} · {formatDuration(d.durationMs)}
                </div>
              </div>

              {d.failureRate24h && d.failureRate24h.total > 0 && (
                <div
                  className="card p-2.5 text-[12px]"
                  style={{ borderColor: "color-mix(in srgb, var(--color-warn) 40%, var(--color-border))" }}
                >
                  ב-24 ש׳ אחרונות: {d.failureRate24h.errors} שגיאות מתוך {d.failureRate24h.total} ריצות
                </div>
              )}

              <div>
                <div className="text-[11px] text-[var(--color-muted)]">צומת שנכשל</div>
                <div className="font-semibold" style={{ color: "var(--color-err)" }}>
                  {d.failedNode ?? d.lastNodeExecuted ?? "לא ידוע"}
                </div>
              </div>

              {(d.errorMessage || d.errorDescription) && (
                <div>
                  <div className="text-[11px] text-[var(--color-muted)]">שגיאה</div>
                  <div className="font-mono text-[12px] whitespace-pre-wrap break-words text-[var(--color-err)]">
                    {d.errorMessage}
                    {d.errorDescription ? `\n${d.errorDescription}` : ""}
                  </div>
                </div>
              )}

              {d.inputSample != null && (
                <div>
                  <div className="text-[11px] text-[var(--color-muted)] mb-1">הקלט שעובד</div>
                  <pre className="bg-[var(--color-surface-2)] rounded-xl p-3 text-[11px] overflow-auto max-h-60 whitespace-pre-wrap break-words">
                    {JSON.stringify(d.inputSample, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
