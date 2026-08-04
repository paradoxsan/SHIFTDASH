#!/usr/bin/env python3
"""
Shift Digital — client-quote PDF generator.

Renders a branded, two-page (or more) Hebrew price quote that matches the
Shift Digital template: extracted paper/border/watermark/logo background,
Google-Sans-style Latin + Heebo Hebrew, centered title, right-aligned RTL
section bodies, a centered build-time banner, validity line, and a
two-column signature block.

Usage:
    python generate_quote.py content.json output.pdf

The content JSON schema is documented in references/content_schema.md and a
ready-to-edit example lives in assets/example_content.json.
"""

import sys
import json
import html
import re
from pathlib import Path

from weasyprint import HTML

ASSETS = Path(__file__).resolve().parent.parent / "assets"
TEMPLATE = ASSETS / "template.html"

# Latin/number tokens get wrapped in a <span class="latin"> so they render in
# the Google-Sans stand-in (Inter) instead of Heebo. This keeps brand names,
# API/GPT/N8N, prices and dates crisp, exactly like the reference PDF.
# We tokenize the RAW text first (before HTML-escaping) so we never mangle
# entities, and so commas inside numbers (2,500) don't get reordered by RTL.
_LATIN_RUN = re.compile(r"[A-Za-z0-9][A-Za-z0-9 ./:+\-_&'’%,]*[A-Za-z0-9]|[A-Za-z0-9]")


def esc(text: str) -> str:
    """Escape Hebrew/other text and wrap Latin+number runs in an LTR-isolated
    span so they render in the Google-Sans stand-in and keep their internal
    order (e.g. 2,500 stays 2,500, API stays API) inside an RTL line.

    Punctuation directly after a Latin run is absorbed into the same unit only
    when more (Hebrew) text follows — that's the case where a bidi neutral box
    could otherwise strand the punctuation at the next line's start (e.g.
    "...של Shift Digital. נמשיך..."). When the Latin run ends the string, the
    trailing period is left outside so the normal RTL rule places the
    sentence-final period correctly (e.g. a validity line ending in a date)."""
    if text is None:
        return ""
    s = str(text)
    out = []
    last = 0
    for m in _LATIN_RUN.finditer(s):
        out.append(html.escape(s[last:m.start()]))
        end = m.end()
        # look at punctuation immediately after the Latin run
        p = end
        trail = ""
        while p < len(s) and s[p] in ".,:":
            trail += s[p]
            p += 1
        # absorb it only if non-space text still follows (mid-line case)
        if trail and s[p:].strip():
            run_text = m.group(0) + trail
            last = p
        else:
            run_text = m.group(0)
            last = end
        out.append(
            f'<span class="latin" dir="ltr" '
            f'style="unicode-bidi:isolate; white-space:nowrap">'
            f'{html.escape(run_text)}</span>'
        )
    out.append(html.escape(s[last:]))
    return "".join(out)


def paragraphs(text: str, cls: str = "body-text") -> str:
    """Split a text block on blank lines / newlines into styled <p> paragraphs."""
    if not text:
        return ""
    blocks = re.split(r"\n\s*\n|\n", text.strip())
    return "".join(
        f'<p class="{cls}">{esc(b.strip())}</p>' for b in blocks if b.strip()
    )


def render_section(sec: dict, first: bool = False) -> str:
    """A section = right-aligned title + one or more body paragraphs.

    If `body` is a list, each item becomes its own paragraph. A cost-style
    item may be a dict {"label": "...", "text": "..."} to bold the lead-in.
    """
    title = sec.get("title", "")
    accent = " accent" if (first and sec.get("accent", True)) else ""
    out = []
    if title:
        out.append(f'<div class="section-title{accent}">{esc(title)}</div>')

    body = sec.get("body", "")
    if isinstance(body, list):
        for item in body:
            if isinstance(item, dict):
                label = item.get("label", "")
                text = item.get("text", "")
                inner = (f'<span class="label">{esc(label)}</span> ' if label else "") + esc(text)
                out.append(f'<p class="body-text">{inner}</p>')
            else:
                out.append(f'<p class="body-text">{esc(item)}</p>')
    else:
        out.append(paragraphs(body))
    return "\n".join(out)


