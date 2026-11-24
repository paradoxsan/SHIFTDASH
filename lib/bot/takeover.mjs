// Human takeover for the T-Center bot: what does a manual message from the
// business number mean for the bot?
//
// Same three-tier shape as BRJewelry (pause / quiet until tomorrow / hand back),
// but the triggers are NOT phrases the owner has to learn. They were mined from
// ~54k messages the owner actually sent customers (chat_messages, role=agent):
// he never writes a fixed "I'm done" line, so the "close" tier recognises the
// things he already writes when an order moves past the sale — "ההזמנה מוכנה",
// "מחר יהיה מוכן", "שוליח לינק לתשלום", "תודה מתקדם", the Google-review request,
// a hand-pasted EZcount link — and everything else he does (".", "בודק", a
// voice note, a sticker) is a sliding short pause.
//
//   handling → bot quiet for TAKEOVER_CONFIG.handlingMinutes, refreshed by every
//              owner message (he is mid-conversation)
//   close    → bot quiet until 00:00 Israel time (the order left the sales stage)
//   release  → bot back on now ("🤖" / "#בוט" in the chat, or "בוט" in the group)
//   ignore   → not a human (the bot's own api sends, deletes, customer messages)
//
// Plain .mjs on purpose, like followup.mjs: the n8n Code nodes inline this file
// verbatim (stripping `export`/`import` lines, and callback-time.mjs with it),
// so the live bot and the unit tests run the same bytes. Edit the module, never
// the node.

import { partsOf, fromWallClock } from "./callback-time.mjs";

export const TAKEOVER_CONFIG = {
  // The owner's own call (2026-08-07, V2.14.0): 2 h, renewed by every manual
  // message. Keep it at or under 125 min: "Rep: Stamp" (V2.40.0) treats a silence
  // that short as a rep window and lets the bot answer after 15 quiet minutes.
  handlingMinutes: 120,
  // Longer than this and it's narration (a long voice transcript, a forwarded
  // brief), not a status line — treat as handling, never as close.
  maxCloseWords: 40,
};

const HB = "(?<![\\u05D0-\\u05EA])"; // not preceded by a Hebrew letter
const HE = "(?![\\u05D0-\\u05EA])";  // not followed by a Hebrew letter
const rx = (s) => new RegExp(s);

