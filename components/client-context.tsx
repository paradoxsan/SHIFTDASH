"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import type { BotMetrics } from "@/lib/types";

export interface ClientInfo {
  id: string;
  name: string;
  workspace: string;
  accent?: string;
  sheetUrl?: string;
  supabaseRef: string;
  whapiKey: string;
  hasWhapi: boolean;
  tables: string[];
  metrics: BotMetrics;
}

interface WorkspaceDef {
  id: string;
  label: string;
}

interface Ctx {
  workspace: string;
  setWorkspace: (w: string) => void;
  clientId: string | null;
  setClientId: (id: string) => void;
  workspaces: WorkspaceDef[];
  clients: ClientInfo[];
  wsClients: ClientInfo[];
  activeClient: ClientInfo | undefined;
  isLoading: boolean;
  isFetching: boolean;
}

const ClientCtx = createContext<Ctx | null>(null);

export function useClientCtx(): Ctx {
  const v = useContext(ClientCtx);
  if (!v) throw new Error("useClientCtx must be used inside <ClientProvider>");
  return v;
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["clients"],
    queryFn: () =>
      fetchJson<{ workspaces: WorkspaceDef[]; clients: ClientInfo[] }>("/api/clients"),
    refetchInterval: 10_000,
  });

  const clients = useMemo(() => data?.clients ?? [], [data]);
  const workspaces = data?.workspaces ?? [
    { id: "mine", label: "העסק שלי" },
    { id: "clients", label: "לקוחות" },
  ];

  const [workspace, setWorkspaceState] = useState("clients");
  const [clientId, setClientIdState] = useState<string | null>(null);

  useEffect(() => {
    const w = localStorage.getItem("bd_ws");
    const c = localStorage.getItem("bd_client");
    if (w) setWorkspaceState(w);
    if (c) setClientIdState(c);
  }, []);

  const setWorkspace = (w: string) => {
    setWorkspaceState(w);
    localStorage.setItem("bd_ws", w);
  };
  const setClientId = (id: string) => {
    setClientIdState(id);
    localStorage.setItem("bd_client", id);
  };

  const wsClients = useMemo(
    () => clients.filter((c) => c.workspace === workspace),
    [clients, workspace]
  );

  // Keep the active client valid for the current workspace.
  useEffect(() => {
    if (clients.length === 0) return;
    if (!clientId || !wsClients.some((c) => c.id === clientId)) {
      if (wsClients[0]) setClientIdState(wsClients[0].id);
    }
  }, [wsClients, clientId, clients.length]);

  const activeClient = clients.find((c) => c.id === clientId);

  return (
    <ClientCtx.Provider
      value={{
        workspace,
        setWorkspace,
        clientId,
        setClientId,
        workspaces,
        clients,
        wsClients,
        activeClient,
        isLoading,
        isFetching,
      }}
    >
      {children}
    </ClientCtx.Provider>
  );
}
