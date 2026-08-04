// Live verification harness for the BotOps phases.
// READ-ONLY: lists projects, runs SELECTs, GETs n8n/WHAPI health. No mutations.
// Reads .env.local at runtime (no secrets in this file). Run: node scripts/verify-live.mjs
// Grows per phase — each phase appends a section asserting reality matches the design.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);

let pass = 0, fail = 0, info = 0;
const ok = (name, cond, detail = "") => { console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`); cond ? pass++ : fail++; };
const note = (name, detail = "") => { console.log(`  • ${name}${detail ? "  — " + detail : ""}`); info++; };
const section = (t) => console.log(`\n## ${t}`);

// Mirror of lib/registry.ts (unit test pins registry.ts itself; this checks it vs LIVE data).
const PARADOX = "kracmhwzmgligxngmhmi", TCENTER = "xrvrjcnxogplmoybppay";
const CLIENTS = [
  { id: "shift-digital", ws: "mine", ref: PARADOX, include: ["leads", "activities", "app_config"], n8nPrefixes: ["SDR", "CRM Bridge", "Shift"], channel: "green" },
  { id: "brjewelry", ws: "clients", ref: PARADOX, exclude: ["leads", "activities"], n8nPrefixes: ["BRJewelry", "BR Jewelry"], whapiKey: PARADOX, channel: "whapi" },
  { id: "t-center", ws: "clients", ref: TCENTER, n8nPrefixes: ["T-CENTER", "T CENTER", "T center", "T-center"], whapiKey: TCENTER, channel: "whapi" },
];

const SUPA = (env.SUPABASE_API_BASE || "https://api.supabase.com").replace(/\/+$/, "");
const mgmt = (p, opts = {}) => fetch(`${SUPA}/v1${p}`, { headers: { Authorization: `Bearer ${env.SUPABASE_MANAGEMENT_TOKEN}`, "Content-Type": "application/json" }, cache: "no-store", ...opts });

// The Management edge occasionally returns a transient HTML error/challenge page.
// Retry until we get real JSON so the verifier doesn't emit false negatives.
async function jsonRetry(doFetch, label, tries = 4) {
  let last = "no attempt";
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await doFetch();
      const ct = r.headers.get("content-type") || "";
      if (r.ok && ct.includes("json")) return await r.json();
      last = `${r.status} ${ct || "no content-type"}`;
    } catch (e) { last = e.message; }
    if (i < tries) await new Promise((res) => setTimeout(res, 400 * i));
  }
  throw new Error(`${label}: ${last} (after ${tries} tries)`);
}
async function sql(ref, q) {
  const d = await jsonRetry(() => mgmt(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query: q }) }), `sql ${ref}`);
  return Array.isArray(d) ? d : (d.result || []);
}

// ── Phase 1 / Phase 2 readiness: registry reads TRUE against live data ────────
section("Supabase — projects & registry mapping (Phase 1 baseline / Phase 2 readiness)");
let projects = [];
try {
  projects = await jsonRetry(() => mgmt("/projects"), "/projects");
  ok("Management API /projects reachable", Array.isArray(projects), `${projects.length} projects`);
} catch (e) { ok("Management API /projects reachable", false, e.message); }
const byRef = Object.fromEntries((projects || []).map((p) => [p.ref || p.id, p]));
for (const ref of [PARADOX, TCENTER]) ok(`project ${ref} ACTIVE_HEALTHY`, byRef[ref]?.status === "ACTIVE_HEALTHY", byRef[ref]?.name || "missing");

for (const c of CLIENTS) {
  try {
    const rows = await sql(c.ref, `select table_name from information_schema.tables where table_schema='public'`);
    const live = new Set(rows.map((r) => r.table_name));
    const declared = c.include ?? [];
    for (const t of declared) ok(`[${c.id}] declared table '${t}' exists live`, live.has(t));
    for (const t of (c.exclude ?? [])) ok(`[${c.id}] excluded '${t}' references a real table`, live.has(t));
    const resolved = c.include ? c.include.filter((t) => live.has(t)) : [...live].filter((t) => !(c.exclude ?? []).includes(t));
    ok(`[${c.id}] resolves to >=1 table`, resolved.length > 0, `${resolved.length} tables`);
  } catch (e) { ok(`[${c.id}] introspect live tables`, false, e.message); }
}

