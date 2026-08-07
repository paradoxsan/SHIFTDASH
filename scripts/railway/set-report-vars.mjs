/**
 * Targeted Railway variable helper for the monthly report.
 *
 * Deliberately NOT the full deploy script: that one syncs every key in
 * .env.local, which would overwrite the CRON_SECRET already living on Railway
 * with whatever this machine happens to hold. This script only ADDS the keys
 * the report needs and leaves everything else exactly as it is.
 *
 * Usage:
 *   node scripts/railway/set-report-vars.mjs            # show what would change
 *   node scripts/railway/set-report-vars.mjs --apply    # write REPORT_PHONE
 *   node scripts/railway/set-report-vars.mjs --show-cron-secret   # print it for n8n
 *
 * Auth: reuses an existing `npx @railway/cli login`, or RAILWAY_TOKEN.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://backboard.railway.com/graphql/v2";
const PROJECT = process.env.PROJECT?.trim() || "shift-dash";
const SERVICE = process.env.SERVICE?.trim() || "dashboard";
const APPLY = process.argv.includes("--apply");
const SHOW_SECRET = process.argv.includes("--show-cron-secret");

function storedCliToken() {
  const candidates = [
    join(homedir(), ".railway", "config.json"),
    join(process.env.APPDATA ?? "", "railway", "config.json"),
    join(homedir(), ".config", "railway", "config.json"),
  ];
  for (const path of candidates) {
    if (!path || !existsSync(path)) continue;
    try {
      const cfg = JSON.parse(readFileSync(path, "utf8"));
      const t = cfg?.user?.accessToken ?? cfg?.user?.token ?? cfg?.token;
      if (typeof t === "string" && t) return t;
    } catch {
      /* next */
    }
  }
  return "";
}

const TOKEN = process.env.RAILWAY_TOKEN?.trim() || storedCliToken();
if (!TOKEN) {
  console.error("No Railway token. Run:  npx -y @railway/cli login   (or set RAILWAY_TOKEN)");
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Railway ${res.status}: ${text.slice(0, 300)}`);
  }
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

function localValue(key) {
  if (!existsSync(".env.local")) return "";
  const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return (m?.[1] ?? "").trim().replace(/^['"]|['"]$/g, "");
}

const me = await gql(`query { me { email workspaces { id name } } }`);
console.log(`account: ${me.me.email}`);
const workspace = me.me.workspaces?.[0];
if (!workspace) throw new Error("no workspace on this account");

const projects = await gql(
  `query ($workspaceId: String!) {
     projects(workspaceId: $workspaceId, first: 100) {
       edges { node { id name environments { edges { node { id name } } }
                      services { edges { node { id name } } } } }
     }
   }`,
  { workspaceId: workspace.id }
);
const project = projects.projects.edges.map((e) => e.node).find((p) => p.name === PROJECT);
if (!project) throw new Error(`project "${PROJECT}" not found`);
const environment =
  project.environments.edges.map((e) => e.node).find((e) => e.name === "production") ??
  project.environments.edges[0]?.node;
const service = project.services.edges.map((e) => e.node).find((s) => s.name === SERVICE);
if (!environment || !service) throw new Error("environment or service not found");
console.log(`project ${project.name} / ${environment.name} / ${service.name}`);

const current =
  (
    await gql(
      `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
         variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
       }`,
      { projectId: project.id, environmentId: environment.id, serviceId: service.id }
    )
  ).variables ?? {};

const cron = current.CRON_SECRET ?? "";
console.log(`CRON_SECRET on Railway: ${cron ? (SHOW_SECRET ? cron : `set (${cron.length} chars)`) : "MISSING"}`);
console.log(`REPORT_PHONE on Railway: ${current.REPORT_PHONE ?? "MISSING"}`);

const want = { REPORT_PHONE: localValue("REPORT_PHONE") || "972584257154" };
const changes = Object.entries(want).filter(([k, v]) => current[k] !== v);
if (!changes.length) {
  console.log("nothing to change.");
} else if (!APPLY) {
  console.log(`would set: ${changes.map(([k, v]) => `${k}=${v}`).join(", ")}   (re-run with --apply)`);
} else {
  await gql(
    `mutation ($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`,
    {
      input: {
        projectId: project.id,
        environmentId: environment.id,
        serviceId: service.id,
        variables: Object.fromEntries(changes),
      },
    }
  );
  console.log(`set: ${changes.map(([k]) => k).join(", ")} — redeploy for it to take effect`);
}
