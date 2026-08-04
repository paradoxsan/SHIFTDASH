# How the Human Eye Reads — and What It Dictates About Layout (Hebrew/RTL Edition)

This file turns vision science into layout law. Everything here is doubly important in Hebrew,
because most of the published heuristics assume left-to-right reading and must be MIRRORED.

## 1. The mechanics: saccades and fixations

Reading is not a smooth sweep. The eye moves in rapid jumps (**saccades**, ~20–50ms, during which
the reader is effectively blind) and pauses (**fixations**, ~200–250ms) where actual reading
happens. Typical saccade length is 7–8 characters.

The perceptual span is **asymmetric in the reading direction**: a reader sees ~3–4 characters
behind the fixation and ~14–15 characters ahead. For Hebrew, "ahead" is LEFTWARD — the eye
previews text to the left of where it's looking. Consequences:

- **Line beginnings (the RIGHT edge in Hebrew) get the most fixations.** Front-load keywords:
  the first 1–2 words of every heading, paragraph, and bullet carry the message. Never open a
  paragraph with filler ("חשוב לציין ש...", "כמו כן").
- **The return sweep** (end of line → start of next line) is the costliest eye movement. Long
  lines make readers miss or repeat lines. This is the physiological reason for the line-length
  law: **45–75 characters per line** (sweet spot ~55–65; >80 measurably fatigues). In CSS:
  `max-inline-size: 60ch` on body text, always.
- A clean, consistent right edge (Hebrew text aligned `start`, i.e., right) makes return sweeps
  predictable. **Never center body paragraphs** — centering randomizes line-start positions and
  breaks the sweep. Centering is allowed for short display text only (a hero headline + one line).
- Never justify (`text-align: justify`) Hebrew web text — it creates rivers of uneven word
  spacing that disrupt saccade rhythm.

## 2. Scanning patterns — mirrored for Hebrew

Users scan before they read; the patterns below describe where attention lands by default.
Eye-tracking on RTL languages confirms the patterns mirror.

**Reversed F-pattern** (text-heavy pages: articles, service descriptions, long landing pages).
Hebrew readers: a horizontal sweep across the TOP starting from the RIGHT, a second shorter
sweep lower, then a vertical scan down the RIGHT edge. Design response:
- The first two lines of any text block do disproportionate work — put the conclusion first.
- The right column of the page is the attention spine: headings, icons, numbers, and bullets
  anchor to the right edge.
- Break the F's "blindness" lower on the page with subheadings, bolded keywords (2–3 words max),
  and visual interruptions — this converts the F into a "layer cake" scan (heading-to-heading
  hopping), which is what a well-structured page produces.

**Reversed Z-pattern** (sparse pages: hero sections, simple landing pages). The eye travels
top-RIGHT → top-LEFT, diagonal down to bottom-RIGHT, then → bottom-LEFT. Design response for a
Hebrew hero: logo/brand top-right, secondary action top-left, headline along the top stroke,
and the primary CTA at a Z terminal (commonly bottom-left of the hero, or centered after the
diagonal). Place the most important visual on the diagonal, not against it.

**First impression ≈ 50ms.** Visual hierarchy must answer in half a second: מי אתה, מה אתה נותן,
מה אני עושה עכשיו. If the hero needs reading to answer those, it failed.

## 3. Hierarchy — directing fixations on purpose

The eye lands on the most visually salient element first, regardless of HTML order. Salience
levers, strongest to weakest: size → contrast (color/value) → weight → position (top/right in
Hebrew) → whitespace isolation → motion (use sparingly). Rules:

- **One king per screen.** Each viewport-height of the page has exactly one dominant element.
  Two competing focal points = zero focal points.
- **Hierarchy of exactly 3 levels per section**: dominant (headline/visual), secondary
  (subhead/supporting image), tertiary (body/caption). If everything is bold, nothing is.
- **The CTA wins its area by contrast, not by size alone.** A button in the accent color, with
  generous padding, surrounded by whitespace, outperforms a giant noisy banner.
- Faces in photos: people look where the photographed person looks. Point subject gazes toward
  the headline/CTA (in RTL compositions, typically gazing leftward into the content).

## 4. Gestalt laws → spacing decisions

- **Proximity:** elements close together read as one unit. Therefore: space WITHIN a component
  < space BETWEEN components. Practical ratio: if card-internal gaps are 16px, card-to-card gaps
  are 24–32px, and section-to-section gaps are 64–120px. Most "messy-looking" pages violate
  exactly this.
- **Similarity:** same role = same style, everywhere. All primary CTAs identical; all cards on a
  grid identical in structure. Variation signals meaning — don't spend it on decoration.
- **Common region:** a background tint or card border groups harder than proximity. Use section
  background alternation (white / off-white) to chunk a long page into digestible scans.
- **Continuity & alignment:** every element aligns to something. In RTL, the master alignment
  line is the RIGHT margin. Mixed alignments (some sections centered, some right) read as broken
  unless the change is deliberate and consistent.

## 5. Whitespace is comprehension time

Fixation density drops in cramped layouts because the eye can't isolate targets. Whitespace
around an element increases both its perceived importance and its reading accuracy. Minimums:
text blocks get padding ≥ their font-size ×1.5 from any border; headlines get more space ABOVE
than below (binding them to their content — proximity again); never let two unrelated elements
sit closer than two related ones.

## 6. Quick application table

| Page zone | Hebrew-RTL rule |
|---|---|
| Hero | Reversed-Z. Brand top-right. One headline ≤8 words, keyword first. One CTA. |
| Nav | Logo right, menu flows leftward, CTA button at far LEFT end of the bar. |
| Body sections | Layer cake: subheading every 2–4 paragraphs, right-anchored, conclusion-first. |
| Lists/cards | Icon/number at the RIGHT of each item; scannable first words. |
| Forms | Labels above fields, right-aligned; one column; CTA full-width on mobile. |
| Footer | Densest text on the page — smallest type but still ≥14px, line-height 1.6. |
