"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import { Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { timeAgo, formatDateTime } from "@/lib/format";
import type { WatchlistItem } from "@/lib/types";

interface WatchResp {
  supported: boolean;
  items: WatchlistItem[];
}

export function HumanWatchlist({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const key = ["watchlist", clientId];

  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchJson<WatchResp>(`/api/clients/${clientId}/watchlist`),
    refetchInterval: 8_000,
  });

  const resume = useMutation({
    mutationFn: (chatId: string) =>
      postJson(`/api/clients/${clientId}/human-mode`, { chatId, active: false }),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBanner message={(q.error as Error).message} />;
  if (q.data && !q.data.supported)
    return <EmptyState text="ללקוח הזה אין שליטת בוט פר-שיחה (human_mode)" />;

  const items = q.data?.items ?? [];
  if (items.length === 0) return <EmptyState text="אין שיחות בהשתלטות אנושית כרגע" />;

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it) => (
        <div key={it.chatId} className="card p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="chip shrink-0"
                style={{ color: it.expired ? "var(--color-warn)" : "var(--color-ok)" }}
              >
                {it.expired ? "השתקה פגה" : "בשליטה"}
              </span>
              <span className="text-sm truncate">{it.chatId.split("@")[0]}</span>
            </div>
            <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
              עודכן {timeAgo(it.updatedAt)}
              {it.silencedUntil ? ` · עד ${formatDateTime(it.silencedUntil)}` : " · ללא הגבלת זמן"}
            </div>
          </div>
          <button
            onClick={() => resume.mutate(it.chatId)}
            disabled={resume.isPending}
            className="chip shrink-0"
            style={{ borderColor: "var(--color-ok)", color: "var(--color-ok)" }}
          >
            החזר את הבוט
          </button>
        </div>
      ))}
      {resume.error && <ErrorBanner message={(resume.error as Error).message} />}
    </div>
  );
}
