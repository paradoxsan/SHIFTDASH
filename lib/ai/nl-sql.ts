// ── NL-to-SQL guard (BotOps Phase 9) ──────────────────────────────────────────
// LLM-generated SQL is an injection vector, so it NEVER runs unguarded. This is a
// pure, defence-in-depth validator: a query must be a SINGLE SELECT, reference
// only allowlisted tables, contain no write keywords / comments / system catalogs
// / second statement, and is row-capped. Reject-by-default. (Pure → fully tested.)

export class NlSqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NlSqlError";
  }
}

// Whole-word keywords that must never appear in a read-only query. Word-boundary
// matching means common column names (created_at, updated_at, deleted_at,
// offset, settings) do NOT false-positive.
const FORBIDDEN_KEYWORDS = [
  "insert", "update", "delete", "drop", "alter", "truncate", "create", "grant",
  "revoke", "merge", "call", "copy", "vacuum", "reindex", "cluster", "lock",
  "set", "reset", "begin", "commit", "rollback", "savepoint", "listen", "notify",
  "prepare", "execute", "do", "into", "returning",
];

export interface GuardResult {
  ok: boolean;
  sql?: string; // the validated, row-capped query
  reason?: string;
  tables?: string[];
}

function firstIdent(part: string): string | null {
  const m = part.trim().match(/^(?:public\.)?"?([a-z_][a-z0-9_]*)"?/i);
  return m ? m[1].toLowerCase() : null;
}

function extractTables(sql: string): string[] {
  const out = new Set<string>();
  // Every JOIN target.
  for (const m of sql.matchAll(/\bjoin\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    out.add(m[1].toLowerCase());
  }
  // Each FROM clause segment up to the next clause keyword — split on commas so a
  // comma-join (`from a, b`) can't smuggle an un-allowlisted table past the check.
  const fromRe = /\bfrom\s+(.+?)(?=\bwhere\b|\bgroup\b|\border\b|\blimit\b|\bhaving\b|\bjoin\b|\bunion\b|\bon\b|$)/gis;
  for (const m of sql.matchAll(fromRe)) {
    for (const part of m[1].split(",")) {
      const t = firstIdent(part);
      if (t) out.add(t);
    }
  }
  return [...out];
}

function enforceLimit(sql: string, cap: number): string {
  const m = sql.match(/\blimit\s+(\d+)\b/i);
  if (m) {
    const n = Number(m[1]);
    return n > cap ? sql.replace(/\blimit\s+\d+\b/i, `limit ${cap}`) : sql;
  }
  return `${sql} limit ${cap}`;
}

/** Validate an LLM-proposed query as a safe, row-capped, allowlisted SELECT. */
export function guardSelect(raw: string, opts: { allowedTables: string[]; maxRows?: number }): GuardResult {
  const maxRows = Math.min(Math.max(opts.maxRows ?? 1000, 1), 5000);
  const sql = String(raw ?? "").trim().replace(/;+\s*$/, ""); // drop trailing semicolons

  if (!sql) return { ok: false, reason: "empty query" };
  if (/--|\/\*|\*\//.test(sql)) return { ok: false, reason: "comments are not allowed" };
  if (sql.includes(";")) return { ok: false, reason: "multiple statements are not allowed" };
  if (!/^\s*select\b/i.test(sql)) return { ok: false, reason: "only SELECT queries are allowed" };

  const lower = sql.toLowerCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(lower)) return { ok: false, reason: `keyword not allowed: ${kw}` };
  }
  if (/\bpg_[a-z_]+/i.test(sql) || /\binformation_schema\b/i.test(sql)) {
    return { ok: false, reason: "system catalogs are not allowed" };
  }

  const tables = extractTables(sql);
  if (tables.length === 0) return { ok: false, reason: "no table referenced" };
  const allowed = new Set(opts.allowedTables.map((t) => t.toLowerCase()));
  const bad = tables.filter((t) => !allowed.has(t));
  if (bad.length) return { ok: false, reason: `table(s) not allowed: ${bad.join(", ")}` };

  return { ok: true, sql: enforceLimit(sql, maxRows), tables };
}

// ── IO wrappers (guarded execution, Claude generation, audit log) ─────────────
import { runSql } from "../supabase-management";
import { controlPlaneRef } from "../control-plane";
import { sqlString } from "../sql";
import { claudeText } from "./anthropic";

/** Guard then run a SELECT against a data-plane project. Throws if rejected. */
export async function runGuardedSelect(
  ref: string,
  sql: string,
  opts: { allowedTables: string[]; maxRows?: number }
): Promise<Record<string, unknown>[]> {
  const g = guardSelect(sql, opts);
  if (!g.ok || !g.sql) throw new NlSqlError(g.reason ?? "query rejected");
  return runSql<Record<string, unknown>>(ref, g.sql);
}

/** Ask Claude for ONE read-only SELECT over the allowed tables. Stripped of fences. */
export async function generateSql(question: string, allowedTables: string[], schemaHint: string): Promise<string> {
  const system =
    `Translate the user's question into exactly ONE read-only PostgreSQL SELECT over ONLY these tables: ${allowedTables.join(", ")}. ` +
    `Rules: SELECT only; never write; no semicolons; no comments; always include a LIMIT; output ONLY the SQL with no markdown.`;
  const raw = await claudeText({ system, prompt: `Schema:\n${schemaHint}\n\nQuestion: ${question}\n\nSQL:`, maxTokens: 500 });
  return raw.replace(/^```sql?\s*/i, "").replace(/```$/i, "").trim();
}

/** Record every NL-query attempt (allowed or rejected) for auditability. */
export async function logAiQuery(args: {
  userEmail: string | null;
  prompt: string;
  sql: string | null;
  allowed: boolean;
  reason?: string;
  rowCount?: number;
}): Promise<void> {
  try {
    await runSql(
      controlPlaneRef(),
      `insert into botops.ai_query_log (user_id, prompt, generated_sql, allowed, reason, row_count)
         values (
           (select id from botops.app_users where lower(email) = lower(${sqlString(args.userEmail ?? "")}) limit 1),
           ${sqlString(args.prompt)},
           ${args.sql ? sqlString(args.sql) : "null"},
           ${args.allowed ? "true" : "false"},
           ${args.reason ? sqlString(args.reason) : "null"},
           ${args.rowCount != null ? String(Math.floor(args.rowCount)) : "null"}
         )`
    );
  } catch {
    // never block the request on logging
  }
}
