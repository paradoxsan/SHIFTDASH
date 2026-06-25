"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import type { SheetLead } from "@/lib/types";
import { TEMPLATES, fillTemplate } from "@/lib/templates";
import { Icon } from "@/components/icons";

export function LeadDrawer({
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
  const [sender, setSender] = useState("דניאל");

  const phone = lead.values["טלפון"] || "";
  const HIDDEN = ["מזהה ליד", "תאריך כניסה", "עודכן לאחרונה", "אוטומציה אחרונה", "תזכורת"];
  const editable = headers.filter((h) => h && !HIDDEN.includes(h));

  const tpl = TEMPLATES.find((t) => t.id === tplId) || TEMPLATES[0];
  const filled = fillTemplate(tpl.text, lead.values, sender);

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
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-[var(--color-muted)]">שליחת הודעה (Green API)</div>
            <div className="flex gap-1">
              {["דניאל", "נועם"].map((s) => (
                <button
                  key={s}
                  onClick={() => setSender(s)}
                  className="chip"
                  style={
                    sender === s
                      ? { borderColor: "var(--color-brand)", color: "var(--color-brand)" }
                      : { opacity: 0.55 }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
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
