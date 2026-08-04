---
name: shift-case-study-pdf
description: >-
  Generate a branded Shift Digital client case-study PDF (CASE STUDY / סיפור
  לקוח) in Hebrew, on the agency's exact visual template — same
  background, fonts, frame, and two-founder signature block as the Shift quote
  PDF — but laid out as a story: outcome headline, one-line lead, a
  הבעיה → הפתרון → איך זה עובד → התוצאה narrative, a big-number results strip,
  and a closing banner. Use whenever the user wants a case study, success story,
  or before/after deliverable to show a NEW lead what Shift built for an existing
  client — "תכין CASE STUDY על X", "סיפור לקוח", "דוגמה ללקוח חדש", or when they
  hand over notes or past-conversation context about a project to turn into
  something client-facing. Copy must be plain everyday Hebrew a non-technical
  business owner understands — explain how the system solves real pain, never a
  spec sheet. Pulls project facts from prior conversations when the client was
  built earlier, runs a short confirm-and-fill intake, then produces a polished,
  ready-to-send PDF.
---

# Shift Digital — Client Case-Study PDF

Produce a client-ready Hebrew **case study** as a PDF that is **visually
identical** to Shift Digital's branded template and **written in plain,
everyday Hebrew** that a non-technical business owner immediately understands.
The look is fixed (the same background asset, fonts, and frame as the
`shift-quote-pdf` skill); your job is to tell the *story* of what was built for
one client, focused on the pain it removed — not the technology.

The deliverable is an A4 PDF, normally **2–3 pages**, arranged as a narrative:

- Page 1: kicker (`CASE STUDY`) + an **outcome headline** title + subline
  (client / industry / location) + a bold one-line **lead** + an **intro** that
  sets up the client and their pain + the first story section(s).
- Following pages: the rest of the story, ending with a **results strip** of
  big numbers and a **closing banner**, then the two-founder signatures.

The non-negotiable rule: **write for the reader, not the engineer.** No node
names, no stack jargon in the body, no "webhook/Supabase/debounce". Translate
every technical capability into what it *does for the business*: "answers every
customer 24/7", "closes the order by itself", "knows when to hand off to a
human". If a sentence would confuse a shop owner, rewrite it.

---

## The process (always in this order)

1. **Gather the project facts.** A case study is about a *real* client build.
   If that client was built or debugged in earlier sessions, **search past
   conversations** (`conversation_search`) for the client name and pull: what
   the business does, what pain drove the project, what the system actually
   does for customers, and any concrete outcomes. If the user pasted notes, use
   those. Never invent capabilities the system doesn't have.
2. **Intake — confirm + fill gaps.** In one short message, confirm the handful
   of facts that shape the story (below), pre-filling everything you already
   found so the user just confirms or corrects.
3. **Write the story** in plain everyday Hebrew (see "Voice & structure").
4. **Generate** the PDF, render it to images, and **proofread visually**
   (Hebrew, numbers, page breaks, logo clearance) before handing it over.
5. **Deliver** the PDF and offer the natural next step (swap a section, adjust
   the numbers, retitle).

Don't block on a long interview. If the user is in a hurry or the past-chat
context is rich, draft the whole thing, state the few assumptions you made, and
produce the PDF.

---

## Intake — the few things that shape the story

Pre-fill from past chats / pasted notes and ask the user only to confirm:

1. **Who the client is** — business name, what they do (industry), and
   city/handle for the subline.
