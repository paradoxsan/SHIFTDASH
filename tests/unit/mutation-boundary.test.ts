import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Fix A (Phase 3): assert EVERY mutating API route funnels through
// auditedMutation, so RBAC + audit cannot be silently bypassed. Uses a raw FS
// walk (ignores .gitignore) so app/api/n8n routes are covered too.
const ROOT = process.cwd();
const API_DIR = join(ROOT, "app", "api");
const MUTATING = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;

// Audited write seams: the single enforcement point is auditedMutation. Later
// phases add thin wrappers that ALL call auditedMutation — the Phase 4 query
// builder (updateRowByPk), the Phase 5 operator service (requeueInboxRow,
// chaseOrder), the Phase 7 provisioning runner (startJob, approveCheckpoint,
// rejectCheckpoint, retryJob), and the copilot agent (runAgent → executeTool,
// which wraps EVERY write tool in auditedMutation — asserted by
// ai-tool-registry.test.ts) — each covered by its own unit/integration test.
// A route reaching any of these funnels through the enforcement point; a route
// doing raw data access matches none and is flagged.
// Require an actual CALL (`name(`), and match against comment-stripped source, so
// a route can never satisfy this with a mention in a comment (review hardening).
const AUDITED_SEAM =
  /\b(auditedMutation|updateRowByPk|requeueInboxRow|chaseOrder|startJob|approveCheckpoint|rejectCheckpoint|retryJob|executeTool|runAgent)\s*\(/;

/** Strip block + line comments so a seam mentioned only in a comment never counts. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// Mutating routes that legitimately do NOT go through auditedMutation — auth /
// session establishment (no actor yet), and the monitoring cron (a SYSTEM actor
// authed by CRON_SECRET, recorded via systemAudit not RBAC).
const ALLOW = new Set([
  "app/api/auth/login/route.ts",
  "app/api/auth/logout/route.ts",
  "app/api/cron/monitor/route.ts",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

describe("mutation boundary (Phase 3, Fix A)", () => {
  it("every mutating API route funnels through auditedMutation (or is allowlisted)", () => {
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!MUTATING.test(src)) continue;
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
      if (ALLOW.has(rel)) continue;
      if (!AUDITED_SEAM.test(src)) offenders.push(rel);
    }
    expect(offenders, `unaudited mutating routes: ${offenders.join(", ")}`).toEqual([]);
  });

  it("a comment-only mention of the seam does NOT satisfy the guard", () => {
    const fake = "// goes through auditedMutation later\nexport async function POST(){ await runSqlRaw(); }";
    expect(AUDITED_SEAM.test(stripComments(fake))).toBe(false);
  });

  it("a real call of the seam satisfies the guard", () => {
    expect(AUDITED_SEAM.test(stripComments("await auditedMutation(ctx, fn)"))).toBe(true);
    expect(AUDITED_SEAM.test(stripComments("const r = await chaseOrder({ ref })"))).toBe(true);
  });
});
