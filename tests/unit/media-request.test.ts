import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the n8n Code node
import {
  detectMediaRequest, lastSiteLink, mediaReply, mediaGroupLine, MEDIA_PROMPT_RULES,
} from "../../lib/bot/media-request.mjs";
import { forbiddenClaim } from "../../lib/bot/followup.mjs";

// The 2026-11-03 incident, re-enacted with made-up messages: a customer asked for
// a video right after Noa sent the sets page; she handed off, muted herself for
// 2 hours, and the customer's next questions went unanswered.
const SETS = "https://www.brjewelry.shop/product-category/10/?utm_source=whatsapp&utm_medium=noa&utm_content=link";
const RING = "https://www.brjewelry.shop/product/טבעת-עגולה-עם-יהלום-מעבדה/?utm_source=whatsapp&utm_medium=noa&utm_content=link";
const CHECKOUT = "https://www.brjewelry.shop/checkout/?session=abc&utm_source=whatsapp&utm_medium=noa&utm_content=checkout";
const CHAT = [
  { role: "bot", text: "הנה טבעת שאולי תאהבו:\n" + RING },
  { role: "user", text: "וכמה זה ב-18K?" },
  { role: "bot", text: "סגרתי לך עגלה, אפשר לשלם כאן:\n" + CHECKOUT },
  { role: "user", text: "יש גם סטים?" },
  { role: "bot", text: "בטח, הנה כל הסטים:\n" + SETS },
  { role: "user", text: "יש וידאו של זה?" },
];

describe("detectMediaRequest — is the customer asking us to send a video or photo?", () => {
  it("catches the short ask that started it", () => {
    expect(detectMediaRequest("יש וידאו של זה?")).toBe("video");
  });

  it("catches the usual ways people ask", () => {
    expect(detectMediaRequest("יש סרטון של הטבעת?")).toBe("video");
    expect(detectMediaRequest("תשלחי סירטון בבקשה")).toBe("video");
    expect(detectMediaRequest("אפשר לקבל וידיאו מקרוב")).toBe("video");
    expect(detectMediaRequest("אפשר תמונה אמיתית?")).toBe("photo");
    expect(detectMediaRequest("תצלמי לי את הסט")).toBe("photo");
  });

  it("video wins when both are asked", () => {
    expect(detectMediaRequest("יש תמונה או סרטון?")).toBe("video");
  });

  // A false positive here sends "I can't send video" to someone who never asked.
  it("ignores media the customer saw or sent", () => {
    expect(detectMediaRequest("ראיתי את הסרטון שלכם באינסטגרם")).toBeNull();
    expect(detectMediaRequest("שלחתי לך תמונה של הטבעת שלי")).toBeNull();
    expect(detectMediaRequest("בסרטון זה נראה יותר גדול, יש בגודל אחר?")).toBeNull();
  });

  // The shapes below were checked against 60 days of real chats; the wording is made up.
  it("ignores the bot's own note about an image the customer sent", () => {
    expect(detectMediaRequest("[תמונה ששלח הלקוח: צילום מסך של העברה בנקאית]")).toBeNull();
    expect(detectMediaRequest("בערך באורך הזה?\n[תמונה ששלח הלקוח: שרשרת על צוואר]")).toBeNull();
    expect(detectMediaRequest("משהו כזה יש?\n[תמונה ששלח/ה הלקוח/ה: טבעת עם אבן ירוקה]")).toBeNull();
  });

  it("ignores a customer offering to photograph or send something themselves", () => {
    expect(detectMediaRequest("אני יכול לצלם לך את האצבע שתבין את המידה?")).toBeNull();
    expect(detectMediaRequest("אני אשלח לך תמונה של מה שאני מחפש")).toBeNull();
  });

  it("catches asks that have no question mark", () => {
    expect(detectMediaRequest("שלחי תמונה")).toBe("photo");
    expect(detectMediaRequest("‏תוכלי לשלוח לי את התמונה של העגילים")).toBe("photo");
    expect(detectMediaRequest("תמונה של השרשרת על הצוואר")).toBe("photo");
    expect(detectMediaRequest("ויש לך סירטון")).toBe("video");
  });

  it("does not let 'I saw it at your place' cancel a real ask", () => {
    expect(detectMediaRequest("יש תמונה? ראיתי אותה פעם בחנות")).toBe("photo");
  });

  it("ignores a plain 'show me' — that is a catalog question Noa already answers", () => {
    expect(detectMediaRequest("ומה עם עגילים, תראי לי")).toBeNull();
    expect(detectMediaRequest("יש לכם צמידים?")).toBeNull();
    expect(detectMediaRequest("")).toBeNull();
    expect(detectMediaRequest(null)).toBeNull();
  });
});

