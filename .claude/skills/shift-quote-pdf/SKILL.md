---
name: shift-quote-pdf
description: >-
  Generate a branded Shift Digital client price-quote PDF (הצעת מחיר) in Hebrew, matching the
  agency's exact template — paper/border/watermark/»SHIFT-logo background, Google-Sans-style type,
  centered title, RTL sections, a build-time banner, costs, validity line, and a two-founder
  signature block. Use this skill whenever the user wants to create a price quote, proposal, or
  הצעת מחיר / הצעת לקוח for a Shift Digital client — including when they paste a summary of a sales
  call with a lead who left details and ask to "build a quote", "תכין הצעת מחיר", "צור הצעה ללקוח",
  or hand over client info and a service to price. Trigger it even if they just say "הצעה ללקוח X"
  or describe what a client wants and ask for a quote document. The skill runs a short intake
  interview (confirming facts extracted from any call summary first), consults the
  n8n-workflow-builder skill to estimate build time for automation projects, then produces a
  polished, ready-to-send PDF.
---

# Shift Digital — Client Quote PDF

Produce a client-ready Hebrew price quote (הצעת מחיר) as a PDF that is **visually identical** to
Shift Digital's template and **written in the agency's voice**. The look is fixed (a real
background asset extracted from the reference quote); your job is to get the *content* right for
each client and fill it in faithfully.

The output is an A4 PDF, normally **2 pages** and **3 pages** when the scope is heavier: page 1 =
title + intro + "what we build" + "behind the scenes"; page 2 = build-time banner + remaining
sections + (on a 2-page quote) costs + validity + signatures. When a quote runs long, push sections
onto a third page (`"page": 3` in the JSON) — the closing block of costs + validity + signatures
automatically follows to the last page. Adding a page is always preferred over shrinking type or
margins (see "If content overflows a page").

The non-negotiable rule: **never generate the PDF before the intake is confirmed.** Most inputs are
a summary of a call with a lead — extract everything you can from it, then confirm the key facts
(and fill gaps) in one short pass. A quote sent with the wrong price, scope, or build time is worse
than a quote sent a minute later.

---

## The process (always in this order)

1. **Read the input.** Usually a call summary with a lead who left details. Extract: client name,
   their site/handle, what service they want, any scope details, anything said about budget or
   timing, and which founder spoke to them.
2. **Intake — confirm + fill gaps.** Ask the questions below, grouped into one message. Pre-fill
   every answer you already have from the summary and ask the user to confirm or correct, rather
   than asking from scratch. This is the "always confirm key facts first" step.
3. **Estimate build time.** For automation/bot/workflow projects, consult the **n8n-workflow-builder
   skill** to ground the number of build days (see "Build-time estimate" below). For non-automation
   services, estimate sensibly and state your assumption.
4. **Draft the content** in the agency voice (see "Voice & structure"), filling the content JSON.
5. **Generate** the PDF with the script, render it to an image, and **proofread it visually**
   (Hebrew, numbers, dates, page breaks) before handing it over.
6. **Deliver** the PDF and offer the natural next step (tweak scope, adjust costs, change validity).

---

## Intake interview

Ask these, grouped. Pre-fill from the call summary and mark what you inferred so the user just
confirms. The five content sections are always present — you're tailoring their content, not
choosing whether to include them.

1. **Client identity** — full name (as it should appear in `לכבוד:`), and their site/handle for the
   subline (e.g. `Winecabinet.co.il`). Confirm the **quote date** (default: today).
2. **Service & scope** — what exactly are we building/providing? This drives the title
   (`הצעת מחיר | <שם השירות>`) and the "what we build" + "behind the scenes" content. For a
   non-bot service, the "behind the scenes" section still explains *how it works* in the same
   transparent tone — adapt the technical content to the actual service.
3. **Build time** — how long until it's ready? Phrased always as *"תוך X ימי עבודה מרגע התשלום"*.
   For automation projects, derive X via the n8n skill (next section). Confirm the number with the
   user. (Default if truly unknown: 5.)
