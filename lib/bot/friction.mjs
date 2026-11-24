// Friction gate for the T-Center bot: stop arguing with customers.
//
// Built from what actually went wrong in 45 days of T-Center chats:
//   • The bot answered "קיבלנו את הפנייה 🙏 נציג יחזור אליך ברגעים הקרובים" ~840
//     times — and again after EVERY new customer message while they waited (~190
//     repeats). Half of those customers waited over an hour; ~150 never got a
//     human. "Moments" was a promise the shop could not keep.
//   • Customers who asked for a person sometimes got the next sales question.
//   • The bot re-asked a question it had just asked ("רובוט לא מפותח").
//   • Post-sale complaints ("יצאו לא טוב", "מתקלף") were answered by the bot.
//
// And the data said what does work: when Asi answered an upset customer, ~8 in
// 9 calmed down; when the bot answered, ~2 in 3 stayed upset. So the bot does
// not try to calm anyone. A request for a person, a complaint, a discount ask,
// "what's happening with my order", or real anger hands off at once: the bot
// says NOTHING to the customer, goes quiet in that chat, and the orders group
// gets an alert (and a reminder if nobody answers). Softer signals ("??",
// "לא הבנתי") only hand off when they pile up. The one exception is a sincere
// "זה בוט?": the bot never pretends to be a person, so it answers that in one
// honest line before handing over.
//
// Plain .mjs on purpose (see takeover.mjs): inlined verbatim into the n8n
// "Friction Gate" / "Repeat Guard" Code nodes. Edit the module, never the node.

export const FRICTION_CONFIG = {
  holdHours: 12,      // a pending handoff keeps the bot quiet this long if nobody answers
  recentMinutes: 120, // soft signals older than this don't add up
  recentUserTurns: 3, // ...and only the customer's last few messages count
  loopMinutes: 60,    // the same bot line twice within this window = a loop
  reminderMinutes: 15, // nobody answered an alert this long → remind the group once
};

/** The only line the bot sends on a handoff — and only when asked if it's a bot. */
export const HONEST_BOT_LINE = "כן, זה הבוט של טי-סנטר. העברתי את השיחה לאסי.";

const L = "\\u05D0-\\u05EA";
const HB = `(?<![${L}])`;
const HE = `(?![${L}])`;
const rx = (s) => new RegExp(s, "u");

// ── Cleaning ─────────────────────────────────────────────────────────────────

/** Remove the markers our own pipeline adds, so we judge only what the customer typed.
 *  The quoted-reply marker literally contains "בוט/הצוות" and would trip every rule. */
export function cleanCustomerText(raw) {
  return String(raw == null ? "" : raw)
    .replace(/\[הלקוח השיב על הודעה קודמת מ-[^:\]]*:\s*"[\s\S]*?"\]/g, " ")
    .replace(/\[המערכת:[^\]]*\]/g, " ")
    .replace(/\[הקלטה קולית[^\]]*\]:?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Signals ──────────────────────────────────────────────────────────────────

const PERSON = `(?:ש|ל|ה|מ|ב)?(?:נציג(?:ה)?|בן\\s*אדם|בנאדם|אדם\\s+אמיתי|מישהו\\s+(?:אמיתי|מהצוות|אנושי)|מנהל(?:ת)?|אסי|הבעלים)${HE}`;
const ASK = `${HB}(?:אפשר|רוצה|רוצים|מבקש|מבקשת|אשמח|תעביר|תעבירו|תעבירי|העבר|צריך|צריכה|יש|למענה|תביא|תביאו|תשלח|תשלחו|תן|תני)${HE}`;
// "שנציג שלכם יחזור אליי", "האם נציג ידבר איתי?", "מתי יגיע רק נציג" — the person
// next to a future-tense "will get back / answer / call".
const COMES_BACK = "(?:יחזור|יחזרו|יתקשר|יתקשרו|יענה|יענו|ידבר|יגיע|יאשר)";
const WANTS_HUMAN = [
  rx(`${ASK}.{0,25}${HB}${PERSON}`),
  rx(`${HB}${PERSON}.{0,15}${HB}${COMES_BACK}${HE}`),
  rx(`${HB}${COMES_BACK}${HE}\\s+(?:רק\\s+|כבר\\s+)?${HB}${PERSON}`),
  /^\s*(?:נציג(?:\s+(?:שירות|אנושי|אמיתי))?|בן אדם|בנאדם)\s*[?!.]*\s*$/u,
  rx(`${HB}(?:אפשר|תוכל|תוכלו|יכול|יכולה|יכולים|רוצה|מבקש|מבקשת|אשמח)${HE}.{0,15}(?:להתקשר|לדבר\\s+בטלפון|שיחה\\s+טלפונית|לענות\\s+לטלפון|תתקשרו|שתתקשר|שיתקשרו)`),
];