const RELEASE = /^\s*(?:🤖+|#בוט)\s*$/u;
const PAYMENT_LINK = /ezcount\.co\.il/i;

// "זה לא מוכן", "עוד לא מוכן", "טרם שולם" — never a close.
const NEGATED = rx(`${HB}(?:לא|טרם)\\s+(?:\\S+\\s+){0,2}(?:מוכן|מוכנה|מוכנים|מוכנות|שולם|שולמה|שילם|שילמה|שילמת|שילמתם|נסגר|סגור|יצא)${HE}`);
// The owner quoting the customer ("הוא אמר ששולם") is not the owner declaring it.
const REPORTED = rx(`${HB}(?:אמר|אמרה|כתב|כתבה|טוען|טוענת|לדבריו|לדבריה|שואל|שואלת|מבקש|מבקשת)${HE}`);

/** [reason, pattern] — first match wins. Each pattern is backed by real owner messages. */
const CLOSE_RULES = [
  ["review_request", /ביקורת\s+בגוגל|תודה\s+(?:רבה\s+)?ש?קניתם/],
  ["order_status", rx(`${HB}ההזמנה\\s+(?:שלך\\s+|שלכם\\s+)?(?:מוכנה|מוכן|בהכנה|בייצור|בהדפסה|בטיפול|יצאה|נשלחה)${HE}`)],
  ["ready", /^\s*(?:\S+\s+){0,2}(?:מוכן|מוכנה|מוכנים|מוכנות)(?:\s+(?:אחי|אחותי|תודה))?\s*[.!]*\s*$/],
  ["ready_when", /(?:היום|מחר|עוד\s+(?:שעה|שעתיים|חצי\s+שעה|כמה\s+דקות)|עד\s+\d{1,2}(?:[.:]\d{2})?)\s+(?:זה\s+)?(?:יהיה|תהיה|יהיו)\s+(?:מוכן|מוכנה|מוכנים|מוכנות)/],
  ["preparing_for", /(?:מכין|אכין|מכינים|נכין)\s+(?:לך|לכם)\s+(?:להיום|למחר)/],
  ["pickup", /אפשר\s+(?:להגיע|לבוא|לאסוף)/],
  ["shipping", /השליח\s+(?:בדרך|יצא|אסף|אצלך)|(?:יצא|יצאה|נשלח|נשלחה)\s+(?:לך\s+)?ב?משלוח/],
  ["will_notify", rx(`${HB}(?:אודיע|נודיע|אעדכן|נעדכן)\\s+(?:לך|לכם|אותך|אותכם)${HE}|${HB}(?:תקבל|תקבלי|תקבלו)\\s+הודעה${HE}`)],
  ["in_production", /עובדים\s+על\s+ההזמנה|מטפל\s+בהזמנה|קיבלתי\s+את\s+ההזמנה/],
  ["payment_request", /(?:שוליח|שולח|שלחתי|שולחת|שלחנו|מוציא)\s+(?:לך\s+|לכם\s+)?(?:לינק|קישור)|(?:להעביר|תעביר|תעבירי|תעבירו)\s+(?:את\s+ה)?תשלום/],
  // Not "שילמת": the owner writes it mostly to ask or dispute ("איך שילמת", "כן אבל שילמת 385").
  ["paid", rx(`${HB}(?:שולם|שולמה)${HE}|התשלום\\s+(?:עבר|התקבל)|קיבלתי\\s+(?:את\\s+)?ה?תשלום`)],
  ["progress", /^\s*(?:תודה\s+)?(?:מתקדם|מתקדמים|מתקדמת)\s*[.!]*\s*$/],
  ["closed", /^\s*(?:סגור|סגורה|נסגר|נסגרה)(?:\s+(?:תודה|אחי))?\s*[.!]*\s*$/],
];

/** The text a human can read in this message (text, caption, edit, or a voice transcript). */
function bodyOf(m) {
  if (typeof m.transcript === "string" && m.transcript.trim()) return m.transcript;
  if (m.text && typeof m.text.body === "string") return m.text.body;
  if (m.action && m.action.type === "edit" && m.action.edited_content && typeof m.action.edited_content.body === "string") {
    return m.action.edited_content.body;
  }
  for (const k of ["image", "video", "document", "link_preview"]) {
    const v = m[k];
    if (v && typeof v === "object") {
      if (typeof v.caption === "string" && v.caption) return v.caption;
      if (typeof v.body === "string" && v.body) return v.body;
    }
  }
  return "";
}

/** Drop the sentences that are questions ("מה שלומך? ההזמנה מוכנה" keeps only the statement). */
function statementsOnly(text) {
  return text
    .split(/(?<=[?!.\n])/)
    .filter((s) => !/[?؟]\s*$/.test(s))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify one WHAPI message object from the business number.
 * Optional `m.transcript` lets the caller pass a voice-note transcription.
 * @returns {{kind: "ignore"|"release"|"close"|"handling", reason: string}}
 */
export function classifyOwnerMessage(m) {
  if (!m || typeof m !== "object") return { kind: "ignore", reason: "no_message" };
  if (m.from_me !== true) return { kind: "ignore", reason: "not_owner" };
  const source = String(m.source || "");
  if (source === "api") return { kind: "ignore", reason: "bot_send" };
  if (source === "system") return { kind: "ignore", reason: "system" };
  const actionType = m.action && m.action.type;
  if (m.type === "action" && (actionType === "delete" || actionType === "revoke")) {
    return { kind: "ignore", reason: "delete" };
  }

  const body = bodyOf(m).replace(/\s+/g, " ").trim();
  const url = (m.link_preview && m.link_preview.url) || "";

  if (RELEASE.test(body)) return { kind: "release", reason: "command" };
  if (PAYMENT_LINK.test(url) || PAYMENT_LINK.test(body)) return { kind: "close", reason: "payment_link" };

  if (body) {
    if (NEGATED.test(body)) return { kind: "handling", reason: "negated" };
    if (REPORTED.test(body)) return { kind: "handling", reason: "reported" };
    if (body.split(" ").length > TAKEOVER_CONFIG.maxCloseWords) return { kind: "handling", reason: "long" };
    const stmt = statementsOnly(body);
    if (stmt) {
      for (const [reason, re] of CLOSE_RULES) {
        if (re.test(stmt)) return { kind: "close", reason };
      }
    }
    return { kind: "handling", reason: "text" };
  }
  return { kind: "handling", reason: m.type === "action" ? String(actionType || "action") : String(m.type || "media") };
}

/** 00:00 Israel time after `now`. */
function nextMidnight(now) {
  const p = partsOf(now);
  return fromWallClock(p.y, p.m, p.d + 1, 0, 0);
}

/**
 * What to write to `human_mode` for this owner message.
 * `current` is the chat's existing row ({active, silenced_until}) if the caller
 * read it: a short pause never shortens a longer silence that is already running
 * (a sticker after "ההזמנה מוכנה" must not wake the bot in 90 minutes).
 * @param {any} m
 * @param {Date} [now]
 * @param {{active?: boolean, silenced_until?: string|null}|null} [current]
 * @returns {{action: "ignore"|"silence"|"release", kind: string, reason: string,
 *            row: {active: boolean, silenced_until: string} | null}}
 */
export function decideTakeover(m, now = new Date(), current = null) {
  const c = classifyOwnerMessage(m);
  if (c.kind === "ignore") return { action: "ignore", kind: c.kind, reason: c.reason, row: null };
  if (c.kind === "release") {
    return { action: "release", kind: c.kind, reason: c.reason, row: { active: false, silenced_until: now.toISOString() } };
  }
  let until = c.kind === "close"
    ? nextMidnight(now)
    : new Date(now.getTime() + TAKEOVER_CONFIG.handlingMinutes * 60000);
  if (current && current.active === true && current.silenced_until) {
    const existing = new Date(current.silenced_until);
    if (!Number.isNaN(existing.getTime()) && existing.getTime() > until.getTime()) until = existing;
  }
  return { action: "silence", kind: c.kind, reason: c.reason, row: { active: true, silenced_until: until.toISOString() } };
}

// ── Orders-group commands ────────────────────────────────────────────────────
// The owner replies to an alert card in the orders group with "בוט" (hand the
// chat back) or "שקט" (quiet until tomorrow). The customer never sees it.

// Longest alternatives first: a bare "בוט" would otherwise eat "בוט חזור" and leave "חזור" as junk.
const GROUP_RELEASE = /^\s*(?:החזר\s+בוט|תחזיר\s+בוט|בוט\s+חזור|בוט|🤖+)(?![א-ת])/u;
const GROUP_SILENCE = /^\s*(?:שקט|השתק|🔇|כבה\s+בוט|בוט\s+כבוי)(?![א-ת])/u;

function toChatId(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "972" + d.slice(1);
  return /^972\d{8,9}$/.test(d) ? `${d}@s.whatsapp.net` : null;
}

/**
 * @param {string} text        the owner's group message
 * @param {string} quotedText  the group message it replies to (an alert card), if any
 * @returns {{action: "release"|"close", chatId: string} | null}
 */
export function parseGroupCommand(text, quotedText) {
  const t = String(text || "").trim();
  let action = null;
  let rest = "";
  // Silence first, so "בוט כבוי" is not read as "בוט" + junk.
  const s = t.match(GROUP_SILENCE);
  const r = s ? null : t.match(GROUP_RELEASE);
  if (s) { action = "close"; rest = t.slice(s[0].length); }
  else if (r) { action = "release"; rest = t.slice(r[0].length); }
  if (!action) return null;

  rest = rest.trim();
  // The command must be the whole message, optionally followed by a phone number,
  // so "בוט עשה בלגן עם הלקוח" is chatter, not a command.
  if (rest && !/^\+?[\d\s-]{9,16}$/.test(rest)) return null;

  let chatId = rest ? toChatId(rest) : null;
  if (!chatId) {
    const q = String(quotedText || "");
    const m = q.match(/wa\.me\/(\d{10,15})/) || q.match(/\+?(972\d{8,9})/) || q.match(/(0\d{1,2}[-\s]?\d{3}[-\s]?\d{4})/);
    if (m) chatId = toChatId(m[1]);
  }
  return chatId ? { action, chatId } : null;
}
