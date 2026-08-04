"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import { Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import type { QueueItem } from "@/lib/types";

interface QueueResp {
  supported: boolean;
  items: QueueItem[];
}

export function QueueMonitor({ botRef }: { botRef: string }) {
  const qc = useQueryClient();
  const key = ["queue", botRef];

  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchJson<QueueResp>(`/api/bots/${botRef}/queue?limit=100`),
    refetchInterval: 8_000,
  });

  const requeue = useMutation({
    mutationFn: (id: QueueItem["id"]) => postJson(`/api/bots/${botRef}/requeue`, { id }),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBanner message={(q.error as Error).message} />;
  if (q.data && !q.data.supported)
    return <EmptyState text="לבוט הזה אין תור הודעות (inbox) לניהול" />;

  const items = q.data?.items ?? [];
  if (items.length === 0) return <EmptyState text="התור נקי — אין הודעות תקועות 🎉" />;

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it) => (
        <div key={String(it.id)} className="card p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="chip shrink-0"
                style={{
                  color:
                    it.status === "failed" || it.status === "error"
                      ? "var(--color-err)"
                      : "var(--color-warn)",
                }}
              >
                {it.status}
              </span>
              <span className="text-[11px] text-[var(--color-muted)]">
                #{String(it.id)} · {it.attempts} ניסיונות · {timeAgo(it.createdAt)}
              </span>
            </div>
            {it.error && (
              <div className="text-[11px] mt-1 text-[var(--color-err)] truncate" title={it.error}>
                {it.error}
              </div>
            )}
            {it.chatId && (
              <div className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">
                {it.chatId}
              </div>
            )}
          </div>

          {it.requeuable ? (
            <button
              onClick={() => requeue.mutate(it.id)}
              disabled={requeue.isPending}
              className="chip shrink-0"
              style={{ borderColor: "var(--color-brand)", color: "var(--color-brand)" }}
            >
              שלח שוב לעיבוד
            </button>
          ) : (
            <span
              className="text-[10px] text-[var(--color-muted)] shrink-0 max-w-28 text-left"
              title={it.reason}
            >
              {it.reason ?? "—"}
            </span>
          )}
        </div>
      ))}
      {requeue.error && <ErrorBanner message={(requeue.error as Error).message} />}
    </div>
  );
}