4. **Costs** — the cost structure **varies per client and must be asked each time**. Establish:
   - one-time setup fee? (amount)
   - monthly retainer? (amount + what it covers: maintenance, hosting, backups, changes, AI services)
   - the optional **self-pay-API discount**: client pays the AI model API themselves and the
     retainer drops to a lower hosting-only figure (the reference uses 150 ₪). Include this line
     only if it applies to the service.
   Ask which of these apply and the amounts.
5. **Validity** — how long is the quote valid? **Default: one week** from the quote date. Confirm or
   override. Render as `ההצעה בתוקף עד לתאריך <date>.`
6. **Signatures** — default is **both founders** (דניאל גורליק + נועם כהן, both `SHIFT DIGITAL`).
   Confirm, or switch to one.

If the user is in a hurry, take the confirmed facts, apply sensible defaults for the rest (one-week
validity, both signatures), state the assumptions you made, and proceed.

---

## Build-time estimate (consult the n8n skill)

For any automation, bot, WhatsApp, n8n, or AI-pipeline project, the build-time number should be
**grounded, not guessed**. Consult the **n8n-workflow-builder** skill: read its SKILL.md and use its
intake framing (trigger, AI logic, memory, external services, credentials, output) to reason about
how many distinct pieces the build involves, then translate that into a realistic number of working
days for the banner.

Rule of thumb to calibrate against (the reference WhatsApp social-bot + media generator = **5 ימי
עבודה**):

- Simple single-flow bot (one webhook, one AI step, reply out): ~3–4 days.
- Standard content/social bot (brand profile + image/text generation + approval + Meta upload, like
  the reference): ~5 days.
- Multi-agent / router + several external integrations + memory: ~7–10 days.

Always phrase as whole working days and confirm with the user. For non-automation services (content
retainers, design, websites), estimate from the actual scope and say what you assumed.

---

## Voice & structure (write it like Shift Digital)

The reference sets the tone. Match it:

- **Second person, warm, direct, confident.** Address the client as "אתה". Short, concrete sentences.
  No corporate fluff, no hype words, no emojis.
- **Open by anchoring to the call:** *"מהשיחה שהיית בה ב-<date> עם <נציג>, הבנו ש..."* then a
  one-line plain-language description of what they're getting, then *"ההצעה הזו מסכמת בדיוק מה אתה
  מקבל, איך זה עובד ומה העלויות."*
- **Explain the "how" transparently.** The "behind the scenes" section names the real stack in plain
  terms (e.g. N8N running the logic, a Google server for 24/7 uptime, Green API for WhatsApp, the AI
  models for generation). Transparency is part of the brand — but keep it readable, not a spec sheet.
- **Reassure with process:** a "what we'll define in the next call" section (we calibrate to your
  business before starting) and a "support & full transparency" section (close guidance, Zoom wal
  -throughs of the system, conducted with one or two of the Shift Digital managers).
- **Costs are stated plainly and confidently**, with bolded lead-ins (`הקמת הבוט:`, `ריטיינר חודשי:`).
- **Always end** with the validity line and the two-founder signatures.

### The five fixed sections (tailor content, keep the arc)

1. **מה אנחנו מקימים לך** — what they get, in their world's language (page 1, accent header).
2. **איך זה עובד מאחורי הקלעים** — how it works / the stack, transparently (page 1).
3. **מה נגדיר בשיחה הבאה** — what we'll calibrate together before building (page 2).
4. **ליווי ושקיפות מלאה** — guidance, Zoom walk-throughs, who they work with (page 2).
5. **עלויות** — the cost lines (page 2, rendered from the `costs` block).

Rename a section only if the service genuinely calls for it; keep the same five-beat flow.

---

## Generating the PDF

1. Write the content to a JSON file following `references/content_schema.md`. Start from
   `assets/example_content.json` (it reproduces the reference quote) and replace the content — it's
   the fastest way to get the structure right. **Read the schema reference before writing the JSON.**
