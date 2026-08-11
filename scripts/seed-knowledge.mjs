#!/usr/bin/env node
// Seed client dossiers from knowledge/clients/<slug>.json into
// botops.client_knowledge.
//
// Idempotent: rows land with source='seed', which has a unique index on
// (tenant_id, title), so re-running updates the body instead of fanning out
// duplicates. Entries written by a human in the dashboard or proposed by an
// agent carry a different source and are NEVER touched by this script — the
// files are the starting point, not the authority.
//
//   node scripts/seed-knowledge.mjs            # seed every client file
//   node scripts/seed-knowledge.mjs t-center   # one client
//   node scripts/seed-knowledge.mjs --dry-run
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "knowledge", "clients");

// .env.local is the same source the app reads; no separate config to drift.
function loadEnv() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnv();

const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const REF = process.env.CONTROL_PLANE_REF?.trim() || "kracmhwzmgligxngmhmi";
if (!TOKEN) {
  console.error("חסר SUPABASE_MANAGEMENT_TOKEN ב-.env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));

/** Single-quote escaping for a Postgres string literal. */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

const KINDS = new Set(["architecture", "incident", "business_rule", "contact", "ops"]);

function validate(slug, entries) {
  if (!Array.isArray(entries)) throw new Error(`${slug}: הקובץ חייב להיות מערך`);
  const titles = new Set();
  for (const [i, e] of entries.entries()) {
    const at = `${slug}[${i}]`;
    if (!KINDS.has(e.kind)) throw new Error(`${at}: kind לא חוקי — ${e.kind}`);
    if (!e.title || e.title.length > 120) throw new Error(`${at}: title חסר או ארוך מדי`);
    if (!e.body || e.body.length > 4000) throw new Error(`${at}: body חסר או ארוך מדי`);
    // The seed upsert keys on title, so a duplicate would silently overwrite
    // its twin and the file would import fewer rows than it contains.
    if (titles.has(e.title)) throw new Error(`${at}: כותרת כפולה — ${e.title}`);
    titles.add(e.title);
  }
  return entries;
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => only.length === 0 || only.includes(basename(f, ".json")));

if (files.length === 0) {
  console.error(`לא נמצאו קבצים ב-${DIR}${only.length ? ` עבור ${only.join(", ")}` : ""}`);
  process.exit(1);
}

let total = 0;
for (const file of files) {
  const slug = basename(file, ".json");
  const entries = validate(slug, JSON.parse(readFileSync(join(DIR, file), "utf8")));

  const rows = await runSql(
    `select tenant_id from botops.bots where slug = ${q(slug)} limit 1`
  );
  const tenantId = rows[0]?.tenant_id;
  if (!tenantId) {
    console.error(`⚠️  ${slug}: אין רשומת bot ב-control-plane — מדלג`);
    continue;
  }

  if (dryRun) {
    console.log(`${slug}: ${entries.length} רשומות (dry-run, לא נכתב)`);
    total += entries.length;
    continue;
  }

  const values = entries
    .map(
      (e) =>
        `(${q(tenantId)}::uuid, ${q(e.kind)}, ${q(e.title)}, ${q(e.body)}, 'seed', ${
          e.pinned ? "true" : "false"
        })`
    )
    .join(",\n    ");

  await runSql(
    `insert into botops.client_knowledge (tenant_id, kind, title, body, source, pinned)
     values ${values}
     on conflict (tenant_id, title) where source = 'seed'
       do update set body = excluded.body, kind = excluded.kind,
                     pinned = excluded.pinned, updated_at = now()`
  );

  console.log(`✅ ${slug}: ${entries.length} רשומות`);
  total += entries.length;
}

console.log(`\nסה"כ ${total} רשומות${dryRun ? " (dry-run)" : ""}.`);
