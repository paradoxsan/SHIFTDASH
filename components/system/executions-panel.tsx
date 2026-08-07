"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import type { N8nExecution, ExecStatus } from "@/lib/types";
import { Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { useClientCtx } from "@/components/client-context";
import { ErrorDrilldown } from "@/components/executions/error-drilldown";
import { timeAgo, formatDuration } from "@/lib/format";

const STATUS_META: Record<ExecStatus, { label: string; color: string }> = {
  success: { label: "הצליח", color: "var(--color-ok)" },
  error: { label: "שגיאה", color: "var(--color-err)" },
  running: { label: "רץ", color: "var(--color-brand)" },
  waiting: { label: "ממתין", color: "var(--color-warn)" },
  unknown: { label: "—", color: "var(--color-idle)" },
};

type Filter = "all" | "success" | "error";

/** Live n8n execution feed with the failed-run drill-down.
 *  Header-less — the machine room owns the page header. */
export function ExecutionsPanel() {
  const [filter, setFilter] = useState<Filter>("all");
  const [drillId, setDrillId] = useState<string | null>(null);
  const { activeClient } = useClientCtx();
  const clientId = activeClient?.id;

  const { data, isLoading, error } = useQuery({
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
    <div>
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
            const drillable = e.status === "error" || e.status === "unknown";
            return (
              <div
                key={e.id}
                onClick={drillable ? () => setDrillId(e.id) : undefined}
                className={`card p-3 flex items-center justify-between gap-3 ${
                  drillable ? "cursor-pointer hover:border-[var(--color-err)]" : ""
                }`}
              >
                <div className="min-w-0 flex items-center gap-3">
                  <span className="dot shrink-0" style={{ background: s.color }} />
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-sm">
                      {e.workflowName ?? `workflow ${e.workflowId ?? "?"}`}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {timeAgo(e.startedAt)} · {formatDuration(e.durationMs)}
                      {e.mode ? ` · ${e.mode}` : ""}
                      {drillable ? " · הקש לפירוט" : ""}
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

      {drillId && <ErrorDrilldown id={drillId} onClose={() => setDrillId(null)} />}
    </div>
  );
}