const COMPLAINT = [
  // "יש לי בעיה עם…", but not the conditional "אם יש בעיה עם השמות תגידו"
  /(?<!אם\s)(?:יש\s+לי|יש|קיימת|היתה|הייתה)\s+(?:בעיה|תקלה|טעות)\s+(?:עם|ב)/u,
  rx(`${HB}עם\\s+(?:בעיה|פגם)${HE}`),
  rx(`${HB}(?:פגום|פגומה|פגומים|מתקלף|מתקלפת|מתקלפים|התקלף|התקלפה|נקרע|נקרעה|דהה|דהו|דהוי|דהויה|דהויות)${HE}`),
  /(?:יצא|יצאו|יצאה)\s+(?:לא\s+טוב|עקום|עקומה|הפוך|מטושטש)/u,
  /לא\s+מה\s+ש(?:הזמנתי|ביקשתי|סיכמנו|אמרתם)/u,
  /(?:לבטל|ביטול)\s+(?:את\s+)?ה?הזמנה|החזר\s+כספי|רוצה\s+(?:את\s+)?הכסף|(?:איאלץ|נאלץ|אצטרך)\s+לבטל/u,
  rx(`${HB}(?:ו|ש)?חסר(?:ים|ות|ה)?\\s+(?:לי|לנו)${HE}`), // "וחסר לי קפוצ'ון"
  /(?:חויבתי|חייבתי|חייבו\s+אותי)\s+פעמיים|(?:תשלום|חיוב)\s+כפול/u,
];

// Real anger: always hands off. Word-bounded so "כובע טמבל" (a hat) and
// "אחראי" (contains the letters of a swear word) never fire.
const HARD = [
  rx(`${HB}(?:מטומטם|מטומטמת|אידיוט|אידיוטים|דביל|סתום|סתמי|תזדיין|זונה|אמק|חרא|זבל|מפגר|מפגרים)${HE}`),
  rx(`${HB}(?:מעצבן|מעצבנת|מעצבנים|נמאס|חפרת|תפסיק|תפסיקו|בושה|חוצפה|מזלזל|מזלזלים|הזוי|מורחים|מורח)${HE}|די\\s+כבר|עובר\\s+כל\\s+גבול|אין\\s+עם\\s+מי\\s+לדבר|מה\\s+הבעיה\\s+שלך|מה\\s+נסגר\\s+איתכם|לא\\s+נורמלי`),
];

// Things only Asi can answer. The bot used to recite the price list at discount
// asks and "it's being handled" at status asks — both ended in "אשמח לדבר עם אסי".
const DISCOUNT = rx(`${HB}(?:הנחה|הנחות|בהנחה)${HE}|יותר\\s+זול|תוריד(?:י|ו)?\\s+(?:לי\\s+)?(?:ב|את\\s+ה)?מחיר`);
// Status of an order that exists (the caller says so) — a lead asking how long
// production takes is still the bot's to answer.
const ORDER_STATUS = rx(`יש\\s+עדכון|מה\\s+(?:עם|קורה\\s+עם)\\s+ה?הזמנה|ההזמנה\\s+(?:שלי|שלנו)|מתי\\s+(?:זה\\s+|היא\\s+|הן\\s+|הם\\s+|ההזמנה\\s+)?(?:יהיה\\s+|תהיה\\s+|יהיו\\s+)?(?:מוכן|מוכנ)|^\\s*(?:זה\\s+)?(?:מוכן|מוכנה|מוכנים|מוכנות)\\s*\\?|מתי\\s+אפשר\\s+(?:לאסוף|לבוא|להגיע)`);
// The sincere question, not "רובוט לא מפותח" said in passing.
const ASKS_IF_BOT = rx(`(?:זה|אתה|את|האם\\s+(?:זה|אתה|את)|מדבר(?:ת)?\\s+עם)\\s*ה?(?:בוט|רובוט)\\s*\\?|(?:בן\\s+אדם|אנושי|אמיתי)\\s+או\\s+(?:בוט|צ'?אט|דיגיטלי|מחשב)|(?:דיגיטלי|בוט)\\s+או\\s+(?:אנושי|אמיתי|בן\\s+אדם)|זה\\s+נציג\\s+(?:אנושי|אמיתי)`);

