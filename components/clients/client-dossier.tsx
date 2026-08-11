"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useCopilot } from "@/components/copilot/copilot-context";

const KINDS = [
  { id: "architecture", label: "איך הבוט בנוי" },
  { id: "business_rule", label: "כללי העסק" },
  { id: "ops", label: "תפעול ונהלים" },
  { id: "incident", label: "תקלות שהיו" },
  { id: "contact", label: "אנשי קשר" },
] as const;

type Kind = (typeof KINDS)[number]["id"];

interface Entry {
  id: number;
  kind: Kind;
  title: string;
  body: string;
  source: "seed" | "human" | "agent";
  pinned: boolean;
  updatedAt: string;
}

const SOURCE_LABEL: Record<Entry["source"], string> = {
  seed: "יובא",
  human: "נכתב ידנית",
  agent: "נלמד בשיחה",
};

/**
 * The dossier behind a client's agent — everything it knows before a
 * conversation starts. Editable here because the alternative (knowledge only
 * the agent can write) makes a wrong entry impossible to correct without
 * arguing with the model.
 */
export function ClientDossier({ client, clientName }: { client: string; clientName: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ kind: Kind; title: string; body: string }>({
    kind: "architecture",
    title: "",
    body: "",
  });
  const { askAbout } = useCopilot();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/agents/${encodeURIComponent(client)}/knowledge`);
      const data = (await res.json()) as { entries?: Entry[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `שגיאה ${res.status}`);
      setEntries(data.entries ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(method: "POST" | "PATCH" | "DELETE", body: unknown) {
    try {
      const res = await fetch(`/api/ai/agents/${encodeURIComponent(client)}/knowledge`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `שגיאה ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function add() {
    if (draft.title.trim().length < 3 || draft.body.trim().length < 1) return;
    await mutate("POST", { ...draft, title: draft.title.trim(), body: draft.body.trim() });
    setDraft({ kind: "architecture", title: "", body: "" });
    setAdding(false);
  }

  return (
    <section className="card p-4">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="font-extrabold text-sm">תיק הלקוח</h2>
          <p className="text-[11px] text-[var(--color-faint)]">
            מה שהסוכן של {clientName} יודע לפני שהשיחה מתחילה
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => askAbout(`מה מצב הבוט של ${clientName}?`, client)}
            className="btn btn-ghost btn-sm"
            title={`דבר עם הסוכן של ${clientName}`}
          >
            <Icon name="ai" size={15} />
          </button>
          <button onClick={() => setAdding((v) => !v)} className="btn btn-ghost btn-sm" title="הוסף">
            <Icon name={adding ? "close" : "plus"} size={16} />
          </button>
        </div>
      </header>

      {error && (
        <p className="text-xs text-[var(--color-danger)] mb-3" role="alert">
          {error}
        </p>
      )}

      {adding && (
        <div className="rounded-xl bg-[var(--color-surface-2)] p-3 mb-3 space-y-2">
          <select
            value={draft.kind}
            onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as Kind }))}
            className="input text-xs py-1.5"
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="כותרת קצרה"
            className="input text-xs py-1.5"
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            placeholder="מה בדיוק, ולמה זה משנה"
            rows={3}
            className="input text-xs py-1.5 resize-none"
          />
          <button onClick={() => void add()} className="btn btn-primary btn-sm w-full">
            שמור לתיק
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-[var(--color-faint)]">טוען…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-[var(--color-faint)]">
          התיק ריק. הסוכן עדיין יעבוד — הוא פשוט יתחיל כל שיחה מאפס. הוסף מה שאתה כבר יודע, או תן לו
          להציע רשומות תוך כדי אבחון.
        </p>
      ) : (
        <div className="space-y-3">
          {KINDS.map(({ id, label }) => {
            const group = entries.filter((e) => e.kind === id);
            if (group.length === 0) return null;
            return (
              <div key={id}>
                <h3 className="text-[10px] font-bold text-[var(--color-faint)] mb-1.5">{label}</h3>
                <ul className="space-y-1.5">
                  {group.map((e) => (
                    <li key={e.id} className="rounded-lg bg-[var(--color-surface-2)] p-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold">
                          {e.pinned && <span title="מוצמד — לא נופל מהתיק">📌 </span>}
                          {e.title}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => void mutate("PATCH", { id: e.id, pinned: !e.pinned })}
                            className="text-[10px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
                            title={e.pinned ? "בטל הצמדה" : "הצמד"}
                          >
                            {e.pinned ? "בטל" : "הצמד"}
                          </button>
                          <button
                            onClick={() => void mutate("DELETE", { id: e.id })}
                            className="text-[var(--color-faint)] hover:text-[var(--color-danger)]"
                            title="מחק"
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </span>
                      </div>
                      <p className="text-[var(--color-muted)] mt-1 whitespace-pre-wrap">{e.body}</p>
                      <p className="text-[10px] text-[var(--color-faint)] mt-1">
                        {SOURCE_LABEL[e.source]} · {e.updatedAt.slice(0, 10)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
