#!/usr/bin/env node
// Deploys the "we have no movement shirts" fix to the live T-CENTER bot.
//   1. Adds a rule to the sales agent's system prompt (lowers the odds of a false yes).
//   2. Inlines lib/bot/product-scope.mjs into the "Parse Order" Code node, so a
//      reply that still says yes is replaced before it reaches the customer.
// Safe to re-run: both edits sit between markers and are replaced, never stacked.
//
//   node scripts/tcenter/fix-movement-shirts.mjs --dry-run          # show what would change
//   node scripts/tcenter/fix-movement-shirts.mjs                    # snapshot live, then PUT
//   node scripts/tcenter/fix-movement-shirts.mjs --rollback <file>  # PUT a snapshot back
//
// Reads N8N_BASE_URL / N8N_API_KEY from the environment or .env.local.
// Follows the lib/n8n-admin.ts rules: connections pass through verbatim, and
// settings are cleaned down to what the public PUT accepts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_ID = "KIIGQZPxugci8i1j";
const AGENT = "T-CENTER Sales Agent";
const PARSE = "Parse Order";

export const PROMPT_START = "### V2.9.5 — מוצרים שאין לנו (כלל מחייב)";
export const PROMPT_END = "### סוף V2.9.5";
export const PROMPT_RULE = [
  PROMPT_START,
  '- אין לנו חולצות תנועה. לא של בני עקיבא, הצופים, השומר הצעיר, עזרא, אריאל, הנוער העובד והלומד, בני המושבים, בית"ר או כל תנועת נוער אחרת. אנחנו לא מייצרים, לא מספקים ולא מוכרים חולצות תנועה.',
  '- לקוח ששואל על חולצת תנועה, או שולח תמונה של חולצת תנועה (למשל חולצה לבנה עם שרוכים וסמל של תנועה) — עונים מיד ובכנות: "לצערנו אין לנו חולצות תנועה". רק אחרי זה, ואם זה מתאים ללקוח, מציעים חולצת טריקו כותנה או דרייפיט רגילה עם הדפסה.',
  "- לעולם לא עונים \"כן\" על מוצר, דגם או שירות שלא מופיע במפורש בהנחיות האלה. אם לא בטוח שיש — כותבים ללקוח שבודקים עם הצוות וחוזרים אליו, ומוסיפים [ESCALATE: לקוח שאל על <המוצר>].",
  '- כשלקוח כותב "לא הבנת" — קוראים שוב מה הוא ביקש ועונים בדיוק על השאלה שלו.',
  PROMPT_END,
].join("\n");

export const GUARD_START = "// ── V2.9.5 movement-shirt guard";
const GUARD_END = "// ── end V2.9.5 movement-shirt guard ──";
const ANCHOR = "\nreturn [{ json: {";
// Names the guard block relies on. If the live node was rewritten and these
// are gone, inserting blind would break every reply — stop instead.
const REQUIRED = ["const src = $('Bot Allowed?').item.json", "let summary", "isOrder", "total"];

/** lib/bot/product-scope.mjs as a self-contained block for the Code node. */
export function guardBlock(source) {
  const body = String(source).replace(/^export\s+/gm, "");
  return [
    `${GUARD_START} (source: lib/bot/product-scope.mjs — update by re-running scripts/tcenter/fix-movement-shirts.mjs) ──`,
    "{",
    "const __ps = (() => {",
    body.trim(),
    "return { movementShirtGuard };",
    "})();",
    "const _ps = __ps.movementShirtGuard({ incoming: src.mergedText, reply: summary });",
    "// Never pair the honest answer with a payment link for the wrong product.",
    "if (_ps.override) { summary = _ps.text; isOrder = false; total = 0; }",
    "}",
    GUARD_END,
  ].join("\n");
}

function replaceBetween(text, start, end, replacement) {
  const i = text.indexOf(start);
  const j = text.indexOf(end, i);
  if (i === -1 || j === -1) return null;
  return text.slice(0, i) + replacement + text.slice(j + end.length);
}

function patchParseOrder(code, block) {
  const updated = replaceBetween(code, GUARD_START, GUARD_END, block);
  if (updated !== null) return updated;
  const missing = REQUIRED.filter((s) => !code.includes(s));
  const at = code.lastIndexOf(ANCHOR);
  if (at === -1 || missing.length) {
    throw new Error(`${PARSE}: anchor not found (${at === -1 ? "final return" : missing.join(", ")}) — the node changed; patch by hand`);
  }
  return code.slice(0, at) + "\n" + block + code.slice(at);
}

