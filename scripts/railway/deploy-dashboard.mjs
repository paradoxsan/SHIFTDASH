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
import { randomBytes } from "node:crypto";

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
      // `railway login` writes user.accessToken (short-lived, with a refresh
      // token beside it); older versions wrote user.token.
      const token = cfg?.user?.accessToken ?? cfg?.user?.token ?? cfg?.token;
      if (typeof token === "string" && token) return token;
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
  "NODE_ENV",
  "GOOGLE_SERVICE_ACCOUNT_FILE", // a local path; the JSON var is what travels
]);

/**
 * The port has to be pinned, not inherited. Railway injects PORT=8080 by
 * default while a service domain is created against a target port — leave them
 * to drift apart and the container runs perfectly on 8080 while every request
 * to the public URL returns "Application failed to respond". One number, set in
 * both places, in the same script.
 */
const PORT = 3000;

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

  // Locally the Google credential is usually a FILE path; there is no file on
  // Railway, so inline the key itself — otherwise every Sheets read (leads,
  // reminders) fails in production while working perfectly on this machine.
  const keyFile = (readFileSync(path, "utf8").match(/^GOOGLE_SERVICE_ACCOUNT_FILE=(.*)$/m)?.[1] ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!out.GOOGLE_SERVICE_ACCOUNT_JSON && keyFile && existsSync(keyFile)) {
    // Re-serialise so the multi-line PEM inside becomes one safe value.
    out.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(JSON.parse(readFileSync(keyFile, "utf8")));
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
// Scoped to the workspace on purpose: `me { projects }` comes back EMPTY for a
// personal workspace, so using it makes this script create a second project on
// every run instead of finding the one it made last time.
const projects = await gql(
  `query ($workspaceId: String!) {
     projects(workspaceId: $workspaceId, first: 100) {
       edges { node { id name environments { edges { node { id name } } }
                      services { edges { node { id name } } } } }
     }
   }`,
  { workspaceId: workspace.id }
);
const found = projects.projects.edges.map((e) => e.node).filter((p) => p.name === PROJECT);
if (found.length > 1) {
  console.error(
    `${found.length} projects are called "${PROJECT}": ${found.map((p) => p.id).join(", ")}.` +
      ` Delete the extras in the Railway dashboard, then re-run.`
  );
  process.exit(1);
}
let project = found[0];

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

// ── 4. work out the public URL first, so it can go into the variables ────────
const domains = await gql(
  `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
     domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
       serviceDomains { domain } customDomains { domain }
     }
   }`,
  { projectId: project.id, environmentId: environment.id, serviceId: service.id }
);
let domain =
  domains.domains.customDomains?.[0]?.domain ?? domains.domains.serviceDomains?.[0]?.domain;
if (!domain && !DRY) {
  const created = await gql(
    `mutation ($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
    { input: { environmentId: environment.id, serviceId: service.id, targetPort: PORT } }
  );
  domain = created.serviceDomainCreate.domain;
  log(`created domain ${domain}`);
} else if (domain) {
  log(`domain: ${domain}`);
}

// ── 5. push the environment variables ────────────────────────────────────────
const vars = readEnvFile(ENV_FILE);

// What is already up there. Read before writing so a re-run cannot rotate a
// generated secret and silently break whatever is using it.
const existing = DRY
  ? {}
  : (
      await gql(
        `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
           variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
         }`,
        { projectId: project.id, environmentId: environment.id, serviceId: service.id }
      )
    ).variables ?? {};

// Must match the domain's target port — see PORT above.
vars.PORT = String(PORT);

// Pin the origin instead of trusting the Host header, and give the monitoring
// cron a secret the first time (nothing calls it yet, so a fresh one is fine).
if (domain && !vars.AUTH_BASE_URL && !existing.AUTH_BASE_URL) {
  vars.AUTH_BASE_URL = `https://${domain}`;
}
if (!vars.CRON_SECRET && !existing.CRON_SECRET) {
  vars.CRON_SECRET = randomBytes(24).toString("base64url");
  log("generated a CRON_SECRET (kept on Railway only — nothing echoes it)");
}
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

// ── 6. what is left for a human ──────────────────────────────────────────────
if (domain) {
  log("");
  log(`URL: https://${domain}`);
  log("");
  log("The one thing this script cannot do for you: Google login will fail until");
  log("this redirect URI is registered in Google Cloud Console → Credentials →");
  log("the OAuth client used by the dashboard:");
  log(`  https://${domain}/api/auth/google/callback`);
}