// Soft: each is weight 1; they hand off only when they add up.
const SOFT = [
  ["bot_accusation", rx(`${HB}(?:בוט|הבוט|רובוט|רובוטית)${HE}|(?:מענה|הודעות?|תשובות?)\\s+אוטומטי(?:ות|ת)?|בינה\\s+מלאכותית|(?:אנושי|אמיתי|בן\\s+אדם)\\s+או\\s+(?:בוט|צ'?אט|דיגיטלי|מחשב)|(?:דיגיטלי|בוט)\\s+או\\s+(?:אנושי|אמיתי|בן\\s+אדם)|זה\\s+נציג\\s+(?:אנושי|אמיתי)`)],
  ["not_understood", rx(`${HB}(?:לא\\s+הבנת|אתה\\s+לא\\s+מבין|את\\s+לא\\s+מבינה|לא\\s+שאלתי|לא\\s+ביקשתי|לא\\s+על\\s+זה)${HE}|זה\\s+לא\\s+מה\\s+ש`)],
  ["confused", rx(`${HB}(?:לא\\s+הבנתי|לא\\s+מבין|לא\\s+מבינה|מה\\s+הכוונה)${HE}`)],
  ["repeat_myself", rx(`${HB}(?:כבר\\s+(?:אמרתי|כתבתי|שלחתי|עניתי)|אמרתי\\s+לך|כתבתי\\s+לך|כמה\\s+פעמים|שואלים\\s+שוב|שוב\\s+את\\s+אותה)${HE}`)],
  ["only_marks", /^\s*(?:מה|הלו|נו)?\s*[?!؟]{2,}\s*$/u],
  ["waiting", rx(`(?:מחכה\\s+לתשובה|עדיין\\s+מחכה|אף\\s+אחד\\s+לא\\s+עונה|למה\\s+(?:לא\\s+עונים|אף\\s+אחד)|לא\\s+עונים\\s+לי|${HB}(?:צריכה|צריך|חייבת|חייב)\\s+תשובה)`)],
];

/**
 * @returns {{wantsHuman: boolean, complaint: boolean, hard: boolean, discount: boolean,
 *            orderStatus: boolean, asksIfBot: boolean, signals: string[], score: number}}
 *   score = soft signals (1 each) + 2 for anger. The other flags hand off
 *   regardless of score (orderStatus only when the chat has an order).
 */
export function detectFriction(raw) {
  const t = cleanCustomerText(raw);
  const signals = [];
  const wantsHuman = WANTS_HUMAN.some((re) => re.test(t));
  const complaint = COMPLAINT.some((re) => re.test(t));
  const hard = HARD.some((re) => re.test(t));
  const discount = DISCOUNT.test(t);
  const orderStatus = ORDER_STATUS.test(t);
  const asksIfBot = ASKS_IF_BOT.test(t);
  if (wantsHuman) signals.push("wants_human");
  if (complaint) signals.push("complaint");
  if (hard) signals.push("anger");
  if (discount) signals.push("discount");
  if (orderStatus) signals.push("order_status");
  if (asksIfBot) signals.push("asks_if_bot");
  let score = hard ? 2 : 0;
  for (const [code, re] of SOFT) {
    if (code === "confused" && signals.includes("not_understood")) continue;
    if (re.test(t)) { signals.push(code); score += 1; }
  }
  return { wantsHuman, complaint, hard, discount, orderStatus, asksIfBot, signals, score };
}

// ── Loop guard ───────────────────────────────────────────────────────────────

function norm(s) {
  return String(s == null ? "" : s).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Is `outgoing` the same message as `previous` (emoji/punctuation aside)?
 *  Word-set overlap ≥ 0.9 — a changed order summary differs in colour/qty/sizes and passes. */
export function isRepeat(outgoing, previous) {
  const a = norm(outgoing);
  const b = norm(previous);
  if (!a || !b) return false;
  if (a === b) return true;
  const A = new Set(a.split(" "));
  const B = new Set(b.split(" "));
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter) >= 0.9;
}

