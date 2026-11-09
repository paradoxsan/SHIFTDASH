import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the n8n Code node
import {
  asksHowItLooks, pickSamples, planMediaTurn, sampleMarker, MEDIA_PROMPT_RULES,
} from "../../lib/bot/media-request.mjs";
import { forbiddenClaim } from "../../lib/bot/followup.mjs";

// 2026-11-09: Shavit sent a sample photo or video for each product type. When a
// customer asks to see how something looks, Noa (store) sends the sample first;
// for a specific model she sends the site. Messages below are made up.
const NL = String.fromCharCode(10);
const BRACELETS_PAGE = "https://www.brjewelry.shop/?product_cat=224&utm_source=whatsapp&utm_medium=noa&utm_content=link";

const ascii = (s: string) => /^[\x00-\x7F]*$/.test(s);

describe("asksHowItLooks — 'how does it look' without the words photo or video", () => {
  it("catches the usual ways people ask", () => {
    expect(asksHowItLooks("איך זה נראה?")).toBe(true);
    expect(asksHowItLooks("איך הצמיד נראה על היד?")).toBe(true);
    expect(asksHowItLooks("ואיך הם נראים במציאות")).toBe(true);
    expect(asksHowItLooks("איך היא נראית")).toBe(true);
  });

  it("ignores remarks and questions about other things", () => {
    expect(asksHowItLooks("ראיתי איך זה נראה באינסטגרם, מהמם")).toBe(false);
    expect(asksHowItLooks("איך נראה המשלוח אצלכם?")).toBe(false);
    expect(asksHowItLooks("איך נראית האריזה?")).toBe(false);
    expect(asksHowItLooks("יש לכם צמידים?")).toBe(false);
    expect(asksHowItLooks("")).toBe(false);
    expect(asksHowItLooks(null)).toBe(false);
  });
});

