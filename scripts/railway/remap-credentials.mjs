/**
 * Remap credential references on the Railway SDR workflow.
 *
 * The imported workflow still points at the OLD instance's credential IDs
 * (25 node references across 3 credential types). Rather than re-picking a
 * credential on 25 nodes by hand in the editor, create the credentials once
 * in the new n8n UI and run this — it matches by type (then by name when a
 * type has several) and rewrites every reference in one PUT.
 *
 * Safe to re-run. Reports anything it could not match instead of guessing.
 *
 * Env (see scripts/railway/README or the runbook):
 *   N8N_NEW_BASE, N8N_NEW_API_KEY, N8N_NEW_WORKFLOW_ID,
 *   N8N_OWNER_EMAIL, N8N_OWNER_PASSWORD   (login is needed to LIST credentials —
 *                                          the public API cannot enumerate them)
 *
 *   node scripts/railway/remap-credentials.mjs [--dry-run]
 */
import { writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

const BASE = need("N8N_NEW_BASE").replace(/\/+$/, "");
const API_KEY = need("N8N_NEW_API_KEY");
const WORKFLOW_ID = need("N8N_NEW_WORKFLOW_ID");

async function login() {
  const res = await fetch(`${BASE}/rest/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrLdapLoginId: need("N8N_OWNER_EMAIL"),
      password: need("N8N_OWNER_PASSWORD"),
    }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
  const cookie = (res.headers.getSetCookie?.() ?? []).join("; ");
  if (!cookie) throw new Error("login returned no cookie");
  return cookie;
}

async function listCredentials(cookie) {
  const res = await fetch(`${BASE}/rest/credentials`, { headers: { cookie } });
  if (!res.ok) throw new Error(`list credentials failed: HTTP ${res.status}`);
  const json = await res.json();
  return (json.data ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type }));
}

async function getWorkflow() {
  const res = await fetch(`${BASE}/api/v1/workflows/${WORKFLOW_ID}`, {
    headers: { "X-N8N-API-KEY": API_KEY },
  });
  if (!res.ok) throw new Error(`get workflow failed: HTTP ${res.status}`);
  return res.json();
}

async function putWorkflow(wf) {
  // Slim body — the public API rejects read-only fields.
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings ?? {} };
  const res = await fetch(`${BASE}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: "PUT",
    headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`put workflow failed: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

/** Pick the credential to use for a given type + old name. Never guesses across types. */
function resolve(available, type, oldName) {
  const sameType = available.filter((c) => c.type === type);
  if (sameType.length === 0) return { error: `no credential of type ${type} exists on the new instance` };
  if (sameType.length === 1) return { cred: sameType[0] };
  const exact = sameType.find((c) => c.name === oldName);
  if (exact) return { cred: exact };
  return {
    error: `${sameType.length} credentials of type ${type} and none named "${oldName}" — rename one to match, or pick manually`,
  };
}

const cookie = await login();
const available = await listCredentials(cookie);
console.log(`credentials on the new instance (${available.length}):`);
available.forEach((c) => console.log(`   ${c.type.padEnd(24)} ${c.name}  [${c.id}]`));

const wf = await getWorkflow();
writeFileSync(new URL("./.remap-backup.json", import.meta.url), JSON.stringify(wf, null, 2));

let remapped = 0,
  already = 0;
const problems = [];

const nodes = wf.nodes.map((node) => {
  if (!node.credentials) return node;
  const nextCreds = {};
  for (const [type, ref] of Object.entries(node.credentials)) {
    const { cred, error } = resolve(available, type, ref.name);
    if (error) {
      problems.push(`${node.name} → ${type}: ${error}`);
      nextCreds[type] = ref;
      continue;
    }
    if (cred.id === ref.id) {
      already++;
      nextCreds[type] = ref;
      continue;
    }
    remapped++;
    nextCreds[type] = { id: cred.id, name: cred.name };
  }
  return { ...node, credentials: nextCreds };
});

console.log(`\nremapped: ${remapped}   already correct: ${already}   problems: ${problems.length}`);
if (problems.length) {
  console.log("\nUNRESOLVED — fix these before activating:");
  problems.forEach((p) => console.log(`   ! ${p}`));
}

if (DRY) {
  console.log("\n--dry-run: nothing written.");
} else if (remapped > 0) {
  await putWorkflow({ ...wf, nodes });
  console.log("\nworkflow updated.");
} else {
  console.log("\nnothing to change.");
}

process.exit(problems.length ? 1 : 0);
