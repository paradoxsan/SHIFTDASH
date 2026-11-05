// Stops the T-CENTER sales agent from saying "yes" to youth-movement shirts
// (חולצות תנועה). T-CENTER does not make or sell them.
//
// Why a code guard and not only a prompt line: on 2026-11-05 a customer asked
// for Bnei Akiva movement shirts, twice, and Gemini answered "כן, אנחנו מדפיסים
// על חולצות תנועה" both times. A prompt rule lowers the odds; this makes the
// false yes impossible to send. Same idea as the V2.9.4 closed-hours guard.
//
// Plain .mjs (not .ts) on purpose: scripts/tcenter/fix-movement-shirts.mjs
// inlines this exact source into the "Parse Order" Code node, so the live bot
// and the unit tests run the same bytes. Keep it import-free.

export const MOVEMENT_SHIRT_REPLY =
  "לצערנו אין לנו חולצות תנועה.\n" +
  "מה שיש לנו זה חולצות טריקו כותנה ודרייפיט רגילות, ואפשר להדפיס עליהן עיצוב משלכם.\n" +
  "אם זה מתאים — אשמח לעזור 🙂";

const HE = "א-ת";

// Movement names. Names that are also common first names (עזרא, אריאל) are left
// out on purpose: "חולצות של אריאל" is usually a person. Those movements are
// still caught through the word תנועה / תנועת.
const NAMES = [
  "בני\\s+עקיבא",
  "בנ[\"״]ע",
  "ה?צופים",
  "ה?שומר\\s+ה?צעיר",
  "ה?נוער\\s+ה?עובד(?:\\s+וה?לומד)?",
  "נוע[\"״]ל",
  "בני\\s+ה?מושבים",
  "בית[\"״]?ר",
  "מכבי\\s+ה?צעיר",
  "ה?מחנות\\s+ה?עולים",
];

// "חולצת תנועה", "החולצות התנועה", "חולצת תנועת הצופים"
const TERM = "ה?תנוע(?:ה|ת)";
const SHIRT = `(?<![${HE}])[והבמש]{0,2}חולצ(?:ה|ת|ות)\\s+`;

/** The customer explicitly asked for a movement shirt. */
const ASK_RE = new RegExp(`${SHIRT}${TERM}(?![${HE}])`);
/** Any way of naming a movement shirt as a product. */
const PRODUCT_RE = new RegExp(`${SHIRT}(?:של\\s+)?(?:${TERM}|${NAMES.join("|")})(?![${HE}])`, "g");

const VERBS =
  "מייצרים|מייצרת|מייצר|מדפיסים|מדפיסה|מדפיס|מספקים|מספקת|מוכרים|מוכרת|עושים|עושה|מחזיקים|מביאים|משווקים";
// "אין" negates, except in "אין בעיה" / "אין ספק", which are a yes.
const NEG = `(?:אין(?!\\s+(?:בעיה|ספק|צורך))|לא\\s+(?:${VERBS})|אנחנו\\s+לא|איננו|אינם)`;
const NEG_BEFORE = new RegExp(`(?:^|[^${HE}])${NEG}(?![${HE}])`);
const NEG_AFTER = new RegExp(`^\\s*${NEG}(?![${HE}])`);
const DENY_RE = new RegExp(
  `(?:^|[^${HE}])(?:אין\\s+לנו|אין\\s+אצלנו|לצערנו|לא\\s+(?:${VERBS})|אנחנו\\s+לא\\s+(?:${VERBS}))(?![${HE}])|^\\s*(?:לא|אין)(?![${HE}])`
);

/** Drop the "[המערכת: ...]" notes the workflow appends to the customer's text. */
function customerText(s) {
  return String(s ?? "").replace(/\[המערכת:[^\]]*\]/g, " ");
}

/** True when the movement-shirt mention at [i, i+len) sits inside a "we don't have" sentence. */
function negatedAt(s, i, len) {
  // Only look inside the current sentence, so "אין לנו פולו. כן, יש חולצות תנועה" still counts as a claim.
  const before = s.slice(Math.max(0, i - 40), i).split(/[.!?\n]/).pop();
  const after = s.slice(i + len, i + len + 25);
  return NEG_BEFORE.test(before) || NEG_AFTER.test(after);
}

/** The reply offers a movement shirt (any mention that is not negated). */
function claimsMovementShirt(reply) {
  for (const m of reply.matchAll(PRODUCT_RE)) {
    if (!negatedAt(reply, m.index, m[0].length)) return m[0].trim();
  }
  return null;
}

/** The reply says no in some form, or names the movement shirt only to deny it. */
function deniesMovementShirt(reply) {
  if (DENY_RE.test(reply)) return true;
  for (const m of reply.matchAll(PRODUCT_RE)) {
    if (negatedAt(reply, m.index, m[0].length)) return true;
  }
  return false;
}

/**
 * Decide whether the agent's reply must be replaced.
 * @param {{ incoming?: string | null, reply?: string | null }} args
 *   incoming — the customer's batch as the agent saw it (mergedText)
 *   reply    — the agent's cleaned reply (summary)
 * @returns {{ override: boolean, reason: string, text?: string }}
 */
export function movementShirtGuard({ incoming, reply } = {}) {
  const r = String(reply ?? "");
  const claim = claimsMovementShirt(r);
  if (claim) return { override: true, reason: "claimed:" + claim, text: MOVEMENT_SHIRT_REPLY };
  if (ASK_RE.test(customerText(incoming)) && !deniesMovementShirt(r)) {
    return { override: true, reason: "asked_not_denied", text: MOVEMENT_SHIRT_REPLY };
  }
  return { override: false, reason: "ok" };
}
