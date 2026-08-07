"use client";

import { useClientCtx } from "@/components/client-context";

/**
 * Which bot am I looking at?
 *
 * Several screens are inherently per-bot — the machine room's queue, human
 * watchlist, database explorer, n8n workflows and runs all read `activeClient`.
 * The old shell offered this through `workspace-bar`, which the new shell never
 * rendered, so the active client silently pinned itself to whichever one the
 * provider auto-selected first and could not be changed. Those tabs looked
 * functional and quietly showed the wrong bot.
 *
 * Deliberately just the client list: the "mine vs clients" workspace split the
 * old bar also carried is gone from this UI — Shift Digital's own pipeline has
 * its own screen (לידים) rather than being a mode you toggle into.
 */
export function ClientSwitcher({ compact = false }: { compact?: boolean }) {
  const { clients, clientId, setClientId } = useClientCtx();
  const bots = clients.filter((c) => c.workspace === "clients");
  if (bots.length < 2) return null;

  return (
    <label className={compact ? "min-w-0" : "block"}>
      <span className="sr-only">בחר בוט</span>
      <select
        value={clientId ?? ""}
        onChange={(e) => setClientId(e.target.value)}
        aria-label="בחר בוט"
        className={`w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] font-semibold truncate ${
          compact ? "text-xs px-2 py-1.5" : "text-sm px-2.5 py-2"
        }`}
      >
        {bots.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
