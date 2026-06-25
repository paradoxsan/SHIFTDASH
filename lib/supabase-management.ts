// Supabase Management API client.
// One Personal Access Token (PAT) does everything:
//   • discover every project (each = one customer/bot)
//   • run SQL against any project (metrics, schema introspection, DB explorer)
// The SQL endpoint is the same one the Supabase SQL editor uses, so we never
// need to reveal or store per-project service_role keys.
import { env } from "./env";
import type { Bot } from "./types";

interface RawProject {
  id: string;
  ref?: string;
  name: string;
  region: string;
  status: string;
  created_at?: string;
}

function mgmtHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${env.supabaseManagementToken()}`,
    "Content-Type": "application/json",
  };
}

// ── Tiny in-memory TTL cache (per server instance) ────────────────────────────
const cache = new Map<string, { at: number; data: unknown }>();
function getCached<T>(key: string, ttlMs: number): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > ttlMs) {
    cache.delete(key);
    return null;
  }
  return e.data as T;
}
function setCached(key: string, data: unknown): void {
  cache.set(key, { at: Date.now(), data });
}

// ── Projects ──────────────────────────────────────────────────────────────────
export async function listProjects(): Promise<Bot[]> {
  const cached = getCached<Bot[]>("projects", 60_000);
  if (cached) return cached;

  const res = await fetch(`${env.supabaseApiBase()}/v1/projects`, {
    headers: mgmtHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase Management /projects ${res.status}: ${await res.text()}`);
  }
  const raw = (await res.json()) as RawProject[];
  const allow = env.projectAllowlist();
  const tokens = env.whapiTokens();

  const bots: Bot[] = raw
    .filter((p) => allow.length === 0 || allow.includes(p.ref ?? p.id))
    .map((p) => {
      const ref = p.ref ?? p.id;
      return {
        ref,
        name: p.name,
        region: p.region,
        status: p.status,
        createdAt: p.created_at ?? null,
        hasWhapi: Boolean(tokens[ref]),
      };
    });

  setCached("projects", bots);
  return bots;
}

export async function getProject(ref: string): Promise<Bot | null> {
  const all = await listProjects();
  return all.find((b) => b.ref === ref) ?? null;
}

// ── Raw SQL (read or write) against a project ────────────────────────────────
export async function runSql<T = Record<string, unknown>>(
  ref: string,
  query: string
): Promise<T[]> {
  const res = await fetch(
    `${env.supabaseApiBase()}/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: mgmtHeaders(),
      body: JSON.stringify({ query }),
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`SQL on ${ref} failed ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray((data as { result?: unknown }).result)) {
    return (data as { result: T[] }).result;
  }
  return [];
}

// ── Schema introspection (cached) ────────────────────────────────────────────
export interface ProjectSchema {
  tables: Record<string, { name: string; type: string }[]>;
  tableNames: string[];
  pks: Record<string, string[]>;
}

export async function introspect(ref: string): Promise<ProjectSchema> {
  const cached = getCached<ProjectSchema>(`schema:${ref}`, 300_000);
  if (cached) return cached;

  const rows = await runSql<{ table_name: string; column_name: string; data_type: string }>(
    ref,
    `select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position`
  );

  const pkRows = await runSql<{ table_name: string; column_name: string }>(
    ref,
    `select tc.table_name, kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      where tc.constraint_type = 'PRIMARY KEY'
        and tc.table_schema = 'public'`
  );

  const tables: Record<string, { name: string; type: string }[]> = {};
  for (const r of rows) {
    (tables[r.table_name] ??= []).push({ name: r.column_name, type: r.data_type });
  }
  const pks: Record<string, string[]> = {};
  for (const r of pkRows) (pks[r.table_name] ??= []).push(r.column_name);

  const schema: ProjectSchema = { tables, tableNames: Object.keys(tables).sort(), pks };
  setCached(`schema:${ref}`, schema);
  return schema;
}

export function hasTable(schema: ProjectSchema, table: string): boolean {
  return table in schema.tables;
}
export function hasColumn(schema: ProjectSchema, table: string, col: string): boolean {
  return (schema.tables[table] ?? []).some((c) => c.name === col);
}
