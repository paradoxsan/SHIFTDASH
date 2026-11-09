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
// 2026-11-09: the shop now has a sample photo or video for each product type. A
// customer who asks to see how something looks gets the sample first, then the
// site for a specific model (see planMediaTurn below).
//
// Wiring in the store bot (n8n):
//   - before the agent: planMediaTurn({text, history}) → send its messages in
//     order, post mediaGroupLine(...) to the team group when plan.notify, log
//     plan.log, done. null → the agent answers as usual.
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

// ── Product samples ─────────────────────────────────────────────────────────

const MEDIA = "https://kracmhwzmgligxngmhmi.supabase.co/storage/v1/object/public/BRJewelry%20WhatsAppMedia/";
const SHOP = "https://www.brjewelry.shop";

/** WhatsApp's link preview 404s on raw Hebrew; encode non-ASCII only (same rule as the store's tagLinks). */
const asciiUrl = (u) => String(u).replace(/[^\x00-\x7F]+/g, (s) => encodeURIComponent(s));
/** A category goes by its last slug, like the store's tagLinks: WordPress 301s ?product_cat=<slug> to the full path. */
const siteLink = (path) => {
  const leaf = path.match(/^\/product-category\/(?:.*\/)?([^/]+)\/$/);
  return asciiUrl(SHOP + (leaf ? "/?product_cat=" + leaf[1] + "&" : path + "?")) + "utm_source=whatsapp&utm_medium=noa&utm_content=link";
};

const img = (file, caption) => ({ endpoint: "image", url: MEDIA + file, caption });
const vid = (file, caption) => ({ endpoint: "video", url: MEDIA + file, caption });

/** Hebrew word boundaries: "סט" / "הסט" / "סטים", never "סטרלינג". */
const SET_RE = /(^|[^א-ת])[הבלושמ]{0,2}סט(ים)?(?=$|[^א-ת])|[/=]10\b/;
const TYPES = [
  ["sets", SET_RE],
  ["rings", /טבעת|טבעות|(?<!ear)rings?\b/i],
  ["earrings", /עגיל|earring|[/=]223\b/i],
  ["bracelets", /צמיד|bracelet|[/=]224\b/i],
  ["necklaces", /שרשר|תליון|necklace|[/=]225\b/i],
];
// The samples are all women's jewelry.
const MEN_RE = /גבר/;
const MOISS_RE = /מוסונייט|מויסונייט|מוסנייט|moissanite/i;
const YELLOW_RE = /צהוב|זהב(?! לבן)/;
const HEART_RE = /(^|[^א-ת])[בהו]?(לב|לבבות)(?=$|[^א-ת])/;

const ROYAL = img("photo.jpeg", "סט רויאל: שרשרת, עגילים, טבעת וצמיד טניס ✨");
const TENNIS_SET = img("store/tennis_necklace_bracelet_set.jpg", "סט שרשרת טניס וצמיד ✨");
const RING_ROUND = img("store/diamond_ring_round.jpg", "טבעת יהלום עגול 💍");
const EARRINGS_TRAY = vid("store/shavit_video_1.mp4", "עוד מהעגילים שלנו ✨");
const TENNIS_BRACELETS = img("store/tennis_bracelets.jpg", "צמידי טניס ✨");
const NECKLACE_SIZES = img("store/necklace_sizes.jpg", "שרשרת סוליטר: 1, 1.5 ו-2 קראט ✨");
const TENNIS_NECKLACES = vid("store/tennis_necklaces.mp4", "שרשראות טניס ✨");

