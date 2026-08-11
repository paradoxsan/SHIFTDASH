// Follow-up re-engagement for leads that went quiet.
//
// Two stages, strictly sequential: נועה nudges once after ~3h of silence, then
// once more ~24h later. A customer reply, a human takeover, or a completed order
// cancels whatever is pending.
//
// Same rules as lib/bot/callback-time.mjs and for the same reason: no date math
// ever reaches the model, and the bot is not allowed to message at 02:00 or on
// Shabbat. The window table (MSG_HOURS) is shared, not re-declared, so there is
// exactly one place where "when may the bot speak" is defined.
//
// Plain .mjs on purpose: n8n/scratch/apply-followups.mjs reads this file verbatim
// and inlines it into the live Code nodes (stripping `export`/`import` lines), so
// the bot and the unit tests run the same bytes. Edit the module, never the node.

import { MSG_HOURS, partsOf, fromWallClock, nextOpen } from "./callback-time.mjs";

const FLOOR_MINUTES = 2; // never schedule inside the current poller tick

/** Is `date` inside one of the day's open windows? */
function isOpen(date, hours) {
  const p = partsOf(date);
  const win = hours[p.dow];
  return !!win && p.mins >= win[0] && p.mins <= win[1];
}

/**
 * When should the nudge for a message sent at `anchorAt` actually go out?
 * `dueAt` is the honest target; `fireAt` is that target pushed into the next
 * moment the bot is allowed to speak. A 3h nudge on a Friday 14:00 reply lands
 * Sunday morning, not Saturday.
 *
 * @returns {{ok: boolean, reason?: string, dueAt?: Date, fireAt?: Date, deferred?: boolean}}
 */
export function resolveFollowup(anchorAt, hoursAfter, now = new Date(), hours = MSG_HOURS) {
  const anchor = anchorAt instanceof Date ? anchorAt : new Date(anchorAt);
  if (Number.isNaN(anchor.getTime())) return { ok: false, reason: "bad_anchor" };
  const h = Number(hoursAfter);
  if (!Number.isFinite(h) || h <= 0) return { ok: false, reason: "bad_interval" };

  const due = new Date(anchor.getTime() + h * 3600000);

  let fire = due;
  let deferred = false;
  if (!isOpen(fire, hours)) {
    const open = nextOpen(fire, hours);
    if (!open) return { ok: false, reason: "no_window" };
    fire = open;
    deferred = true;
  }

  // A backlogged nudge must not jump the fence on its way out: flooring an
  // overdue item to "now" can land it after closing time (a 12:58 Friday target
  // resolved at 14:00 would fire at 14:02, on Shabbat), so re-clamp afterwards.
  const floor = new Date(now.getTime() + FLOOR_MINUTES * 60000);
  if (fire.getTime() < floor.getTime()) {
    fire = floor;
    if (!isOpen(fire, hours)) {
      const open = nextOpen(fire, hours);
      if (!open) return { ok: false, reason: "no_window" };
      fire = open;
      deferred = true;
    }
  }

  return { ok: true, dueAt: due, fireAt: fire, deferred };
}

/**
 * Did the customer say some version of "let me think about it"?
 * Deliberately a plain substring match over a config-driven word list rather than
 * a machine tag from the model — an LLM asked to emit a tag "when relevant" skips
 * it roughly a third of the time, and this decides whether a real customer gets
 * messaged.
 */
export function detectThink(text, words) {
  const s = String(text ?? "");
  if (!s.trim()) return false;
  const list = (Array.isArray(words) ? words : String(words ?? "").split(","))
    .map((w) => String(w).trim())
    .filter(Boolean);
  return list.some((w) => s.includes(w));
}

/**
 * Is this WhatsApp profile name safe to greet a customer by?
 * Profile names are free text — real leads show up as "ga group", "🪬 ליאור 🪬",
 * shop names, or a phone number. Greeting one of those by name reads as broken,
 * so anything that is not plainly a Hebrew personal name is dropped in favour of
 * a clean nameless greeting.
 */
