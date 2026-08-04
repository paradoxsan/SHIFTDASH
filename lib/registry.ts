// Client registry — the single source of truth that ties the whole system
// together. A "client" maps to a set of resources: a Supabase project (or a
// SUBSET of its tables), n8n workflows (by name prefix), a WHAPI channel, and a
// CRM Google Sheet. Two workspaces: "mine" (Shift Digital, the agency) and
// "clients" (the businesses we run bots for).

import { loadBotRows, type BotRow } from "./control-plane";
import { ForbiddenError } from "./rbac";

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

// ── Control-plane–backed registry (BotOps Phase 2) ────────────────────────────
// The static CLIENTS array above is now the SEED + offline FALLBACK. At runtime
// the source of truth is the `botops` control-plane schema. A sync cached
// snapshot keeps existing (sync) consumers working; routes call loadClients() to
// refresh from the DB. Adding a tenant/bot row makes a client appear with no redeploy.
function rowToClient(r: BotRow): ClientDef {
  return {
    id: r.slug,
    name: r.name,
    workspace: r.workspace,
    supabaseRef: r.supabase_ref,
    tables: r.table_include?.length ? r.table_include : undefined,
    excludeTables: r.table_exclude?.length ? r.table_exclude : undefined,
    n8nPrefixes: r.n8n_prefixes ?? [],
    whapiKey: r.whapi_key ?? undefined,
    sheetId: r.sheet_id ?? undefined,
    accent: r.accent ?? undefined,
  };
}

let runtimeClients: ClientDef[] | null = null;
let loadedAt = 0;
const REGISTRY_TTL_MS = 60_000;

/** Sync snapshot: control-plane data once loaded, otherwise the static seed. */
export function getClientsCached(): ClientDef[] {
  return runtimeClients ?? CLIENTS;
}

/** Refresh (and cache) the registry from the control-plane; falls back to the seed. */
export async function loadClients(force = false): Promise<ClientDef[]> {
  if (!force && runtimeClients && Date.now() - loadedAt < REGISTRY_TTL_MS) {
    return runtimeClients;
  }
  try {
    const rows = await loadBotRows();
    if (rows.length > 0) {
      runtimeClients = rows.map(rowToClient);
      loadedAt = Date.now();
    }
  } catch {
    // Control-plane unreachable — keep the last good cache or the static seed.
  }
  return getClientsCached();
}

export function getClients(): ClientDef[] {
  return getClientsCached();
}
export function getClient(id: string): ClientDef | null {
  return getClientsCached().find((c) => c.id === id) ?? null;
}

/** The set of data-plane Supabase refs we manage. */
export function knownRefs(): Set<string> {
  return new Set(getClientsCached().map((c) => c.supabaseRef));
}

/**
 * Guard a URL-supplied `[ref]` before any data-plane call. The Management PAT is
 * org-wide, so an unvalidated ref would let an authenticated user read/write ANY
 * project under the org. Throws ForbiddenError (→ 403) for an unknown ref.
 */
export function assertKnownRef(ref: string): void {
  if (!knownRefs().has(ref)) throw new ForbiddenError(`unknown project ref: ${ref}`);
}
export function clientsByWorkspace(ws: Workspace): ClientDef[] {
  return getClientsCached().filter((c) => c.workspace === ws);
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
