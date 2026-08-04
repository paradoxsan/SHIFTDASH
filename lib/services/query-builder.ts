// ── Allowlisted, PK-scoped, audited query builder (BotOps Phase 4) ────────────
// The ONLY sanctioned path for data-plane reads/writes from route handlers.
//   • Every identifier (table, column) is allowlist-checked against LIVE
//     introspection before it can touch SQL — unknown table/column is rejected.
//   • Every user value is bound through lib/sql.ts (typed literal, quote-safe).
//   • The operation set is allowlisted: select | update_by_pk | aggregate.
//     update/delete that is not PK-scoped, and any DDL, are impossible here.
//   • Mutations funnel through auditedMutation() so RBAC + audit always apply,
//     and a rejected mutation is still recorded in the audit log.
// Route handlers MUST import data access from THIS module, never runSql.
//
// The pure `build*` helpers take a ProjectSchema directly (no network), so the
// allowlist logic is unit-testable without live secrets; the async wrappers add
// introspection + execution (+ audit for mutations).
import { runSql, introspect, type ProjectSchema } from "../supabase-management";
import { sqlValue } from "../sql";
import { auditedMutation } from "./audited";
import type { Session } from "../auth";
import type { Role } from "../rbac";
import type { TableInfo } from "../types";

export class QueryBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryBuilderError";
  }
}

/** The only operations this builder will ever emit. */
export const ALLOWED_OPS = ["select", "update_by_pk", "aggregate", "count"] as const;
export type QueryOp = (typeof ALLOWED_OPS)[number];

export function assertOp(op: string): asserts op is QueryOp {
  if (!(ALLOWED_OPS as readonly string[]).includes(op)) {
    throw new QueryBuilderError(`operation not allowed: ${op}`);
  }
}

// ── Identifier allowlisting ───────────────────────────────────────────────────
// Defence in depth: identifiers are checked against the live schema AND quoted
// so a value can never break out of an identifier even if a check were skipped.
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function assertTable(schema: ProjectSchema, table: string): void {
  if (!schema.tableNames.includes(table)) {
    throw new QueryBuilderError(`unknown table: ${table}`);
  }
}

function columnType(schema: ProjectSchema, table: string, col: string): string {
  const found = (schema.tables[table] ?? []).find((c) => c.name === col);
  if (!found) throw new QueryBuilderError(`unknown column: ${table}.${col}`);
  return found.type;
}

function defaultOrderColumn(cols: { name: string }[]): string | null {
  return (
    cols.find((c) => c.name === "created_at")?.name ??
    cols.find((c) => c.name === "updated_at")?.name ??
    cols.find((c) => c.name === "id")?.name ??
    cols[0]?.name ??
    null
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(n, lo), hi);
}

// ── WHERE predicates (allowlisted column + op, bound values) ───────────────────
export type WhereOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "is_null" | "not_null";
export interface WherePredicate {
  column: string;
  op: WhereOp;
  value?: unknown; // scalar for comparisons; array for `in`; ignored for null checks
}

const SQL_OP: Record<Exclude<WhereOp, "in" | "is_null" | "not_null">, string> = {
  eq: "=",
  neq: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
};

/** Pure: validate every predicate's column against `schema` and bind its value. */
export function buildWhere(schema: ProjectSchema, table: string, where: WherePredicate[]): string {
  assertTable(schema, table);
  if (where.length === 0) return "";
  const parts = where.map((p) => {
    const type = columnType(schema, table, p.column); // throws on unknown column
    const col = quoteIdent(p.column);
    if (p.op === "is_null") return `${col} is null`;
    if (p.op === "not_null") return `${col} is not null`;
    if (p.op === "in") {
      const vals = Array.isArray(p.value) ? p.value : [];
      if (vals.length === 0) throw new QueryBuilderError(`'in' predicate on ${p.column} needs a non-empty array`);
      return `${col} in (${vals.map((v) => sqlValue(v, type)).join(", ")})`;
    }
    const sqlOp = SQL_OP[p.op];
    if (!sqlOp) throw new QueryBuilderError(`unknown where op: ${p.op}`);
    return `${col} ${sqlOp} ${sqlValue(p.value, type)}`;
  });
  return parts.join(" and ");
}

// ── SELECT ────────────────────────────────────────────────────────────────────
export interface SelectOptions {
  columns?: string[]; // default: every column
  where?: WherePredicate[]; // allowlisted, value-bound filters (AND-joined)
  limit?: number;
  offset?: number;
  orderBy?: string; // column name (validated)
  orderDir?: "asc" | "desc";
  truncateText?: boolean; // truncate big text/json for the DB explorer
}

