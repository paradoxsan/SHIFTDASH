# The Build Process — Pipeline, Open-Question Scripts (Hebrew), and the Designer's Method

This file is read FIRST (Phase 1). It contains the conversation choreography — what to ask, when,
and in what spirit — plus the design method this skill expects from the model at build time
(distilled from how Claude/Fable works best on web projects).

## 0. Conversation principles

- **Mode first.** If Step 0 in SKILL.md wasn't resolved yet ("תבנית מוכנה או שקיבלנו כסף?"),
  ask it before any other question. Template answer → leave this pipeline for
  `template-throughline.md`.
- **Open questions, batched, justified.** Each phase has ONE batch of questions. Ask only what
  the answers will actually change. Before asking, harvest everything already available:
  the conversation, pasted briefs, memory, the client's existing site/socials (fetch them!).
  Confirm harvested facts ("ראיתי שהעסק נמצא ב... נכון?") instead of re-asking.
- **Open > closed.** "מה לקוחות הכי אוהבים אצלכם?" beats "אתם רוצים אזור ביקורות?". Closed
  options are offered only as a fallback when the user struggles.
- **Hebrew, conversational, zero jargon to clients.** Translate: "above the fold" → "מה שרואים
  בלי לגלול"; "CTA" → "הפעולה שאנחנו רוצים שיעשו".
- Checkpoints are real: after Phase 2, 4, and 5 — present, get a nod, continue. Don't barrel
  through to code.

## 1. Phase-1 intake script (adapt, don't recite)

Open with classification (often inferable — then skip): site type, and:

```
כמה שאלות פתוחות כדי שאבנה משהו מדויק ולא גנרי:
1. ספר לי על העסק במשפט-שניים — מה אתם עושים, למי, ואיפה?
2. מה המטרה של [הדף/האתר]? כשמישהו נכנס — מה ההצלחה? (שיחה? ליד? קנייה? הרשמה?)
3. מי הלקוח שהכי היית רוצה שיגיע דרך האתר? תאר אותו.
4. מה יש היום? (אתר קיים, דף פייסבוק/אינסטגרם, לוגו, צבעים, תמונות) — תזרוק לינקים.
5. תן לי 2–3 עסקים (מתחרים או לא) שהאתרים שלהם עושים לך "וואו" — ולמה.
```
For a חנות add: product count, payment/shipping reality, inventory source.
For אתר תדמית add: how many pages, what the business wants people to DO after reading.
For דף נחיתה add: traffic source (קמפיין ממומן? איזו פלטפורמה?), the offer/הטבה.

## 2. Phase-3 production-question script (after Round-1 research)

Anchor each question in a research finding — this shows the work and sharpens answers:

```
עשיתי סיבוב מחקר על הנישה. כמה דברים שעלו, וכמה שאלות שנגזרות מהם:
[ממצא 1 בקצרה] ←
1. רוב המתחרים מדגישים [X]. מה אצלכם שונה/טוב יותר באמת? במילים שלך, בלי שיווק.
2. איזה הוכחות יש לכם ביד? (ביקורות גוגל, תמונות לפני/אחרי, מספרים, לקוחות מוכרים, תעודות)
3. מה ההתנגדות הכי נפוצה שאתה שומע מלקוחות לפני שהם סוגרים? ("יקר לי", "אין זמן"...)
4. תכל'ס — פעולה אחת שהדף צריך להשיג. אם הם עושים רק דבר אחד, מה זה? (וואטסאפ? טופס? שיחה?)
5. איך העסק צריך להרגיש? תן 3 מילים (למשל: חם ומשפחתי / מקצועי ומדויק / צעיר ונועז)
6. יש מגבלות? (תקציב צילום, תכנים שאסור, דדליין, מערכת שחייבים להתחבר אליה)
```

## 3. Phase-5: the designer's method (how to think when planning & building)

This is the working method that produces distinctive, non-templated results:

1. **Plan in tokens before pixels.** Write: palette (4–6 named hex), type pairing with roles
   (display/body/utility per `hebrew-typography.md`), spacing scale, and **the signature** — the
   ONE element this site will be remembered by (a type treatment, an interaction, a layout move,
   a photographic style). The signature must come from the client's actual world (their
   materials, tools, vernacular — a barber's site smells different from a lawyer's), not from a
   trend.
2. **Audit the plan against the default traps.** Known AI-design ruts: cream background + serif +
   terracotta; near-black + acid green accent; broadsheet hairlines-and-columns. Also the
   generic-SMB rut: blue gradient + stock handshake + three feature cards. If any part of the
   plan would have been produced for ANY client in this niche — that part isn't designed yet;
   revise it and say what changed.
3. **Spend boldness in one place.** The signature gets the risk; everything around it stays
   quiet and disciplined. Two signatures = noise. Before "leaving the house," remove one
   accessory.
4. **Copy is design material.** Write the actual Hebrew copy as part of the plan: hero headline
   (≤8 words, keyword first), the one CTA verb phrase, section headers. Conversational Israeli
   Hebrew — concrete, specific, no "אנחנו מאמינים במצוינות". A button says exactly what happens:
   "קבעו תור בוואטסאפ", not "שליחה".
5. **Build to a quality floor without announcing it:** responsive to 360px, visible keyboard
   focus, reduced-motion respected, semantic HTML — these are not features to list, they're the
   floor.
6. **Self-critique pass after building.** Re-read the rendered structure top-to-bottom as the
   target customer on a phone: does each screen-height have one king? does the page answer
   מי/מה/למה-אתה within the hero? is anything decoration that serves nothing? Cut it.

## 4. Section playbooks (defaults — override per research)

**דף נחיתה (campaign):** hero (headline+sub+CTA+proof hint) → trust strip (logos/ratings) →
the offer in detail → how it works (3 steps) → proof (testimonials with names/photos) →
objection-killers (FAQ 4–6) → final CTA block → mini-footer with hours + הצהרת נגישות link.
Form: minimum fields (name + phone wins in Israel); sticky WhatsApp button bottom-left;
click-to-call in the mobile header.

**אתר תדמית:** home (hero thesis → what we do → why us/proof → CTA), about (story, faces —
Israelis buy from people), services (one section or page per service, each with its own CTA),
testimonials, contact (form + phone + WhatsApp + waze/map + hours א'–ה').

**חנות:** home (hero offer → categories → bestsellers → trust: משלוחים/החזרות/תשלום מאובטח),
category grid RTL-correct, product page (gallery right-of-text or stacked mobile, price ₪,
add-to-cart fixed on mobile), cart/checkout friction minimal. Flag: real stores need a platform
(Shopify/Wix/WooCommerce) — this skill delivers the design system + key page builds + spec,
not a payment backend, unless wired via connectors.

## 5. Delivery format

Default: single self-contained HTML file (fonts via CDN, CSS+JS inline) saved to outputs —
openable and hostable anywhere. React artifact when the user wants interactivity/iteration in
Claude. Multi-page sites: one HTML per page + shared style block, or a zip. Always end delivery
with: decisions-summary (research-backed), accessibility status per `accessibility-israel.md`,
and next steps (hosting, domain, pixel/analytics wiring, הצהרת נגישות completion).
