#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the DIGIM-branded CONTENT GANTT PDF (Hebrew, RTL).

USAGE
  python scripts/build_pdf.py content.json output.pdf

The deliverable has two parts, in one PDF, on the DIGIM template
(full-bleed orange #FAA31E, white rounded card, Assistant font, logo bottom-left):

  1. A landscape BAR-TIMELINE overview of the month  ── the gantt itself:
     a left-to-right day axis, one track per platform for feed posts, and a
     SEPARATE "סטוריז" band underneath. Each item is a platform-coloured chip on
     its day, with its proposed time. Weekends + holidays for the business's
     locale are shaded.

  2. Portrait DETAIL pages ── the writing:
     grouped by date, every post with its description + a SHORT and a LONG
     caption (in the brand's researched voice), hashtags, and a clickable link
     to its media in Google Drive (with a thumbnail when it's an image).
     Stories get their own section.

content.json schema  (all copy is whatever language the business posts in):
{
  "title":         "גאנט תוכן",                  # optional (default)
  "business":      "T-CENTER",                   # used in the filename-ish header
  "subtitle":      "T-CENTER | באר שבע",          # page-1 subtitle (business | location)
  "month_label":   "ינואר 2026",                 # human label shown in the header
  "timezone_label":"שעון ישראל (UTC+2)",          # shown next to times
  "year":  2026,
  "month": 1,                                    # 1-12 (real month → real weekdays)
  "locale": "IL",                                # IL | DE | IT | ... drives default weekend
  "weekend_days": [4,5],                         # optional override; Python weekday ints (Mon=0..Sun=6)
  "holidays": [ {"day": 1, "label": "..."} ],    # optional; shaded + labelled on the axis
  "platforms": ["Instagram","Facebook","TikTok"],# feed-track order (top→bottom)
  "direction": "rtl",                            # timeline axis (default rtl = day 1 on the right); "ltr" to flip

  "posts": [                                     # feed posts (NOT stories)
    {
      "day": 4, "time": "19:30",
      "platform": "Instagram", "format": "Reel",
      "title": "כותרת קצרה",
      "desc":  "תיאור הפוסט - מה רואים / הקונספט",
      "caption_short": "קאפשן קצר ...",
      "caption_long":  "קאפשן ארוך ...",
      "hashtags": "#... #...",                    # optional
      "media": {                                  # optional Google-Drive media
        "label": "reel_raw_0142.mp4",
        "url":   "https://drive.google.com/file/d/XXX/view",
        "kind":  "video",                         # image | video
        "thumb_b64": "<base64 png/jpg, images only>"
      }
    }
  ],

  "stories": [                                   # SEPARATE stories section
    {
      "day": 5, "time": "12:00",
      "platform": "Instagram",
      "week": 1,                                  # optional; used to group in detail
      "title": "סטורי - ...",
      "desc":  "מה בסטורי",
      "caption_short": "טקסט/סטיקר על הסטורי",
      "media": { ... }                            # optional
    }
  ]
}

Fonts + logo are bundled in ../assets and resolved relative to this script.
"""
import json, os, sys, calendar, html as _html

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
FONTS = os.path.join(ASSETS, "fonts")
LOGO = os.path.join(ASSETS, "digim_logo.png")
ORANGE = "#FAA31E"

# Restrict the emoji fonts to real emoji/symbol codepoints so they are NEVER
# matched for ASCII digits, Latin, or Hebrew (Noto Color Emoji's cmap contains
# bare digits 0-9 for keycaps, which otherwise hijacks the calendar numbers).
EMOJI_RANGE = ("U+200D,U+203C,U+2049,U+2122,U+2139,U+2194-2199,U+21A9-21AA,"
               "U+231A-231B,U+2328,U+23CF,U+23E9-23F3,U+23F8-23FA,U+24C2,"
               "U+25AA-25FF,U+2600-27BF,U+2934-2935,U+2B00-2B59,U+3030,U+303D,"
               "U+3297,U+3299,U+FE0F,U+1F000-1FAFF")

# Hebrew single-letter weekday labels, keyed by Python weekday (Mon=0..Sun=6)
HE_DOW = {6: "א", 0: "ב", 1: "ג", 2: "ד", 3: "ה", 4: "ו", 5: "ש"}

# Platform brand colours for the timeline chips (recognisable at a glance)
PLATFORM_COLOR = {
    "instagram": "#E1306C", "facebook": "#1877F2", "tiktok": "#111111",
    "meta": "#0866FF",  # Meta = a single cross-post to Instagram + Facebook
    "linkedin": "#0A66C2", "youtube": "#FF0000", "x": "#111111",
    "twitter": "#1DA1F2", "threads": "#111111",
}
# Short Hebrew format tags for the chips
FORMAT_TAG = {
    "reel": "ריל", "reels": "ריל", "post": "פוסט", "feed": "פוסט",
    "carousel": "קרוסלה", "image": "תמונה", "photo": "תמונה",
    "video": "וידאו", "story": "סטורי", "stories": "סטורי", "live": "לייב",
}
STORY_COLOR = "#8B5CF6"  # the separate stories band accent

# Soft (pastel) chip palette for the timeline: (background, text) per platform.
# Calmer than the saturated brand colours and far more legible at small sizes —
# dark text on a light tint instead of white-on-saturated.
PLATFORM_SOFT = {
    "instagram": ("#FCE4EF", "#C13584"), "facebook": ("#E7F0FE", "#1456B0"),
    "tiktok": ("#ECEFF1", "#0F1115"), "meta": ("#E4ECFF", "#0A4DD0"),
    "linkedin": ("#E7F0FA", "#0A66C2"), "youtube": ("#FCE7E7", "#D32F2F"),
    "x": ("#ECEFF1", "#0F1115"), "twitter": ("#E7F3FB", "#1273B8"),
    "threads": ("#ECEFF1", "#0F1115"),
}
STORY_SOFT = ("#EFE7FD", "#6D28D9")

# Any way of saying "this post goes to BOTH Instagram and Facebook" collapses to a
# single "Meta" marking, so a cross-post is ONE chip/track instead of two.
_META_SPELLINGS = {
    "meta", "מטא", "ig+fb", "fb+ig", "ig + fb", "fb + ig",
    "instagram+facebook", "facebook+instagram", "instagram + facebook",
    "facebook + instagram", "instagram/facebook", "facebook/instagram",
    "instagram & facebook", "facebook & instagram", "meta (ig+fb)",
    "אינסטגרם+פייסבוק", "פייסבוק+אינסטגרם", "אינסטגרם ופייסבוק", "פייסבוק ואינסטגרם",
}


def _norm_platform(p):
    """Collapse any 'Instagram + Facebook' spelling to a single 'Meta'."""
    if str(p).strip().lower() in _META_SPELLINGS:
        return "Meta"
    return str(p).strip()


def _platform_soft(p):
    return PLATFORM_SOFT.get(_norm_platform(p).lower(), ("#EEEEEE", "#333333"))


def _esc(s):
    return _html.escape(str(s if s is not None else ""))


def _platform_color(p):
    return PLATFORM_COLOR.get(_norm_platform(p).lower(), "#444")


def _format_tag(f):
    return FORMAT_TAG.get(str(f).strip().lower(), str(f))


def _weekend_days(content):
    if content.get("weekend_days"):
        return set(content["weekend_days"])
    # IL & Jewish-audience default: Fri(4)+Sat(5). Most of the world: Sat(5)+Sun(6).
    return {4, 5} if str(content.get("locale", "")).upper() == "IL" else {5, 6}


# ----------------------------------------------------------------------------- CSS
def _css(direction):
    axis_dir = "rtl" if direction == "rtl" else "ltr"
    return f"""
@font-face {{ font-family:'Assistant'; font-weight:400; src:url('file://{FONTS}/Assistant-Regular.ttf'); }}
@font-face {{ font-family:'Assistant'; font-weight:600; src:url('file://{FONTS}/Assistant-SemiBold.ttf'); }}
@font-face {{ font-family:'Assistant'; font-weight:700; src:url('file://{FONTS}/Assistant-Bold.ttf'); }}
@font-face {{ font-family:'Assistant'; font-weight:800; src:url('file://{FONTS}/Assistant-ExtraBold.ttf'); }}
@font-face {{ font-family:'NotoEmoji'; src:url('file://{FONTS}/NotoEmoji-Static.ttf'); unicode-range:{EMOJI_RANGE}; }}

@page land {{ size:A4 landscape; margin:0; }}
@page port {{ size:A4 portrait;  margin:0; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
html {{ background:{ORANGE}; }}
body {{ font-family:'Assistant', 'NotoEmoji', sans-serif; color:#1a1a1a; }}

/* ---- page frames ---- */
.page-land {{ page:land; position:relative; width:297mm; height:210mm; page-break-after:always; }}
.page-port {{ page:port; position:relative; width:210mm; height:297mm; page-break-after:always; }}
.page-port:last-child, .page-land:last-child {{ page-break-after:auto; }}
.card {{ position:absolute; top:5.5mm; left:5.5mm; right:5.5mm; bottom:5.5mm;
        background:#fff; border-radius:7mm; padding:11mm 12mm 16mm; overflow:hidden; }}
.card.port {{ padding:13mm 15mm 18mm; }}
.logo {{ position:absolute; left:12mm; bottom:7mm; width:30mm; }}
.card.port .logo {{ left:15mm; bottom:9mm; width:32mm; }}

/* ---- header (page 1) ---- */
.title {{ text-align:center; font-weight:700; font-size:23pt; color:#1d1d1d; margin-top:2mm; }}
.subtitle {{ text-align:center; font-weight:400; font-size:13pt; color:#1d1d1d; margin-top:2.5mm; }}
.meta {{ text-align:center; font-weight:600; font-size:10.5pt; color:#444; margin-top:1.5mm; }}
.divider {{ border:none; border-top:1.4px solid #2b2b2b; width:80%; margin:3.5mm auto 0; }}

/* ---- the timeline ---- */
table.tl {{ direction:{axis_dir}; width:100%; border-collapse:collapse; margin-top:5mm;
           table-layout:fixed; }}
table.tl col.label {{ width:30mm; }}
table.tl th, table.tl td {{ border:0.5px solid #ececec; padding:0; height:auto; vertical-align:top; }}
.dayhead {{ text-align:center; font-size:7pt; line-height:1.05; padding:1mm 0; color:#333; }}
.dayhead .dow {{ font-weight:700; font-size:7.5pt; color:#000; display:block; }}
.dayhead.we {{ background:#f3f3f3; color:#999; }}
.dayhead.ho {{ background:#FDEBC9; }}
.dayhead .holab {{ font-size:5.3pt; color:#9a6a00; display:block; line-height:1; margin-top:0.3mm; }}
.tracklab {{ direction:rtl; text-align:right; font-weight:700; font-size:8.5pt; color:#111;
            padding:1.5mm 2mm; background:#fafafa; }}
.tracklab.stories {{ color:{STORY_COLOR}; }}
td.cell {{ height:11mm; }}
td.cell.we {{ background:#f7f7f7; }}
td.cell.ho {{ background:#fdf4e3; }}
.sep td {{ border:0; height:3mm; }}
.sep .bar {{ height:1px; background:#ddd; margin:1mm 0; }}
.band {{ direction:rtl; text-align:right; font-weight:800; font-size:8pt; color:{STORY_COLOR};
         padding:0.5mm 2mm; }}

/* chips placed in a day cell — soft pastel, dark legible text */
.chip {{ display:block; margin:0.5mm 0.4mm; border-radius:1.5mm; padding:0.8mm 0.7mm;
         text-decoration:none; }}
.chip .ftag {{ font-weight:800; font-size:6.7pt; line-height:1.05; display:block; }}
.chip .tm {{ font-weight:600; font-size:5.9pt; line-height:1.2; opacity:0.85; display:block; }}
.chip.haslink .ftag {{ text-decoration:underline; text-underline-offset:1.2px; }}

.legend {{ direction:rtl; text-align:center; margin-top:4mm; font-size:8pt; color:#444; }}
.legend span {{ display:inline-block; margin:0 3mm; }}
.legend i {{ display:inline-block; width:3mm; height:3mm; border-radius:0.8mm;
             vertical-align:-0.3mm; margin-left:1.2mm; }}

/* ---- detail pages ---- */
.sec-title {{ direction:rtl; text-align:right; font-weight:800; font-size:16pt; color:#000;
              margin:1mm 0 4mm; }}
.daygrp {{ break-inside:avoid; margin-bottom:5mm; }}
.dayhdr {{ direction:rtl; text-align:right; font-weight:800; font-size:12.5pt; color:{ORANGE};
           border-bottom:1.2px solid #eee; padding-bottom:1.2mm; margin-bottom:2.5mm; }}
.item {{ break-inside:avoid; direction:rtl; text-align:right;
         border-right:3px solid #ddd; padding:0 4mm 0 0; margin:0 0 4mm 0; }}
.item .line1 {{ display:flex; gap:2.5mm; align-items:center; flex-wrap:wrap; margin-bottom:1.2mm; }}
.pill {{ color:#fff; font-weight:700; font-size:8pt; border-radius:1.4mm; padding:0.5mm 2mm; }}
.datetag {{ font-weight:800; font-size:8.5pt; color:#B45309; background:#FFF4E5;
            border-radius:1.4mm; padding:0.5mm 2.2mm; }}
.fmt {{ font-weight:700; font-size:10pt; color:#000; }}
.time {{ font-weight:600; font-size:9.5pt; color:#555; }}
.item .ttl {{ font-weight:800; font-size:11pt; color:#000; margin:0.5mm 0 1mm; }}
.lbl {{ font-weight:700; font-size:8.5pt; color:{ORANGE}; margin-top:1.6mm; }}
.txt {{ font-weight:400; font-size:9.5pt; color:#1f1f1f; line-height:1.5; }}
.txt.long {{ white-space:pre-wrap; }}
.tags {{ font-weight:600; font-size:8.5pt; color:#1877F2; margin-top:1mm; word-break:break-word; }}
.media {{ margin-top:2mm; display:flex; gap:2.5mm; align-items:center; }}
.media img {{ width:22mm; height:22mm; object-fit:cover; border-radius:1.5mm; border:1px solid #eee; }}
.media a {{ font-weight:700; font-size:9pt; color:#0A66C2; text-decoration:none;
            border:1px solid #cfe0f5; border-radius:1.4mm; padding:1mm 2.5mm; background:#f3f8ff; }}
.media .kind {{ font-size:7.5pt; color:#888; }}
.empty {{ direction:rtl; text-align:center; color:#aaa; font-size:10pt; margin-top:30mm; }}
"""


# ----------------------------------------------------------------------------- timeline page
def _timeline_page(content, header_html):
    year = int(content["year"]); month = int(content["month"])
    ndays = calendar.monthrange(year, month)[1]
    weekend = _weekend_days(content)
    holidays = {int(h["day"]): h.get("label", "") for h in content.get("holidays", [])}
    # platforms (track order). Normalise so any IG+FB cross-post collapses to "Meta",
    # then de-duplicate while preserving order.
    raw_platforms = content.get("platforms") or [
        p.get("platform", "") for p in content.get("posts", [])
    ] or ["Instagram"]
    platforms = []
    for p in raw_platforms:
        np = _norm_platform(p)
        if np and np not in platforms:
            platforms.append(np)

    # index posts/stories by (normalised platform, day)
    def _index(items):
        idx = {}
        for it in items:
            key = (_norm_platform(it.get("platform", "")).lower(), int(it.get("day", 0)))
            idx.setdefault(key, []).append(it)
        return idx
    post_idx = _index(content.get("posts", []))
    story_idx = {}
    for s in content.get("stories", []):
        if s.get("day"):
            story_idx.setdefault(int(s["day"]), []).append(s)

    # day header row
    heads = ['<col class="label">'] + ['<col>' for _ in range(ndays)]
    colgroup = "<colgroup>" + "".join(heads) + "</colgroup>"

    head_cells = ['<th class="tracklab">&nbsp;</th>']
    for d in range(1, ndays + 1):
        wd = calendar.weekday(year, month, d)
        cls = "dayhead"
        if d in holidays: cls += " ho"
        elif wd in weekend: cls += " we"
        holab = f'<span class="holab">{_esc(holidays[d][:10])}</span>' if d in holidays and holidays[d] else ""
        head_cells.append(
            f'<th class="{cls}"><span class="dow">{HE_DOW.get(wd,"")}</span>{d}{holab}</th>'
        )
    rows = [f"<tr>{''.join(head_cells)}</tr>"]

    def _chip(it, soft, default="פוסט"):
        bg, fg = soft
        tag = _format_tag(it.get("format") or default)
        tm = _esc(it.get("time", ""))
        tm_html = f'<span class="tm">{tm}</span>' if tm else ""
        inner = f'<span class="ftag">{_esc(tag)}</span>{tm_html}'
        style = f'background:{bg};color:{fg}'
        url = it.get("media", {}).get("url")
        if url:  # clickable chip → underlined format tag signals an attached Drive file
            return f'<a class="chip haslink" style="{style}" href="{_esc(url)}">{inner}</a>'
        return f'<div class="chip" style="{style}">{inner}</div>'

    # platform feed tracks
    for p in platforms:
        pl = _norm_platform(p).lower()
        soft = _platform_soft(p)
        cells = [f'<td class="tracklab">{_esc(_norm_platform(p))}</td>']
        for d in range(1, ndays + 1):
            wd = calendar.weekday(year, month, d)
            cls = "cell"
            if d in holidays: cls += " ho"
            elif wd in weekend: cls += " we"
            chips = "".join(_chip(it, soft) for it in post_idx.get((pl, d), []))
            cells.append(f'<td class="{cls}">{chips}</td>')
        rows.append(f"<tr>{''.join(cells)}</tr>")

    # separator + stories band
    rows.append(f'<tr class="sep"><td colspan="{ndays+1}"><div class="bar"></div></td></tr>')
    story_cells = [f'<td class="tracklab stories">סטוריז</td>']
    for d in range(1, ndays + 1):
        wd = calendar.weekday(year, month, d)
        cls = "cell"
        if d in holidays: cls += " ho"
        elif wd in weekend: cls += " we"
        chips = "".join(_chip(it, STORY_SOFT, default="Story") for it in story_idx.get(d, []))
        story_cells.append(f'<td class="{cls}">{chips}</td>')
    rows.append(f"<tr>{''.join(story_cells)}</tr>")

    # legend
    # legend (Meta is spelled out once so the reader knows it means IG + FB)
    leg = "".join(
        f'<span><i style="background:{_platform_soft(p)[1]}"></i>'
        f'{"Meta · IG+FB" if _norm_platform(p) == "Meta" else _esc(p)}</span>'
        for p in platforms
    )
    leg += f'<span><i style="background:{STORY_SOFT[1]}"></i>סטוריז</span>'
    leg += '<span><i style="background:#f3f3f3;border:1px solid #ddd"></i>סופ״ש</span>'
    if holidays:
        leg += '<span><i style="background:#FDEBC9"></i>חג / מועד</span>'

    table = (f'<table class="tl">{colgroup}{"".join(rows)}</table>'
             f'<div class="legend">{leg}</div>')
    return (f'<div class="page-land"><div class="card">'
            f'{header_html}{table}'
            f'<img class="logo" src="file://{LOGO}"></div></div>')


# ----------------------------------------------------------------------------- detail
def _media_html(m):
    if not m or not m.get("url"):
        return ""
    thumb = (f'<img src="data:image/png;base64,{m["thumb_b64"]}">'
             if m.get("thumb_b64") else "")
    kind = m.get("kind", "")
    kind_he = {"image": "תמונה", "video": "וידאו"}.get(str(kind).lower(), kind)
    label = _esc(m.get("label", "קובץ מדרייב"))
    badge = f'<span class="kind">{_esc(kind_he)}</span>' if kind_he else ""
    return (f'<div class="media">{thumb}'
            f'<a href="{_esc(m["url"])}">קובץ מצורף · {label}</a>{badge}</div>')


def _item_html(it, color, default_fmt="", date_label=None):
    fmt = _esc(it.get("format") or default_fmt)
    time = _esc(it.get("time", ""))
    platform = _norm_platform(it.get("platform", "")) if it.get("platform") else ""
    pill = f'<span class="pill" style="background:{color}">{_esc(platform)}</span>' if platform else ""
    time_html = f'<span class="time">{time}</span>' if time else ""
    date_html = f'<span class="datetag">{_esc(date_label)}</span>' if date_label else ""
    parts = [f'<div class="line1">{date_html}{pill}<span class="fmt">{fmt}</span>{time_html}</div>']
    if it.get("title"):
        parts.append(f'<div class="ttl">{_esc(it["title"])}</div>')
    if it.get("desc"):
        parts.append(f'<div class="lbl">תיאור הפוסט</div><div class="txt">{_esc(it["desc"])}</div>')
    if it.get("caption_short"):
        parts.append(f'<div class="lbl">קאפשן קצר</div><div class="txt">{_esc(it["caption_short"])}</div>')
    if it.get("caption_long"):
        parts.append(f'<div class="lbl">קאפשן ארוך</div><div class="txt long">{_esc(it["caption_long"])}</div>')
    if it.get("hashtags"):
        parts.append(f'<div class="tags">{_esc(it["hashtags"])}</div>')
    parts.append(_media_html(it.get("media")))
    return f'<div class="item" style="border-right-color:{color}">{"".join(parts)}</div>'


# ---- detail pagination ---------------------------------------------------------
# Estimate rendered heights (mm) so detail content flows across as many portrait
# pages as needed and is NEVER clipped. Estimates lean slightly high (safe).
_CHARS_PER_LINE = 70
_LINE_MM = 5.15
_HEADER_MM = 11.0
_TITLE_MM = 13.0
_CARD_INNER_MM = 255.0                       # usable height inside .card.port
_PAGE_ITEM_BUDGET_MM = _CARD_INNER_MM - _TITLE_MM - 20.0  # headers+items per page, with slack


def _text_mm(s, label=True):
    if not s:
        return 0.0
    lines = 0
    for seg in str(s).split("\n"):
        lines += max(1, -(-len(seg) // _CHARS_PER_LINE))   # ceil division
    return lines * _LINE_MM + (5.0 if label else 0.0)


def _item_mm(it):
    h = 7.0                                   # line1 (pill / format / time)
    if it.get("title"):
        h += 7.0
    h += _text_mm(it.get("desc"))
    h += _text_mm(it.get("caption_short"))
    h += _text_mm(it.get("caption_long"))
    if it.get("hashtags"):
        h += 6.0
    m = it.get("media") or {}
    if m.get("url"):
        h += 26.0 if m.get("thumb_b64") else 12.0
    return h + 5.0                            # bottom margin / breathing room


def _hdr_html(label, color, continued):
    style = f' style="color:{color}"' if color else ""
    txt = f"{label} · המשך" if continued else label
    return f'<div class="dayhdr"{style}>{_esc(txt)}</div>'


def _pack_groups(groups):
    """groups: list of (label, color_or_None, [(item_html, item_mm), ...]).
    Returns a list of pages; each page is a list of html fragments. A group's
    header is repeated (with '· המשך') whenever the group spills onto a new page."""
    pages, cur, used = [], [], 0.0
    for label, color, items in groups:
        shown_here = False
        ever_shown = False
        for item_html, item_mm in items:
            hdr_h = 0.0 if shown_here else _HEADER_MM
            if cur and used + item_mm + hdr_h > _PAGE_ITEM_BUDGET_MM:
                pages.append(cur); cur, used = [], 0.0
                shown_here = False; hdr_h = _HEADER_MM
            if not shown_here:
                cur.append(_hdr_html(label, color, ever_shown))
                shown_here = True; ever_shown = True
                used += _HEADER_MM
            cur.append(item_html)
            used += item_mm
    if cur:
        pages.append(cur)
    return pages


def _emit_pages(page_frag_lists, title, color=None):
    style = f' style="color:{color}"' if color else ""
    out = []
    for i, frags in enumerate(page_frag_lists):
        t = title if i == 0 else f"{title} · המשך"
        out.append(
            f'<div class="page-port"><div class="card port">'
            f'<div class="sec-title"{style}>{_esc(t)}</div>{"".join(frags)}'
            f'<img class="logo" src="file://{LOGO}"></div></div>'
        )
    return "".join(out)


def _detail_pages(content):
    """Group feed posts by day + a separate stories section, paginated so nothing clips."""
    year = int(content["year"]); month = int(content["month"])
    month_label = content.get("month_label", "")
    he_months = {1:"ינואר",2:"פברואר",3:"מרץ",4:"אפריל",5:"מאי",6:"יוני",
                 7:"יולי",8:"אוגוסט",9:"ספטמבר",10:"אוקטובר",11:"נובמבר",12:"דצמבר"}

    def _daylabel(d):
        wd = calendar.weekday(year, month, d)
        names = {6:"ראשון",0:"שני",1:"שלישי",2:"רביעי",3:"חמישי",4:"שישי",5:"שבת"}
        return f'יום {names.get(wd,"")} · {d} ב{he_months.get(month,"")}'

    # ---- feed posts: one group per day ----
    posts = sorted(content.get("posts", []), key=lambda x: (int(x.get("day", 0)), x.get("time", "")))
    by_day = {}
    for p in posts:
        by_day.setdefault(int(p.get("day", 0)), []).append(p)
    feed_groups = []
    for d in sorted(by_day):
        items = [(_item_html(it, _platform_color(it.get("platform"))), _item_mm(it))
                 for it in by_day[d]]
        feed_groups.append((_daylabel(d), None, items))

    feed_title = f'תוכן הפוסטים · {month_label}'
    if feed_groups:
        feed_html = _emit_pages(_pack_groups(feed_groups), feed_title)
    else:
        feed_html = (f'<div class="page-port"><div class="card port">'
                     f'<div class="sec-title">{_esc(feed_title)}</div>'
                     f'<div class="empty">לא הוגדרו פוסטים</div>'
                     f'<img class="logo" src="file://{LOGO}"></div></div>')

    # ---- stories: separate section, one group per week (each story shows its date) ----
    stories = sorted(content.get("stories", []),
                     key=lambda x: (int(x.get("week", 0)), int(x.get("day", 0)), x.get("time", "")))
    story_html = ""
    if stories:
        by_week = {}
        for s in stories:
            by_week.setdefault(int(s.get("week", 0)), []).append(s)
        story_groups = []
        for wk in sorted(by_week):
            label = f'שבוע {wk}' if wk else 'סטוריז'
            items = [(_item_html(it, STORY_COLOR, default_fmt="סטורי",
                                 date_label=(_daylabel(int(it["day"])) if it.get("day") else None)),
                      _item_mm(it)) for it in by_week[wk]]
            story_groups.append((label, STORY_COLOR, items))
        story_html = _emit_pages(_pack_groups(story_groups),
                                 f'סטוריז · {month_label}', color=STORY_COLOR)

    return feed_html + story_html


# ----------------------------------------------------------------------------- build
def _force_mono_emoji():
    """Reject the system 'Noto Color Emoji' so WeasyPrint can't auto-match it.

    The system CBDT colour-emoji font (a) gets matched for ASCII digits/'#' and
    (b) is mispositioned vertically by WeasyPrint. We bundle a monochrome outline
    emoji font and force it by hiding the colour one via a fontconfig include.
    Must run BEFORE weasyprint/fontconfig initialises.
    """
    try:
        import tempfile
        cfg = ('<?xml version="1.0"?>\n'
               '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n'
               '<fontconfig>\n'
               '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n'
               '  <selectfont><rejectfont>\n'
               '    <pattern><patelt name="family"><string>Noto Color Emoji</string></patelt></pattern>\n'
               '  </rejectfont></selectfont>\n'
               '</fontconfig>\n')
        fd, path = tempfile.mkstemp(prefix="digim_fontconfig_", suffix=".conf")
        with os.fdopen(fd, "w") as fh:
            fh.write(cfg)
        os.environ["FONTCONFIG_FILE"] = path
    except Exception:
        pass  # fall back to default config if anything goes wrong


def build(content, out_path):
    _force_mono_emoji()
    from weasyprint import HTML
    direction = content.get("direction", "rtl")
    title = content.get("title", "גאנט תוכן")
    subtitle = content.get("subtitle", content.get("business", ""))
    meta_bits = [b for b in [content.get("month_label"), content.get("timezone_label")] if b]
    header = (f'<div class="title">{_esc(title)}</div>'
              f'<div class="subtitle">{_esc(subtitle)}</div>'
              + (f'<div class="meta">{_esc(" · ".join(meta_bits))}</div>' if meta_bits else "")
              + '<hr class="divider">')

    timeline = _timeline_page(content, header)
    details = _detail_pages(content)
    doc = (f'<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
           f'<style>{_css(direction)}</style></head><body>{timeline}{details}</body></html>')
    HTML(string=doc, base_url=HERE).write_pdf(out_path)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        content = json.load(f)
    for req in ("year", "month"):
        if req not in content:
            print(f"ERROR: content.json is missing required field '{req}'.", file=sys.stderr)
            sys.exit(1)
    out = build(content, sys.argv[2])
    print("PDF written:", out)
