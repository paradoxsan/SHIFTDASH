---
name: digim-creative-skill
description: >-
  DIGIM Creative Skill — a research-and-ideation partner for short-form video (Reels / TikTok /
  Shorts / Facebook video) for Israeli businesses, ending in a DIGIM-branded Hebrew PDF of 10 reel
  concepts. Use it whenever the user wants reel ideas, scripts, hooks, or creative concepts for an
  Israeli brand — which FORMATS get engagement in a niche, what competitors post (with real links),
  what's trending in audio/hashtags, Meta Ad Library research for paid campaigns, or adapting a
  viral format to a business. Trigger it even when the user just names a business and asks "what
  should they post," "ideas for reels for X," or "what's working now," hands over a competitor
  account, or wants a Hebrew content plan or creative brief. It runs TWO rounds of live research
  (broad scan, then a targeted pass after the production questions), confirms the direction, then
  builds the final DIGIM PDF. When asked to swap or replace concepts, it researches brand-new ideas
  and rebuilds the PDF.
---

# DIGIM Creative Skill

A live research-and-ideation partner for short-form video aimed at Israeli audiences. It turns
"what should this business post?" into a structured, sourced, client-ready creative document:
which formats are actually working in the niche, who's doing them well (with real links), what
sound and hashtags to ride, and **10** concrete reel concepts adapted to the specific brand —
each with a description, a goal, a beat-by-beat script, and visual-element notes.

The final deliverable is a **DIGIM-branded Hebrew PDF** (the exact template clients expect),
produced only after two rounds of research and a direction sign-off. See
`references/digim_pdf_output.md` for the locked spec and `scripts/build_pdf.py` for the renderer.

This skill is opinionated toward how Shift Digital works — Israeli SMBs, Hebrew client-facing
output, and a generation pipeline of Higgsfield (GPT Image 2 / Veo), Nano Banana Pro, CapCut,
and Suno — but the method generalizes to any Israeli brand and any short-form platform.

Three non-negotiables, because breaking any one destroys client trust:
**(1) never invent engagement numbers or fake links** — every "this got X" must be pulled live
or clearly marked an estimate, and a reel link must point at a real post; **(2) co-select before
developing, and confirm the direction after the second research round before writing the PDF** —
research first, co-select, re-research, get a yes, then produce; **(3) build every concept to
fit what the client can actually shoot.**

---

## What this skill is (and what it isn't)

This skill is a **methodology Claude runs inside a session**. When it triggers, Claude
orchestrates its own live tools — browser, web search, web fetch — in a structured, repeatable
sequence, and reasons over the results. That is genuinely agentic *within the session*.

It is **not** a deployed service that runs on its own. If the goal is autonomous, scheduled
output ("email me a fresh trend report every Monday"), that's this skill's logic wired into an
**n8n schedule trigger** on top — build that with the `n8n-workflow-builder` skill once the
creative method here is dialled in.

---

## The process (always in this order)

The order matters because each step feeds the next, and the checkpoints are what make it feel
like working *with* the user instead of dumping a report on them. There are **two research
rounds** and **two sign-off gates** before any PDF is written.

1. **Intake — light business framing.** Establish who we're creating for, just enough to research
   well. Grouped, fast. See "Intake" below. If the conversation already answers some fields,
   extract those and only ask the gaps — confirm, don't assume. Do NOT ask production questions
   here.
