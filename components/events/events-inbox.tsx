"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import { Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";

interface Ev {
  id: number;
  type: string;
  severity: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const SEV_COLOR: Record<string, string> = {
  info: "var(--color-idle)",
  low: "var(--color-idle)",
  medium: "var(--color-warn)",
  high: "var(--color-err)",
  critical: "var(--color-err)",
};
const TYPE_HE: Record<string, string> = {
  BOT_DOWN: "בוט מושבת",
  QUEUE_STUCK: "תור תקוע",
  FAILED_SPIKE: "קפיצת כשלים",
  N8N_ERROR_SPIKE: "שגיאות n8n",
  RLS_REGRESSION: "רגרסיית RLS",
};

export function EventsInbox() {
  const qc = useQueryClient();
  const key = ["events"];
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchJson<{ events: Ev[] }>("/api/events"),
    refetchInterval: 8_000,
  });
  const act = useMutation({
    mutationFn: (v: { id: number; action: "ack" | "resolve" }) => postJson("/api/events", v),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBanner message={(q.error as Error).message} />;
  const events = (q.data?.events ?? []).filter((e) => e.status !== "resolved");
  if (events.length === 0) return <EmptyState text="אין התראות פתוחות 🎉" />;

  return (
    <div className="flex flex-col gap-1.5">
      {events.map((e) => (
        <div key={e.id} className="card p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="dot shrink-0" style={{ background: SEV_COLOR[e.severity] ?? "var(--color-idle)" }} />
              <span className="font-semibold text-sm">{TYPE_HE[e.type] ?? e.type}</span>
              {e.status === "ack" && <span className="chip text-[10px]">טופל</span>}
            </div>
            <div className="text-[11px] text-[var(--color-muted)] mt-0.5 truncate">
              {timeAgo(e.created_at)}
              {e.payload ? ` · ${JSON.stringify(e.payload)}` : ""}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {e.status !== "ack" && (
              <button onClick={() => act.mutate({ id: e.id, action: "ack" })} className="chip opacity-80">
                אשר טיפול
              </button>
            )}
            <button
              onClick={() => act.mutate({ id: e.id, action: "resolve" })}
              className="chip"
              style={{ borderColor: "var(--color-ok)", color: "var(--color-ok)" }}
            >
              סגור
            </button>
          </div>
        </div>
      ))}
      {act.error && <ErrorBanner message={(act.error as Error).message} />}
    </div>
  );
}