2. Run the generator:

   ```bash
   python scripts/generate_quote.py <content.json> <output.pdf>
   ```

3. **Proofread visually** — render the PDF to images and look at them before delivering:

   ```bash
   pdftoppm -png -r 100 <output.pdf> /tmp/quote_check
   ```

   Check: Hebrew reads correctly, numbers/prices/dates are right and not reordered, the build-time
   banner shows the agreed number, sections fall on the right pages, nothing overflows the border
   frame, and the signatures are correct. Fix the JSON and re-run if anything is off.

   **Always look at the LAST page specifically.** The single most common defect is the closing
   block (costs + validity + signatures) getting pushed down until the signatures collide with the
   »SHIFT logo baked into the bottom-right of the background, or spill past the bottom border. The
   logo occupies roughly the bottom-right corner of every page (about the right 54 mm × bottom
   24 mm). If the signatures or any text reach that zone, the page is overloaded — fix it by adding
   a page (see below), not by shrinking anything.
4. Copy the final PDF to the outputs directory and present it.

### If content overflows a page — add a page, don't shrink

The frame and the per-page background (border + »SHIFT logo) are fixed. When a page runs long:

1. **First choice: spread the content across more pages.** The generator supports a **third page
   automatically** — give a section `"page": 3` in the JSON and it emits page 3. The closing block
   (costs + validity + signatures) always follows to the LAST page, so it lands on page 3 on its
   own, with generous clearance above the logo. A typical heavier quote splits as: page 1 = intro +
   "what we build"; page 2 = "behind the scenes" + "next call"; page 3 = "support" + costs +
   signatures. (More than three pages also works via further `page` values, but three is almost
   always enough.)
2. **Second choice: tighten the prose** — the agency voice is concise anyway, so trimming a wordy
   paragraph is fair game.
3. **Never** shrink fonts, cut line-height, or squeeze margins to force-fit a long quote, and never
   let text run past the border. Those tricks degrade the template; adding a page preserves it.

The signature block is anchored to the right of the text column at a fixed width so its leftmost
signer clears the logo horizontally even on a two-page quote — but the surest way to keep the
signatures clean is to let them sit high on a dedicated final page.

---

## Setup / dependencies

The generator needs WeasyPrint. If it isn't installed:

```bash
pip install weasyprint --break-system-packages -q
```

Fonts (Google-Sans-stand-in Inter + Hebrew Heebo) and the background image are bundled in `assets/`
and referenced automatically — nothing to download.

---

## Files

- `scripts/generate_quote.py` — the PDF generator (JSON in, PDF out). Handles RTL, Latin-token
  isolation, two- or three-page layout (via section `page` keys), and the signature block.
- `assets/template.html` — the HTML/CSS layout (typographic scale, section styles, page frame).
  Edit here only to change the *design*; per-quote content lives in the JSON.
- `assets/background.png` — the exact background extracted from the reference quote (paper, border,
  chevron watermarks, »SHIFT logo). Identical on every page.
- `assets/fonts/` — Inter (Google Sans stand-in, Latin) + Heebo (Hebrew), Regular + Bold.
- `assets/example_content.json` — a complete working example (the reference quote). Copy and edit.
- `references/content_schema.md` — full field-by-field schema for the content JSON. Read before
  writing a quote.

---

## Changelog

**v2 (current).** Added automatic **three-page support**: set `"page": 3` on later sections and the
generator emits a third page, with the costs + validity + signature closing block following to the
last page automatically. This is now the preferred way to handle a long quote — adding a page beats
shrinking type or margins. Also fixed the **signature block** so it's anchored to the right of the
text column at a fixed width and always clears the bottom-right »SHIFT logo (the old centered
`space-between` block could collide with the logo when signatures fell in the bottom band). Page-2
spacing returned to the reference values, since the third page (not tighter margins) is now the
release valve for overflow.

**v1.** Original two-page generator, template, background, fonts, schema, and example.
