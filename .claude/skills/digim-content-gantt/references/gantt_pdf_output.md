# Gantt PDF Output — Locked Spec

The renderer is `scripts/build_pdf.py`. It is deterministic: it does **not** invent content — it
lays out exactly what's in `content.json` on the DIGIM template. All the thinking (research,
distribution, copy, Drive matching) happens before; this step renders and you **verify**.

```
python scripts/build_pdf.py content.json output.pdf
```

---

## The visual (do not drift from this)

- **A4**, full-bleed DIGIM orange `#FAA31E` on the page; a **white card** inset 5.5 mm with
  `border-radius: 7 mm`. **Assistant** font throughout. **DIGIM logo** bottom-left. Emoji render via
  the system colour-emoji font (bundled monochrome fallback). Bundled in `assets/`.
- **Two parts in one PDF:**
  1. **Bar-timeline overview — landscape.** Header (title + subtitle + month/timezone meta + rule).
     A left-to-right **day axis** for the whole month: each column is a day with its **Hebrew
     weekday letter** (א–ש) and number; **weekend** columns (per locale) and **holiday** columns are
     shaded (holiday gets a small label). One **track per platform** for feed posts; below a divider,
     a **separate "סטוריז" band**. Each item is a **platform-coloured chip** on its day showing the
     format tag + time; a chip with attached media is **clickable** and underlined. A **legend** and
     the logo close the page.
  2. **Detail pages — portrait.** Posts grouped by date (`יום <weekday> · <d> ב<month>`); each post
     shows a platform pill, format, time, title, **תיאור הפוסט**, **קאפשן קצר**, **קאפשן ארוך**,
     hashtags, and a clickable **קובץ מצורף · <filename>** Drive link (with an image thumbnail + a
     kind badge when present). **Stories render in their own section** (`סטוריז · <month>`), grouped
     by week.

- **Axis direction:** the timeline day axis is **RTL by default** (day **1 on the right**, day N on
  the left — matching how Hebrew reads); all copy is RTL too. Override with `"direction": "ltr"`
  only if a client specifically wants a left-to-right axis.

---

## content.json schema

```jsonc
{
  "title":          "גאנט תוכן",                  // optional; default "גאנט תוכן"
  "business":       "T-CENTER",
  "subtitle":       "T-CENTER | באר שבע",          // page-1 subtitle (business | location)
  "month_label":    "ינואר 2026",                 // human label in the header + detail titles
  "timezone_label": "שעון ישראל (UTC+2)",          // shown in the header meta
  "year":  2026,                                  // REQUIRED — real weekdays
  "month": 1,                                     // REQUIRED — 1..12
  "locale": "IL",                                 // IL | DE | IT | ... → default weekend + tone
  "weekend_days": [4,5],                          // optional override; Python weekday ints Mon0..Sun6
  "holidays": [ {"day": 13, "label": "מבצע חורף"} ],// only days within this month; shaded + labelled
  "platforms": ["Instagram","Facebook","TikTok"], // feed-track order, top→bottom
  "direction": "rtl",                             // timeline axis (rtl = day 1 on the right); copy is RTL regardless

  "posts": [                                      // FEED posts (not stories)
    {
      "day": 4, "time": "19:30",
      "platform": "Instagram",
      "format": "ריל",                            // Hebrew tag so timeline + detail match (see below)
      "title":  "כותרת קצרה",
      "desc":   "תיאור הפוסט — מה רואים / הקונספט",
      "caption_short": "קאפשן קצר ...",
      "caption_long":  "קאפשן ארוך ...",
      "hashtags": "#... #...",                     // optional; match the brand's pattern
      "media": {                                   // optional; from Google Drive
        "label": "reel_newyear_0142.mp4",
        "url":   "https://drive.google.com/file/d/EXAMPLE/view",
        "kind":  "video",                          // image | video
        "thumb_b64": "<base64 jpg/png — images only, downscaled>"
      }
    }
  ],

  "stories": [                                    // SEPARATE stories section + timeline band
    {
      "day": 5, "time": "12:00",
      "platform": "Instagram",
      "week": 1,                                   // groups the stories in the detail section
      "title": "סטורי — ...",
      "desc":  "מה בסטורי",
      "caption_short": "טקסט/סטיקר על הסטורי",
      "media": { "...": "optional — same shape as a post; gives the story a Drive link/thumbnail" }
    }
  ]
}
```

**Field notes**
- **`year` + `month` are required** — the renderer computes real weekdays, weekend shading, and the
  Hebrew weekday letters from them. Get them right or the calendar lies.
