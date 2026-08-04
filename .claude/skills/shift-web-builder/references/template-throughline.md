# Template Mode — "Throughline Style" (תבנית מוכנה)

This is the fast-track production template, reverse-engineered from the Fable-built "Throughline"
SaaS landing page (single-file HTML, dark, scroll-drawn signature line). In template mode you do
NOT run the full 7-phase process: you re-skin this exact skeleton for the client's business,
translate the dynamics to Hebrew/RTL, and **change exactly ONE variation axis** (§5) so every
deployment feels distinct while staying production-fast.

Template mode still obeys ALL hard rules in SKILL.md (RTL, Hebrew typography, ת"י 5568) and the
QA gate. What it skips: the two research rounds and the full design-plan ceremony (replaced by a
mini-intake, §6).

## 1. The core idea (don't lose this when re-skinning)

The page's signature is STRUCTURAL: one continuous glowing SVG path — "the line" — that draws
itself as the user scrolls, snakes down the ENTIRE page, physically connects every section, and
terminates exactly on the final CTA button. The line is the product's metaphor made into layout
(for Throughline: "the through-line of your content"). For each client, name the line's meaning
in their world (fitness coach: קו ההתקדמות; accountant: השורה התחתונה; barber: קו התספורת;
automation agency: ה-flow). If the metaphor can't be named in one Hebrew phrase, the line is
decoration — fix the naming before building.

## 2. Design DNA (replicate faithfully)

**Canvas:** near-black indigo base (`#080816`–`#0d0d24` range), subtle dot-grid texture
(radial-gradient dots, ~24px cell, 4–6% opacity), 1–2 large radial color glows anchored to the
hero and the final CTA. Generous darkness between sections — the glow moments need contrast.

**The line:** one `<svg>` spanning the full document (absolute, behind content,
`pointer-events:none`), a single `<path>` with `vector-effect="non-scaling-stroke"`,
stroke ~3px, `stroke-linecap="round"`, gradient stroke along its length — cool at top → warm at
bottom (Throughline used cyan `#5eead4`/`#67e8f9` → violet → amber/orange `#fb923c`). Glow via
duplicated path underneath with `filter: blur(8–14px)` + opacity 0.5. Progressive draw:
`stroke-dasharray = pathLength`, update `stroke-dashoffset` from scroll progress
(`requestAnimationFrame` + `IntersectionObserver`/scroll listener; respect
`prefers-reduced-motion` → show full line, no animation). A glowing head-dot (small circle,
strong blur halo) sits at the current tip via `getPointAtLength()`.
**RTL adaptation:** mirror the path's horizontal logic (start its first bend from the RIGHT,
since reading anchors right); the line weaving "between" columns stays centered.

**Typography (Hebrew RTL build):**
- Display: heavy geometric Hebrew sans — Secular One, or Heebo 900 (Throughline's Latin look ≈
  Space Grotesk; Secular One is the Hebrew equivalent in spirit). Hero ~clamp(40px, 7vw, 76px),
  line-height 1.15–1.2, two stacked statements.
- **Split-color emphasis:** one word per hero line carries an accent (line 1 word in pink/violet
  `#e879f9`-ish, line 2 word in cyan) — e.g. "צפיות זה <span>רעש</span>. / שמירות זה
  <span>סיגנל</span>." Keyword-first per `eye-and-layout.md`.
- Body: Heebo/Noto Sans Hebrew 400, ≥16px, lh 1.6–1.7, muted slate (`#94a3b8`-ish on dark;
  verify ≥4.5:1).
