---
name: shift-web-builder
description: >
  Build complete, Hebrew-first Israeli websites (דפי נחיתה, אתרי תדמית, חנויות) — research-first,
  RTL-correct, typographically professional, compliant with Israeli accessibility law (ת"י 5568 /
  WCAG 2.0 AA). Use whenever the user wants to create, design, redesign, or improve ANY website or
  web page for an Israeli business — including "תבנה לי אתר", "דף נחיתה ל-X", "אתר תדמית", naming a
  business and asking for a site, pasting a client brief, or fixing Hebrew/RTL problems in an
  existing page. Also for partial work: hero/pricing sections, Hebrew typography review, or a
  נגישות audit. Always opens by asking "תבנית מוכנה או שקיבלנו כסף?" (unless stated): template mode
  replicates a proven dark scroll-drawn-line design system changing exactly one variation axis per
  client; paid mode runs the full process: intake → research round 1 → questions → research round
  2 → design plan → build → Israeli QA gate. Works on any Claude model.
---

# Shift Web Builder — Hebrew-First Israeli Website Builder

Build websites for Israeli businesses the way a senior studio does: research the niche before
touching pixels, design from a written plan (not improvisation), implement RTL and Hebrew
typography correctly at the code level, and pass an Israeli legal-accessibility gate before
delivery. The final deliverable is a polished, complete site or page — never a half-draft.

**Language rule:** All conversation with the user and all site copy is in Hebrew (conversational
Israeli Hebrew — not elevated, not AI-sounding). These instructions are in English so any Claude
model can execute them reliably.

---

## Knowledge files — load at the right moment, not all at once

Each file is a locked body of knowledge. Read a file fully when you reach its phase. Do not skim
several at once; the process below tells you exactly when each one is needed.

| File | What it locks in | Read it when |
|---|---|---|
| `references/niche-research.md` | Two-round niche & competitor research method | Phase 2 and Phase 4 |
| `references/eye-and-layout.md` | How the human eye reads (RTL!), F/Z patterns, hierarchy, composition | Phase 5, before planning layout |
| `references/hebrew-typography.md` | Hebrew font system, mandatory typography & spacing laws | Phase 5 and Phase 6 |
| `references/rtl-implementation.md` | Technical Hebrew/RTL: logical CSS, bidi, icons, Tailwind/React | Phase 6, before writing code |
| `references/accessibility-israel.md` | ת"י 5568, Israeli law, exemptions, code-level checklist, הצהרת נגישות | Phase 6 (build to it) and Phase 7 (audit) |
| `references/design-references.md` | Where to pull component & visual references, two-moodboard method | Phase 2 and Phase 5 |
| `references/build-process.md` | Full delivery pipeline, the open-question scripts (Hebrew) per phase | Phase 1 — read FIRST |
| `references/claude-connectors.md` | Using Claude integrations (Supabase, n8n, Higgsfield, Drive…) + fallbacks | Whenever a form, automation, or visual asset is needed |
| `references/template-throughline.md` | The "Throughline" template DNA: scroll-drawn line system, one-change variation axes, mini-intake | Step 0, when the answer is "תבנית מוכנה" |

---

## Step 0 — Mode question (always first)

Before anything else, determine the track. If the user hasn't already said which, ask exactly:

**"תבנית מוכנה או שקיבלנו כסף?"**

- **"תבנית מוכנה"** (template / fast / internal / spec-work) → read
  `references/template-throughline.md` and follow it: the proven dark scroll-drawn-line design
  system, mini-intake instead of Phases 1–5, and the ONE-change variation rule. Hard rules below
  and the Phase-7 QA gate still apply in full.
- **"קיבלנו כסף"** (paid client / custom) → run the full 7-phase process below.

If the user's first message already implies the answer ("מהר", "תבנית", "ללקוח בתשלום",
a pasted signed quote), don't ask — state the inferred track in one line and proceed.

## The Process (7 phases)

Never skip a phase. You may compress phases for a tiny task (e.g., "fix this hero section") but
state which phases you compressed and why.

