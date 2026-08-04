import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Phase 4 (Fix C / SQL allowlist): assert that NO API route imports runSql
// directly. Data-plane reads/writes from routes must go through the allowlisted,
// PK-scoped, audited query builder (lib/services/query-builder.ts); only the
// service layer (lib/services/*) may touch runSql. Raw FS walk so app/api/n8n
// (gitignored historically) is covered too.
const ROOT = process.cwd();
const API_DIR = join(ROOT, "app", "api");

// Match an actual import of the runSql binding, not a comment mentioning it.
const IMPORTS_RUNSQL = /import\s+[^;]*\brunSql\b[^;]*from/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

describe("runSql route boundary (Phase 4)", () => {
  it("no app/api route imports runSql directly — they must use the query builder", () => {
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const src = readFileSync(file, "utf8");
      if (IMPORTS_RUNSQL.test(src)) {
        offenders.push(file.slice(ROOT.length + 1).replace(/\\/g, "/"));
      }
    }
    expect(offenders, `routes importing runSql: ${offenders.join(", ")}`).toEqual([]);
  });
});
