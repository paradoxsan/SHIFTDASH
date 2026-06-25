"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import type { N8nWorkflowDetail, N8nExecution } from "@/lib/types";
import { Spinner, ErrorBanner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { timeAgo, formatDuration } from "@/lib/format";

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () =>
      fetchJson<{ workflow: N8nWorkflowDetail; executions: N8nExecution[] }>(
        `/api/n8n/workflows/${id}`
      ),
    refetchInterval: 8_000,
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => postJson(`/api/n8n/workflows/${id}/toggle`, { active }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["workflow", id] }),
  });

  const wf = data?.workflow;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link
        href="/workflows"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] mb-3"
      >
        <Icon name="back" size={16} /> חזרה לאוטומציות
      </Link>

      {error && <ErrorBanner message={(error as Error).message} />}

      {isLoading || !wf ? (
        <Spinner />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold truncate">{wf.name}</h1>
              <div className="text-[11px] text-[var(--color-muted)] mt-1">
                {wf.nodes.length} שלבים · {wf.active ? "פעיל" : "כבוי"}
                {wf.tags.length > 0 && ` · ${wf.tags.join(", ")}`}
              </div>
            </div>
            <button
              onClick={() => toggle.mutate(!wf.active)}
              disabled={toggle.isPending}
              aria-label={wf.active ? "כבה" : "הדלק"}
              className="relative w-12 h-7 rounded-full transition disabled:opacity-50 shrink-0"
              style={{ background: wf.active ? "var(--color-ok)" : "var(--color-border)" }}
            >
              <span
                className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow"
                style={{ insetInlineStart: wf.active ? "1.75rem" : "0.25rem" }}
              />
            </button>
          </div>

          <h2 className="text-sm font-bold text-[var(--color-muted)] mb-2">שלבים (nodes)</h2>
          <div className="flex flex-col gap-1.5 mb-6">
            {wf.nodes.map((n, i) => (
              <div
                key={i}
                className="card p-3 flex items-center gap-3"
                style={n.disabled ? { opacity: 0.45 } : undefined}
              >
                <span className="w-6 h-6 rounded-md bg-[var(--color-surface-2)] grid place-items-center text-[11px] font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{n.name}</div>
                  <div className="text-[11px] text-[var(--color-muted)] truncate" dir="ltr">
                    {n.type}
                    {n.disabled ? " · מושבת" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h2 className="text-sm font-bold text-[var(--color-muted)] mb-2">ריצות אחרונות</h2>
          <div className="flex flex-col gap-1.5">
            {(data?.executions ?? []).length === 0 ? (
              <div className="text-sm text-[var(--color-muted)]">אין ריצות אחרונות</div>
            ) : (
              data!.executions.map((e) => (
                <div
                  key={e.id}
                  className="card p-2.5 flex items-center justify-between text-sm"
                >
                  <span className="text-[var(--color-muted)]">
                    {timeAgo(e.startedAt)} · {formatDuration(e.durationMs)}
                  </span>
                  <span
                    className="chip"
                    style={{
                      color:
                        e.status === "success"
                          ? "var(--color-ok)"
                          : e.status === "error"
                            ? "var(--color-err)"
                            : "var(--color-muted)",
                    }}
                  >
                    {e.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