export function usableName(raw) {
  const s = String(raw ?? "").trim().replace(/[‎‏]/g, "");
  if (!s || s.length > 24) return "";
  if (/[A-Za-z0-9]/.test(s)) return "";           // latin/digits ⇒ handle, shop, or number
  if (!/[֐-׿]/.test(s)) return "";      // no Hebrew letter at all ⇒ emoji-only
  const letters = s.replace(/[^֐-׿\s'"־-]/g, "").trim();
  if (!letters) return "";
  return letters.replace(/\s{2,}/g, " ");
}

/** Fill {name} in a template; a nameless lead gets a clean greeting, not "היי {name}". */
export function renderFollowup(template, { name } = {}) {
  const t = String(template ?? "");
  const clean = usableName(name);
  if (clean) return t.replace(/\{name\}/g, clean);
  return t
    .replace(/\s*\{name\}\s*/g, " ")
    .replace(/\s+([,،.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The last gate before a real customer gets a real message.
 *
 * Pure and total on purpose: every reason a follow-up should NOT go out is one
 * branch here with a name, so the poller stays dumb wiring and the decisions are
 * unit-testable. Order matters — cheapest and most decisive checks first.
 *
 * `newest` is the last-mile WHAPI probe of the chat's newest message. It is the
 * only thing that can see the shop owner answering from his phone: those sends
 * are not recorded anywhere in Supabase, so a DB-only check would happily nudge
 * a customer he already closed by hand.
 *
 * @returns {{send: boolean, reason: string}}
 */
export function decideSend(ctx = {}) {
  const {
    enabled, paused, approved, anchorMsgId, newest,
    anchorAt, orderedAt, inWindow = true, stage,
  } = ctx;

  if (!enabled) return { send: false, reason: "disabled" };
  if (stage !== 1 && stage !== 2) return { send: false, reason: "bad_stage" };
  if (paused) return { send: false, reason: "human_takeover" };
  if (!approved) return { send: false, reason: "not_campaign" };

  if (orderedAt && anchorAt && new Date(orderedAt).getTime() >= new Date(anchorAt).getTime()) {
    return { send: false, reason: "already_ordered" };
  }

  // Outside MSG_HOURS is not a cancellation — the nudge is still wanted, later.
  if (!inWindow) return { send: false, reason: "outside_hours" };

  // Fail closed: if we cannot see the chat's current state, we do not speak into it.
  if (!newest || !newest.id) return { send: false, reason: "no_chat_state" };

  if (newest.id !== anchorMsgId) {
    if (!newest.from_me) return { send: false, reason: "customer_replied" };
    if (newest.source && newest.source !== "api") return { send: false, reason: "human_replied" };
    return { send: false, reason: "stale_anchor" };
  }

  return { send: true, reason: "ok" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contextual follow-ups.
//
// A canned "רק מוודאת שלא פספסתי אותך" is wasted on a lead whose actual blocker
// is one missing detail. So the nudge is written per conversation by the same
// Gemini the bot already runs on — but generation is never trusted blind:
// validateFollowupText() has to pass, or we fall back to the client-approved
// template. Worst case is a slightly generic message, never a broken one.
// ─────────────────────────────────────────────────────────────────────────────

/** Machine tags the agent emits for the pipeline. None of them may reach a customer. */
const MARKER_RE = /\[[A-Z_]{3,}\s*[:\]]/;

/**
 * Capabilities נועה does not have. She invented "לשריין לך את הסט" on a live lead
 * despite no reservation mechanism existing anywhere — there is no inventory hold,
 * so a customer told her set is reserved can arrive to find it sold.
 *
 * Defaults only; the caller passes the config list so the shop can extend it with
 * one UPDATE. Kept as substrings, not regex, so a non-engineer can edit it safely.
 */
export const DEFAULT_FORBIDDEN_CLAIMS = [
  "לשריין", "אשריין", "משוריין", "שריון", "שריינתי",
  "אשמור לך", "שומרת לך", "שמרתי לך",
  "מבטיחה", "אני מבטיח",
  "יש במלאי", "נשארו לנו", "המלאי אזל",
];

/**
 * First forbidden capability claim in `text`, or null.
 *
 * Negation-aware: "אני לא יכולה לשריין בעצמי, אבל אבקש מהמנהל" is the *correct*
 * answer, and a plain substring match rejects it for containing the very word it
 * is disclaiming. Only an un-negated occurrence counts as a claim.
 */
export function forbiddenClaim(text, patterns = DEFAULT_FORBIDDEN_CLAIMS) {
  const s = String(text ?? "");
  const list = (Array.isArray(patterns) ? patterns : String(patterns ?? "").split(","))
    .map((w) => String(w).trim())
    .filter(Boolean);

  for (const w of list) {
    let from = 0;
    for (;;) {
      const i = s.indexOf(w, from);
      if (i === -1) break;
      // A negator anywhere in the short run-up flips the meaning.
      if (!/(^|\s)(לא|אינני|איני|אסור|בלי)(\s|$)/.test(s.slice(Math.max(0, i - 22), i))) return w;
      from = i + w.length;
    }
  }
  return null;
}

/** Money-shaped numbers: 3+ digits, optionally comma-grouped. Ignores 16:30 and house numbers < 100. */
function moneyTokens(s) {
  const out = new Set();
  for (const m of String(s ?? "").matchAll(/\d[\d,]*\d|\d{3,}/g)) {
    const digits = m[0].replace(/,/g, "");
    if (digits.length >= 3) out.add(digits);
  }
  return out;
}

/**
 * The prompt for the follow-up writer. Deliberately narrow: it is shown the
 * conversation and asked for one line that continues it — it is NOT the sales
 * agent and must not re-open negotiation, quote, or promise anything new.
 */
export function buildFollowupPrompt({ history = [], stage = 1, trigger = "silence", name = "", hoursSilent = 3 } = {}) {
  const NL = String.fromCharCode(10);
  const transcript = history
    .map((m) => (m.role === "bot" ? "נועה: " : "לקוח: ") + String(m.text ?? "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 6)
    .slice(-12)
    .join(NL);

  const situation = trigger === "think"
    ? "הלקוח אמר שהוא צריך לחשוב / להתייעץ."
    : "הלקוח פשוט הפסיק להגיב באמצע השיחה.";

  const stageNote = stage === 2
    ? "זו תזכורת שנייה ואחרונה, אחרי כיממה. תני לו דרך יציאה מכובדת (\"ואם זה לא רלוונטי כרגע, גם בסדר גמור\")."
    : "זו התזכורת הראשונה, אחרי כמה שעות. קלילה וקצרה.";

  return [
    "את נועה, אשת המכירות של BRJewelry בוואטסאפ. את כותבת הודעת תזכורת אחת ללקוח ששתק.",
    "",
    "השיחה עד עכשיו:",
    transcript || "(אין היסטוריה)",
    "",
    `המצב: ${situation} עברו בערך ${hoursSilent} שעות. ${stageNote}`,
    name ? `שם הלקוח: ${name}` : "שם הלקוח לא ידוע — אל תמציאי שם.",
    "",
    "כללים מחייבים:",
    "1. הודעה אחת קצרה, עד 2 משפטים. וואטסאפ, לא מייל.",
    "2. תמשיכי בדיוק מהנקודה שבה השיחה נעצרה — אם חסר פרט שביקשת, בקשי אותו שוב ספציפית.",
    "3. אסור להציע מחיר, הנחה, מבצע או הטבה כלשהי שלא נאמרו כבר בשיחה למעלה.",
    "4. אסור להבטיח זמינות, תאריך או משלוח שלא סוכמו כבר.",
    "5. אין לך מערכת מלאי ואין לך יומן. את לא יכולה לשריין, לשמור או להחזיק פריט, ולא לאשר תור סופית. אל תכתבי 'אשריין לך', 'אשמור לך' או 'יש במלאי' — אם זה עולה, הנוסח הוא 'אבדוק עם נציג ואחזור אליך'.",
    "6. בלי לפתוח מחדש ('היי, אני נועה מ...') — הלקוח כבר מכיר אותך.",
    "7. בלי סוגריים מרובעים, בלי תגיות, בלי JSON, בלי אימוג'י מוגזם (אחד לכל היותר).",
    "8. אל תלחצי ואל תתנצלי יותר מדי.",
    "",
    "החזירי אך ורק את טקסט ההודעה עצמה, בלי מרכאות ובלי הסבר.",
  ].join(NL);
}

/**
 * Gate between the model and a real customer. Everything the output-quality
 * monitor exists to catch after the fact, refused here before the send.
 *
 * @returns {{ok: boolean, reason: string, text?: string}}
 */
export function validateFollowupText(raw, { history = [], finishReason = null, forbiddenClaims = DEFAULT_FORBIDDEN_CLAIMS } = {}) {
  // gemini-3.5-flash is a thinking model: its reasoning spends the output budget,
  // and a starved call returns a clean-looking half sentence ("היי, רק רציתי")
  // that passes every content check. Trust finishReason over appearances.
  if (finishReason && finishReason !== "STOP") return { ok: false, reason: "truncated:" + finishReason };

  let t = String(raw ?? "").trim();
  // Models like to wrap a one-liner in quotes or a fence despite being told not to.
  t = t.replace(/^```[a-z]*\s*|\s*```$/g, "").trim();
  t = t.replace(/^["'״”“]+|["'״”“]+$/g, "").trim();

  if (!t) return { ok: false, reason: "empty" };
  if (t.length > 320) return { ok: false, reason: "too_long" };
  if (MARKER_RE.test(t)) return { ok: false, reason: "machine_marker" };
  if (/^[[{]/.test(t) || /"\s*:\s*"/.test(t)) return { ok: false, reason: "looks_like_json" };
  if (!/[֐-׿]/.test(t)) return { ok: false, reason: "not_hebrew" };
  if ((t.match(/\?/g) || []).length > 2) return { ok: false, reason: "interrogation" };

  // Promising something the shop has no mechanism to honour. Worse than a wrong
  // price: the customer only finds out when they turn up and the set is gone.
  const claim = forbiddenClaim(t, forbiddenClaims);
  if (claim) return { ok: false, reason: "invented_capability:" + claim };

  // The expensive failure: inventing a price or a discount nobody authorised.
  const known = moneyTokens(history.map((m) => m.text).join(" "));
  for (const n of moneyTokens(t)) {
    if (!known.has(n)) return { ok: false, reason: "invented_number:" + n };
  }

  // Deliberately last, so the specific diagnoses above win the reason string.
  // This is the catch-all for a truncation finishReason did not report. Length
  // is the only honest signal — a cut-off Hebrew sentence still ends in a Hebrew
  // letter, so "does it end with punctuation" proves nothing. The truncations
  // seen in real calls were 13 and 17 chars; genuine nudges run 40+.
  if (t.length < 25) return { ok: false, reason: "too_short" };

  return { ok: true, reason: "ok", text: t };
}

/**
 * Contextual text if it passed the gate, else the client-approved template.
 * Always returns something sendable.
 */
export function pickFollowupText({ generated, template, name, history = [], finishReason = null, forbiddenClaims = DEFAULT_FORBIDDEN_CLAIMS }) {
  if (generated != null && String(generated).trim()) {
    const v = validateFollowupText(generated, { history, finishReason, forbiddenClaims });
    if (v.ok) return { text: v.text, source: "generated", reason: "ok" };
    return { text: renderFollowup(template, { name }), source: "template", reason: v.reason };
  }
  return { text: renderFollowup(template, { name }), source: "template", reason: "no_generation" };
}

/** One compact ops-group line per follow-up. Built without a single backslash: n8n
 *  double-escapes `\n` on a scripted PUT and silently ships a literal "\n". */
export function groupLine({ stage, trigger, name, phone }) {
  const NL = String.fromCharCode(10);
  const who = String(name ?? "").trim() || "לקוח";
  const why = trigger === "think" ? "אמר שהוא חושב על זה" : "לא הגיב";
  return [
    "🔔 נועה שלחה פולואפ " + (stage === 2 ? "שני (24 שעות)" : "ראשון (3 שעות)"),
    "👤 " + who,
    "📞 " + String(phone ?? "").replace(/\D/g, ""),
    "💬 " + why,
  ].join(NL);
}
