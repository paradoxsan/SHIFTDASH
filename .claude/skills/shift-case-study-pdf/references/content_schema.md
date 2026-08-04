# Case-study content JSON schema

`scripts/generate_case_study.py` turns one JSON file into the branded Shift
case-study PDF (same background, fonts, and frame as the quote template). Fill
every field in Hebrew — Latin tokens (brand names, `WHAPI`, `N8N`, `API`, `GPT`,
numbers, dates) are auto-detected and rendered in the Google-Sans stand-in, so
you don't mark them. A complete working example is
`assets/example_content.json` (the T-CENTER case study).

## Top-level fields

| Field | Required | Meaning |
|---|---|---|
| `kicker` | no | Small uppercase label above the title. Default `CASE STUDY`. |
| `title` | yes | Document title, centered. Use `\n` to force a line break. Write it as an outcome headline, not a topic — e.g. *"איך בוט וואטסאפ אחד ענה ללקוחות של X במקום הבעלים"*. |
| `client_name` | yes | First item in the subline. |
| `industry` | no | Second subline item (e.g. `הדפסה ורקמה על חולצות`). |
| `client_domain` | no | Third subline item — site, handle, or city. |
| `lead` | no | One bold centered sentence under the title: the "what this is" in plain language. Keep it to a single line of meaning. |
| `intro` | yes | Opening paragraphs that set up the client and the pain. Blank line splits paragraphs. |
| `sections` | yes | Ordered content sections (see below). The recommended arc is **הבעיה → הפתרון → איך זה עובד → התוצאה**. |
| `closing_banner` | no | A centered emphatic closing line on the last page (e.g. the one-liner that sums up the win). |
| `signatures` | yes | Signers. Default = both founders. |

There is **no costs block and no validity line** — this is a story, not a quote.

## `sections` — list of objects

```json
{
  "title": "התוצאה",
  "page": 2,
  "accent": true,
  "body": [
    "פסקה רגילה ...",
    { "label": "עונה על הכל:", "text": "לבן-מודגש בתחילת השורה ..." },
    { "stat_row": [
        { "num": "24/7", "cap": "מענה מיידי" },
        { "num": "0", "cap": "פניות שנופלות" }
    ]}
  ]
}
```

- `title` — Hebrew section header (right-aligned bold).
- `page` — `1`, `2`, or `3`. Page 1 = title + lead + intro + first sections;
  later sections move to page 2/3. **The closing block (banner + signatures)
  always follows to the LAST page**, so set a late section to `"page": 3` to
  give the closing its own clean page above the »SHIFT logo.
- `accent` — only meaningful on the first section: `true` underlines it.
- `body` — a string, or a list whose items are:
  - a plain string → one paragraph;
  - `{"label","text"}` → paragraph with a bolded lead-in;
  - `{"stat_row": [ {"num","cap"}, ... ]}` → the big-number results strip.
- `stat_row` may also be set as a top-level key on the section (renders after
  the body). `cap` accepts `\n` for a two-line caption.

## `stat_row` — the results strip

A centered row of 2–3 big-number cards. Use it once, in the "התוצאה" section,
for the headline outcomes. Keep `num` short (`24/7`, `1–2`, `0`, `×3`) and `cap`
to one short line (two with `\n`).

## `signatures` — list

```json
[
  { "name": "דניאל גורליק", "org": "SHIFT DIGITAL" },
  { "name": "נועם כהן", "org": "SHIFT DIGITAL" }
]
```

Default is both founders. `org` defaults to `SHIFT DIGITAL`.

## Notes on rendering

- RTL throughout; Latin runs auto-isolated so `WHAPI`, `2,500`, dates keep order.
- A blank line **or** a single newline in a string body starts a new paragraph.
- Don't hand-wrap lines — the template controls width.
- Escape backslashes (`\\`) and Hebrew double-quotes (`ש\"ח`) inside JSON.