2. **The pain** — what was the day-to-day problem before? (e.g. "the owner was
   stuck answering the same WhatsApp questions all day".) This is the heart of
   the case study; get it concrete.
3. **What we built, in plain terms** — the one-line "what this is" for the lead,
   plus the 3–6 things the system does *for the customer/business*.
4. **The outcome** — what changed? Aim for 2–3 headline results for the stat
   strip. These can be qualitative-but-concrete (`24/7` instant replies,
   `1–2` days to fulfil, `0` missed enquiries) when hard metrics aren't
   available — don't fabricate precise percentages that weren't measured.
5. **Signatures** — default both founders (דניאל גורליק + נועם כהן). Confirm.

---

## Voice & structure (write it like Shift Digital, for a layperson)

- **Plain, warm, concrete Hebrew.** Short sentences. No hype, no emojis, and —
  critically — **no technical jargon in the body**. The reader is a business
  owner deciding whether this could work for *them*.
- **Lead with pain, not features.** Open on the everyday problem the owner felt,
  so a new lead recognises their own situation.
- **Explain the "how" as plain capabilities.** Instead of naming the stack, say
  what the system does: answers around the clock, collects the order, sends a
  payment link, receives the customer's file, hands off to a human when needed,
  and never makes things up. (Behind the scenes it's the real Shift stack —
  n8n, WHAPI, Supabase, the AI model, EZcount — but that stays out of the copy.)
- **End on the result.** A short "התוצאה" section + a big-number **stat strip**
  + a one-line **closing banner** that sums up the win.

### Recommended five-beat arc (tailor content, keep the shape)

1. **Lead + intro** — who the client is and the pain (page 1).
2. **הבעיה** — the day-to-day problem, made concrete (page 1, accent header).
3. **הפתרון** — what we built, in the customer's language.
4. **איך זה עובד — בלי הקטע הטכני** — the capabilities as plain bullets
   (`{label,text}` lines).
5. **התוצאה** — what changed + the stat strip + closing banner.

Spread these across pages so the closing block (banner + signatures) lands on
its own clean final page (see "If content overflows").

---

## Generating the PDF

1. Write the content to a JSON file following `references/content_schema.md`.
   Start from `assets/example_content.json` (the T-CENTER case study) and
   replace the content — fastest way to get the structure right. **Read the
   schema reference before writing the JSON.**
2. Run the generator:

   ```bash
   python scripts/generate_case_study.py <content.json> <output.pdf>
   ```

3. **Proofread visually** — render to images and look before delivering:

   ```bash
   pdftoppm -png -r 100 <output.pdf> /tmp/case_check
   ```

   Check: Hebrew reads correctly, numbers/stats/dates aren't reordered, the
   stat strip and banner render, sections fall on the right pages, nothing
   overflows the border frame, and the signatures are correct.

   **Always look at the LAST page specifically.** The most common defect is the
   closing block (banner + signatures) — or a final body paragraph — colliding
   with the »SHIFT logo baked into the bottom-right of the background (roughly
   the right 54 mm × bottom 24 mm of every page). If anything reaches that zone,
   the page is overloaded — fix it by adding a page (below), not by shrinking.

4. Copy the final PDF to the outputs directory and present it.

### If content overflows a page — add a page, don't shrink

The frame and per-page background are fixed. When a page runs long:

1. **First choice: spread across more pages.** Give a later section
   `"page": 3` and the generator emits a third page; the closing block always
   follows to the last page, so it lands there with clearance above the logo.
2. **Second choice: tighten the prose** — the voice is concise anyway.
3. **Never** shrink fonts, cut line-height, squeeze margins, or let text run
   past the border. Adding a page preserves the template; tricks degrade it.

---

## Setup / dependencies

The generator needs WeasyPrint. If it isn't installed:

```bash
pip install weasyprint --break-system-packages -q
```

Fonts (Inter as the Google-Sans stand-in + Hebrew Heebo) and the background
image are bundled in `assets/` and referenced automatically.

---

## Files

- `scripts/generate_case_study.py` — the PDF generator (JSON in, PDF out).
  Handles RTL, Latin-token isolation, the kicker/lead/stat-strip/banner, two- or
  three-page layout (via section `page` keys), and the signature block.
- `assets/template.html` — the HTML/CSS layout. Same brand frame as the quote
  template, plus case-study styles (kicker, lead, stat strip, banner). Edit here
  only to change the *design*.
- `assets/background.png` — the exact Shift background (paper, border, chevron
  watermark, »SHIFT logo). Identical on every page; shared with the quote skill.
- `assets/fonts/` — Inter (Google Sans stand-in, Latin) + Heebo (Hebrew).
- `assets/example_content.json` — the T-CENTER case study; copy and edit.
- `references/content_schema.md` — full field-by-field schema. Read before
  writing a case study.