/** Pure: validate identifiers against `schema` and return a SELECT string. */
export function buildSelect(schema: ProjectSchema, table: string, opts: SelectOptions = {}): string {
  assertTable(schema, table);
  const cols = schema.tables[table];

  const chosen = opts.columns?.length
    ? opts.columns.map((c) => {
        columnType(schema, table, c); // throws on unknown
        return c;
      })
    : cols.map((c) => c.name);

  const selectList = chosen
    .map((name) => {
      if (!opts.truncateText) return quoteIdent(name);
      const t = columnType(schema, table, name).toLowerCase();
      if (t.includes("json")) return `left(${quoteIdent(name)}::text, 500) as ${quoteIdent(name)}`;
      if (t === "text" || t.includes("char")) return `left(${quoteIdent(name)}, 300) as ${quoteIdent(name)}`;
      return quoteIdent(name);
    })
    .join(", ");

  const limit = clamp(opts.limit ?? 50, 1, 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  const whereClause = opts.where?.length ? `where ${buildWhere(schema, table, opts.where)}` : "";

  let orderClause = "";
  const orderCol = opts.orderBy ? (columnType(schema, table, opts.orderBy), opts.orderBy) : defaultOrderColumn(cols);
  if (orderCol) {
    const dir = opts.orderDir === "asc" ? "asc" : "desc";
    orderClause = `order by ${quoteIdent(orderCol)} ${dir}`;
  }

  // Join only the present clauses with single spaces — never collapse whitespace
  // globally (that would mangle spaces inside bound string literals).
  return [
    `select ${selectList} from public.${quoteIdent(table)}`,
    whereClause,
    orderClause,
    `limit ${limit} offset ${offset}`,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface SelectResult {
  table: string;
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  limit: number;
  offset: number;
  primaryKeys: string[];
}

/** Allowlisted SELECT against a data-plane project. Read-only (not audited). */
export async function selectRows(ref: string, table: string, opts: SelectOptions = {}): Promise<SelectResult> {
  const schema = await introspect(ref);
  const sql = buildSelect(schema, table, opts);
  const rows = await runSql<Record<string, unknown>>(ref, sql);
  return {
    table,
    columns: schema.tables[table],
    rows,
    limit: clamp(opts.limit ?? 50, 1, 500),
    offset: Math.max(opts.offset ?? 0, 0),
    primaryKeys: schema.pks[table] ?? [],
  };
}

// ── UPDATE … WHERE <pk> ───────────────────────────────────────────────────────
export interface UpdateByPkPlan {
  sql: string;
  columns: string[]; // columns actually updated
}

/**
 * Pure: validate identifiers against `schema`, require a real primary key, and
 * build a PK-scoped UPDATE. Rejects unknown table/column, missing PK value, a
 * table with no primary key, and any attempt to set a PK column.
 */
export function buildUpdateByPk(
  schema: ProjectSchema,
  table: string,
  pk: Record<string, unknown>,
  set: Record<string, unknown>
): UpdateByPkPlan {
  assertTable(schema, table);
  const pks = schema.pks[table] ?? [];
  if (pks.length === 0) {
    throw new QueryBuilderError(`table ${table} has no primary key — update-by-pk not allowed`);
  }
  for (const k of pks) {
    if (!(k in pk)) throw new QueryBuilderError(`missing primary-key value: ${k}`);
  }

  const setCols = Object.keys(set).filter((c) => !pks.includes(c));
  for (const c of setCols) columnType(schema, table, c); // throws on unknown
  if (setCols.length === 0) throw new QueryBuilderError("no updatable columns");

  const setClause = setCols
    .map((c) => `${quoteIdent(c)} = ${sqlValue(set[c], columnType(schema, table, c))}`)
    .join(", ");
  const whereClause = pks
    .map((k) => `${quoteIdent(k)} = ${sqlValue(pk[k], columnType(schema, table, k))}`)
    .join(" and ");

  return {
    sql: `update public.${quoteIdent(table)} set ${setClause} where ${whereClause}`,
    columns: setCols,
  };
}

export interface UpdateByPkArgs {
  ref: string;
  table: string;
  pk: Record<string, unknown>;
  set: Record<string, unknown>;
  actor: Session | null;
  minRole?: Role; // default operator
  action?: string; // default db.row.update
}

/**
 * Allowlisted, PK-scoped UPDATE, funnelled through auditedMutation. RBAC is
 * checked first; a rejected/invalid mutation is still written to the audit log.
 */
export async function updateRowByPk(args: UpdateByPkArgs): Promise<{ updated: string[] }> {
  const schema = await introspect(args.ref);
  return auditedMutation(
    {
      actor: args.actor,
      minRole: args.minRole ?? "operator",
      action: args.action ?? "db.row.update",
      targetType: `${args.ref}.${args.table}`,
      targetId: JSON.stringify(args.pk),
      payload: { table: args.table, pkKeys: Object.keys(args.pk) },
    },
    async () => {
      // Build INSIDE the audited fn so an out-of-allowlist identifier is
      // recorded as an audited error, not a silent pre-audit throw.
      const plan = buildUpdateByPk(schema, args.table, args.pk, args.set);
      await runSql(args.ref, plan.sql);
      return { updated: plan.columns };
    }
  );
}

// ── Aggregate (count) ─────────────────────────────────────────────────────────
/** Allowlisted approximate-free exact COUNT(*) of one table. */
export async function countRows(ref: string, table: string): Promise<number> {
  const schema = await introspect(ref);
  assertTable(schema, table);
  const rows = await runSql<{ n: number }>(ref, `select count(*)::int as n from public.${quoteIdent(table)}`);
  return Number(rows[0]?.n ?? 0);
}

/** Tables + columns + PKs + approximate row counts (catalog read, read-only). */
export async function listTablesWithCounts(ref: string): Promise<TableInfo[]> {
  const schema = await introspect(ref);
  const counts = await runSql<{ relname: string; n_live_tup: number }>(
    ref,
    `select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public'`
  );
  const countMap = new Map(counts.map((c) => [c.relname, Number(c.n_live_tup)]));
  return schema.tableNames.map((name) => ({
    name,
    columns: schema.tables[name],
    approxRows: countMap.has(name) ? countMap.get(name)! : null,
    primaryKeys: schema.pks[name] ?? [],
  }));
}