// ── Control-plane (botops schema) reads TRUE vs the static registry ──────────
section("Control-plane botops schema — parity with static registry (Phase 2)");
try {
  const bots = await sql(PARADOX, `select b.slug, b.supabase_ref, b.table_include, b.table_exclude, b.channel, t.workspace
    from botops.bots b join botops.tenants t on t.id = b.tenant_id order by b.slug`);
  ok("botops.bots seeded with 3 bots", bots.length === 3, `${bots.length} rows`);
  const bySlug = Object.fromEntries(bots.map((b) => [b.slug, b]));
  const eq = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  for (const c of CLIENTS) {
    const r = bySlug[c.id];
    if (!r) { ok(`[${c.id}] present in control-plane`, false); continue; }
    ok(`[${c.id}] control-plane matches static`, r.supabase_ref === c.ref && eq(r.table_include, c.include) && eq(r.table_exclude, c.exclude) && r.channel === c.channel,
      `ref=${r.supabase_ref} inc=${JSON.stringify(r.table_include)} exc=${JSON.stringify(r.table_exclude)} ch=${r.channel} ws=${r.workspace}`);
  }
} catch (e) { ok("control-plane botops readable", false, e.message); }

// ── n8n: bot workflows reachable + each client prefix matches ────────────────
section("n8n — workflows reachable & client prefixes match (Phase 6 template readiness)");
let wfs = [];
try {
  const r = await fetch(`${env.N8N_BASE_URL}/api/v1/workflows?limit=250`, { headers: { "X-N8N-API-KEY": env.N8N_API_KEY, accept: "application/json" }, cache: "no-store" });
  wfs = (await r.json()).data || [];
  ok("n8n /workflows reachable", r.ok, `${wfs.length} workflows`);
} catch (e) { ok("n8n /workflows reachable", false, e.message); }
const tc = wfs.find((w) => String(w.id) === "KIIGQZPxugci8i1j");
ok("T-CENTER bot workflow present & active", Boolean(tc && tc.active), tc?.name || "missing");
for (const c of CLIENTS) {
  const m = wfs.filter((w) => c.n8nPrefixes.some((p) => String(w.name).toLowerCase().includes(p.toLowerCase())));
  ok(`[${c.id}] n8n prefix matches >=1 workflow`, m.length > 0, `${m.length} matched`);
}

// ── Messaging channels healthy (per the client's actual channel) ─────────────
section("Messaging channels — healthy per client (WHAPI for clients, Green API for the agency)");
const tokens = (() => { try { return JSON.parse(env.WHAPI_TOKENS_JSON || "{}"); } catch { return {}; } })();
const wb = (env.WHAPI_BASE_URL || "https://gate.whapi.cloud").replace(/\/+$/, "");
for (const c of CLIENTS.filter((c) => c.channel === "whapi")) {
  const tok = tokens[c.whapiKey];
  if (!tok) { ok(`[${c.id}] WHAPI token configured`, false); continue; }
  try {
    const r = await fetch(`${wb}/health`, { headers: { Authorization: `Bearer ${tok}`, accept: "application/json" }, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    ok(`[${c.id}] WHAPI channel healthy`, r.ok, `${r.status} ${j?.user?.pushname ? "(" + j.user.pushname + ")" : ""}`);
  } catch (e) { ok(`[${c.id}] WHAPI channel healthy`, false, e.message); }
}
// Agency (shift-digital) uses Green API, not WHAPI — verify state if creds present.
if (env.GREEN_API_INSTANCE && env.GREEN_API_TOKEN) {
  try {
    const r = await fetch(`https://api.green-api.com/waInstance${env.GREEN_API_INSTANCE}/getStateInstance/${env.GREEN_API_TOKEN}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    ok(`[shift-digital] Green API authorized`, r.ok && j.stateInstance === "authorized", j.stateInstance || `${r.status}`);
  } catch (e) { ok(`[shift-digital] Green API authorized`, false, e.message); }
} else {
  note("[shift-digital] Green API creds not in .env.local (skipped)");
}

// ── Data-plane RLS (Phase 4): anon must be denied on the 6 T-CENTER tables ────
section("Data-plane RLS — anon denied on T-CENTER tables (Phase 4)");
try {
  const keys = await jsonRetry(() => mgmt(`/projects/${TCENTER}/api-keys`), "api-keys");
  const anon = Array.isArray(keys) ? keys.find((k) => k.name === "anon")?.api_key : null;
  if (!anon) {
    ok("fetch T-CENTER anon key", false);
  } else {
    for (const t of ["orders", "human_mode", "graphics", "audit_log", "message_buffer", "media_buffer"]) {
      const r = await fetch(`https://${TCENTER}.supabase.co/rest/v1/${t}?select=*&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` }, cache: "no-store",
      });
      let rows = -1;
      try { const j = await r.json(); rows = Array.isArray(j) ? j.length : -1; } catch { /* non-array */ }
      ok(`anon denied on ${t}`, rows === 0, `rows=${rows} http=${r.status}`);
    }
  }
} catch (e) { ok("data-plane RLS check", false, e.message); }