def build_pages(data: dict) -> str:
    """Assemble the page HTML.

    Two-page layout (default): page 1 = intro + opening sections; page 2 =
    build-time banner + remaining sections + costs + validity + signatures.

    Three-page layout (automatic): if any section sets `"page": 3`, a third
    page is emitted. Page 1 = intro + page-1 sections; page 2 = banner +
    page-2 sections; page 3 = page-3 sections. The closing block
    (costs + validity + signatures) always lives on the LAST page, so it
    moves to page 3 automatically when a third page exists.

    Use three pages when the content would otherwise crowd the bottom border
    or push the signature block into the »SHIFT logo. Adding a page is the
    preferred fix for a long quote — do not shrink fonts or margins instead.

    Sections are distributed by an explicit `page` key (1, 2, or 3); anything
    without one falls on page 1."""
    # ---- Header (page 1) ----
    title = esc(data.get("title", "הצעת מחיר"))
    client = esc(data.get("client_name", ""))
    date = esc(data.get("date", ""))
    domain = esc(data.get("client_domain", ""))

    sub_parts = []
    if client:
        sub_parts.append(f'לכבוד: {client}')
    if date:
        sub_parts.append(f'תאריך: {date}')
    if domain:
        sub_parts.append(domain)
    subline = " | ".join(sub_parts)

    intro = paragraphs(data.get("intro", ""), cls="intro")

    sections = data.get("sections", [])
    p1_sections = [s for s in sections if s.get("page", 1) == 1]
    p2_sections = [s for s in sections if s.get("page", 1) == 2]
    p3_sections = [s for s in sections if s.get("page", 1) == 3]

    p1_body = []
    for i, sec in enumerate(p1_sections):
        p1_body.append(render_section(sec, first=(i == 0)))

    page1 = f"""
    <div class="page">
      <div class="content">
        <div class="doc-title">{title}</div>
        <div class="subline">{subline}</div>
        {intro}
        {''.join(p1_body)}
      </div>
    </div>"""

    # ---- Build-time banner (top of page 2) ----
    banner = data.get("build_time_banner")
    if banner is None:
        days = data.get("build_days", "5")
        banner_html = (
            f'<div class="banner">המערכת תוקם ותהיה מוכנה לעבודה<br>'
            f'<span class="u">תוך {esc(days)} ימי עבודה</span> מרגע התשלום.</div>'
        )
    else:
        banner_html = f'<div class="banner">{esc(banner)}</div>'

    p2_body = []
    for sec in p2_sections:
        p2_body.append(render_section(sec))

    p3_body = []
    for sec in p3_sections:
        p3_body.append(render_section(sec))

    # Costs section (always its own block, on the final page)
    costs = data.get("costs", {})
    costs_html = ""
    if costs:
        costs_html += f'<div class="section-title">{esc(costs.get("title", "עלויות"))}</div>'
        for line in costs.get("lines", []):
            if isinstance(line, dict):
                label = line.get("label", "")
                text = line.get("text", "")
                inner = (f'<span class="label">{esc(label)}</span> ' if label else "") + esc(text)
                costs_html += f'<p class="body-text">{inner}</p>'
            else:
                costs_html += f'<p class="body-text">{esc(line)}</p>'

    # Validity
    validity = data.get("validity", "")
    validity_html = f'<div class="validity">{esc(validity)}</div>' if validity else ""

    # Signatures
    sigs = data.get("signatures", [])
    sig_html = ""
    if sigs:
        cells = "".join(
            f'<div class="sig"><div class="name">{esc(s.get("name",""))}</div>'
            f'<div class="org">{esc(s.get("org","SHIFT DIGITAL"))}</div></div>'
            for s in sigs
        )
        sig_html = f'<div class="signatures">{cells}</div>'

    # The closing block (costs + validity + signatures) lives on the last page.
    closing_html = f"{costs_html}{validity_html}{sig_html}"

    has_page3 = len(p3_sections) > 0

    if has_page3:
        # Page 2 = banner + its sections (no closing block).
        page2 = f"""
    <div class="page">
      <div class="content">
        {banner_html}
        {''.join(p2_body)}
      </div>
    </div>"""
        # Page 3 = its sections + closing block.
        page3 = f"""
    <div class="page">
      <div class="content">
        {''.join(p3_body)}
        {closing_html}
      </div>
    </div>"""
        return page1 + page2 + page3

    # ---- Default two-page layout ----
    page2 = f"""
    <div class="page">
      <div class="content">
        {banner_html}
        {''.join(p2_body)}
        {closing_html}
      </div>
    </div>"""

    return page1 + page2


def main():
    if len(sys.argv) != 3:
        print("Usage: python generate_quote.py content.json output.pdf")
        sys.exit(1)

    content_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    data = json.loads(content_path.read_text(encoding="utf-8"))
    template = TEMPLATE.read_text(encoding="utf-8")
    pages_html = build_pages(data)
    full_html = template.replace("{{PAGES}}", pages_html)

    # base_url = assets dir so the @font-face and background.png resolve
    HTML(string=full_html, base_url=str(ASSETS)).write_pdf(str(output_path))
    print(f"✓ Wrote {output_path}")


if __name__ == "__main__":
    main()
