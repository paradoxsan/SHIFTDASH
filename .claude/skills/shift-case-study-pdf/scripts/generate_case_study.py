#!/usr/bin/env python3
"""
Shift Digital — client case-study (Case Study) PDF generator.

Renders a branded, multi-page Hebrew case study on the exact same visual
template as the Shift quote PDF (extracted paper/border/watermark/»SHIFT-logo
background, Google-Sans-style Latin + Heebo Hebrew, centered title). The layout
is tuned for a story rather than a price list: a kicker + title, a one-line
"lead", a narrative of הבעיה → הפתרון → איך זה עובד → התוצאה, an optional
headline stat-strip, a closing banner, and the two-founder signature block.

Usage:
    python generate_case_study.py content.json output.pdf

Schema lives in references/content_schema.md; a worked example is in
assets/example_content.json.
"""

import sys
import json
import html
import re
from pathlib import Path

from weasyprint import HTML

ASSETS = Path(__file__).resolve().parent.parent / "assets"
TEMPLATE = ASSETS / "template.html"

# Latin/number runs get wrapped in an LTR-isolated <span class="latin"> so they
# render in the Google-Sans stand-in (Inter) and keep their internal order
# (2,500 stays 2,500, WHAPI stays WHAPI) inside RTL lines. Identical tokenizer
# to the quote generator.
_LATIN_RUN = re.compile(r"[A-Za-z0-9][A-Za-z0-9 ./:+\-_&'’%,]*[A-Za-z0-9]|[A-Za-z0-9]")


def esc(text: str) -> str:
    """Escape text and isolate Latin+number runs (see module docstring)."""
    if text is None:
        return ""
    s = str(text)
    out = []
    last = 0
    for m in _LATIN_RUN.finditer(s):
        out.append(html.escape(s[last:m.start()]))
        end = m.end()
        p = end
        trail = ""
        while p < len(s) and s[p] in ".,:":
            trail += s[p]
            p += 1
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
    """Split a text block on blank lines / newlines into styled <p>s."""
    if not text:
        return ""
    blocks = re.split(r"\n\s*\n|\n", text.strip())
    return "".join(
        f'<p class="{cls}">{esc(b.strip())}</p>' for b in blocks if b.strip()
    )


def render_stat_row(stats: list) -> str:
    """A centered strip of big-number result cards.

    Each stat is {"num": "85%", "cap": "מהפניות..."}.
    """
    cells = "".join(
        f'<div class="stat"><div class="num">{esc(s.get("num",""))}</div>'
        f'<div class="cap">{esc(s.get("cap",""))}</div></div>'
        for s in stats
    )
    return f'<div class="stat-row">{cells}</div>'


def render_section(sec: dict, first: bool = False) -> str:
    """A section = right-aligned title + body paragraphs (+ optional stat row).

    `body` items: a plain string -> paragraph; {"label","text"} -> bolded
    lead-in; {"stat_row": [...]} -> the big-number strip.
    """
    title = sec.get("title", "")
    accent = " accent" if (first and sec.get("accent", True)) else ""
    out = []
    if title:
        out.append(f'<div class="section-title{accent}">{esc(title)}</div>')

    body = sec.get("body", "")
    if isinstance(body, list):
        for item in body:
            if isinstance(item, dict) and "stat_row" in item:
                out.append(render_stat_row(item["stat_row"]))
            elif isinstance(item, dict):
                label = item.get("label", "")
                text = item.get("text", "")
                inner = (f'<span class="label">{esc(label)}</span> ' if label else "") + esc(text)
                out.append(f'<p class="body-text">{inner}</p>')
            else:
                out.append(f'<p class="body-text">{esc(item)}</p>')
    else:
        out.append(paragraphs(body))

    # A section may also carry its own top-level stat_row (outside body).
    if sec.get("stat_row"):
        out.append(render_stat_row(sec["stat_row"]))
    return "\n".join(out)


def build_pages(data: dict) -> str:
    """Assemble page HTML.

    Page 1 = kicker + title + subline + lead + page-1 sections.
    Page 2 = page-2 sections (+ closing banner + signatures, unless a page 3
    exists). Page 3 (optional, via "page": 3) = page-3 sections + closing.
    The closing block (banner + signatures) always follows to the LAST page.
    """
    kicker = esc(data.get("kicker", "CASE STUDY"))
    title = esc(data.get("title", "סיפור לקוח"))
    client = esc(data.get("client_name", ""))
    domain = esc(data.get("client_domain", ""))
    industry = esc(data.get("industry", ""))

    sub_parts = []
    if client:
        sub_parts.append(client)
    if industry:
        sub_parts.append(industry)
    if domain:
        sub_parts.append(domain)
    subline = "  |  ".join(sub_parts)

    lead = data.get("lead", "")
    lead_html = f'<div class="lead">{esc(lead)}</div>' if lead else ""

    intro = paragraphs(data.get("intro", ""), cls="intro")

    sections = data.get("sections", [])
    p1 = [s for s in sections if s.get("page", 1) == 1]
    p2 = [s for s in sections if s.get("page", 1) == 2]
    p3 = [s for s in sections if s.get("page", 1) == 3]

    p1_body = [render_section(s, first=(i == 0)) for i, s in enumerate(p1)]
    p2_body = [render_section(s) for s in p2]
    p3_body = [render_section(s) for s in p3]

    page1 = f"""
    <div class="page">
      <div class="content">
        <div class="doc-kicker">{kicker}</div>
        <div class="doc-title">{title}</div>
        <div class="subline">{subline}</div>
        {lead_html}
        {intro}
        {''.join(p1_body)}
      </div>
    </div>"""

    # ---- Closing block (banner + signatures) — always on the last page ----
    banner = data.get("closing_banner", "")
    banner_html = ""
    if banner:
        banner_html = f'<div class="banner">{esc(banner)}</div>'

    sigs = data.get("signatures", [])
    sig_html = ""
    if sigs:
        cells = "".join(
            f'<div class="sig"><div class="name">{esc(s.get("name",""))}</div>'
            f'<div class="org">{esc(s.get("org","SHIFT DIGITAL"))}</div></div>'
            for s in sigs
        )
        sig_html = f'<div class="signatures">{cells}</div>'

    closing_html = f"{banner_html}{sig_html}"

    has_page3 = len(p3) > 0

    if has_page3:
        page2 = f"""
    <div class="page">
      <div class="content">
        {''.join(p2_body)}
      </div>
    </div>"""
        page3 = f"""
    <div class="page">
      <div class="content">
        {''.join(p3_body)}
        {closing_html}
      </div>
    </div>"""
        return page1 + page2 + page3

    page2 = f"""
    <div class="page">
      <div class="content">
        {''.join(p2_body)}
        {closing_html}
      </div>
    </div>"""
    return page1 + page2


def main():
    if len(sys.argv) != 3:
        print("Usage: python generate_case_study.py content.json output.pdf")
        sys.exit(1)

    content_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    data = json.loads(content_path.read_text(encoding="utf-8"))
    template = TEMPLATE.read_text(encoding="utf-8")
    pages_html = build_pages(data)
    full_html = template.replace("{{PAGES}}", pages_html)

    HTML(string=full_html, base_url=str(ASSETS)).write_pdf(str(output_path))
    print(f"✓ Wrote {output_path}")


if __name__ == "__main__":
    main()