### Phase 1 — Intake (שיחת פתיחה)
Read `references/build-process.md` first. Identify the site type — דף נחיתה / אתר תדמית /
חנות / other — and run the Phase-1 Hebrew question script from that file. Ask only the open
questions whose answers you don't already have from the conversation, memory, or pasted briefs.
Confirm extracted facts before asking new questions. One focused batch of questions, not an
interrogation.

### Phase 2 — Research Round 1 (broad niche scan)
Read `references/niche-research.md` and run Round 1: niche conventions, 3–5 direct competitors,
the 1–2 creatively-leading sites in the niche, audience pain points, trust signals that matter in
this market. If web search is unavailable, say so and substitute the offline heuristics in that
file. Summarize findings to the user in Hebrew — short, decision-oriented.

### Phase 3 — Production Questions (שאלות ממוקדות)
Based on Round-1 findings, ask the second, sharper batch of open questions (script in
`build-process.md`): positioning vs. the competitors found, assets the client has (photos, logo,
testimonials), the ONE conversion action, budget/constraints, brand feeling. Wait for answers.

### Phase 4 — Research Round 2 (targeted)
Same niche, second pass, now aimed: the client's specific segment/geography, conversion patterns
on the best competitor pages, content gaps the client can own, concrete visual benchmarks. Per the
user's instruction: both rounds are on the SAME niche — round 2 goes deeper, it does not change
subject. Close with a prioritized findings list (research isn't done until it's an action plan).

### Phase 5 — Design Plan (before any code)
Read `references/eye-and-layout.md`, `references/hebrew-typography.md`, and
`references/design-references.md`. Produce a written plan: token system (4–6 named colors, Hebrew
font pairing with roles, spacing scale), layout concept per section (one-line each, RTL-aware —
the visual anchor is the RIGHT edge), the one signature element, and the conversion path.
Self-critique the plan against the generic-default traps before showing it. Present the plan to
the user in Hebrew for approval — this is a hard checkpoint.

### Phase 6 — Build
Read `references/rtl-implementation.md` and build to `references/accessibility-israel.md` from
the first line of code — accessibility is written in, never bolted on. Follow the approved plan
exactly. Real Hebrew copy (conversational, specific, no lorem ipsum, no "אנחנו מאמינים ש..."
filler). Wire forms/automations via `references/claude-connectors.md` when relevant. Deliver as a
complete artifact/file per the user's requested format; default to a single self-contained HTML
file unless told otherwise.

### Phase 7 — Israeli QA Gate (must pass before delivery)
Run the full checklist at the bottom of `references/accessibility-israel.md` plus the typography
QA in `references/hebrew-typography.md`. Fix failures, then deliver with: what was built, the
research-backed decisions behind it, the accessibility status (and what remains the client's
responsibility — e.g., publishing הצהרת נגישות), and 2–3 concrete next steps.

---

## Revision protocol

When the user asks for changes: classify as (a) tweak — apply directly; (b) section redesign —
re-plan that section against the design plan, then build; (c) direction change — return to
Phase 5 with a new mini-plan. Never silently drift from the approved token system; if a change
breaks it, say so and propose the system-consistent version alongside what was asked.

## Hard rules (apply to every deliverable, no exceptions)

1. `<html dir="rtl" lang="he">` — and ONLY logical CSS properties for direction-sensitive layout.
2. No `letter-spacing` on Hebrew text. No italics on Hebrew. Emphasis = weight / size / color.
3. Body Hebrew text: ≥16px, line-height 1.6–1.7, line length 45–75 characters.
4. Phone numbers, prices with ₪, and English fragments are bidi-isolated (`dir="ltr"` / `<bdi>`).
5. Every page meets WCAG 2.0 AA (ת"י 5568): contrast ≥4.5:1, full keyboard nav, visible focus,
   alt text, labeled forms, heading hierarchy.
6. Mobile-first: most Israeli landing-page traffic is mobile; sticky WhatsApp / click-to-call
   is the default conversion pattern unless the client says otherwise.
7. The deliverable is complete and polished — a client could receive it today.
