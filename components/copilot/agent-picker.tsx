"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useCopilot } from "./copilot-context";

export interface AgentOption {
  client: string;
  name: string;
  workspace: "mine" | "clients";
  accent: string | null;
  knowledgeCount: number;
}

/**
 * Which agent the dock is talking to. Switching clears the conversation — a
 * thread is pinned to one client server-side, so there is no such thing as
 * carrying it across — and the confirm-free switch is deliberate: the reset is
 * visible immediately in the transcript area, so a prompt would just be noise.
 */
export function AgentPicker() {
  const { agent, setAgent, busy } = useCopilot();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/ai/agents")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d: { agents?: AgentOption[] }) => {
        if (alive) setAgents(d.agents ?? []);
      })
      .catch(() => {
        /* picker degrades to the agency copilot only */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = agent ? agents.find((a) => a.client === agent) : null;
  const label = current?.name ?? "כל הסוכנות";
  const accent = current?.accent ?? "var(--color-ai)";

  function choose(client: string | null) {
    setAgent(client);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition disabled:opacity-50 max-w-[11rem]"
        title="בחר סוכן"
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: accent }}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
        <Icon name="chevronDown" size={12} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 start-0 z-50 w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden">
          <button
            onClick={() => choose(null)}
            className={`w-full text-start px-3 py-2 text-xs hover:bg-[var(--color-surface-2)] transition flex items-center gap-2 ${
              agent === null ? "bg-[var(--color-surface-2)]" : ""
            }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: "var(--color-ai)" }}
            />
            <span className="flex-1">
              <span className="font-bold block">כל הסוכנות</span>
              <span className="text-[10px] text-[var(--color-faint)]">כל הלקוחות, מבט על</span>
            </span>
          </button>

          {agents.length > 0 && (
            <div className="border-t border-[var(--color-border)] px-3 pt-2 pb-1 text-[10px] text-[var(--color-faint)] font-bold">
              סוכן ייעודי ללקוח
            </div>
          )}

          {agents.map((a) => (
            <button
              key={a.client}
              onClick={() => choose(a.client)}
              className={`w-full text-start px-3 py-2 text-xs hover:bg-[var(--color-surface-2)] transition flex items-center gap-2 ${
                agent === a.client ? "bg-[var(--color-surface-2)]" : ""
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: a.accent ?? "var(--color-ai)" }}
              />
              <span className="flex-1 min-w-0">
                <span className="font-bold block truncate">{a.name}</span>
                <span className="text-[10px] text-[var(--color-faint)]">
                  {/* An empty dossier is stated, not hidden — an agent with no
                      knowledge yet behaves very differently from a loaded one. */}
                  {a.knowledgeCount > 0 ? `${a.knowledgeCount} רשומות בתיק` : "התיק ריק"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
