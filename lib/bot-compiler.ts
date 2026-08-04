// ── Deterministic bot compiler (BotOps Phase 6) ───────────────────────────────
// Pure: a tokenized template + a token→value map → a deployable n8n workflow.
// Substitution is EXACT-token only ({{TPL:NAME}}), so the workflow's own n8n
// expressions ({{ $json.x }}) are never touched. Same input → identical output
// (no Date/random), and any token without a param is reported (never silently
// left as a live secret placeholder).
import { contentHash } from "./bot-artifact";

// Matches ONLY our sentinels — n8n's {{ $json }} has spaces/`$` and never matches.
const TPL_RE = /\{\{TPL:([A-Z0-9_]+)\}\}/g;

export interface CompileResult {
  workflow: Record<string, unknown>;
  unresolved: string[]; // token names that had no param (sorted, unique)
  residual: number; // count of leftover {{TPL:...}} in the output (0 on success)
}

function substituteString(s: string, params: Record<string, string>, unresolved: Set<string>): string {
  return s.replace(TPL_RE, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) return params[name];
    unresolved.add(name);
    return match; // leave the sentinel so `residual` catches it
  });
}

function deepSubstitute(value: unknown, params: Record<string, string>, unresolved: Set<string>): unknown {
  if (typeof value === "string") return substituteString(value, params, unresolved);
  if (Array.isArray(value)) return value.map((v) => deepSubstitute(v, params, unresolved));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepSubstitute(v, params, unresolved);
    return out;
  }
  return value;
}

/** Compile a tokenized template into a deployable workflow. Pure + deterministic. */
export function compileWorkflow(template: unknown, params: Record<string, string>): CompileResult {
  const unresolved = new Set<string>();
  const workflow = deepSubstitute(template, params, unresolved) as Record<string, unknown>;
  const residual = (JSON.stringify(workflow).match(/\{\{TPL:/g) ?? []).length;
  return { workflow, unresolved: [...unresolved].sort(), residual };
}

/** Every distinct {{TPL:NAME}} present in a template (sorted). */
export function requiredTokens(template: unknown): string[] {
  const set = new Set<string>();
  for (const m of JSON.stringify(template).matchAll(TPL_RE)) set.add(m[1]);
  return [...set].sort();
}

/** Content hash of a compiled workflow (stable JSON) — the version/snapshot id. */
export function workflowHash(workflow: Record<string, unknown>): string {
  return contentHash(JSON.stringify(workflow));
}
