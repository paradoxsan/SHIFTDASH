<!--
TEMPLATE: 05 principles, format and spec. This holds the account's strategic
throughlines, the operator's house style, brand assets, and the production spec.
The technical spec is locale-aware: keep the parts that match the client's
working language and output formats, drop the rest. Localize headings and
content. Delete every > 📝 block and this comment before delivering.
-->

# [Client name] — principles, format and technical spec

## Key principles and learnings

> 📝 The strategic throughlines for this account: the hard-won facts that should shape every decision. Lead with the single most important one (often the real conversion lever for the niche). Add lessons already learned.

- [The central metric / lever for this account, stated plainly.]
- [Creative principle that wins here.]
- [A lesson learned: what worked, what didn't, and why.]
- [Strategic reference or model, if used.]

## Format preferences

> 📝 The operator's house style, captured exactly. These rules are applied to the prose of every deliverable, so be specific.

- **Documents:** [preferred types and settings, for example Word/Sheets/slides, font, layout].
- **Messaging:** [conventions for chat/WhatsApp/email, spacing, tables vs none, emoji].
- **Numbering and headings:** [the operator's style].
- **Hard rules:** [non-negotiables, for example never use em dashes; use a specific quote style].
- **Language per audience:** [which language goes to which audience].
- **Email drafts:** [for example, usually offer two versions, warm/detailed and short/direct].
- **Output expectation:** [finished deliverables that need minimal post-editing, synthesized from fragmented input].

## Brand assets

> 📝 Colors, fonts, logo. Include hex values.

- **Colors:** [hex] ([name]), [hex] ([name]).
- **Fonts:** [fonts].
- **Logo:** [where it lives / usage notes].

## Technical production spec

> 📝 Keep only the recipes that match the client's working language and output formats. The blocks below are worked examples; adapt or replace per the actual stack. If the client works left-to-right, drop the RTL handling and note the LTR defaults instead.

### Right-to-left languages (Hebrew, Arabic, etc.)
> 📝 Use only if the working language is RTL.
- **Slides / carousels:** set RTL at presentation and text-box level; use a square layout for social carousels.
- **Spreadsheets:** enable right-to-left sheet view; set header fill and alternating row colors in brand palette.
- **Word documents:** set bidirectional and right alignment; section headers render more reliably as single-cell tables than as styled paragraphs.

### Left-to-right languages
> 📝 Use for English and other LTR languages. Standard alignment and layout; apply the brand palette to headers and accents.

### QA workflow
> 📝 How finished visual output is checked. For example, export slides to PDF then to images for review.
[The check.]

### Additional rules
> 📝 Any other hard production rules.
- [For example: when adding a sheet to an existing file, copy the file from outputs first.]
- [For example: social tables must include full clickable URLs, not just handles.]

## Tools and resources

> 📝 The tools and infrastructure the account runs on, and how each is used.

- **[Tool]:** [how it's used].
- **[Tool]:** [how it's used].
- **[Platform]:** [for example, paid campaigns managed in parallel by the media buyer].
- **[Downstream tool]:** [for example, structured briefs handed off for text generation].