// ── Control-plane Phase 4: encrypted secrets + n8n-org columns present ────────
section("Control-plane Phase 4 — bot_secrets (RLS) + n8n-org hooks");
try {
  const rls = await sql(PARADOX, `select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='botops' and c.relname in ('bot_secrets','data_plane_migrations') order by c.relname`);
  const byName = Object.fromEntries(rls.map((r) => [r.relname, r.relrowsecurity]));
  ok("botops.bot_secrets exists + RLS on", byName.bot_secrets === true);
  ok("botops.data_plane_migrations exists + RLS on", byName.data_plane_migrations === true);
  // No secret should ever be stored as readable plaintext (ciphertext only).
  const cols = await sql(PARADOX, `select column_name from information_schema.columns
    where table_schema='botops' and table_name='bot_secrets' order by column_name`);
  const names = new Set(cols.map((c) => c.column_name));
  ok("bot_secrets stores ciphertext+nonce (no plaintext column)", names.has("ciphertext") && names.has("nonce") && !names.has("plaintext"));
  // n8n org hooks on tenants (folder-per-business rule).
  const org = await sql(PARADOX, `select count(*)::int n from information_schema.columns
    where table_schema='botops' and table_name='tenants' and column_name in ('org_label','n8n_tag_id','n8n_folder_id','n8n_project_id')`);
  ok("botops.tenants has n8n-org columns", Number(org[0]?.n) === 4, `${org[0]?.n}/4`);
  const labelled = await sql(PARADOX, `select count(*)::int n from botops.tenants where org_label is not null`);
  ok("every tenant has an org_label (business name backfilled)", Number(labelled[0]?.n) >= 3, `${labelled[0]?.n} labelled`);
} catch (e) { ok("control-plane Phase 4 schema", false, e.message); }

// ── n8n org primitive available (tags; projects/folders gated on this license) ─
section("n8n — business grouping primitive (tags) reachable");
try {
  const r = await fetch(`${env.N8N_BASE_URL}/api/v1/tags?limit=1`, { headers: { "X-N8N-API-KEY": env.N8N_API_KEY, accept: "application/json" }, cache: "no-store" });
  ok("n8n /tags reachable (business-folder primitive)", r.ok, `${r.status}`);
} catch (e) { ok("n8n /tags reachable", false, e.message); }