describe("pickSamples — which product the customer means, and what to send", () => {
  it("finds the product in the message", () => {
    expect(pickSamples({ text: "יש תמונה של הצמיד?" })?.key).toBe("bracelets");
    expect(pickSamples({ text: "אפשר סרטון של הטבעות?" })?.key).toBe("rings");
    expect(pickSamples({ text: "יש וידאו של העגילים" })?.key).toBe("earrings");
    expect(pickSamples({ text: "תמונה של השרשרת על הצוואר" })?.key).toBe("necklaces");
  });

  it("sends at most two files, each a public https link", () => {
    for (const text of ["תמונה של צמיד", "תמונה של טבעת", "תמונה של עגילים", "תמונה של שרשרת", "תמונה של סט"]) {
      const p = pickSamples({ text })!;
      expect(p.items.length).toBeGreaterThan(0);
      expect(p.items.length).toBeLessThanOrEqual(2);
      for (const it of p.items) {
        expect(it.url).toMatch(/^https:\/\/kracmhwzmgligxngmhmi\.supabase\.co\/storage\/v1\/object\/public\//);
        expect(ascii(it.url)).toBe(true);
        expect(["image", "video"]).toContain(it.endpoint);
        expect(it.caption.length).toBeGreaterThan(0);
      }
    }
  });

  it("picks the closer sample when the customer is specific", () => {
    expect(pickSamples({ text: "יש תמונה של טבעת אירוסין?" })?.key).toBe("rings/engagement");
    expect(pickSamples({ text: "יש סרטון של עגילי לב?" })?.key).toBe("earrings/heart");
    expect(pickSamples({ text: "תמונה של צמיד טניס צהוב" })?.key).toBe("bracelets/yellow");
    expect(pickSamples({ text: "יש סרטון של סט רויאל?" })?.key).toBe("sets/royal");
  });

  it("a set wins over the pieces it is made of", () => {
    expect(pickSamples({ text: "יש תמונה של סט שרשרת וצמיד?" })?.key).toBe("sets");
  });

  it("does not read 'סטרלינג' as a set or 'earrings' as rings", () => {
    expect(pickSamples({ text: "יש תמונה של טבעת כסף סטרלינג?" })?.key).toBe("rings");
    expect(pickSamples({ text: "earrings photo?" })?.key).toBe("earrings");
  });

  it("sends nothing for products it has no sample of", () => {
    expect(pickSamples({ text: "יש תמונה של צמיד לגבר?" })).toBeNull();
    expect(pickSamples({ text: "יש תמונה של השעון?" })).toBeNull();
    expect(pickSamples({ text: "יש תמונה?" })).toBeNull();
  });

  it("takes the product from the chat when the ask is just 'is there a video?'", () => {
    const history = [
      { role: "user", text: "יש לכם צמידי טניס?" },
      { role: "bot", text: "בטח, הנה כל הצמידים:" + NL + BRACELETS_PAGE },
    ];
    const p = pickSamples({ text: "יש וידאו?", history })!;
    expect(p.key).toBe("bracelets");
    expect(p.url).toBe(BRACELETS_PAGE); // the page she already sent
  });

  it("does not guess when the last message named several products", () => {
    const history = [{ role: "bot", text: "יש לנו טבעות, עגילים וצמידים, מה מעניין אותך?" }];
    expect(pickSamples({ text: "יש תמונה?", history })).toBeNull();
  });

  it("links the matching category on the site, tagged and encoded", () => {
    const p = pickSamples({ text: "יש תמונה של העגילים?" })!;
    expect(p.url).toContain("brjewelry.shop/?product_cat=223&"); // short form, same as the store's tagLinks
    expect(p.url).toContain("utm_source=whatsapp&utm_medium=noa&utm_content=link");
    expect(ascii(p.url)).toBe(true);
  });

  it("links moissanite when the customer is talking about moissanite", () => {
    const diamond = pickSamples({ text: "יש תמונה של עגילים?" })!.url;
    const moiss = pickSamples({ text: "יש תמונה של עגילי מוסונייט?" })!.url;
    expect(diamond).toContain("product_cat=223&"); // lab-diamond earrings
    expect(decodeURIComponent(moiss)).toContain("product_cat=עגילים&"); // moissanite earrings
  });

  // Live test 2026-11-09: Noa asked "lab diamond or moissanite?" and her own question picked moissanite.
  it("goes by the customer's words for moissanite, not Noa's question", () => {
    const history = [
      { role: "user", text: "היי, יש לכם שרשראות טניס?" },
      { role: "bot", text: "בטח, יש לנו ביהלומי מעבדה וגם במוסונייט. מה יותר בכיוון?" },
    ];
    expect(pickSamples({ text: "יש וידאו?", history })!.url).toContain("product_cat=225&");
    // ...also when her message is where the product came from
    const named = [{ role: "bot", text: "יש לנו שרשראות טניס מוסונייט ויהלומי מעבדה. מה מעניין אותך?" }];
    expect(pickSamples({ text: "יש וידאו?", history: named })!.url).toContain("product_cat=225&");
  });

  // Live test 2026-11-09: "איך זה נראה?" right after the necklace samples sent the same video again.
  it("never sends the same file twice in a chat", () => {
    const first = planMediaTurn({ text: "יש סרטון של שרשרת טניס?" })!;
    const history = [{ role: "bot", text: first.log }];
    const sent = new Set(first.messages.map((m) => m.media).filter(Boolean));
    const next = pickSamples({ text: "איך זה נראה?", history })!;
    expect(next.key).toBe("necklaces");
    expect(next.items.length).toBeGreaterThan(0);
    for (const it of next.items) expect(sent.has(it.url)).toBe(false);
  });

  it("links the Royal set's own page for the Royal set", () => {
    expect(decodeURIComponent(pickSamples({ text: "יש סרטון של סט רויאל?" })!.url)).toContain("/product/");
  });

  it("knows when this sample was already sent in the chat", () => {
    const history = [{ role: "bot", text: "שלחתי לך כמה דוגמאות" + NL + sampleMarker("bracelets") }];
    expect(pickSamples({ text: "יש תמונה של צמיד?", history })?.already).toBe(true);
    expect(pickSamples({ text: "יש תמונה של צמיד טניס צהוב?", history })?.already).toBe(false);
  });
});

describe("planMediaTurn — what goes out to the customer", () => {
  it("first ask: the samples, then one text with the site", () => {
    const plan = planMediaTurn({ text: "יש תמונה של הצמיד?" })!;
    const media = plan.messages.slice(0, -1);
    const last = plan.messages[plan.messages.length - 1];
    expect(media.length).toBeGreaterThan(0);
    for (const m of media) expect(m.media).toBeTruthy();
    expect(last.endpoint).toBe("text");
    expect(last.body).toContain("brjewelry.shop");
    expect(plan.notify).toBe(false); // nothing for the team to do
    expect(plan.log).toContain(sampleMarker("bracelets"));
    expect(plan.log).toContain(last.body);
  });

  it("asking again for the same product: the site, and the team is told", () => {
    const history = [{ role: "bot", text: "שלחתי לך כמה דוגמאות" + NL + sampleMarker("bracelets") }];
    const plan = planMediaTurn({ text: "יש עוד סרטון של הצמיד?", history })!;
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0].endpoint).toBe("text");
    expect(plan.messages[0].body).toContain("brjewelry.shop");
    expect(plan.messages[0].body).toContain("סרטון");
    expect(plan.notify).toBe(true);
    // a photo ask is answered about photos
    expect(planMediaTurn({ text: "יש עוד תמונה של הצמיד?", history })!.messages[0].body).toContain("תמונות");
  });

  it("a photo ask with no product it knows: the old answer, unchanged", () => {
    const plan = planMediaTurn({ text: "יש סרטון של השעון?" })!;
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0].body).toContain("לא יכולה לשלוח");
    expect(plan.notify).toBe(true);
  });

  it("'how does it look' sends samples when the product is known", () => {
    const plan = planMediaTurn({ text: "איך הטבעת נראית על היד?" })!;
    expect(plan.messages.length).toBeGreaterThan(1);
  });

  it("'how does it look' with no product, or samples already sent, is left to Noa", () => {
    expect(planMediaTurn({ text: "איך זה נראה?" })).toBeNull();
    const history = [{ role: "bot", text: sampleMarker("rings") }];
    expect(planMediaTurn({ text: "איך הטבעת נראית?", history })).toBeNull();
  });

  it("anything else is left to Noa", () => {
    expect(planMediaTurn({ text: "כמה עולה הצמיד?" })).toBeNull();
    expect(planMediaTurn({ text: "ומה עם עגילים, תראי לי" })).toBeNull();
  });

  it("the text is real multi-line text and promises nothing the shop can't keep", () => {
    const body = planMediaTurn({ text: "יש תמונה של העגילים?" })!.messages.at(-1)!.body!;
    expect(body.split(NL).length).toBeGreaterThan(2);
    expect(body).not.toContain("\\n");
    expect(forbiddenClaim(body)).toBeNull();
  });
});

describe("MEDIA_PROMPT_RULES — Noa knows the samples exist", () => {
  it("tells her the system sends samples and she sends the site for a specific model", () => {
    expect(MEDIA_PROMPT_RULES).toContain("[נשלחו דוגמאות:");
    expect(MEDIA_PROMPT_RULES).toContain("באתר");
    expect(MEDIA_PROMPT_RULES).toContain("לא סיבה להעביר");
    expect(MEDIA_PROMPT_RULES).not.toContain("\\n");
  });
});