/** Per product type: what to send, which page to link. Variants match the customer's own words. */
const SAMPLES = {
  rings: {
    label: "הטבעות",
    diamond: "/product-category/תכשיטי-יהלומים/rings/",
    moissanite: "/product-category/תכשיטי-מוסונייט/לנשים/rings-mono/",
    items: [img("store/rings_sample_silver_gold.jpg", "טבעות לדוגמה, בכסף ובזהב ✨"), vid("store/shavit_video_2.mp4", "עוד מהטבעות שלנו 💍")],
    variants: [
      { name: "engagement", re: /אירוס|סוליטר/, label: "טבעות האירוסין", path: "/product-category/תכשיטי-יהלומים/טבעות-אירוסין/",
        items: [RING_ROUND, vid("store/diamond_ring_sample_2.mp4", "טבעת יהלום מקרוב ✨")] },
      { name: "diamond", re: /יהלום/, items: [RING_ROUND, vid("store/diamond_ring_sample_1.mp4", "טבעת יהלום מקרוב ✨")] },
    ],
  },
  earrings: {
    label: "העגילים",
    diamond: "/product-category/תכשיטי-יהלומים/223/",
    moissanite: "/product-category/תכשיטי-מוסונייט/לנשים/עגילים/",
    items: [img("store/earrings_1ct.jpg", "עגילים 1 קראט ✨"), EARRINGS_TRAY],
    variants: [{ name: "heart", re: HEART_RE, items: [img("store/heart_earrings_half_ct.jpg", "עגילי לב חצי קראט 🤍"), EARRINGS_TRAY] }],
  },
  bracelets: {
    label: "הצמידים",
    diamond: "/product-category/תכשיטי-יהלומים/224/",
    moissanite: "/product-category/תכשיטי-מוסונייט/לנשים/צמידים/",
    items: [TENNIS_BRACELETS, vid("store/diamond_bracelets_sample.mp4", "עוד מהצמידים שלנו ✨")],
    variants: [{ name: "yellow", re: YELLOW_RE, items: [vid("store/tennis_bracelet_yellow.mp4", "צמיד טניס בזהב צהוב ✨"), TENNIS_BRACELETS] }],
  },
  necklaces: {
    label: "השרשראות",
    diamond: "/product-category/תכשיטי-יהלומים/225/",
    moissanite: "/product-category/תכשיטי-מוסונייט/לנשים/שרשראות/",
    items: [NECKLACE_SIZES, TENNIS_NECKLACES],
    variants: [
      { name: "tennis", re: /טניס/, items: [TENNIS_NECKLACES, TENNIS_SET] },
      { name: "yellow", re: YELLOW_RE, items: [img("store/necklace_1ct_yellow_round.jpg", "שרשרת יהלום עגול 1 קראט ✨"), NECKLACE_SIZES] },
    ],
  },
  sets: {
    label: "הסטים",
    diamond: "/product-category/10/",
    moissanite: "/product-category/10/",
    items: [ROYAL, TENNIS_SET],
    variants: [
      // The campaign set, sold on the site as "סט רויאל 4 חלקים" (product 7436).
      { name: "royal", re: /רויאל|royal|4 חלקים|ארבעה חלקים|1,?999|מודעה|פרסומת/i,
        more: "כל הפרטים והמחיר של סט רויאל באתר:", path: "/product/סט-תכשיטים-מוסונייט-שרשרת-צמיד-טבעת-ז/",
        items: [ROYAL, vid("1999%20set.mp4", "סט רויאל בסרטון ✨")] },
      { name: "yellow", re: YELLOW_RE, items: [vid("gold_set.mp4", "סט רויאל בזהב צהוב ✨"), ROYAL] },
    ],
  },
};

/** Decode %D7%.. runs so links in the chat read as Hebrew words. */
const plain = (s) =>
  String(s ?? "").replace(/(%[0-9A-F]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch { return m; } });

/** Product types named in the text, in the order they appear. */
function typesIn(text) {
  const s = plain(text);
  return TYPES.map(([type, re]) => ({ type, at: s.search(re) }))
    .filter((t) => t.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((t) => t.type);
}

/** Written into the logged turn so the next ask knows this sample went out. */
export const sampleMarker = (key) => "[נשלחו דוגמאות: " + key + "]";

/** Every file already sent in this chat, read back from the markers. */
function sentFiles(list) {
  const sent = new Set();
  for (const m of list) {
    if (m?.role !== "bot" && m?.role !== "agent") continue;
    for (const [, type, name] of String(m.text ?? "").matchAll(/\[נשלחו דוגמאות: ([a-z]+)(?:\/([a-z]+))?\]/g)) {
      const cat = SAMPLES[type];
      for (const i of (name ? cat?.variants.find((v) => v.name === name)?.items : cat?.items) ?? []) sent.add(i.url);
    }
  }
  return sent;
}

/** "איך זה נראה?" — asking to see a product without the words photo or video. */
export function asksHowItLooks(text) {
  const s = String(text ?? "").replace(/\[[^\]]*\]/g, " ");
  return /איך\s+(\S+\s+){0,3}?(נראה|נראית|נראים|נראות)/.test(s) && !/ראיתי|ראינו|משלוח|אריזה|קופסה|הזמנה|תשלום/.test(s);
}

/**
 * Which product the customer wants to see, and the samples and page for it.
 * The product comes from the message, or else from the last chat message that names
 * exactly one product. null when there is no sample for it.
 * @param {{text?: unknown, history?: Array<{role?: string, text?: unknown}>}} [opts]
 */
