# Design & Component References — Where to Look, and How to Look

Reference-hunting has a method: match the source to the job, build TWO moodboards, borrow
decisions not looks. Never copy a reference wholesale — extract one transferable idea per source
(a layout structure, a type treatment, a proof pattern) and credit it in the design plan
("מבנה ה-hero בהשראת X, מותאם ל-RTL").

## 1. Source map — pick by job

| Job | Sources |
|---|---|
| Visual craft, art direction, motion | **Awwwards**, **Godly** (godly.website — tight curation, great for motion), The FWA, CSS Design Awards |
| Real shipped product UI patterns | **Mobbin** (mobile+web flows), **Refero**, Page Flows (interaction flows) |
| Landing pages & conversion structure | **Land-book**, **Lapa Ninja**, **One Page Love** |
| Typography-driven minimal sites | **Httpster**, **Site Inspire** (best filtering taxonomy) |
| Typography specifically | **Typewolf** (what fonts sites use + pairings), FontPair; for Hebrew — Google Fonts Hebrew filter, alefalefalef.co.il, fontef.com, the Awesome-Hebrew-Fonts repo |
| Specific section patterns | Footer.design (footers), SaaS Landing Page (sections by type), Component galleries: collectui.com |
| Code-ready components | shadcn/ui (available in React artifacts), Tailwind UI patterns, 21st.dev — adapt to RTL per `rtl-implementation.md` |
| Israeli context | gov.il design system (Hebrew-first government patterns — forms, accessibility), leading Israeli brands per niche (search "אתר [נישה] עיצוב" + check Israeli agency portfolios: e.g. studios behind Wix/monday/Fiverr marketing pages for the high end) |

How to use with web tools: `web_search` the gallery + niche ("land-book fitness landing"), then
`web_fetch` 2–3 chosen references and read their structure (section order, hero pattern, CTA
logic) — you analyze the decisions even when you can't render the pixels.

## 2. The two-moodboard method (run in Phase 5)

Build two short lists, not one:
1. **Feel board (איך המותג מרגיש):** 2–3 references answering tone — palette energy, type
   personality, photography style. Pulled from Awwwards/Godly/Httpster/Israeli brands.
2. **Perform board (איך הדף מבצע):** 2–3 references answering conversion — CTA placement, proof
   density, form friction, objection order, section sequencing. Pulled from
   Land-book/Lapa/Mobbin/best niche competitor found in research.

The perform board is where the money is; a beautiful page from the feel board alone is
commercially weak. The design plan must cite at least one item from EACH board.

## 3. Extraction discipline

For each chosen reference write one line: "לוקח: ___ . משאיר: ___ ." Examples:
- "לוקח: hero בשתי עמודות עם טופס מימין (אצלנו: טופס משמאל בגלל RTL — הטקסט מתחיל מימין).
  משאיר: הפלטה הכחולה."
- "לוקח: פס לוגואים של לקוחות מיד אחרי ה-hero. משאיר: הטיפוגרפיה."

LTR references must be consciously mirrored: their left-edge attention spine becomes our right
edge; their bottom-right Z-terminal CTA logic maps to our bottom-left. Never paste an LTR
composition unmirrored into an RTL page.

## 4. Anti-patterns

- Referencing only award sites for an SMB landing page (over-designed, under-converting).
- Referencing only competitors (guarantees a me-too site).
- More than 5 total references (decision paralysis; the plan should be opinionated).
- "Inspired by" that's actually a clone of the niche's creative leader — re-run differentiation.
