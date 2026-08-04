/**
 * Health probe for the Railway SDR instance.
 *
 * Written because "auth fixed" does not mean "feature fixed" — on BRJewelry a
 * broken credential masked a separate config bug for weeks, and on the GCloud
 * SDR a stale editor draft silently diverged from the published version. This
 * checks the things that actually went wrong, not just whether the server is up.
 *
 * Env: N8N_NEW_BASE, N8N_NEW_API_KEY, N8N_NEW_WORKFLOW_ID
 *      N8N_OWNER_EMAIL, N8N_OWNER_PASSWORD  (optional — enables the credential check)
 *
 *   node scripts/railway/verify-sdr.mjs
 */
const BASE = (process.env.N8N_NEW_BASE ?? "").replace(/\/+$/, "");
const API_KEY = process.env.N8N_NEW_API_KEY;
const WORKFLOW_ID = process.env.N8N_NEW_WORKFLOW_ID;
if (!BASE || !API_KEY || !WORKFLOW_ID) {
  console.error("missing env: N8N_NEW_BASE / N8N_NEW_API_KEY / N8N_NEW_WORKFLOW_ID");
  process.exit(2);
}

const results = [];
const ok = (name, detail = "") => results.push({ level: "OK", name, detail });
const warn = (name, detail = "") => results.push({ level: "WARN", name, detail });
const fail = (name, detail = "") => results.push({ level: "FAIL", name, detail });

const api = (path) => fetch(`${BASE}${path}`, { headers: { "X-N8N-API-KEY": API_KEY } });

// ── 1. server ─────────────────────────────────────────────────────────────────
try {
  const res = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => ({}));
  body?.status === "ok" ? ok("server healthz", BASE) : fail("server healthz", JSON.stringify(body));
} catch (err) {
  fail("server healthz", err.message);
}

// ── 2. workflow shape ─────────────────────────────────────────────────────────
let wf = null;
try {
  const res = await api(`/api/v1/workflows/${WORKFLOW_ID}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  wf = await res.json();
  ok("workflow reachable", `${wf.name} (${wf.nodes.length} nodes, active=${wf.active})`);

  wf.nodes.length === 102
    ? ok("node count", "102")
    : warn("node count", `${wf.nodes.length} (expected 102 — did someone edit it?)`);

  const names = new Set(wf.nodes.map((n) => n.name));
  const voice = ["Is Voice", "Download Voice", "Prep Audio", "Transcribe Voice", "Voice To Text", "Message Ready"];
  const missing = voice.filter((v) => !names.has(v));
  missing.length === 0
    ? ok("voice branch intact", "all 6 nodes present")
    : fail("voice branch", `missing: ${missing.join(", ")}`);

  const ctx = ["Lead Context Lookup", "Build Lead Context", "Bot Pause Guard"].filter((n) => !names.has(n));
  ctx.length === 0 ? ok("context engine intact") : fail("context engine", `missing: ${ctx.join(", ")}`);
} catch (err) {
  fail("workflow reachable", err.message);
}

// ── 3. the landmine: editor draft vs published version ────────────────────────
if (wf) {
  const draft = wf.nodes?.length ?? 0;
  const published = wf.activeVersion?.nodes?.length ?? null;
  if (published === null) {
    ok("draft/active divergence", "no separate published version yet (workflow not activated)");
  } else if (published === draft) {
    ok("draft/active divergence", `both ${draft} nodes`);
  } else {
    fail(
      "draft/active divergence",
      `draft ${draft} vs published ${published} — a Save in the UI would publish the stale draft`
    );
  }
}

// ── 4. credentials actually resolve ───────────────────────────────────────────
if (wf && process.env.N8N_OWNER_EMAIL && process.env.N8N_OWNER_PASSWORD) {
  try {
    const login = await fetch(`${BASE}/rest/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailOrLdapLoginId: process.env.N8N_OWNER_EMAIL,
        password: process.env.N8N_OWNER_PASSWORD,
      }),
    });
    const cookie = (login.headers.getSetCookie?.() ?? []).join("; ");
    const res = await fetch(`${BASE}/rest/credentials`, { headers: { cookie } });
    const existing = new Set(((await res.json()).data ?? []).map((c) => c.id));

    const dangling = new Map();
    for (const node of wf.nodes) {
      for (const [type, ref] of Object.entries(node.credentials ?? {})) {
        if (!existing.has(ref.id)) {
          const key = `${type} "${ref.name}"`;
          dangling.set(key, (dangling.get(key) ?? 0) + 1);
        }
      }
    }
    if (dangling.size === 0) {
      ok("credential references", "every node points at a credential that exists");
    } else {
      for (const [key, count] of dangling) {
        fail("dangling credential", `${key} — referenced by ${count} node(s); run remap-credentials.mjs`);
      }
    }
  } catch (err) {
    warn("credential references", `could not check: ${err.message}`);
  }
} else if (wf) {
  warn("credential references", "skipped (set N8N_OWNER_EMAIL / N8N_OWNER_PASSWORD to enable)");
}

// ── 5. executions — the Calendar failure mode that killed the GCloud instance ──
try {
  const res = await api(`/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=50`);
  const rows = (await res.json()).data ?? [];
  if (rows.length === 0) {
    ok("executions", "none yet (expected before activation)");
  } else {
    const errors = rows.filter((e) => e.status === "error");
    const pct = Math.round((errors.length / rows.length) * 100);
    if (errors.length === 0) ok("executions", `${rows.length} sampled, 0 errors`);
    else if (pct >= 50) fail("executions", `${errors.length}/${rows.length} failing (${pct}%)`);
    else warn("executions", `${errors.length}/${rows.length} failing (${pct}%)`);
  }
} catch (err) {
  warn("executions", err.message);
}

// ── report ────────────────────────────────────────────────────────────────────
const pad = (s) => s.padEnd(28);
console.log(`\nSDR on Railway — ${BASE}\n`);
for (const r of results) console.log(`  ${r.level.padEnd(5)} ${pad(r.name)} ${r.detail}`);

const fails = results.filter((r) => r.level === "FAIL").length;
const warns = results.filter((r) => r.level === "WARN").length;
console.log(`\n${results.length - fails - warns} ok / ${warns} warn / ${fails} fail`);
process.exit(fails > 0 ? 1 : 0);