2. **Confirm the brief direction** in one short line: the business, the platform, the goal, and
   the angle of attack. (When intake already pins this down via tappable answers, state it in one
   line and proceed — don't stall for a redundant yes.)
3. **Research round 1 — broad scan.** Source real data using the tiered strategy in
   `references/data_sourcing.md`. Find the *formats* winning in the niche, real competitor reels
   (with links), trending audio + hashtags, and — only if there's a paid budget — Meta Ad Library
   creatives. Label every number verified or estimated.
4. **CHECKPOINT — present findings and co-select.** Show the user a short menu of format
   directions, each with a real reference link and why it works. Because the final doc carries
   **10** concepts, offer enough directions to land there (chosen directions + the client's own
   ideas in step 5 together make up the 10). Let them pick. Do not skip this.
5. **PRODUCTION & DIRECTION CHECKPOINT — ask before researching deeper.** Once directions are
   chosen, ask the precise production questions (equipment, how many people on camera, locations,
   constraints) AND invite the client's own rough ideas — *one line each is enough*. See
   "Production & creative-direction checkpoint." You may fold this into the step-4 message to save
   a round-trip.
6. **Research round 2 — targeted, informed by the answers.** Now that the directions, the
   production constraints, and the client's one-liners are known, go deeper: find specific
   reference reels for those exact formats, validate the chosen angles against what's actually
   performing, pull current trending sounds that fit those formats and the audience, and check the
   seasonal/holiday timing (`references/israeli_context.md`). This pass turns the chosen directions
   into grounded, sharp concepts instead of generic ones. Same honesty rules — verified vs
   estimated, real links only.
7. **DIRECTION-CONFIRMATION CHECKPOINT — get a yes before the PDF.** Present the refined research
   plus the proposed set of ~10 concept directions as a short menu, and ask plainly: *"this is the
   direction — does it work?"* Collect approval and any change requests. **Do not write the PDF
   until the user confirms.** Apply their edits here.
8. **Develop the 10 concepts.** After sign-off, run the adaptation framework
   (`references/adaptation_framework.md`) on each chosen direction AND each one-line idea the
   client gave: deconstruct the format, map it onto the brand, localize it for an Israeli
   audience, and write each concept in the **DIGIM 4-section structure** — תיאור הרעיון / מטרה /
   תסריט-פורמט / אלמנטים ויזואליים (see `references/brief_template.md`). Build every concept to fit
   the production answers (e.g. a no-kid fallback where kids aren't guaranteed).
9. **Produce & deliver the final DIGIM PDF.** Render the branded PDF per
   `references/digim_pdf_output.md` using `scripts/build_pdf.py` (10 concept cards). Verify it,
   present it, and offer to save it to Google Drive and to hand any AI-generation prompts to the
   pipeline.

### Revisions — swapping or replacing concepts

When the user asks to **replace or swap concept(s) in the final PDF** ("swap idea 4," "replace
these three," "give me different ideas instead"), treat it as fresh creative work, not light
editing:

- **Research anew.** Run a fresh, targeted research pass (`references/data_sourcing.md`) for
  **genuinely new** ideas in the same niche, goal, and production constraints — do NOT just reword
  or lightly remix the existing cards. The replacements must be different concepts, grounded in
  what's actually performing now.
- **Confirm briefly.** Show the new directions in one short line and get a yes (same gate as step
  7), then apply any tweaks.
- **Rebuild the PDF.** Regenerate a **new** final PDF with `scripts/build_pdf.py` — keep the
  concepts that weren't being replaced, drop in the new ones, keep the count at **10**, and present
  the fresh file. Don't hand-patch the old PDF.

---

## Intake (the creative profile)

Ask these before researching. Group them into one or two messages — and use **tappable options**
for the structured bits where possible. For a returning client, pull the profile from the prior
doc and just confirm what changed.

The eight things worth knowing up front (framing only — production specifics come later):

1. **Business + niche** — name and the specific category (not "food" but "neighborhood shawarma
   joint" / "indoor kids' play center" / "barber"). Niche specificity drives the whole search.
2. **Where & who** — location and target audience. Israeli regional nuance is real: a Negev /
   periphery audience, a Tel Aviv audience, and a religious-sector audience respond differently.
3. **Content language** — Hebrew (default), and whether any Arabic or English is wanted.
4. **Brand voice** — funny / warm / premium / blunt-and-local / authoritative.
5. **Platform priority** — Instagram Reels (default for most Israeli SMBs), TikTok, Facebook
   video, YouTube Shorts.
6. **Goal** — awareness, follower growth, leads/DMs, sales, or foot traffic.
7. **Budget posture** — organic-only, or a paid campaign? Only research the Meta Ad Library when
   there's budget.
8. **What they've tried** — anything posted already, and what flopped or worked.

Deliberately NOT asked here: equipment, how many people are on camera, locations, and the
client's own rough ideas — those belong to the production checkpoint (after round-1 research).

If an answer is "I don't know," pick the safest sensible default (Instagram Reels, Hebrew, the
niche as stated, organic), proceed, and flag the assumption rather than blocking.

---

## Data sourcing — the tiered strategy

Short-form platforms block scraping, so reliability comes from tiering the sources and being
honest about which numbers are real. Full recipes are in `references/data_sourcing.md` — read it
before each research step. Both research rounds use it: round 1 goes **broad** (map the niche,
seed competitor names, spot format waves); round 2 goes **deep** (specific reference reels for the
chosen formats, current sounds that fit, seasonal timing). The summary:

- **Tier 1 — Claude in Chrome (real numbers, real links).** When available, navigate Instagram,
  TikTok, and the Meta Ad Library in the user's logged-in browser and read *actual* posts, counts,
  and creative. Prefer it whenever the question hinges on "what's actually performing." This is
  especially worth doing in **round 2** to ground the chosen formats with real reel links.
- **Tier 2 — web_search + web_fetch + public trend hubs.** Without Chrome, or to go broad fast:
  trend roundups and niche listicles; **TikTok Creative Center** (public — trending songs,
  hashtags, top ads, by region) for audio; and **Meta Ad Library** URLs for `country=IL`.
- **Tier 3 — reasoning from format knowledge.** When live data is thin, fall back to durable
  reel-format patterns and the adaptation framework, and say plainly the concepts are
  pattern-based, not tied to a specific trending post.

Honesty rules, always: every engagement figure is **verified** (seen live) or **estimated**;
never present a constructed example as a real post; an unconfirmed sound is a **"suggested"** sound,
not a trending one.

---

## Production & creative-direction checkpoint (after round-1 research, before round-2)

This checkpoint exists because of a real failure mode: you present a format menu and the client
ends up writing full concepts themselves just to get the direction across. That's backwards. Run
this once directions are chosen, **before the deep second research pass**, so round 2 and the
concepts are aimed right.

Ask two things together, in one message (tappable options for the structured bits):

**A. The production reality — what can they actually shoot?**
- **Equipment** — phone only / DJI Osmo Pocket 3 / gimbal / lighting / drone? Sets how ambitious
  the shot list can be.
- **People on camera — and how many.** None (→ hands-only / voiceover / AI), one presenter, or
  two+? Ask the *number*. A two-person skit dies if only one person will film.
- **Who** — a staff member, the owner, a friend/influencer, or actors?
- **Locations / props accessible** — the signature spots and any prop the format needs.
- **Effort per shoot** — quick phone grabs between shifts, or a planned shoot day?
- **Hard constraints** — brand no-nos, people who can't be filmed, kashrut/sector sensitivities.
  For any business filming **children**, default to parental consent + face-blurring and design
  concepts to work without a guaranteed kid on camera.

**B. The client's own ideas — one line each is plenty.** Explicitly invite them: *"Throw me any
ideas you have — even a single sentence. I'll turn each into a full concept."* Treat their
one-liners as first-class concepts and develop them with the same rigor. **Never make the client
write a full concept.**

Then lock the direction in one line and move to **research round 2**. Every concept you later
write must fit the production answers; don't propose what they can't shoot.

---

## The adaptation framework (the core value)

Finding a viral format is the easy part. The skill's real job is translating it into *this* brand,
for an Israeli audience, on-brand — so the output is a shootable reel, not "do what they did."
Apply the same method to the client's one-line ideas. The method is **Deconstruct → Map →
Localize → Script**, detailed with worked examples in `references/adaptation_framework.md`:

- **Deconstruct** the reference reel into its mechanics: hook (first 1–2s), structure
  (transformation / listicle / POV / before-after / day-in-the-life / a bit), the sound's role,
  the on-screen-text rhythm, and *why* it holds attention.
- **Map** each mechanic onto the target business: our reveal, our list, our "before," our
  punchline. Keep the *structure*; swap the *content*.
- **Localize** for Israel: native Hebrew (not translated), Israeli humor and references, RTL
  on-screen text, holiday/seasonal tie-ins where they fit (`references/israeli_context.md`).
- **Script** it concretely into the DIGIM 4-section card.

---

## Israeli localization

The Israeli-ness is the differentiator, not a coat of paint. Pull from
`references/israeli_context.md` for: the holiday/seasonal calendar with content angles (Pesach,
Mimouna, Yom Ha'atzma'ut, the Chagim, summer, back-to-school); Hebrew on-screen-text and caption
conventions (short, punchy, RTL); Israeli humor and reference notes; hashtag norms; and
regional-audience cues. A reel that lands in Tel Aviv can fall flat in the periphery and
vice-versa — match the profile from intake.

---

## Output: the final DIGIM PDF

The deliverable is a single **DIGIM-branded Hebrew PDF** the user can send to a client — not a
chat blob. It contains the header (title "רעיונות קריאייטיב" + "[שם העסק] | [סניף/מיקום]") and
**10 concept cards**, each in the 4-section structure (תיאור הרעיון / מטרה / תסריט-פורמט /
אלמנטים ויזואליים). The visual spec is locked (full-bleed orange `#FAA31E`, white rounded card,
Assistant font, DIGIM logo bottom-left, one idea per page).

- **How it looks + how to build it:** `references/digim_pdf_output.md`.
- **Renderer:** `scripts/build_pdf.py` (write a `content.json`, run the script). Don't hand-build
  the layout — drive the script.
- **Content structure of each card:** `references/brief_template.md`.

Client-facing text is Hebrew. The PDF deliberately omits captions, hashtags, and AI-generation
prompts (no slot in the template); deliver those, if wanted, as a separate internal production
sheet (e.g. a markdown brief). AI-generation prompts stay English with specs.

---

## Tie-in to the Shift Digital pipeline

Concepts should land ready to produce. Map each to the toolchain when you prepare the optional
internal production sheet:

- **AI image reels** → Nano Banana Pro / Higgsfield GPT Image 2 prompts (English, detailed).
- **AI video reels** → Veo / Higgsfield prompts: Subject → Action → Scene → Camera → Lighting →
  Style → Pacing → Audio → Negative.
- **Original music** → a Suno brief when a trending licensed sound can't be used in a paid context.
- **Edit** → CapCut/Premiere notes.

Honesty about the environment: Claude's web sandbox **cannot upload files to Higgsfield's
CloudFront CDN**, so deliver generation prompts for the user to run in Higgsfield Studio or via
their n8n pipeline. Offer to save the finished PDF (and the profile) to Google Drive so each
engagement is resumable and comparable.

---

## Hard-won conventions (carry into every engagement)

- **Never fabricate engagement or links.** Verified-or-estimated on every number; real posts only.
- **Inspiration, not plagiarism.** Adapt the *format/structure*; never tell the client to copy a
  competitor's exact reel shot-for-shot.
- **Music licensing is real.** Trending sounds are cleared *inside* Instagram/TikTok organic
  posts, not necessarily for paid ads — flag it on campaigns and offer a Suno original.
- **Two research rounds, two gates.** Co-select after round 1; re-research; then confirm the
  direction after round 2 and apply edits **before** writing the PDF. Don't burn a full 10-concept
  PDF on an unconfirmed direction.
- **Lock production, then write.** Build every concept to fit what they can actually shoot;
  develop the client's one-liners for them; default to consent + blurring (and no-kid fallbacks)
  for anything involving children.
- **Hebrew out, English prompts in.** Client-facing copy is native Hebrew; AI prompts stay English.
- **Match the profile.** Tone, references, and holiday angle bend to the audience from intake.

---

## Delivery format

After building the PDF: present it, then give a tight handover —

1. **What's in it** — one line on the 10 concepts and which directions the user picked.
2. **What needs a real value** — any assumption flagged at intake, any sound marked *suggested*
   rather than confirmed, any engagement number that's an estimate.
3. **Run-the-prompts step** — that any AI-generation prompts go into Higgsfield Studio / the n8n
   pipeline (CloudFront limitation), and the offer to save to Drive.
4. **Next step** — usually "pick the first concept to produce" or "wire this into an n8n weekly
   trend run."

Keep it short. The user can read the PDF; they need the map and the honest flags.

---

## Reference files & resources

Read the one that matches the step. Don't load all of them for a quick idea.

- `references/data_sourcing.md` — the tiered search strategy in full (Chrome playbook for IG /
  TikTok / Meta Ad Library, exact recipes and URL patterns incl. `country=IL`, TikTok Creative
  Center, verified-vs-estimated rules and fallback ladder). Used in **both** research rounds.
- `references/adaptation_framework.md` — Deconstruct → Map → Localize → Script in detail, the hook
  taxonomy, reel-structure patterns, and worked examples (barber, restaurant, law firm).
- `references/israeli_context.md` — the holiday/seasonal calendar with content angles, Hebrew
  on-screen-text and caption conventions, humor/reference notes, hashtag norms, regional cues.
- `references/brief_template.md` — the **content** structure: the 4-section concept card, the
  research artifacts (trend snapshot, competitor benchmark), and a filled example card.
- `references/digim_pdf_output.md` — the **render**: the locked DIGIM PDF visual spec, fonts/logo
  (bundled in `assets/`), and how to drive the build script.
- `scripts/build_pdf.py` — the deterministic PDF renderer (`python scripts/build_pdf.py
  content.json out.pdf`).
- `assets/digim_logo.png`, `assets/fonts/Assistant-*.ttf` — bundled brand logo and font, so the
  build is self-contained.
