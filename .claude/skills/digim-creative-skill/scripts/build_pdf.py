#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the DIGIM-branded creative-ideas PDF (Hebrew, RTL).

USAGE
  python scripts/build_pdf.py content.json output.pdf

content.json schema:
{
  "title":    "רעיונות קריאייטיב",                       # optional, this is the default
  "subtitle": "שם העסק | סניף/מיקום",                    # required (page-1 subtitle)
  "ideas": [                                              # 10 items (see SKILL.md)
    {
      "title": "שם הקונספט",
      "desc":  "תיאור הרעיון - פסקה אחת",
      "goal":  "מטרה - משפט או שניים",
      "steps": ["שלב 1", "שלב 2", "..."],                 # תסריט / פורמט (ממוספר)
      "vis":   ["אלמנט 1", "אלמנט 2", "..."]              # אלמנטים ויזואליים (בולטים)
    }
    // ...
  ]
}

Design is locked to the DIGIM template (see references/digim_pdf_output.md):
full-bleed orange #FAA31E, white rounded card, Assistant font, DIGIM logo
bottom-left, one idea per page, header only on page 1.
Fonts + logo are bundled in ../assets and resolved relative to this script.
"""
import json, os, sys, html as _html

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
FONTS = os.path.join(ASSETS, "fonts")
LOGO = os.path.join(ASSETS, "digim_logo.png")
ORANGE = "#FAA31E"


def _css():
    return f"""
@font-face {{ font-family:'Assistant'; font-weight:400; src:url('file://{FONTS}/Assistant-Regular.ttf'); }}
@font-face {{ font-family:'Assistant'; font-weight:600; src:url('file://{FONTS}/Assistant-SemiBold.ttf'); }}
@font-face {{ font-family:'Assistant'; font-weight:700; src:url('file://{FONTS}/Assistant-Bold.ttf'); }}
@font-face {{ font-family:'Assistant'; font-weight:800; src:url('file://{FONTS}/Assistant-ExtraBold.ttf'); }}

@page {{ size:A4; margin:0; }}
html {{ background:{ORANGE}; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:'Assistant', sans-serif; color:#1a1a1a; }}

.page {{ position:relative; width:210mm; height:297mm; page-break-after:always; }}
.page:last-child {{ page-break-after:auto; }}
.card {{ position:absolute; top:5.5mm; left:5.5mm; right:5.5mm; bottom:5.5mm;
        background:#fff; border-radius:7mm; padding:15mm 17mm 20mm; overflow:hidden; }}

.title {{ text-align:center; font-weight:400; font-size:25pt; color:#1d1d1d; margin-top:6mm; }}
.subtitle {{ text-align:center; font-weight:400; font-size:14.5pt; color:#1d1d1d; margin-top:4mm; }}
.divider {{ border:none; border-top:1.4px solid #2b2b2b; width:88%; margin:5mm auto 0; }}

.idea-title {{ direction:rtl; text-align:right; font-weight:700; font-size:15.5pt; color:#000; margin:7mm 0 3mm; }}
.subhead {{ direction:rtl; text-align:center; font-weight:700; font-size:12pt; color:#000; margin:4.5mm 0 1.5mm; }}
p.body {{ direction:rtl; text-align:center; font-weight:400; font-size:11pt; color:#1f1f1f; line-height:1.6; }}

ol.steps {{ direction:rtl; text-align:right; list-style:none; counter-reset:s; margin:0.5mm 6mm 0 0; }}
ol.steps li {{ direction:rtl; text-align:right; font-size:11pt; line-height:1.55; counter-increment:s; padding-right:7mm; position:relative; }}
ol.steps li::before {{ content:counter(s) "."; position:absolute; right:0; font-weight:700; color:#000; }}

ul.vis {{ direction:rtl; text-align:right; list-style:none; margin:0.5mm 6mm 0 0; }}
ul.vis li {{ direction:rtl; text-align:right; font-size:11pt; line-height:1.6; padding-right:7mm; position:relative; }}
ul.vis li::before {{ content:"\\25CF"; position:absolute; right:0; font-size:0.62em; top:0.55em; color:#1a1a1a; }}

.logo {{ position:absolute; left:17mm; bottom:11mm; width:34mm; }}
"""


def _esc(s):
    return _html.escape(str(s))


def _idea_html(num, idea, header=""):
    steps = "".join(f"<li>{_esc(s)}</li>" for s in idea.get("steps", []))
    vis = "".join(f"<li>{_esc(v)}</li>" for v in idea.get("vis", []))
    return f"""
    <div class="page"><div class="card">
      {header}
      <div class="idea-title">{num}. {_esc(idea['title'])}</div>
      <div class="subhead">תיאור הרעיון</div>
      <p class="body">{_esc(idea['desc'])}</p>
      <div class="subhead">מטרה</div>
      <p class="body">{_esc(idea['goal'])}</p>
      <div class="subhead">תסריט / פורמט</div>
      <ol class="steps">{steps}</ol>
      <div class="subhead">אלמנטים ויזואליים</div>
      <ul class="vis">{vis}</ul>
      <img class="logo" src="file://{LOGO}">
    </div></div>"""


def build(content, out_path):
    from weasyprint import HTML
    title = content.get("title", "רעיונות קריאייטיב")
    subtitle = content["subtitle"]
    ideas = content["ideas"]
    header = (f'<div class="title">{_esc(title)}</div>'
              f'<div class="subtitle">{_esc(subtitle)}</div>'
              f'<hr class="divider">')
    pages = [_idea_html(i + 1, idea, header if i == 0 else "")
             for i, idea in enumerate(ideas)]
    doc = (f'<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
           f'<style>{_css()}</style></head><body>{"".join(pages)}</body></html>')
    HTML(string=doc, base_url=HERE).write_pdf(out_path)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        content = json.load(f)
    n = len(content.get("ideas", []))
    if n != 10:
        print(f"WARNING: expected 10 ideas, got {n} (building anyway).", file=sys.stderr)
    out = build(content, sys.argv[2])
    print("PDF written:", out)
