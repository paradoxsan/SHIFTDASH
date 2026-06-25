// Client registry — the single source of truth that ties the whole system
// together. A "client" maps to a set of resources: a Supabase project (or a
// SUBSET of its tables), n8n workflows (by name prefix), a WHAPI channel, and a
// CRM Google Sheet. Two workspaces: "mine" (Shift Digital, the agency) and
// "clients" (the businesses we run bots for).

export type Workspace = "mine" | "clients";

export interface ClientDef {
  id: string;
  name: string;
  workspace: Workspace;
  supabaseRef: string;
  /** Include only these tables (else all of the project's tables). */
  tables?: string[];
  /** Or exclude these tables (used when a project is shared by two clients). */
  excludeTables?: string[];
  /** n8n workflow name prefixes that belong to this client. */
  n8nPrefixes: string[];
  /** Override WHAPI token key (env WHAPI_TOKENS_JSON). Defaults to supabaseRef. */
  whapiKey?: string;
  /** CRM Google Sheet id (for two-way sync / view). */
  sheetId?: string;
  accent?: string;
}

const PARADOX = "kracmhwzmgligxngmhmi";
const TCENTER = "xrvrjcnxogplmoybppay";

export const CLIENTS: ClientDef[] = [
  {
    id: "shift-digital",
    name: "Shift Digital",
    workspace: "mine",
    supabaseRef: PARADOX,
    tables: ["leads", "activities", "app_config"],
    n8nPrefixes: ["SDR", "CRM Bridge", "Shift"],
    whapiKey: "shift-digital",
    sheetId: "1IBhC6YCCVV9UHknv9_omW8eBwx8NYnNS1pkpooPHOkc",
    accent: "#5b8cff",
  },
  {
    id: "brjewelry",
    name: "BRJewelry",
    workspace: "clients",
    supabaseRef: PARADOX,
    excludeTables: ["leads", "activities"],
    n8nPrefixes: ["BRJewelry", "BR Jewelry"],
    whapiKey: PARADOX,
    sheetId: "1O-Z_NQP_d-3ppg623eY66yj_lyOFUyEcXl72Bc_WECE",
    accent: "#d4a14e",
  },
  {
    id: "t-center",
    name: "T center",
    workspace: "clients",
    supabaseRef: TCENTER,
    n8nPrefixes: ["T-CENTER", "T CENTER", "T center", "T-center"],
    whapiKey: TCENTER,
    accent: "#2fbf71",
  },
];

export const WORKSPACES: { id: Workspace; label: string }[] = [
  { id: "mine", label: "העסק שלי" },
  { id: "clients", label: "לקוחות" },
];

export function getClients(): ClientDef[] {
  return CLIENTS;
}
export function getClient(id: string): ClientDef | null {
  return CLIENTS.find((c) => c.id === id) ?? null;
}
export function clientsByWorkspace(ws: Workspace): ClientDef[] {
  return CLIENTS.filter((c) => c.workspace === ws);
}

/** Resolve which of a project's tables belong to this client. */
export function clientTables(c: ClientDef, allTables: string[]): string[] {
  if (c.tables) return allTables.filter((t) => c.tables!.includes(t));
  if (c.excludeTables) return allTables.filter((t) => !c.excludeTables!.includes(t));
  return allTables;
}

/** Does an n8n workflow name belong to this client? */
export function workflowMatchesClient(c: ClientDef, workflowName: string): boolean {
  const n = workflowName.toLowerCase();
  return c.n8nPrefixes.some((p) => n.startsWith(p.toLowerCase()) || n.includes(p.toLowerCase()));
}

/** Public (no-secret) shape sent to the browser. */
export interface ClientPublic {
  id: string;
  name: string;
  workspace: Workspace;
  accent?: string;
  sheetId?: string;
  sheetUrl?: string;
}
export function toPublic(c: ClientDef): ClientPublic {
  return {
    id: c.id,
    name: c.name,
    workspace: c.workspace,
    accent: c.accent,
    sheetId: c.sheetId,
    sheetUrl: c.sheetId ? `https://docs.google.com/spreadsheets/d/${c.sheetId}` : undefined,
  };
}