describe("lastSiteLink — which page answers 'show me a video'", () => {
  it("returns the page Noa sent last — the sets page in that chat", () => {
    expect(lastSiteLink(CHAT)).toBe(SETS);
  });

  it("never offers the checkout link as a place to look at jewelry", () => {
    expect(lastSiteLink(CHAT.slice(0, 3))).toBe(RING);
  });

  it("ignores links the customer pasted", () => {
    expect(lastSiteLink([{ role: "user", text: "מה עם זה " + RING }])).toBe("https://www.brjewelry.shop/");
  });

  it("falls back to the shop when Noa sent nothing yet", () => {
    expect(lastSiteLink([])).toBe("https://www.brjewelry.shop/");
    expect(lastSiteLink(undefined, { fallback: "https://x.test/" })).toBe("https://x.test/");
  });
});

describe("mediaReply — says what she can't do, then the quick fix", () => {
  const video = mediaReply({ kind: "video", url: SETS });

  it("says plainly she can't send video, and sends the site instead", () => {
    expect(video).toContain("לא יכולה לשלוח");
    expect(video).toContain(SETS);
    expect(video).toContain("את הדגמים"); // a category page shows several
  });

  it("says what she can do and that she's still here", () => {
    expect(video).toContain("כאן לכל שאלה");
    expect(video).toContain("הזמנה");
  });

  it("promises no time and no capability the shop does not have", () => {
    expect(video).not.toMatch(/\d{1,2}:\d{2}/);
    expect(video).not.toContain("ישלחו לך סרטון");
    expect(forbiddenClaim(video)).toBeNull();
  });

  it("talks about one item when the link is a product page", () => {
    expect(mediaReply({ kind: "video", url: RING })).toContain("את הדגם ");
  });

  it("has a photo version", () => {
    const photo = mediaReply({ kind: "photo", url: RING });
    expect(photo).toContain("תמונה אישית");
    expect(photo).toContain(RING);
  });

  // n8n double-escapes "\n" on a scripted PUT; the module builds newlines without one.
  it("is real multi-line text, not a literal backslash-n", () => {
    expect(video.split(String.fromCharCode(10)).length).toBeGreaterThan(2);
    expect(video).not.toContain("\\n");
  });
});

describe("mediaGroupLine — what the team sees", () => {
  it("names the customer, the link, and that Noa is still on", () => {
    const g = mediaGroupLine({ kind: "video", name: "דנה כהן", phone: "972500000001@s.whatsapp.net", url: SETS });
    expect(g).toContain("ביקש סרטון");
    expect(g).toContain("דנה כהן");
    expect(g).toContain("972500000001");
    expect(g).not.toContain("@s.whatsapp.net");
    expect(g).toContain(SETS);
    expect(g).toContain("ממשיכה לענות");
    expect(g).not.toContain("\\n");
  });
});

describe("a video ask right after the sets page, end to end", () => {
  it("would have answered on the spot with the sets page", () => {
    const ask = CHAT[CHAT.length - 1].text;
    const kind = detectMediaRequest(ask);
    expect(kind).toBe("video");
    expect(mediaReply({ kind, url: lastSiteLink(CHAT) })).toContain(SETS);
  });
});

describe("MEDIA_PROMPT_RULES — the same rule, for the agent's system message", () => {
  it("tells her what she can't do, the fix, and not to hand off the whole chat", () => {
    // Since 2026-11-09 the system sends product samples; what she still can't do is film one.
    expect(MEDIA_PROMPT_RULES).toContain("לא יכולה לצלם");
    expect(MEDIA_PROMPT_RULES).toContain("באתר");
    expect(MEDIA_PROMPT_RULES).toContain("לא סיבה להעביר");
    expect(MEDIA_PROMPT_RULES).not.toContain("\\n");
  });
});
