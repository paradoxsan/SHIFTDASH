"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import type { N8nWorkflow } from "@/lib/types";
import { PageHeader, Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { useClientCtx } from "@/components/client-context";
import { timeAgo } from "@/lib/format";

function Toggle({
  active,
  pending,
  onClick,
}: {
  active: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      aria-pressed={active}
      aria-label={active ? "כבה" : "הדלק"}
      className="relative w-12 h-7 rounded-full transition disabled:opacity-50 shrink-0"
      style={{ background: active ? "var(--color-ok)" : "var(--color-border)" }}
    >
      <span
        className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow"
        style={{ insetInlineStart: active ? "1.75rem" : "0.25rem" }}
      />
    </button>
  );
}

export default function WorkflowsPage() {
  const qc = useQueryClient();
  const { activeClient } = useClientCtx();
  const clientId = activeClient?.id;
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["workflows", clientId],
    queryFn: () =>
      fetchJson<{ workflows: N8nWorkflow[] }>(
        `/api/n8n/workflows${clientId ? `?client=${clientId}` : ""}`
      ),
    refetchInterval: 15_000,
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [mutErr, setMutErr] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      postJson(`/api/n8n/workflows/${id}/toggle`, { active }),
    onMutate: ({ id }) => {
      setPendingId(id);
      setMutErr(null);
    },
    onError: (e) => setMutErr((e as Error).message),
    onSettled: () => {
      setPendingId(null);
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const workflows = (data?.workflows ?? []).filter((w) => !w.archived);
  const activeCount = workflows.filter((w) => w.active).length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader
        title="אוטומציות"
        subtitle={`${activeClient?.name ?? "כל הבוטים"} · ${
          workflows.length ? `${activeCount} פעילות מתוך ${workflows.length}` : "n8n"
        }`}
        live={isFetching}
      />

      {(error || mutErr) && <ErrorBanner message={(error as Error)?.message || mutErr!} />}

      {isLoading ? (
        <Spinner />
      ) : workflows.length === 0 ? (
        <EmptyState text="לא נמצאו workflows ב־n8n" />
      ) : (
        <div className="flex flex-col gap-2">
          {workflows.map((w) => (
            <div key={w.id} className="card p-3.5 flex items-center justify-between gap-3">
              <Link href={`/workflows/${w.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="dot shrink-0"
                    style={{ background: w.active ? "var(--color-ok)" : "var(--color-idle)" }}
                  />
                  <h3 className="font-semibold truncate">{w.name}</h3>
                </div>
                <div className="text-[11px] text-[var(--color-muted)] mt-1">
                  {w.active ? "פעיל" : "כבוי"} · עודכן {timeAgo(w.updatedAt)}
                  {w.tags.length > 0 && ` · ${w.tags.join(", ")}`}
                </div>
              </Link>
              <Toggle
                active={w.active}
                pending={pendingId === w.id}
                onClick={() => toggle.mutate({ id: w.id, active: !w.active })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