// ── History ──────────────────────────────────────────────────────────────────

/**
 * chat_messages rows (any order, {role, text, created_at}) → the history BEFORE
 * the current turn, oldest first. The bot logs the customer's messages as they
 * arrive, so the tail of the table can already hold the very text we are judging;
 * those rows are dropped so a message is never counted as its own history.
 */
export function historyBefore(rows, currentText, limit = 12) {
  const hist = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === "object" && typeof r.role === "string" && typeof r.text === "string")
    .map((r) => ({ role: r.role, text: r.text, at: r.created_at || r.at }))
    .sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  const cur = cleanCustomerText(currentText);
  while (hist.length) {
    const last = hist[hist.length - 1];
    const t = cleanCustomerText(last.text);
    if (last.role === "user" && t && cur.includes(t)) hist.pop();
    else break;
  }
  return hist.slice(-limit);
}

/**
 * Before sending the agent's reply: is it the line we just sent?
 * Order summaries are exempt — the send after a summary is where the payment
 * link gets released (Approval Gate), and blocking it would cost a sale; a
 * summary loop still gets caught by the customer's own reaction ("??", "שוב").
 * A blocked repeat sends nothing: the caller silences the chat and alerts Asi.
 * @returns {{blocked: boolean, reply: null}}
 */
export function repeatGuard({ reply, isOrder, lastBotText }) {
  if (isOrder === true || !isRepeat(reply, lastBotText)) return { blocked: false, reply: null };
  return { blocked: true, reply: null };
}

// ── Decision ─────────────────────────────────────────────────────────────────

/** Bot lines that promise a human (the agent's own escalation wording, and the
 *  honest bot line), so the turn after one is recognised as "still waiting". */
const HANDOFF_LINE = /קיבלנו את הפנייה|העברתי את (?:השיחה|הבקשה|הפנייה)|העברתי לאסי|נציג\s+(?:יחזור|ימשיך|יענה)|הצוות\s+(?:יחזור|ימשיך)|מישהו מהצוות/u;

function ageMin(h, now) {
  const t = new Date(h.at).getTime();
  return Number.isNaN(t) ? Infinity : (now.getTime() - t) / 60000;
}

/**
 * @param {{text: string, history?: Array<{role: string, text: string, at: string}>,
 *          now?: Date, businessOpen?: boolean, hasOrder?: boolean}} input
 *   history  = the chat's recent messages BEFORE this one, oldest first
 *              (role: "user" | "bot" | "agent").
 *   hasOrder = the chat has a recent order, so "מתי מוכן?" is a status ask for Asi.
 *   (businessOpen is accepted for the caller's convenience; no reply depends on it.)
 * @returns {{action: "continue"|"handoff"|"hold", reason: string|null, reply: string|null,
 *            notifyGroup: boolean, signals: string[]}}
 *   continue → let the agent answer
 *   handoff  → silence the bot for the chat and alert the group; send `reply`
 *              only if it is not null (just the honest "yes, I'm the bot" line)
 *   hold     → a handoff is already pending: say nothing; alert the group only if notifyGroup
 */
