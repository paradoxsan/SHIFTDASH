"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useCopilot } from "./copilot-context";
import { Message } from "./message";
import { ApprovalCard } from "./approval-card";
import { AgentPicker } from "./agent-picker";

const AGENCY_SUGGESTIONS = [
  "מה שבור עכשיו?",
  "איזה בוט נפל בשבוע האחרון?",
  "אילו לידים צריכים מעקב היום?",
  "תראה לי את השגיאות האחרונות ב-n8n",
];

// A client agent is opened to debug that client, so its openers start from the
// bot rather than from the portfolio.
const CLIENT_SUGGESTIONS = [
  "מה מצב הבוט עכשיו?",
  "הבוט לא עונה — תבדוק למה",
  "מה נשבר כאן בעבר?",
  "תראה לי את הריצות שנכשלו היום",
];

export function CopilotDock() {
  const { open, setOpen, items, busy, agent, send, reset } = useCopilot();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  async function submit() {
    const text = draft;
    setDraft("");
    await send(text);
  }

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Claude">
      <button
        aria-label="סגור"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/50 md:bg-black/30"
      />

      <div className="relative ms-auto h-full w-full max-w-xl bg-[var(--color-surface)] border-s border-[var(--color-border)] flex flex-col animate-in">
        <header className="flex items-center justify-between gap-2 px-4 h-14 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ color: "var(--color-ai)" }}>
              <Icon name="ai" size={18} />
            </span>
            <div className="min-w-0">
              <div className="font-extrabold text-sm leading-tight">Claude</div>
              <div className="text-[10px] text-[var(--color-faint)]">
                מחובר ל-n8n, Supabase, וואטסאפ ולידים
              </div>
            </div>
            <AgentPicker />
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button onClick={reset} className="btn btn-ghost btn-sm" title="שיחה חדשה">
                <Icon name="plus" size={16} />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sm" aria-label="סגור">
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <div className="pt-6">
              <p className="text-sm text-[var(--color-muted)] mb-3">
                {agent
                  ? "אני הסוכן של הלקוח הזה — אני מכיר את הבוט שלו ואת מה שכבר נשבר כאן. כל פעולה שמשנה מצב תוצג לך לאישור לפני שהיא רצה."
                  : "שאל אותי על הבוטים, הלקוחות או הלידים. אני יכול גם לבצע פעולות — כל פעולה תוצג לך לאישור לפני שהיא רצה."}
              </p>
              <div className="flex flex-col gap-1.5">
                {(agent ? CLIENT_SUGGESTIONS : AGENCY_SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="text-start text-sm px-3 py-2 rounded-xl bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            items.map((item, i) =>
              item.kind === "approval" ? (
                <ApprovalCard key={`${item.toolUseId}-${i}`} item={item} />
              ) : (
                <Message key={i} item={item} />
              )
            )
          )}
        </div>

        <div className="p-3 border-t border-[var(--color-border)] shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              placeholder="שאל משהו…"
              className="input resize-none max-h-32 py-2.5"
              style={{ minHeight: "2.6rem" }}
            />
            <button
              onClick={() => void submit()}
              disabled={busy || !draft.trim()}
              className="btn btn-ai shrink-0"
              aria-label="שלח"
            >
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
