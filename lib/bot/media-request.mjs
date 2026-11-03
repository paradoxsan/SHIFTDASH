// What נועה does when a customer asks for a video or a photo she cannot send.
//
// 2026-11-03: a customer asked for a video right after Noa sent the sets page.
// She handed off to the team and promised a video, the handoff muted her for two
// hours, and the customer's next two messages — one a plain "show me earrings",
// which she answers all day — went unanswered while nobody picked the chat up.
//
// The fix, in two parts:
//   1. A media request gets an honest answer on the spot: she can't send video
//      from here, the item is on the site (the page she last sent), and the team
//      has been told in case they have a video.
//   2. A handoff never mutes her, whatever the reason: the team group is told
//      and Noa keeps answering. She goes quiet only when someone from the shop
//      writes in the chat by hand (the existing 30-minute mute in n8n).
//
// Wiring in the store bot (n8n):
//   - before the agent: detectMediaRequest(text) → send mediaReply({kind, url:
//     lastSiteLink(history)}), post mediaGroupLine(...) to the team group, done.
//   - in the handoff branch: stop writing human_mode (it wrote a 120-minute
//     mute). Keep the team-group notification.
//   - MEDIA_PROMPT_RULES goes into the agent's system message as a backstop.
//
// Plain .mjs, same contract as followup.mjs: the n8n Code node inlines this file
// verbatim (stripping `export`), so the bot and the unit tests run the same bytes.
// No "\n" inside strings — n8n double-escapes it on a scripted PUT.

const NL = String.fromCharCode(10);

const VIDEO_WORDS = ["וידאו", "וידיאו", "סרטון", "סירטון", "video"];
// Final-letter forms differ ("תצלם" is not inside "תצלמי"), so both are listed.
const PHOTO_WORDS = ["תמונה", "תמונות", "צילום", "תצלום", "תצלם", "תצלמי", "תצלמו", "לצלם", "photo"];

/** Something in the message has to make it a request, not a remark. */
const ASK_CUES = [
  "?", "יש", "אפשר", "ניתן", "אשמח", "רוצה", "בא לי", "לקבל", "לראות", "תוכל",
  "שלח", "לשלוח", "תעביר", "להעביר", "תצלם", "תצלמי", "תצלמו", "לצלם",
];

/**
 * Media the customer saw, sent, or offers to send is not a request for ours.
 * Phrases, not bare verbs: "זוכרת שראיתי אצלכם" next to "יש תמונה?" is still a request.
 */
const SEEN_CUES = [
  "ראיתי את ה", "ראינו את ה", "שלחתי", "ששלח", "שלחנו", "אשלח", "צילמתי", "אצלם", "לצלם לך",
  "בסרטון", "מהסרטון", "בתמונה", "מהתמונה",
];

const has = (s, list) => list.some((w) => s.includes(w));

/**
 * Is the customer asking us to send a video or a photo?
 *
 * The pipeline appends its own notes in brackets — "[תמונה ששלח הלקוח: ...]" for
 * every image a customer sends — so those are dropped first; otherwise every
 * payment screenshot reads as "send me a photo".
 *
 * @returns {"video" | "photo" | null}
 */
export function detectMediaRequest(text) {
  const s = String(text ?? "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[‎‏]/g, "")
    .toLowerCase()
    .trim();
  if (!s) return null;
  if (has(s, SEEN_CUES)) return null;
  const kind = has(s, VIDEO_WORDS) ? "video" : has(s, PHOTO_WORDS) ? "photo" : null;
  if (!kind) return null;
  // "תמונה רק של הצמיד הדק" — opening with the noun is itself the ask.
  const opens = [...VIDEO_WORDS, ...PHOTO_WORDS].some((w) => s.startsWith(w));
  return opens || has(s, ASK_CUES) ? kind : null;
}

/**
 * The shop page Noa sent most recently — the one the customer is looking at when
 * they ask for a video. Checkout and cart links are skipped: they show a form,
 * not the jewelry.
 */
export function lastSiteLink(history = [], { host = "brjewelry.shop", fallback = "https://www.brjewelry.shop/" } = {}) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i] ?? {};
    if (m.role !== "bot" && m.role !== "agent") continue;
    const urls = String(m.text ?? "").match(/https?:\/\/[^\s<>"']+/g) ?? [];
    const good = urls
      .map((u) => u.replace(/[).,!?]+$/, ""))
      .filter((u) => u.includes(host) && !/\/(checkout|cart|my-account)\b/.test(u));
    if (good.length) return good[good.length - 1];
  }
  return fallback;
}

/**
 * Noa's answer: what she can't do, the quick fix, and that she's still here.
 * @param {{kind?: "video" | "photo" | null, url?: string}} [opts]
 */
export function mediaReply({ kind = "video", url = "https://www.brjewelry.shop/" } = {}) {
  const one = /\/product\//.test(url);
  const lines = kind === "photo"
    ? [
        "תמונה אישית אני לא יכולה לצלם מכאן 🙈",
        `אבל באתר יש תמונות של ${one ? "הדגם" : "הדגמים"} מקרוב:`,
        url,
        "העברתי גם לצוות, ואם יש להם תמונה נוספת הם ישלחו לך.",
      ]
    : [
        "סרטון אני לא יכולה לשלוח מכאן 🙈",
        `אבל באתר אפשר לראות ${one ? "את הדגם" : "את הדגמים"} מקרוב:`,
        url,
        "העברתי גם לצוות, ואם יש להם סרטון הם ישלחו לך.",
      ];
  lines.push("בינתיים אני כאן לכל שאלה, ואפשר גם לסגור הזמנה כאן בצ'אט 🙂");
  return lines.join(NL);
}

/**
 * The team-group note for a media request.
 * @param {{kind?: "video" | "photo" | null, name?: string, phone?: string, url?: string}} [opts]
 */
export function mediaGroupLine({ kind = "video", name, phone, url } = {}) {
  const digits = String(phone ?? "").replace(/@.*$/, "").replace(/\D/g, "");
  return [
    kind === "photo" ? "📷 לקוח ביקש תמונה" : "🎥 לקוח ביקש סרטון",
    "👤 " + (String(name ?? "").trim() || "לקוח"),
    "📞 " + digits,
    "🔗 " + url,
    "נועה שלחה קישור לאתר וממשיכה לענות בצ'אט. יש לכם " + (kind === "photo" ? "תמונה" : "סרטון") + "? שלחו ישירות ללקוח.",
  ].join(NL);
}

/** The same rule for the agent's system message, so the model and the code agree. */
export const MEDIA_PROMPT_RULES = [
  "## סרטונים ותמונות",
  "- את לא יכולה לשלוח סרטון או לצלם תמונה אישית. כשמבקשים, תגידי את זה פשוט, במשפט אחד, בלי להתנצל יותר מדי.",
  "- הפתרון המהיר: לראות את הדגם מקרוב באתר. שלחי את הקישור לדגם שמדברים עליו, או לקטגוריה אם אין דגם מסוים.",
  "- אם חשוב ללקוח סרטון אישי: תגידי שהעברת לצוות ושאם יש להם, הם ישלחו. בלי שעה ובלי הבטחה.",
  "- בקשה לסרטון היא לא סיבה להעביר את כל השיחה לנציג. אחרי התשובה את ממשיכה לענות כרגיל.",
  "- מה שאת כן יכולה: לשלוח קישורים לדגמים, לענות על מחיר, מידות וחומרים, ולסדר הזמנה כאן בצ'אט.",
].join(NL);