export function decideFriction({ text, history = [], now = new Date(), hasOrder = false }) {
  const f = detectFriction(text);
  const hist = (Array.isArray(history) ? history : []).filter(
    (h) => h && typeof h === "object" && typeof h.role === "string" && typeof h.text === "string"
  );

  // 1. A human was already promised and hasn't shown up: don't repeat the promise.
  let pending = -1;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].role === "agent") break;
    if (hist[i].role === "bot" && HANDOFF_LINE.test(hist[i].text) && ageMin(hist[i], now) <= FRICTION_CONFIG.holdHours * 60) {
      pending = i;
      break;
    }
  }
  if (pending >= 0) {
    return {
      action: "hold", reason: "pending_handoff", reply: null,
      notifyGroup: f.wantsHuman || f.complaint || f.hard || f.score > 0,
      signals: f.signals,
    };
  }

  const handoff = (reason, reply = null) => ({
    action: "handoff", reason, reply, notifyGroup: true, signals: f.signals,
  });

  // 2. Hard triggers. Asked sincerely whether it's a bot, it says so — then hands over.
  if (f.asksIfBot) return handoff("asks_if_bot", HONEST_BOT_LINE);
  if (f.wantsHuman) return handoff("wants_human");
  if (f.complaint) return handoff("complaint");
  if (f.discount) return handoff("discount");
  if (f.orderStatus && hasOrder) return handoff("order_status");
  if (f.hard || f.score >= 2) return handoff("frustrated");

  // 3. Soft signals that pile up across the last few customer turns.
  if (f.score >= 1) {
    const recentUser = hist
      .filter((h) => h.role === "user" && ageMin(h, now) <= FRICTION_CONFIG.recentMinutes)
      .slice(-FRICTION_CONFIG.recentUserTurns);
    if (recentUser.some((h) => detectFriction(h.text).score > 0)) return handoff("frustrated");
  }

  // 4. The bot is looping: its last two lines (with the customer in between) are the same.
  const bots = [];
  for (let i = hist.length - 1; i >= 0 && bots.length < 2; i--) {
    if (hist[i].role === "agent") break;
    if (hist[i].role === "bot") bots.push(i);
  }
  if (bots.length === 2) {
    const [last, prev] = bots;
    const customerBetween = hist.slice(prev + 1, last).some((h) => h.role === "user");
    if (customerBetween && ageMin(hist[prev], now) <= FRICTION_CONFIG.loopMinutes && isRepeat(hist[last].text, hist[prev].text)) {
      return handoff("bot_loop");
    }
  }

  return { action: "continue", reason: null, reply: null, notifyGroup: false, signals: f.signals };
}

// ── Messages ─────────────────────────────────────────────────────────────────

const REASON_LABEL = {
  wants_human: "רוצה לדבר איתך",
  complaint: "תלונה / בעיה בהזמנה",
  discount: "מבקש/ת הנחה",
  order_status: "שואל/ת מה עם ההזמנה",
  asks_if_bot: "שאל/ה אם זה בוט",
  frustrated: "מתעצבן/ת על הבוט",
  bot_loop: "הבוט חזר על עצמו",
  pending_handoff: "עדיין מחכה לך ומתחיל/ה להתעצבן",
};

/** T-Center opening hours (same as the "Bot Allowed?" node): Sun–Thu 08:30–16:30,
 *  Fri 08:30–14:00, Sat closed. Reminders to Asi only go out inside them. */
export function isShopOpen(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(now).map((x) => [x.type, x.value])
  );
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  const mins = (p.hour === "24" ? 0 : Number(p.hour)) * 60 + Number(p.minute);
  if (dow === 6) return false;
  if (dow === 5) return mins >= 510 && mins < 840;
  return mins >= 510 && mins < 990;
}

/** One line per waiting customer, for the reminder when an alert went unanswered. */
export function reminderAlert({ reason, name, phone, lastText, waitedMin }) {
  const digits = String(phone || "").replace(/\D/g, "");
  const said = cleanCustomerText(lastText).slice(0, 160);
  return [
    `⏰ תזכורת — ${name || "לקוח"} מחכה לך ${Math.max(1, Math.round(Number(waitedMin) || 0))} דק'`,
    `${REASON_LABEL[reason] || "דרוש מענה"}${said ? `: "${said}"` : ""}`,
    `פתיחת צ'אט: https://wa.me/${digits}`,
  ].join("\n");
}

/** The orders-group card. Replying "בוט" to it hands the chat back (takeover.mjs parseGroupCommand). */
export function groupAlert({ reason, name, phone, lastText }) {
  const digits = String(phone || "").replace(/\D/g, "");
  const said = cleanCustomerText(lastText).slice(0, 200);
  return [
    `⚠️ ${REASON_LABEL[reason] || "דרוש נציג"} — הבוט הושתק בשיחה הזו`,
    "",
    `שם: ${name || "לקוח"}`,
    `טלפון: +${digits}`,
    said ? `כתב/ה: "${said}"` : null,
    `פתיחת צ'אט: https://wa.me/${digits}`,
    "",
    `להחזיר את הבוט ללקוח הזה: השיבו להודעה הזו "בוט"`,
  ].filter((x) => x !== null).join("\n");
}