- **Write Hebrew format names** (`ריל`, `פוסט`, `קרוסלה`, `סטורי`, `וידאו`, `לייב`). The timeline maps
  common English ones too, but writing Hebrew keeps the chip and the detail page identical. Stories
  with no `format` show `סטורי` automatically.
- **`time` is `"HH:MM"`**, in the audience's timezone (see `references/timing_and_locale.md`).
- **`weekend_days`** overrides the locale default; otherwise IL→`[4,5]`, else→`[5,6]`.
- **`holidays`** only lists days *inside* the planned month.
- **`media.thumb_b64`** is images-only and should be downscaled (`references/drive_media.md`); videos
  link out with no preview.
- Stories must carry a **`day`** — it places them on the timeline band **and is shown as a date**
  (e.g. `יום שני · 5 בינואר`) on each story in the detail section. `week` controls detail grouping.
  Stories accept the **same `media` object as posts**, so a story can carry a clickable Drive link
  (and image thumbnail) too.

---

## Platform colours

Each platform has a recognisable colour. The **timeline chips use a soft pastel pair** (light tint
background + dark same-hue text) so a full month reads calm and legible instead of a saturated
rainbow; the **detail-page pills use the solid brand colour**. Both are keyed by platform:
Instagram (pink) · Facebook (blue) · **Meta (blue)** · TikTok (near-black) · LinkedIn (blue) ·
YouTube (red) · stories (purple). Unknown platforms fall back to grey. All defined in the script
(`PLATFORM_SOFT`, `PLATFORM_COLOR`, `STORY_SOFT`/`STORY_COLOR`) — adjust there for a custom brand colour.

### Meta = one marking for an Instagram + Facebook cross-post

When the same content goes out to **both Instagram and Facebook**, set `platform: "Meta"` on a
**single** post — do NOT create two separate Instagram and Facebook entries. This collapses the
cross-post into **one Meta track / one Meta chip / one Meta pill**, so the document stays clean
instead of doubling every cross-post. The renderer also auto-detects common spellings
(`"Instagram + Facebook"`, `"IG+FB"`, `"פייסבוק+אינסטגרם"`, …) and normalises them to `Meta`; the
legend spells it out as `Meta · IG+FB`. Use a plain `Instagram` or `Facebook` value only when a post
is genuinely for that one network.

---

## Verify (do this every time, before delivering)

Render, then rasterise and **look** — a client-facing PDF must not ship with a calendar error or a
notdef box.

```python
import fitz
d = fitz.open("output.pdf")
print("pages:", d.page_count)
for i in range(d.page_count):
    p = d[i]
    print(i+1, f"{p.rect.width:.0f}x{p.rect.height:.0f}", "links:", len(p.get_links()))
    p.get_pixmap(dpi=130).save(f"/tmp/check-{i+1}.png")
```
(or `pdftoppm -png -r 130 output.pdf /tmp/check`). Then eyeball:

- **Page 1 is landscape**, detail pages portrait.
- **Timeline flows right-to-left**: day **1 is on the right**, the platform labels are on the right,
  and days increase leftward (unless `direction:"ltr"` was set).
- **Weekday letters are correct** for the month (spot-check day 1's weekday against a real calendar)
  and **weekends/holidays are shaded on the right columns for the locale**.
- **Chips sit on the right dates and platforms**, in the **soft pastel** colours; times read
  correctly; the **stories band is separate** and shows `סטורי`.
- **RTL is correct** on the detail pages; **every story shows its date**; **emoji render** (not empty
  boxes); **captions present**.
- **Drive links exist** (link count > 0 when media was attached) on both **posts and stories**, and
  point at the right files.

Fix any miss and re-render before sending.

---

## Font recovery (only if `assets/` fonts are missing)

Fonts ship inside the skill, so this is a fallback. The emoji fallback font is a static instance of
Google's Noto Emoji; the colour emoji used for rendering is the system font at
`/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf`.

```bash
cd assets/fonts
# monochrome emoji fallback (instance the variable font to a static weight)
curl -sL -o NotoEmoji-var.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf"
python3 - <<'PY'
from fontTools import ttLib
from fontTools.varLib.instancer import instantiateVariableFont
f = ttLib.TTFont("NotoEmoji-var.ttf")
instantiateVariableFont(f, {"wght": 400}, inplace=True)
f.save("NotoEmoji-Static.ttf")
PY
rm -f NotoEmoji-var.ttf
# Assistant (Hebrew) — re-fetch from Google Fonts and instance the weights you need (400/600/700/800)
# https://raw.githubusercontent.com/google/fonts/main/ofl/assistant/Assistant%5Bwght%5D.ttf
```

Install with `pip install weasyprint pymupdf --break-system-packages` if not present.
