# Content JSON schema

The generator (`scripts/generate_quote.py`) turns a single JSON file into the
branded two- or three-page PDF. Fill every field in Hebrew (Latin tokens like brand
names, `API`, `N8N`, `GPT`, prices and dates are auto-detected and rendered in
the Google-Sans stand-in — you don't need to mark them). A complete, working
example is `assets/example_content.json` (it reproduces the reference quote).

## Top-level fields

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Document title, centered at the top. Pattern: `הצעת מחיר \| <שם השירות>`. |
| `client_name` | yes | Goes into the subline as `לכבוד: <name>`. |
| `date` | yes | Quote date, `DD.MM.YYYY`. Subline shows `תאריך: <date>`. |
| `client_domain` | no | Client's site/handle, shown at the start of the subline (e.g. `Winecabinet.co.il`). Omit if none. |
| `intro` | yes | Opening paragraph(s). Reference back to the call: *"מהשיחה שהיית בה ב-<date> עם <נציג>, הבנו ש..."*. Use a blank line to split paragraphs. |
| `sections` | yes | Ordered list of content sections (see below). |
| `build_days` | yes* | Number for the build-time banner: *"תוך X ימי עבודה מרגע התשלום"*. For automation projects, derive X via the n8n-workflow-builder skill (see SKILL.md). |
| `build_time_banner` | no | Override the whole banner text if the default phrasing doesn't fit. Usually leave unset. |
| `costs` | yes | The costs block (see below). Always its own section on the final page. |
| `validity` | yes | Validity line, centered. Default span = 1 week from the quote date. Pattern: `ההצעה בתוקף עד לתאריך <date>.` |
| `signatures` | yes | List of signers. Default = both founders. |

\* Either `build_days` or `build_time_banner` must be present.

## `sections` — list of objects

Each section renders as a right-aligned bold title followed by its body.

```json
{
  "title": "מה אנחנו מקימים לך",
  "page": 1,
  "accent": true,
  "body": [
    "פסקה ראשונה ...",
    "פסקה שנייה ..."
  ]
}
```

- `title` — the Hebrew section header.
- `page` — `1`, `2`, or `3`. Controls which page the section lands on.
  Opening sections (what we build / behind the scenes) go on page 1; the rest
  (next call / support / etc.) go on page 2. Defaults to `1` if omitted.
  **Set `3` on one or more later sections to spread a long quote across three
  pages** — the closing block (costs + validity + signatures) always moves to
  whichever is the last page, so it lands on page 3 by itself with room above
  the »SHIFT logo. Prefer adding a page over letting page 2 crowd the bottom
  border (see SKILL.md → "If content overflows a page").
- `accent` — only meaningful on the **first** section: `true` adds the
  underline accent seen on the reference's opening header. Defaults to `true`.
- `body` — either a single string, or a list of strings (each becomes a
  paragraph). A paragraph may also be `{"label": "...", "text": "..."}` to
  bold a lead-in phrase.

## `costs` — object

```json
{
  "title": "עלויות",
  "lines": [
    { "label": "הקמת הבוט:", "text": "2,500 ש\"ח. חד-פעמי, נכנס יחד עם תחילת העבודה." },
    { "label": "ריטיינר חודשי:", "text": "350 ש\"ח לחודש. כולל ..." },
    { "text": "ניתנת אופציה לשלם על ה-API ... ולהוריד את הריטיינר ל-150 ש\"ח בלבד." }
  ]
}
```

- `title` — defaults to `עלויות`.
- `lines` — each line is either a plain string or `{label, text}` (label is
  bolded, like `הקמת הבוט:`). The cost **structure is decided per client** —
  one-time only, retainer only, both, plus the optional self-pay-API discount
  line. Include whatever lines apply.

## `signatures` — list

```json
[
  { "name": "דניאל גורליק", "org": "SHIFT DIGITAL" },
  { "name": "נועם כהן", "org": "SHIFT DIGITAL" }
]
```

Default is both founders. `org` defaults to `SHIFT DIGITAL` if omitted. One
signer also works (the block stays centered).

## Notes on rendering

- Text direction is RTL throughout; Latin runs are auto-isolated so numbers
  like `2,500` and tokens like `Green API` keep their order.
- Paragraph splitting: in a string body, a blank line **or** a single newline
  starts a new paragraph.
- Don't hand-wrap lines — let the text flow; the template controls width.
- Backslash in JSON must be escaped (`\\`), and Hebrew double-quotes inside a
  JSON string must be escaped (`ש\"ח`).
