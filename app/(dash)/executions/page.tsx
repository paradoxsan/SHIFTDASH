"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import type { N8nExecution, ExecStatus } from "@/lib/types";
import { PageHeader, Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { useClientCtx } from "@/components/client-context";
import { timeAgo, formatDuration } from "@/lib/format";

const STATUS_META: Record<ExecStatus, { label: string; color: string }> = {
  success: { label: "הצליח", color: "var(--color-ok)" },
  error: { label: "שגיאה", color: "var(--color-err)" },
  running: { label: "רץ", color: "var(--color-brand)" },
  waiting: { label: "ממתין", color: "var(--color-warn)" },
  unknown: { label: "—", color: "var(--color-idle)" },
};

type Filter = "all" | "success" | "error";

export default function ExecutionsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { activeClient } = useClientCtx();
  const clientId = activeClient?.id;
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["executions", filter, clientId],
    queryFn: () =>
      fetchJson<{ executions: N8nExecution[] }>(
        `/api/n8n/executions?limit=60${filter !== "all" ? `&status=${filter}` : ""}${
          clientId ? `&client=${clientId}` : ""
        }`
      ),
    refetchInterval: 5_000,
  });

  const execs = data?.executions ?? [];
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "הכל" },
    { key: "success", label: "הצליחו" },
    { key: "error", label: "שגיאות" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader
        title="ריצות"
        subtitle={`${activeClient?.name ?? "כל הבוטים"} · executions בזמן אמת`}
        live={isFetching}
      />

      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="chip"
            style={
              filter === f.key
                ? { borderColor: "var(--color-brand)", color: "var(--color-brand)" }
                : { opacity: 0.6 }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={(error as Error).message} />}

      {isLoading ? (
        <Spinner />
      ) : execs.length === 0 ? (
        <EmptyState text="אין ריצות להצגה" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {execs.map((e) => {
            const s = STATUS_META[e.status] ?? STATUS_META.unknown;
            return (
              <div key={e.id} className="card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="dot shrink-0" style={{ background: s.color }} />
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-sm">
                      {e.workflowName ?? `workflow ${e.workflowId ?? "?"}`}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {timeAgo(e.startedAt)} · {formatDuration(e.durationMs)}
                      {e.mode ? ` · ${e.mode}` : ""}
                    </div>
                  </div>
                </div>
                <span className="chip shrink-0" style={{ color: s.color }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
