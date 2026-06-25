"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import type { SheetLead } from "@/lib/types";
import { PageHeader, Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { LeadDrawer } from "@/components/leads/lead-drawer";
import { RemindersView } from "@/components/leads/reminders-view";
import { bucketOf, parseReminder, todayInIsrael } from "@/lib/reminders";

const STATUS_ORDER = [
  "ליד חדש",
  "בשיחה עם הבוט",
  "צריך להתקשר",
  "הצעה נשלחה",
  "פגישה נקבעה",
  "בטיפול",
  "נסגר ✅",
  "לא רלוונטי",
];
function statusColor(s: string): string {
  if (/נסגר|✅|won/i.test(s)) return "var(--color-ok)";
  if (/לא רלוונטי|אבוד|lost/i.test(s)) return "var(--color-err)";
  if (/פגישה|הצעה/.test(s)) return "var(--color-warn)";
  return "var(--color-brand)";
}

type View = "pipeline" | "reminders";

export function LeadManager() {
  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["leads"],
    queryFn: () => fetchJson<{ headers: string[]; leads: SheetLead[] }>("/api/leads"),
    refetchInterval: 20_000,
  });

  const [view, setView] = useState<View>("pipeline");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [openLead, setOpenLead] = useState<SheetLead | null>(null);

  const leads = data?.leads ?? [];

  // Count of reminders needing attention now (overdue or due today) — drives the
  // badge on the reminders tab so it's actionable at a glance.
  const dueNow = useMemo(() => {
    const today = todayInIsrael();
    return leads.reduce((n, l) => {
      const r = parseReminder(l.values["תזכורת"]);
      if (!r) return n;
      const b = bucketOf(r, today);
      return b === "overdue" || b === "today" ? n + 1 : n;
    }, 0);
  }, [leads]);

  const statuses = useMemo(() => {
    const set = new Set(leads.map((l) => l.values["סטטוס"] || "—"));
    return [
      ...STATUS_ORDER.filter((s) => set.has(s)),
      ...[...set].filter((s) => !STATUS_ORDER.includes(s)),
    ];
  }, [leads]);
  const priorities = useMemo(
    () => [...new Set(leads.map((l) => l.values["עדיפות"]).filter(Boolean))],
    [leads]
  );

  const filtered = leads.filter((l) => {
    if (statusFilter && (l.values["סטטוס"] || "—") !== statusFilter) return false;
    if (priorityFilter && l.values["עדיפות"] !== priorityFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const d = search.replace(/\D/g, "");
      const name = (l.values["שם"] || "").toLowerCase();
      const phone = (l.values["טלפון"] || "").replace(/\D/g, "");
      if (!(name.includes(q) || (d.length >= 3 && phone.includes(d)))) return false;
    }
    return true;
  });

  const grouped = useMemo(() => {
    const g: Record<string, SheetLead[]> = {};
    for (const l of filtered) {
      const s = l.values["סטטוס"] || "—";
      (g[s] ??= []).push(l);
    }
    return g;
  }, [filtered]);
  const order = statuses.filter((s) => grouped[s]?.length);

  const inputCls =
    "rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]";

  const tab = (v: View, label: string, badge?: number) => (
    <button
      onClick={() => setView(v)}
      className="chip"
      style={
        view === v
          ? { borderColor: "var(--color-brand)", color: "var(--color-brand)" }
          : { opacity: 0.55 }
      }
    >
      {label}
      {badge ? ` · ${badge}` : ""}
    </button>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="ניהול לידים"
        subtitle={`Shift Digital · ${leads.length} לידים`}
        live={isFetching}
      />
      {error && <ErrorBanner message={(error as Error).message} />}

      <div className="flex gap-1.5 mb-4">
        {tab("pipeline", "צינור לידים")}
        {tab("reminders", "תזכורות", dueNow)}
      </div>

      {view === "pipeline" && (
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש שם / טלפון…"
            className={`${inputCls} flex-1 min-w-[150px]`}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
            <option value="">כל הסטטוסים</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">כל העדיפויות</option>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {isLoading ? (
        <Spinner label="טוען לידים מה-Sheet…" />
      ) : view === "reminders" ? (
        <RemindersView leads={leads} onOpen={setOpenLead} />
      ) : filtered.length === 0 ? (
        <EmptyState text="אין לידים תואמים" />
      ) : (
        <div className="flex flex-col gap-5">
          {order.map((status) => (
            <section key={status}>
              <div className="flex items-center gap-2 mb-2">
                <span className="dot" style={{ background: statusColor(status) }} />
                <h2 className="font-bold">{status}</h2>
                <span className="text-xs text-[var(--color-muted)]">{grouped[status].length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {grouped[status].map((l) => (
                  <button
                    key={l.rowIndex}
                    onClick={() => setOpenLead(l)}
                    className="card p-3 text-start flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate">
                        {l.values["שם"] || l.values["טלפון"] || "—"}
                      </div>
                      {l.values["עדיפות"] && (
                        <span className="chip shrink-0">{l.values["עדיפות"]}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)] truncate">
                      {l.values["טלפון"]}
                      {l.values["תחום העסק"] ? ` · ${l.values["תחום העסק"]}` : ""}
                      {l.values["מועד פגישה"] ? ` · 📅 ${l.values["מועד פגישה"]}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {openLead && data && (
        <LeadDrawer
          lead={openLead}
          headers={data.headers}
          onClose={() => setOpenLead(null)}
          onSaved={() => {
            setOpenLead(null);
            qc.invalidateQueries({ queryKey: ["leads"] });
          }}
        />
      )}
    </div>
  );
}
