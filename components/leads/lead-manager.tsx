"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import type { SheetLead } from "@/lib/types";
import { PageHeader, Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { TEMPLATES, fillTemplate } from "@/lib/templates";
import { Icon } from "@/components/icons";

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

export function LeadManager() {
  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["leads"],
    queryFn: () => fetchJson<{ headers: string[]; leads: SheetLead[] }>("/api/leads"),
    refetchInterval: 20_000,
  });

  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [openLead, setOpenLead] = useState<SheetLead | null>(null);

  const leads = data?.leads ?? [];

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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="ניהול לידים"
        subtitle={`Shift Digital · ${leads.length} לידים`}
        live={isFetching}
      />
      {error && <ErrorBanner message={(error as Error).message} />}

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

      {isLoading ? (
        <Spinner label="טוען לידים מה-Sheet…" />
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

function LeadDrawer({
  lead,
  headers,
  onClose,
  onSaved,
}: {
  lead: SheetLead;
  headers: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({ ...lead.values });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tplId, setTplId] = useState(TEMPLATES[0].id);

  const phone = lead.values["טלפון"] || "";
  const HIDDEN = ["מזהה ליד", "תאריך כניסה", "עודכן לאחרונה", "אוטומציה אחרונה", "תזכורת"];
  const editable = headers.filter((h) => h && !HIDDEN.includes(h));

  const tpl = TEMPLATES.find((t) => t.id === tplId) || TEMPLATES[0];
  const filled = fillTemplate(tpl.text, lead.values);

  const pause = useMutation({
    mutationFn: (v: { paused: boolean; minutes?: number }) => postJson("/api/leads/pause", { phone, ...v }),
    onSuccess: (_d, v) => setToast(v.paused ? "הבוט הושתק לליד הזה ✓" : "הבוט הוחזר ✓"),
    onError: (e) => setErr((e as Error).message),
  });
  const send = useMutation({
    mutationFn: (message: string) => postJson("/api/leads/send", { phone, message }),
    onSuccess: () => setToast("נשלח ✓ (הבוט הושתק אוטומטית)"),
    onError: (e) => setErr((e as Error).message),
  });

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const updates: Record<string, string> = {};
      for (const h of [...editable, "תזכורת"]) {
        if ((draft[h] ?? "") !== (lead.values[h] ?? "")) updates[h] = draft[h] ?? "";
      }
      if (Object.keys(updates).length) {
        await fetchJson("/api/leads", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rowIndex: lead.rowIndex, updates }),
        });
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  const fieldCls =
    "w-full mt-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-brand)]";

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex justify-end" onClick={onClose}>
      <div
        className="bg-[var(--color-surface)] w-full md:max-w-md h-full overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-extrabold truncate">{lead.values["שם"] || phone}</h2>
          <button onClick={onClose} className="text-[var(--color-muted)] text-sm shrink-0">
            סגור ✕
          </button>
        </div>
        <div className="text-[11px] text-[var(--color-muted)] mb-4" dir="ltr">
          {phone} · {lead.id}
        </div>

        <div className="card p-3 mb-3">
          <div className="text-xs font-bold text-[var(--color-muted)] mb-2">שליטת בוט</div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => pause.mutate({ paused: true, minutes: 120 })}
              disabled={pause.isPending}
              className="btn text-xs"
              style={{ color: "var(--color-warn)" }}
            >
              השתק 2ש׳
            </button>
            <button
              onClick={() => pause.mutate({ paused: true, minutes: 720 })}
              disabled={pause.isPending}
              className="btn text-xs"
            >
              היום
            </button>
            <button
              onClick={() => pause.mutate({ paused: false })}
              disabled={pause.isPending}
              className="btn text-xs"
              style={{ color: "var(--color-ok)" }}
            >
              החזר בוט
            </button>
          </div>
        </div>

        <div className="card p-3 mb-3">
          <div className="text-xs font-bold text-[var(--color-muted)] mb-2">שליחת הודעה (Green API)</div>
          <select
            value={tplId}
            onChange={(e) => setTplId(e.target.value)}
            className="w-full rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-1.5 text-sm mb-2"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <textarea
            value={filled}
            readOnly
            rows={4}
            className="w-full rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-1.5 text-sm mb-2"
            dir="rtl"
          />
          <button
            onClick={() => send.mutate(filled)}
            disabled={send.isPending || !phone}
            className="btn btn-brand w-full text-sm"
          >
            <Icon name="send" size={16} /> שלח (משתיק בוט אוטומטית)
          </button>
        </div>

        <div className="card p-3 mb-3">
          <div className="text-xs font-bold text-[var(--color-muted)] mb-2">תזכורת פולואפ (פנימית)</div>
          <input
            type="date"
            value={draft["תזכורת"] || ""}
            onChange={(e) => setDraft((d) => ({ ...d, "תזכורת": e.target.value }))}
            className="w-full rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-1.5 text-sm"
          />
        </div>

        <div className="text-xs font-bold text-[var(--color-muted)] mb-2">פרטי הליד</div>
        <div className="flex flex-col gap-2.5 mb-4">
          {editable.map((h) => (
            <label key={h} className="block">
              <span className="text-[11px] font-semibold text-[var(--color-muted)]">{h}</span>
              <input
                value={draft[h] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [h]: e.target.value }))}
                className={fieldCls}
              />
            </label>
          ))}
        </div>

        {err && <p className="text-[var(--color-err)] text-sm mb-2">{err}</p>}
        {toast && <p className="text-[var(--color-ok)] text-sm mb-2">{toast}</p>}

        <div className="flex gap-2 sticky bottom-0 bg-[var(--color-surface)] py-2">
          <button onClick={save} disabled={saving} className="btn btn-brand flex-1">
            {saving ? "שומר…" : "שמור שינויים"}
          </button>
          <button onClick={onClose} className="btn">
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