export function pickSamples({ text, history = [] } = {}) {
  const list = Array.isArray(history) ? history : [];
  const now = plain(text);
  const inNow = typesIn(now);
  let type = inNow.includes("sets") ? "sets" : inNow[0]; // a set wins over the pieces it is made of
  let about = now;
  for (let i = list.length - 1; !type && i >= Math.max(0, list.length - 4); i--) {
    const t = plain(list[i]?.text);
    const found = typesIn(t);
    if (found.length > 1) return null; // that message named several products: don't guess
    if (found.length) { type = found[0]; about = t + " " + now; }
  }
  if (!type || MEN_RE.test(about)) return null;

  const cat = SAMPLES[type];
  const v = cat.variants.find((x) => x.re.test(about));
  const key = v ? type + "/" + v.name : type;
  // The customer's own words only: Noa's "lab diamond or moissanite?" is not a choice.
  const recent = list.slice(-6).filter((m) => m?.role === "user").map((m) => plain(m.text)).join(" ");
  const last = asciiUrl(lastSiteLink(list, { fallback: "" }));
  const lastTypes = typesIn(last);
  const url = v?.path ? siteLink(v.path)
    : lastTypes.length === 1 && lastTypes[0] === type ? last // the page she already sent
    : siteLink(cat[MOISS_RE.test(now + " " + recent) ? "moissanite" : "diamond"]);
  const sent = sentFiles(list);
  const items = (v?.items ?? cat.items).filter((i) => !sent.has(i.url)); // never the same file twice
  const label = v?.label ?? cat.label;
  return { key, type, items, url, already: items.length === 0,
    more: v?.more ?? "רוצה לראות דגם מסוים? כל " + label + " באתר, עם תמונות ומחירים:" };
}

/**
 * The text after the samples: the site for a specific model.
 * @param {{url: string, more: string}} opts
 */
export function sampleReply({ url, more }) {
  return ["אלה דוגמאות מהקולקציה שלנו ✨", more, url, "ואם משהו תפס לך את העין, אני כאן לעזור לבחור ולסגור הזמנה 🙂"].join(NL);
}

/**
 * Asked again after the samples went out: the site, and the team is told.
 * @param {{url: string, kind?: string}} opts
 */
export function moreReply({ url, kind = "video" }) {
  return [
    "לדגם מסוים יש באתר תמונות מקרוב:",
    url,
    "העברתי גם לצוות, ואם יש להם " + (kind === "photo" ? "עוד תמונות" : "סרטון") + " של הדגם שמעניין אותך הם ישלחו לך.",
    "בינתיים אני כאן לכל שאלה 🙂",
  ].join(NL);
}

/**
 * What goes out for this message, before the agent runs. null → the agent answers.
 * @param {{text?: unknown, history?: Array<{role?: string, text?: unknown}>}} [opts]
 * @returns {null | {kind: string, key: string|null, url: string, notify: boolean, log: string,
 *   messages: Array<{endpoint: "image"|"video"|"text", media?: string, caption?: string, body?: string}>}}
 */
export function planMediaTurn({ text, history = [] } = {}) {
  const kind = detectMediaRequest(text);
  if (!kind && !asksHowItLooks(text)) return null;
  const pick = pickSamples({ text, history });
  if (pick && !pick.already) {
    const body = sampleReply(pick);
    return {
      kind: kind ?? "look", key: pick.key, url: pick.url, notify: false,
      messages: [...pick.items.map((i) => ({ endpoint: i.endpoint, media: i.url, caption: i.caption })), { endpoint: "text", body }],
      log: body + NL + sampleMarker(pick.key),
    };
  }
  if (!kind) return null; // "how does it look" with nothing new to send: Noa answers
  const last = asciiUrl(lastSiteLink(history));
  const url = pick && !/\/product\//.test(last) ? pick.url : last;
  const body = pick ? moreReply({ url, kind }) : mediaReply({ kind, url });
  return { kind, key: pick?.key ?? null, url, notify: true, messages: [{ endpoint: "text", body }], log: body };
}

/** The same rule for the agent's system message, so the model and the code agree. */
export const MEDIA_PROMPT_RULES = [
  "## סרטונים ותמונות",
  "- כשמבקשים לראות איך טבעות, עגילים, צמידים, שרשראות או סטים נראים, המערכת שולחת לבד תמונה או סרטון לדוגמה וקישור לאתר. בהיסטוריה זה מופיע כ-[נשלחו דוגמאות: ...].",
  "- אחרי הדוגמאות, לדגם מסוים: שלחי את הקישור לדגם שמדברים עליו, או לקטגוריה המתאימה. באתר יש תמונות מקרוב של כל דגם.",
  "- את לא יכולה לצלם תמונה או סרטון אישי של דגם מסוים, ואל תכתבי שאת שולחת תמונה או סרטון בעצמך. אם חשוב ללקוח סרטון של דגם מסוים: תגידי שהעברת לצוות ושאם יש להם, הם ישלחו. בלי שעה ובלי הבטחה.",
  "- בקשה לסרטון היא לא סיבה להעביר את כל השיחה לנציג. אחרי התשובה את ממשיכה לענות כרגיל.",
  "- מה שאת כן יכולה: לשלוח קישורים לדגמים, לענות על מחיר, מידות וחומרים, ולסדר הזמנה כאן בצ'אט.",
].join(NL);
