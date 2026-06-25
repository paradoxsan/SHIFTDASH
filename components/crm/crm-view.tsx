"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import type { CrmPayload } from "@/lib/types";
import { useClientCtx } from "@/components/client-context";
import { LeadManager } from "@/components/leads/lead-manager";
import { PageHeader, Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { formatCurrency, formatDateTime, prettyChatId, timeAgo } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  new: "חדש",
  contacted: "יצירת קשר",
  appointment_set: "פגישה נקבעה",
  showed_up: "הגיע",
  won: "נסגר ✅",
  lost: "אבוד",
  open: "פתוח",
  paid: "שולם ✅",
  cancelled: "בוטל",
  superseded: "הוחלף",
};
const STATUS_COLORS: Record<string, string> = {
  new: "var(--color-brand)",
  contacted: "var(--color-brand)",
  appointment_set: "var(--color-warn)",
  showed_up: "var(--color-warn)",
  won: "var(--color-ok)",
  lost: "var(--color-err)",
  open: "var(--color-brand)",
  paid: "var(--color-ok)",
  cancelled: "var(--color-err)",
  superseded: "var(--color-idle)",
};

type Rec = Record<string, unknown>;

export function CrmView() {
  const { activeClient } = useClientCtx();
  const qc = useQueryClient();
  const id = activeClient?.id;
  const ref = activeClient?.supabaseRef;

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["crm", id],
    queryFn: () => fetchJson<CrmPayload>(`/api/clients/${id}/crm`),
    enabled: !!id && activeClient?.workspace !== "mine",
    refetchInterval: 12_000,
  });

  const setStatus = useMutation({
    mutationFn: ({ pkVal, status }: { pkVal: unknown; status: string }) =>
      fetchJson(`/api/bots/${ref}/tables/${data!.table}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pk: { [data!.pk!]: pkVal }, set: { status } }),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["crm", id] }),
  });

  const grouped = useMemo(() => {
    const g: Record<string, Rec[]> = {};
    for (const r of data?.records ?? []) {
      const s = String(r.status ?? "—");
      (g[s] ??= []).push(r);
    }
    return g;
  }, [data]);

  if (!activeClient) return <Spinner />;
  // My-business workspace (Shift Digital) uses the full Sheet-backed LeadManager.
  if (activeClient.workspace === "mine") return <LeadManager />;

  const present = Object.keys(grouped);
  const statusOrder = data
    ? [...data.statuses.filter((s) => present.includes(s)), ...present.filter((s) => !data.statuses.includes(s))]
    : [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="CRM"
        subtitle={activeClient.name}
        live={isFetching}
        right={
          activeClient.sheetUrl ? (
            <a href={activeClient.sheetUrl} target="_blank" rel="noreferrer" className="btn text-xs">
              Sheet ↗
            </a>
          ) : undefined
        }
      />

      {error && <ErrorBanner message={(error as Error).message} />}

      {isLoading ? (
        <Spinner />
      ) : !data || data.kind === "none" ? (
        <EmptyState
          text={
            activeClient.sheetUrl
              ? "ה-CRM של הלקוח הזה חי ב-Google Sheet (אין מראה ב-Supabase). פתח אותו בכפתור למעלה."
              : "אין נתוני CRM ללקוח הזה."
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {statusOrder.map((status) => {
            const items = grouped[status] ?? [];
            const revenue = data.hasTotal
              ? items.reduce((a, r) => a + (Number(r.total) || 0), 0)
              : null;
            return (
              <section key={status}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="dot"
                    style={{ background: STATUS_COLORS[status] ?? "var(--color-idle)" }}
                  />
                  <h2 className="font-bold">{STATUS_LABELS[status] ?? status}</h2>
                  <span className="text-xs text-[var(--color-muted)]">
                    {items.length}
                    {revenue != null && items.length ? ` · ${formatCurrency(revenue)}` : ""}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((r, i) => (
                    <CrmCard
                      key={i}
                      kind={data.kind}
                      rec={r}
                      statuses={data.statuses}
                      onStatus={(s) => setStatus.mutate({ pkVal: r[data.pk!], status: s })}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CrmCard({
  kind,
  rec,
  statuses,
  onStatus,
}: {
  kind: "leads" | "orders" | "none";
  rec: Rec;
  statuses: string[];
  onStatus: (status: string) => void;
}) {
  const status = String(rec.status ?? "");
  const title =
    kind === "leads"
      ? String(rec.full_name || prettyChatId(rec.phone as string) || "—")
      : String(rec.invoice_name || prettyChatId(rec.chat_id as string) || `#${rec.id}`);

  return (
    <div className="card p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold truncate">{title}</div>
        {kind === "orders" && rec.total != null && (
          <span className="text-sm font-bold" style={{ color: "var(--color-ok)" }}>
            {formatCurrency(Number(rec.total))}
          </span>
        )}
      </div>

      {kind === "leads" && (
        <div className="text-[11px] text-[var(--color-muted)]">
          {rec.phone ? prettyChatId(rec.phone as string) : ""}
          {rec.business_type ? ` · ${rec.business_type}` : ""}
          {rec.lead_source ? ` · ${rec.lead_source}` : ""}
          {rec.appointment_at ? ` · פגישה ${formatDateTime(rec.appointment_at as string)}` : ""}
        </div>
      )}
      {kind === "orders" && (
        <div className="text-[11px] text-[var(--color-muted)] flex items-center gap-2">
          <span>{timeAgo(rec.created_at as string)}</span>
          {rec.payment_link ? (
            <button
              onClick={() => navigator.clipboard?.writeText(String(rec.payment_link))}
              className="text-[var(--color-brand)] font-semibold"
            >
              העתק קישור תשלום
            </button>
          ) : null}
        </div>
      )}

      <select
        value={status}
        onChange={(e) => onStatus(e.target.value)}
        className="mt-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-1 text-xs font-semibold outline-none focus:border-[var(--color-brand)]"
      >
        {statuses.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s] ?? s}
          </option>
        ))}
        {!statuses.includes(status) && <option value={status}>{status}</option>}
      </select>
    </div>
  );
}
