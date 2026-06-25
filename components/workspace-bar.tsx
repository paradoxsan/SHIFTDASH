"use client";

import { useClientCtx } from "./client-context";

export function WorkspaceBar() {
  const { workspace, setWorkspace, workspaces, wsClients, clientId, setClientId, isFetching } =
    useClientCtx();

  return (
    <div className="border-b border-[var(--color-border)] px-4 md:px-6 py-2.5 flex items-center gap-3 flex-wrap">
      {/* Workspace tabs: My Business / Clients */}
      <div className="flex gap-1 bg-[var(--color-surface)] rounded-xl p-1">
        {workspaces.map((w) => (
          <button
            key={w.id}
            onClick={() => setWorkspace(w.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
              workspace === w.id
                ? "bg-[var(--color-brand)] text-white"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Client selector for the active workspace */}
      {wsClients.length > 0 && (
        <select
          value={clientId ?? ""}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold outline-none focus:border-[var(--color-brand)] max-w-[45vw] md:max-w-xs truncate"
        >
          {wsClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {isFetching && (
        <span className="dot dot-live ms-auto" style={{ background: "var(--color-ok)" }} />
      )}
    </div>
  );
}
