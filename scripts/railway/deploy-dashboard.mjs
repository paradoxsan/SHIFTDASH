/**
 * Put the dashboard on Railway, wired to GitHub so `git push` redeploys it.
 *
 * Everything here is idempotent: run it again after adding an env var, or after
 * a failed run, and it converges instead of creating a second project. It never
 * prints a secret value — only which keys were synced.
 *
 * Env:
 *   RAILWAY_TOKEN   account token from railway.com → Account Settings → Tokens
 *   REPO            owner/name to deploy from (default: paradoxsan/SHIFTDASH)
 *   PROJECT         Railway project name (default: shift-dash)
 *   ENV_FILE        which file supplies the variables (default: .env.local)
 *
 *   node scripts/railway/deploy-dashboard.mjs [--dry-run] [--no-vars]
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://backboard.railway.com/graphql/v2";

/** Reuse an existing `railway login` rather than making anyone paste a token
 *  into a chat window. Falls back to RAILWAY_TOKEN for CI. */
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
      const token = cfg?.user?.token ?? cfg?.token;
      if (token) return String(token);
    } catch {
      /* try the next location */
    }
  }
  return "";
}

const TOKEN = process.env.RAILWAY_TOKEN?.trim() || storedCliToken();
const REPO = process.env.REPO?.trim() || "paradoxsan/SHIFTDASH";
const PROJECT = process.env.PROJECT?.trim() || "shift-dash";
const ENV_FILE = process.env.ENV_FILE?.trim() || ".env.local";
const DRY = process.argv.includes("--dry-run");
const NO_VARS = process.argv.includes("--no-vars");

if (!TOKEN) {
  console.error("No Railway credential. Either:");
  console.error("  npx @railway/cli login        (opens a browser, nothing to paste)");
  console.error("  or set RAILWAY_TOKEN=…        (railway.com → Account Settings → Tokens)");
  process.exit(2);
}

/** Variables that must never leave this machine, or that Railway supplies itself. */
const SKIP = new Set([
  "VERCEL_OIDC_TOKEN", // Vercel-only, expires, meaningless here
  "PORT", // Railway injects it
  "NODE_ENV",
  "GOOGLE_SERVICE_ACCOUNT_FILE", // a local path; the JSON var is what travels
]);

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
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1);
    }
    if (!SKIP.has(m[1]) && v !== "") out[m[1]] = v;
  }
  return out;
}

const log = (...a) => console.log(...a);

// ── 1. who am I, and where can I put a project ───────────────────────────────
const me = await gql(`
  query { me { id email workspaces { id name } } }
`);
log(`account: ${me.me.email}`);
const workspace = me.me.workspaces?.[0];
if (!workspace) throw new Error("no workspace on this account");
log(`workspace: ${workspace.name} (${workspace.id})`);

// ── 2. find or create the project ────────────────────────────────────────────
const projects = await gql(`
  query {
    me {
      projects {
        edges { node { id name environments { edges { node { id name } } }
                       services { edges { node { id name } } } } }
      }
    }
  }
`);
let project = projects.me.projects.edges.map((e) => e.node).find((p) => p.name === PROJECT);

if (!project) {
  if (DRY) {
    log(`[dry-run] would create project "${PROJECT}"`);
    process.exit(0);
  }
  const created = await gql(
    `mutation ($input: ProjectCreateInput!) {
       projectCreate(input: $input) {
         id name environments { edges { node { id name } } } services { edges { node { id name } } }
       }
     }`,
    { input: { name: PROJECT, workspaceId: workspace.id } }
  );
  project = created.projectCreate;
  log(`created project ${project.name} (${project.id})`);
} else {
  log(`project exists: ${project.name} (${project.id})`);
}

const environment =
  project.environments.edges.map((e) => e.node).find((e) => e.name === "production") ??
  project.environments.edges[0]?.node;
if (!environment) throw new Error("project has no environment");
log(`environment: ${environment.name} (${environment.id})`);

// ── 3. find or create the web service, sourced from GitHub ───────────────────
let service = project.services.edges.map((e) => e.node).find((s) => s.name === "dashboard");
if (!service) {
  if (DRY) {
    log(`[dry-run] would create service "dashboard" from ${REPO}`);
  } else {
    const created = await gql(
      `mutation ($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`,
      {
        input: {
          projectId: project.id,
          name: "dashboard",
          // A repo source is what makes `git push` redeploy. It requires the
          // Railway GitHub App to have access to this repo — if this call fails
          // with a repo-not-found, authorise it once at railway.com and re-run.
          source: { repo: REPO },
          branch: "main",
        },
      }
    );
    service = created.serviceCreate;
    log(`created service ${service.name} (${service.id}) from ${REPO}`);
  }
} else {
  log(`service exists: ${service.name} (${service.id})`);
}
if (!service) process.exit(0); // dry-run stops here

// ── 4. push the environment variables ────────────────────────────────────────
const vars = readEnvFile(ENV_FILE);
if (NO_VARS) {
  log("skipping variables (--no-vars)");
} else if (Object.keys(vars).length === 0) {
  log(`no variables found in ${ENV_FILE}`);
} else {
  log(`syncing ${Object.keys(vars).length} variables: ${Object.keys(vars).sort().join(", ")}`);
  if (!DRY) {
    await gql(
      `mutation ($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`,
      {
        input: {
          projectId: project.id,
          environmentId: environment.id,
          serviceId: service.id,
          variables: vars,
        },
      }
    );
    log("variables synced");
  }
}

// ── 5. make sure it has a public URL ─────────────────────────────────────────
const domains = await gql(
  `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
     domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
       serviceDomains { domain } customDomains { domain }
     }
   }`,
  { projectId: project.id, environmentId: environment.id, serviceId: service.id }
);
let domain = domains.domains.serviceDomains?.[0]?.domain;
if (!domain && !DRY) {
  const created = await gql(
    `mutation ($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
    { input: { environmentId: environment.id, serviceId: service.id, targetPort: 3000 } }
  );
  domain = created.serviceDomainCreate.domain;
  log(`created domain ${domain}`);
} else if (domain) {
  log(`domain: ${domain}`);
}

if (domain) {
  log("");
  log(`URL: https://${domain}`);
  log("");
  log("Two things this script cannot do for you:");
  log(`  1. Google login will fail until you add the new redirect URI in Google Cloud`);
  log(`     Console → Credentials → the OAuth client:`);
  log(`       https://${domain}/api/auth/google/callback`);
  log(`  2. Set AUTH_BASE_URL=https://${domain} so the app stops trusting the Host header.`);
}
