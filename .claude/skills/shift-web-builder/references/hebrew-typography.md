# Hebrew Web Typography — Font System + Mandatory Typography & Spacing Laws

Hebrew is not "Latin pointing the other way." It has no uppercase, no native italics, different
vertical metrics (only ל ascends; ך ן ף ץ ק descend), and letterforms whose rhythm breaks under
tracking. This file is the binding type system for every site.

## 1. The Hebrew font palette (all on Google Fonts unless noted)

| Font | Character | Use for |
|---|---|---|
| **Heebo** | The workhorse. Roboto's Hebrew sibling by Oded Ezer; 9 weights (Thin–Black); excellent at small sizes; full nikud | Default body + UI for almost any business; headings via heavy weights |
| **Rubik** | Rounded corners, friendly, young, modern; variable weights | Brands with warmth/energy: food, kids, fitness, lifestyle, local SMBs |
| **Assistant** | Light, airy, elegant | Fashion, interior design, clinics, premium-minimal brands; body text in calm designs |
| **Noto Sans Hebrew** | Neutral, enormous weight range, bulletproof rendering | Data-heavy UI, dashboards, when Heebo feels too branded |
| **Open Sans Hebrew** | Conservative, institutional | Corporate, legal, finance — when trust > personality |
| **Frank Ruhl Libre** | THE Hebrew serif (newspaper heritage — Haaretz lineage) | Editorial gravitas: law firms, journalism, culture, heritage brands; display or long-form |
| **Suez One** | Heavy slab display, one weight | Headlines only — bold statements, food, nightlife, campaigns |
| **Secular One** | Geometric display, one weight | Headlines only — tech-ish, confident, municipal/young |
| **Miriam Libre** | Mono-ish, slightly retro | Accents, tags, numbers, techy details |
| **Karantina** | Condensed display, loud | Posters/promos, big sale energy — never body |
| **Amatic SC** | Handwritten, thin | Sparingly: boutique/handmade vibe accents |
| **Alef / Varela Round / David Libre / Bellefair** | Niche alternatives | When the brand needs them specifically |

**Pairing recipe:** one characterful display face (used with restraint) + one quiet text face.
Proven pairs: Suez One + Heebo · Frank Ruhl Libre + Assistant · Secular One + Noto Sans Hebrew ·
Rubik (Bold headings) + Rubik (Regular body — single-family is legitimate and very Israeli) ·
Karantina + Heebo. For mixed Hebrew/English sites, pick faces whose Latin matches in weight and
x-height (Heebo↔Roboto/Inter, Rubik's own Latin is good, Assistant↔Source Sans).
Avoid pairing two display faces, and avoid >2 families + 4 total weights per site.

**Loading:** Google Fonts CDN with `display=swap`; request only the weights actually used
(e.g., 400;700;900). Subset `hebrew` + `latin`. Always declare a fallback stack ending in a
generic: `font-family: 'Heebo', 'Arial Hebrew', Arial, sans-serif;`.

## 2. Mandatory typography laws (every site, no exceptions)

1. **No letter-spacing on Hebrew.** Not on headings, not "just a little." Hebrew letterforms are
   designed to a closed rhythm; tracking shatters word-shapes the eye relies on. (Tiny positive
   tracking is tolerable on ALL-Latin labels only.) If a heading feels cramped — change weight or
   size, not tracking. `letter-spacing: normal` is the law.
2. **No italics/oblique on Hebrew.** Browsers fake-slant it; it looks broken. Emphasis tools:
   weight (700/900), size, color, background highlight. `<em>` content in Hebrew gets
   `font-style: normal; font-weight: 700;`.
3. **No uppercase tricks** — Hebrew has no case. Any `text-transform` plan is meaningless; design
   hierarchy with weight/size/color from the start.
4. **Body size ≥16px** (Hebrew reads slightly smaller than Latin at equal px — when in doubt, 17–18px).
   Minimum anywhere on page: 14px (footnotes/captions).
5. **Line-height: body 1.6–1.7** (more than the Latin habit of 1.5 — Hebrew's denser block needs
   air; if nikud is used anywhere, ≥1.8 there). **Headings 1.2–1.35** (Hebrew headings can't go as
   tight as Latin's 1.1 — descenders ך ן ף ץ ק collide).
6. **Line length 45–75 characters** (`max-inline-size: 60ch` default on paragraphs).
7. **Word-spacing:** default, or up to `0.05em` for dense body text. Never negative.

## 3. Scale & spacing system (the math of "נעים לעין")

- **Type scale:** pick ONE ratio and derive every size from a 16–18px base.
  - 1.2 (minor third) — quiet, content-heavy brand sites.
  - 1.25–1.333 — landing pages needing punchy heroes.
  - Example (1.25, base 16): 16 → 20 → 25 → 31 → 39 → 49 → 61(hero). Round to whole px. No
    orphan sizes outside the scale ("17px because it felt right" is how systems die).
  - Mobile: hero sizes drop 1–2 scale steps; body NEVER drops below 16px (also prevents iOS zoom
    on inputs).
- **Spacing scale: 8px system** — all margins/paddings/gaps from {4, 8, 12, 16, 24, 32, 48, 64,
  96, 120}. Section vertical padding: 64–96px desktop, 48–64px mobile. Component gap rules come
  from Gestalt proximity (see `eye-and-layout.md` §4): inner < outer, always.
- **Vertical rhythm:** space ABOVE a heading ≈ 2× space below it (binds heading to its content).
  Paragraph spacing: 0.75–1em between paragraphs; never both indent AND space.
- **Contrast of hierarchy:** adjacent levels must differ by at least a full scale step OR
  300 weight units OR a clear color shift — two weak differences don't add up to one clear one.

## 4. Israeli formatting conventions (bake into copy and components)

- Currency: `₪` after the number with no space in running text per common Israeli web usage
  ("299₪") or "299 ש"ח"; pick one per site. Prices are bidi-sensitive — wrap in `<bdi>`.
- Dates: DD/MM/YYYY or "12 במרץ 2026". Time: 24-hour ("9:00–18:00").
- Hours block: "א'–ה' 9:00–18:00, ו' 9:00–13:00" — the Sunday–Thursday week, Friday short day.
- Phone: 05X-XXX-XXXX displayed, always inside `dir="ltr"` span; link as `tel:+972...`.
- Quotation: „..." or "..." consistently; gershayim for acronyms (צה"ל), geresh for abbreviations.
- Numbers and digits stay Western (1,234.56) and are auto-LTR — isolate them (see rtl file).

## 5. Typography QA (run at Phase 7)

- [ ] Zero `letter-spacing`/`font-style: italic` on any Hebrew text (grep the CSS).
- [ ] Body ≥16px, line-height 1.6–1.7, paragraphs capped at ~60ch.
- [ ] Every font-size on page belongs to the declared scale; every space to the 8px system.
- [ ] ≤2 families, ≤4 weights; weights actually loaded in the font request.
- [ ] Headings: keyword-first, no orphan single word on last line at desktop width (adjust
      wording or `max-inline-size`, not tracking).
- [ ] ₪/dates/phones formatted per §4 and bidi-isolated.
- [ ] Hierarchy test: squint (or blur mentally) — can you still tell what's most important in
      each section?