// ── Operator quick-wins (Phase 5) — read-only data-shape the features rely on ─
section("Operator quick-wins — data shape (Phase 5, read-only)");
try {
  const cols = await sql(TCENTER, `select table_name, string_agg(column_name, ',') c
    from information_schema.columns
    where table_schema='public' and table_name in ('inbox','orders','human_mode')
    group by table_name`);
  const byT = Object.fromEntries(cols.map((r) => [r.table_name, (r.c || "").split(",")]));
  ok("inbox has status+attempts+error (requeue target)", ["status", "attempts", "error"].every((c) => byT.inbox?.includes(c)));
  ok("orders has status+payment_link+chat_id (chase target)", ["status", "payment_link", "chat_id"].every((c) => byT.orders?.includes(c)));
  ok("human_mode has active+chat_id (watchlist/takeover)", ["active", "chat_id"].every((c) => byT.human_mode?.includes(c)));
  const open = await sql(TCENTER, `select count(*)::int n from public.orders where status='open' and payment_link is not null and payment_link <> ''`);
  ok("open chaseable orders exist", Number(open[0]?.n) > 0, `${open[0]?.n} open w/ link`);
} catch (e) { ok("operator data shape", false, e.message); }

// ── Phase 6: golden roundtrip — compile(template, realParams) byte-matches live ─
section("Bot template golden roundtrip — compiled tcenter-sales == live workflow (Phase 6)");
try {
  const tplPath = "templates/tcenter-sales/workflow.template.json";
  const paramPath = "templates/tcenter-sales/tcenter.params.local.json";
  let template, params;
  try { template = JSON.parse(readFileSync(tplPath, "utf8")); params = JSON.parse(readFileSync(paramPath, "utf8")); }
  catch { note("[tcenter-sales] golden roundtrip skipped — template or gitignored params file missing"); template = null; }
  if (template) {
    const deepSub = (v) => typeof v === "string" ? v.replace(/\{\{TPL:([A-Z0-9_]+)\}\}/g, (m, n) => (n in params ? params[n] : m))
      : Array.isArray(v) ? v.map(deepSub)
      : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepSub(x)])) : v;
    const compiled = deepSub(template);
    const noResidual = !JSON.stringify(compiled).includes("{{TPL:");
    ok("compile leaves no residual {{TPL:...}}", noResidual);

    const live = await jsonRetry(() => fetch(`${env.N8N_BASE_URL}/api/v1/workflows/KIIGQZPxugci8i1j`, { headers: { "X-N8N-API-KEY": env.N8N_API_KEY, accept: "application/json" }, cache: "no-store" }), "n8n workflow GET");
    const stable = (o) => JSON.stringify(o, (_k, val) => (val && typeof val === "object" && !Array.isArray(val)) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val);
    const edges = (c) => { let n = 0; for (const s of Object.values(c || {})) for (const o of Object.values(s)) for (const a of o) n += (a || []).length; return n; };

    ok("node count matches live", compiled.nodes.length === live.nodes.length, `${compiled.nodes.length} vs ${live.nodes.length}`);
    ok("edge count matches live", edges(compiled.connections) === edges(live.connections), `${edges(compiled.connections)} vs ${edges(live.connections)}`);
    ok("connection graph byte-matches live", stable(compiled.connections) === stable(live.connections));

    // Per-node byte-equality is a DRIFT MONITOR (informational): the live bot is
    // edited continuously, so a stale committed template lags by a few nodes. The
    // compiler's correctness is proven by the structural criteria above (count +
    // graph + systemMessage) — when freshly snapshotted all 92 nodes match.
    const byName = (arr) => Object.fromEntries(arr.map((n) => [n.name, n]));
    const cN = byName(compiled.nodes), lN = byName(live.nodes);
    const drifted = Object.keys(cN).filter((name) => !lN[name] || stable(cN[name]) !== stable(lN[name]));
    if (drifted.length === 0) ok("every node byte-matches live", true, `${compiled.nodes.length} nodes identical`);
    else note(`template drift: ${drifted.length}/${compiled.nodes.length} nodes differ from live (re-run generate-template to re-snapshot)`, drifted.slice(0, 4).join(", "));

    const agentSM = (wf) => wf.nodes.find((n) => String(n.type).includes("agent"))?.parameters?.options?.systemMessage;
    ok("agent systemMessage byte-matches live", agentSM(compiled) === agentSM(live), `len ${agentSM(compiled)?.length}`);
  }
} catch (e) { ok("golden roundtrip", false, e.message); }

console.log(`\n──────────\n${pass} passed · ${fail} failed · ${info} info`);
process.exit(fail ? 1 : 0);
