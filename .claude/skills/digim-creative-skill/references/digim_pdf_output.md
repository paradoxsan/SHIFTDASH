# DIGIM PDF Output — the final deliverable spec & build recipe

The final deliverable is a **DIGIM-branded PDF** in Hebrew (RTL): the client-facing
creative-ideas document. This file is the single source of truth for how it looks and how
it's built, so every engagement looks identical and professional. The reusable build script
is `scripts/build_pdf.py`; this doc explains the spec behind it and how to drive it.

## Table of contents
1. The visual spec (locked)
2. The concept-card structure (4 sections)
3. Fonts & logo (bundled assets)
4. How to build (the script)
5. Verify before delivering
6. Honesty notes carried into the PDF

---

## 1. The visual spec (locked)

This matches the established DIGIM template exactly. Do not redesign it.

- **Page:** A4, `margin:0`.
- **Background:** full-bleed **orange `#FAA31E`**, set on `html` so it paints to the edge on
  *every* page.
- **White card:** a white rounded rectangle inset **5.5mm** from all edges, `border-radius:7mm`,
  sitting on the orange. Content padding inside the card: **15mm top / 17mm sides / 20mm bottom**.
- **Font:** **Assistant** (Hebrew) — Regular (400) for body/title, Bold (700) for idea titles
  and sub-headings. See §3.
- **DIGIM logo:** bottom-left inside each card, ~**34mm** wide. Bundled at
  `assets/digim_logo.png` (cropped from the source template; reuse it, don't re-render).
- **One idea per page.** The first idea shares page 1 with the header; ideas 2–10 each get their
  own page. `page-break-after:always` (except the last page).

**Header (page 1 only):**
- Title **"רעיונות קריאייטיב"** — centered, ~25pt, weight 400, near-black `#1d1d1d`.
- Subtitle **"[שם העסק] | [סניף/מיקום]"** — centered, ~14.5pt, weight 400.
- A thin divider rule under it — ~88% width, `1.4px` solid `#2b2b2b`, centered.

**Alignment rules (important — this is how the template reads):**
- **Centered:** title, subtitle, sub-headings (תיאור/מטרה/תסריט/אלמנטים), and the body
  paragraphs under תיאור הרעיון and מטרה.
- **Right-aligned (RTL):** the idea title (`N. כותרת`), the numbered תסריט steps, and the
  אלמנטים bullets.
- Body text near-black; idea titles and sub-headings pure black.

---

## 2. The concept-card structure (4 sections)

Each of the **10** ideas uses exactly these four sections, in this order — same headings every
time:

- **תיאור הרעיון** — one prose paragraph describing the reel idea (what the viewer sees / the
  concept). Fold the hook and the gist of the shot flow into this prose.
- **מטרה** — one or two sentences: what the reel is for (awareness / saves & shares / leads /
  foot traffic), in the client's terms.
- **תסריט / פורמט** — a numbered, beat-by-beat shot list (the steps of the reel).
- **אלמנטים ויזואליים** — bulleted production notes: camera/edit style, the *type* of sound
  (mark "מוצע" / suggested unless a trend was confirmed live), on-screen-text style, and any
  hard constraint (e.g. "ילדים מצולמים רק בהסכמת הורה, בטשטוש").

This client PDF deliberately **does not** include captions, hashtags, or AI-generation prompts —
the DIGIM template has no slot for them. Develop those during the concept step and, if the user
wants them, hand them over as a **separate internal production sheet** (e.g. the richer
markdown brief), not inside this PDF.

---

## 3. Fonts & logo (bundled assets)

Both are bundled in `assets/` so the build is self-contained and offline-safe:
- `assets/fonts/Assistant-Regular.ttf`, `-SemiBold.ttf`, `-Bold.ttf`, `-ExtraBold.ttf`
- `assets/digim_logo.png`

If the fonts are ever missing, re-create them from Google Fonts' GitHub mirror (the gstatic
CDN is usually network-blocked, but `raw.githubusercontent.com` is reachable):

```bash
curl -sL "https://raw.githubusercontent.com/google/fonts/main/ofl/assistant/Assistant%5Bwght%5D.ttf" -o Assistant-VF.ttf
python3 - <<'PY'
from fontTools import ttLib
from fontTools.varLib.instancer import instantiateVariableFont
for w,name in [(400,'Regular'),(600,'SemiBold'),(700,'Bold'),(800,'ExtraBold')]:
    f=ttLib.TTFont('Assistant-VF.ttf'); instantiateVariableFont(f,{'wght':w},inplace=True)
    f.save(f'Assistant-{name}.ttf')
PY
```

If the logo is ever missing and the user supplies a DIGIM-branded source PDF, recover it by
rasterizing the source at 300dpi and cropping the black "DIGIM" wordmark from the bottom-left
(detect the black-pixel bounding box, pad ~18px, save as PNG on white).

---

## 4. How to build (the script)

`scripts/build_pdf.py` is the deterministic renderer. Write the content as a JSON file and run:

```bash
pip install weasyprint --break-system-packages --quiet   # if not present
python scripts/build_pdf.py content.json /mnt/user-data/outputs/<business>-creative.pdf
```

`content.json`:
```json
{
  "subtitle": "פאנקי מאנקי | סניף סינמה סיטי ב\"ש",
  "ideas": [
    { "title":"...", "desc":"...", "goal":"...",
      "steps":["...","..."], "vis":["...","..."] }
    // 10 items total
  ]
}
```

The script holds the locked CSS, the orange, the card, the Assistant `@font-face` rules, the
logo placement, and the page-per-idea logic. It warns if `ideas` ≠ 10 but still builds.
Don't reimplement the layout inline — drive the script. The title defaults to
"רעיונות קריאייטיב".

---

## 5. Verify before delivering

Always eyeball the output before handing it over:

```bash
python3 - <<'PY'
import fitz
d=fitz.open('/mnt/user-data/outputs/<business>-creative.pdf')
print('pages', d.page_count)
for i in range(d.page_count): d[i].get_pixmap(dpi=110).save(f'check-{i+1}.png')
PY
```

Open `check-1.png` (header + idea 1) and one interior page. Confirm: orange full-bleed frame,
white rounded card, Hebrew renders correctly (fonts embedded), idea title flush-right,
sub-headings + body centered, lists right-aligned, the DIGIM logo bottom-left, and each idea on
its own page. Then `present_files` the PDF.

---

## 6. Honesty notes carried into the PDF

- The two-round research (see SKILL.md) and the verified-vs-estimated rules in
  `data_sourcing.md` still govern the content. Anything marked "מוצע" (suggested) for sound, or
  any competitor figure that's an estimate, stays labelled — don't let the polished PDF imply
  certainty you didn't verify.
- A "טרנד שעובד כרגע" idea (with real reel links, like the original DIGIM example) goes in
  **only** if the links were pulled live and point at real posts. Never fabricate links to fill
  the slot.
