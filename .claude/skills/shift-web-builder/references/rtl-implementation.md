# Hebrew/RTL Technical Implementation — Code-Level Law

RTL done right is invisible; done wrong it's the first thing an Israeli user feels. The strategy:
declare direction once, use logical properties everywhere, let the browser do the mirroring, and
manually handle only the genuine exceptions (bidi runs and directional icons).

## 1. Document foundation

```html
<!DOCTYPE html>
<html dir="rtl" lang="he">
```
- `dir="rtl"` on `<html>` — never on scattered divs. `lang="he"` is also an accessibility and
  SEO requirement (screen readers pick the Hebrew voice from it).
- Prefer HTML markup (`dir`, `<bdi>`) over CSS `direction:`/Unicode control characters wherever
  markup can do the job — markup survives copy-paste and CSS failures.

## 2. Logical properties — the only allowed direction-sensitive CSS

Physical `left/right` properties are banned in layout code. Mapping:

| Banned (physical) | Required (logical) |
|---|---|
| `margin-left / margin-right` | `margin-inline-start / margin-inline-end` |
| `padding-left / padding-right` | `padding-inline-start / padding-inline-end` |
| `left: / right:` (positioning) | `inset-inline-start / inset-inline-end` |
| `border-left / border-right` | `border-inline-start / border-inline-end` |
| `text-align: left / right` | `text-align: start / end` |
| `border-top-left-radius` … | `border-start-start-radius` … |
| `float: left / right` | avoid floats; use flex/grid |

- **Flexbox and Grid mirror automatically** under `dir="rtl"` — `flex-direction: row` flows
  right→left, grid column 1 starts at the right. Define grids semantically
  (`grid-template-columns: 250px 1fr`) and trust the mirroring; do not "pre-flip" anything.
- `gap` is direction-free — prefer it over directional margins between siblings.
- Physical properties remain fine for the vertical axis (`margin-top` etc.), though
  `margin-block-*` is cleaner.
- Allowed physical exception: a truly fixed-position element pinned for a non-textual reason
  (e.g., floating WhatsApp button conventionally bottom-LEFT in Israeli sites, opposite the
  right-handed thumb's text zone) — comment it: `/* intentionally physical */`.

## 3. Bidi — mixed Hebrew/English/numbers (where most bugs live)

The Unicode bidi algorithm handles single runs fine; it fails on punctuation/hyphens at run
boundaries. Rules:

- **Phone numbers:** `<span dir="ltr">050-123-4567</span>` — without it the hyphen order
  scrambles. Link: `<a href="tel:+972501234567" dir="ltr">`.
- **Prices, dates with slashes, addresses with numbers, units (m², km):** wrap in `<bdi>` (best:
  isolates without forcing direction) or `dir="ltr"` span when the content is fully LTR.
- **English brand/product names inside Hebrew sentences:** usually fine bare; wrap in `<bdi>` if
  followed by punctuation or numbers ("דגם X-500 החדש" is a classic scrambler).
- **User-generated / dynamic content** (names, CRM fields): always `<bdi>` — you can't predict
  the script.
- In CSS-only contexts: `.ltr-run { direction: ltr; unicode-bidi: isolate; }`.
- Inputs for phone/email/URL: `<input dir="ltr" style="text-align: end">` so typing behaves
  while the field visually sits in the RTL form.
- Punctuation at line ends (?, !, :) misplacing itself = a missing isolation upstream; fix the
  run, don't hack with `&rlm;` unless inside attribute text where markup is impossible (`title`,
  `alt` may need `&rlm;`/`&lrm;`).

## 4. Icons and imagery — what mirrors and what doesn't

MIRROR (anything encoding reading direction): back/forward arrows, chevrons in breadcrumbs and
accordions pointing "next", carousel controls, "send" arrows, undo/redo, progress direction,
list-item leading icons' position.
```css
[dir="rtl"] .icon-directional { transform: scaleX(-1); }
```
NEVER mirror: logos, clocks, checkmarks, phone/WhatsApp icons, media play buttons (play stays ▶
by convention), brand icons, maps, photos of real things, numbers inside badges.
Question-mark cases (search magnifier, speech bubbles): leave unmirrored.

Carousels/sliders and scroll-snap: first slide enters from the RIGHT; verify the JS library
supports `rtl` (Swiper: `dir="rtl"` on container; Embla: `direction: 'rtl'`).

## 5. Framework specifics

**Tailwind:** use logical utilities — `ms-* me-* ps-* pe-* start-* end-*`, `text-start/text-end`,
and `rtl:`/`ltr:` variants for exceptions (`rtl:rotate-180` on chevrons). Never `ml-/mr-/pl-/pr-`
in this codebase. `space-x-*` needs `space-x-reverse` under RTL — prefer `gap` in flex instead.

**React/JSX artifacts:** set `document.documentElement.dir = 'he' && 'rtl'` equivalents at mount
(`useEffect(() => { document.documentElement.dir = 'rtl'; document.documentElement.lang = 'he'; }, [])`)
because the artifact host page is LTR. Component libraries (shadcn/ui): verify popovers/drawers/
toasts anchor correctly; pass `dir="rtl"` to Radix-based components that accept it.

**Plain HTML single-file deliverables (the default):** everything in one file — fonts via Google
CDN link, CSS in `<style>`, no build step, works opened from disk.

## 6. RTL QA (part of Phase 7)

- [ ] Grep CSS for banned physical properties (left/right) — zero hits outside commented exceptions.
- [ ] Phone, prices, emails, English runs render correctly (read every mixed line out loud).
- [ ] All directional icons flip; logo and play buttons don't.
- [ ] Forms: labels/inputs aligned start; LTR fields typed test (phone/email).
- [ ] Mobile menu slides from the RIGHT; close button where the thumb expects it.
- [ ] Browser default scrollbar side and any `overflow` containers behave (test long content).
- [ ] Copy-paste a paragraph from the page into a plain editor — word order survives (markup-level
      bidi, not visual hacks).