- **Eyebrows & data labels:** the mono-uppercase-letterspaced look (`• CREATOR ANALYTICS · …`)
  stays in LATIN mono (Space Mono / JetBrains Mono / Miriam Libre for a Hebrew-flavored mono) —
  letter-spacing is allowed on Latin only. Pattern: colored `•` + 2–4 word label + `·`
  separators. Hebrew eyebrows (when Latin doesn't fit the client): small bold colored Hebrew,
  NO letterspacing.

**Recurring components:**
- Nav: logo+wordmark at inline-start (RIGHT in RTL), 3 links + one light pill CTA at inline-end.
- Hero: eyebrow → two-line split-color headline → 2–3 line muted sub → primary light pill +
  ghost secondary → product mockup panel (glowing chart / relevant visual) → **marquee data
  ticker** strip (mono, the client's real numbers: ratings, clients served, years, ₪ saved —
  bidi-isolate every figure).
- "Demoted/Promoted" two-column comparison (the line passes between): left column = the old way,
  dimmed, each item name + one cutting line of copy; right column = the client's way, cyan-dot
  bullets, highlighted numbers. Column header pills. In RTL the PROMOTED column sits RIGHT
  (read first).
- Staircase timeline: 4 cards stepping down along the line with mono time/step labels
  (T+0 → T+48H ⇒ שלב 1 → שלב 4 or יום 1 → יום 30), label color warming as it descends.
  RTL: cards step left as they descend (start right).
- Annotated-chart section ("see the exact second they leave") — adapt to a client-relevant
  "moment of truth" visual; skip if no honest equivalent (don't fake data).
- Three-cards section ("Three rooms. One thread.") → three offerings, line threads through.
- Pricing: exactly two cards, second one featured (gradient border glow + filled CTA vs ghost),
  mono trust line under: "ניסיון 14 יום · בלי כרטיס אשראי · ביטול בשני קליקים" style.
- Final CTA: the line's terminus — short imperative headline ("מצאו את ה-X שלכם"), the head-dot
  lands on/above the button. One button.
- Footer: minimal, dark, + הצהרת נגישות link.

**Copy voice:** short declarative knife-sentences, numbers everywhere, zero fluff
("טרופי. לא כלי." / "Cheap to give. Predicts nothing."). Hebrew: conversational-sharp, not
marketing-inflated.

## 3. What must stay vs. what adapts per client

STAYS (the template's identity): dark canvas + glows + dot grid · the scroll-drawn full-page
line ending on the CTA · split-color two-statement hero · mono eyebrow/ticker system ·
demoted/promoted comparison · featured-of-two pricing · knife copy voice.
ADAPTS (content layer, every client): all copy/metaphor naming, the client's real numbers,
section count/order per their offer, mockup contents, CTA action (וואטסאפ/טופס/שיחה per Israeli
conventions — sticky WhatsApp still applies).

## 4. The ONE-change rule

Every deployment changes **exactly one** variation axis — no more (template drifts into custom
work), no less (clients get clones). Track which axis was used per client (memory/notes) and
rotate; two clients in the same niche must never share an axis value.

| Axis | Example values |
|---|---|
| A. Palette temperature | Indigo+cyan→orange (original) · charcoal+lime→violet · deep-green+gold→red · navy+pink→teal |
| B. Line geometry | Smooth S-snake (original) · sharp circuit angles (90°) · soft pencil-sketch wobble · dashed-becoming-solid |
| C. Line metaphor object | Plain stroke (original) · road with dashes · heartbeat/pulse spikes at sections · thread with stitch marks |
| D. Hero mockup motif | Analytics chart (original) · phone/WhatsApp conversation · before/after slider · map route |
| E. Display face | Secular One · Suez One · Heebo 900 · Karantina (loud niches) |
| F. Texture | Dot grid (original) · fine diagonal lines · noise grain · blueprint grid |

Default for the first-ever deployment: change axis A (palette) and keep the rest original.
State in delivery which axis was changed: "וריאציה: ציר B — קו בזוויות מעגל חשמלי".

## 5. Mini-intake for template mode (replaces Phases 1–4)

Ask in one batch (skip anything already known):
```
מסלול תבנית — צריך ממך רק את אלה:
1. שם העסק + מה אתם עושים במשפט?
2. הפעולה האחת שהדף צריך להשיג (וואטסאפ / טופס / שיחה / קנייה)?
3. 3–5 מספרים אמיתיים שאפשר להתגאות בהם (לקוחות, שנים, דירוג, אחוזים)?
4. "הדרך הישנה" מול "הדרך שלכם" — תן לי 3–4 נקודות לכל צד.
5. שני מחירים/חבילות (אם רלוונטי), ומה ההבדל ביניהם?
```
Then: name the line metaphor yourself, pick the variation axis, confirm both in one line
("הקו יהיה ___, והשינוי הפעם: ___"), and build. One checkpoint only — before delivery QA.

## 6. Build notes

Single self-contained HTML (the original was). Performance: one SVG path + transform/offset
animations only (no per-frame layout thrash); ticker via CSS `animation` with
`prefers-reduced-motion` pause; glows via CSS, not images. All hard rules + Phase-7 QA gate
apply unchanged — dark themes fail contrast more often than light ones; check every
muted-text/background pair.