function patchPrompt(prompt) {
  const updated = replaceBetween(prompt, PROMPT_START, PROMPT_END, PROMPT_RULE);
  return updated !== null ? updated : prompt.replace(/\s*$/, "") + "\n\n" + PROMPT_RULE;
}

/** Pure: returns a patched copy. Only the two target nodes change. */
export function patchWorkflow(wf, { guardSource } = {}) {
  const source = guardSource ?? readFileSync(join(ROOT, "lib", "bot", "product-scope.mjs"), "utf8");
  const out = structuredClone(wf);
  const agent = out.nodes.find((n) => n.name === AGENT);
  const parse = out.nodes.find((n) => n.name === PARSE);
  if (!agent?.parameters?.options || typeof agent.parameters.options.systemMessage !== "string") {
    throw new Error(`${AGENT}: systemMessage not found`);
  }
  if (!parse || typeof parse.parameters?.jsCode !== "string") throw new Error(`${PARSE}: jsCode not found`);
  agent.parameters.options.systemMessage = patchPrompt(agent.parameters.options.systemMessage);
  parse.parameters.jsCode = patchParseOrder(parse.parameters.jsCode, guardBlock(source));
  return out;
}

// ── live deploy ───────────────────────────────────────────────────────────────
function loadEnv() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const ALLOWED_SETTINGS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions",
  "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
function toPutBody(wf) {
  const settings = Object.fromEntries(ALLOWED_SETTINGS.filter((k) => k in (wf.settings ?? {})).map((k) => [k, wf.settings[k]]));
  if (!settings.executionOrder) settings.executionOrder = "v1";
  return { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };
}

async function n8n(method, body) {
  const base = String(process.env.N8N_BASE_URL ?? "").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, {
    method,
    headers: { "X-N8N-API-KEY": process.env.N8N_API_KEY, accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`n8n ${method} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  loadEnv();
  if (!process.env.N8N_BASE_URL || !process.env.N8N_API_KEY) {
    console.error("חסר N8N_BASE_URL / N8N_API_KEY (בסביבה או ב-.env.local)");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rollbackAt = args.indexOf("--rollback");

  if (rollbackAt !== -1) {
    const snapshot = JSON.parse(readFileSync(args[rollbackAt + 1], "utf8"));
    await n8n("PUT", toPutBody(snapshot));
    console.log("✅ שוחזר מהגיבוי", args[rollbackAt + 1]);
    return;
  }

  const live = await n8n("GET");
  const next = patchWorkflow(live);
  const sm = (wf) => wf.nodes.find((n) => n.name === AGENT).parameters.options.systemMessage;
  const js = (wf) => wf.nodes.find((n) => n.name === PARSE).parameters.jsCode;
  console.log(`${live.name} (${WORKFLOW_ID}) · active=${live.active}`);
  console.log(`  prompt:      ${sm(live).length} → ${sm(next).length} chars`);
  console.log(`  Parse Order: ${js(live).length} → ${js(next).length} chars`);
  if (sm(live) === sm(next) && js(live) === js(next)) {
    console.log("כבר מעודכן — אין מה לשנות.");
    return;
  }

  const dir = join(ROOT, "n8n", "backups"); // /n8n/ is gitignored
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(dir, `${WORKFLOW_ID}-${stamp}.json`);
  writeFileSync(backup, JSON.stringify(live, null, 2));
  if (dryRun) {
    writeFileSync(backup.replace(/\.json$/, ".patched.json"), JSON.stringify(next, null, 2));
    console.log("dry-run — לא נשלח. הגיבוי והגרסה המתוקנת נשמרו ב-", dir);
    return;
  }

  await n8n("PUT", toPutBody(next));
  const after = await n8n("GET");
  const ok = sm(after).includes(PROMPT_START) && js(after).includes(GUARD_START);
  console.log(ok ? "✅ התיקון עלה לבוט החי." : "⚠️ ה-PUT עבר אבל הסימונים לא נמצאו בגרסה החיה — לבדוק ידנית.");
  console.log("גיבוי לשחזור:", backup);
  console.log(`שחזור: node scripts/tcenter/fix-movement-shirts.mjs --rollback ${backup}`);
  console.log("שימו לב: scripts/verify-live.mjs ידווח ש-systemMessage שונה מהתבנית עד ה-snapshot הבא.");
  if (!ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  });
}
