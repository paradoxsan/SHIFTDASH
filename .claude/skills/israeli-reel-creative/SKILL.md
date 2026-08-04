---
name: israeli-reel-creative
description: >-
  Research-and-ideation partner for short-form video (Reels / TikTok / Shorts / Facebook video) for
  Israeli businesses. Use this skill whenever the user wants reel ideas, scripts, hooks, or creative
  concepts for an Israeli brand — finding which reel FORMATS are getting engagement in a niche, what
  competitors are posting (with real links), what's trending in audio/hashtags, Meta Ad Library
  research for a paid campaign, or adapting a viral format to a specific business. Trigger it even
  when the user just names a business and asks "what should they post," "ideas for reels for X,"
  "what's working in this niche right now," or hands over a competitor's account to learn from. Also
  trigger for building a content plan or a client-ready creative brief in Hebrew. The skill runs live
  research (real-time), works through it WITH the user in checkpoints, and delivers a Hebrew,
  client-ready brief with concrete scripts and AI-generation prompts wired to the Shift Digital stack.
---

# Israeli Reel Creative

A live research-and-ideation partner for short-form video aimed at Israeli audiences. It turns
"what should this business post?" into a structured, sourced, client-ready creative brief: which
formats are actually working in the niche, who's doing them well (with real links), what sound and
hashtags to ride, and 3–5 concrete reel concepts adapted to the specific brand — each with a hook,
a beat-by-beat script, Hebrew on-screen text, a caption, and ready-to-run AI-generation prompts.

This skill is opinionated toward how Shift Digital works — Israeli SMBs, Hebrew client-facing output,
and a generation pipeline of Higgsfield (GPT Image 2 / Veo), Nano Banana Pro, CapCut, and Suno — but
the method generalizes to any Israeli brand and any short-form platform.

Two non-negotiables, because breaking either destroys client trust:
**never invent engagement numbers or fake links** — every "this got X likes" must be either pulled
live or clearly marked as an estimate, and a reel link must point at a real post; and **never write
five full scripts before the user has chosen a direction** — research first, co-select, then develop.

---

## What this skill is (and what it isn't)

Read this once so expectations are right. This skill is a **methodology Claude runs inside a
session**. When it triggers, Claude orchestrates its own live tools — browser, web search, web
fetch — in a structured, repeatable sequence, and reasons over the results. That is genuinely
agentic *within the session*: it does the searching and the thinking alongside the user.

It is **not** a deployed service that runs on its own. It only works when someone is in a Claude
session driving it. If the goal is autonomous, scheduled output ("email me a fresh trend report
every Monday with nobody at the keyboard"), that is this skill's logic wired into an **n8n schedule
trigger** on top — build that with the `n8n-workflow-builder` skill once the creative method here is
dialled in. Keep the two layers separate: this is the brain; n8n is the optional heartbeat.

---

## The process (always in this order)

The order matters because each step feeds the next, and the checkpoints are what make it feel like
working *with* the user instead of dumping a report on them.

1. **Intake — light business framing.** Establish who we're creating for, just enough to research
   well. Grouped, fast. See "Intake" below. If the conversation already answers some fields (the user
   described the business, or this is a returning client), extract those and only ask the gaps —
   confirm, don't assume. Do NOT ask the detailed production questions here; those come after research
   (step 5), once we know which formats we're aiming at.
2. **Confirm the brief direction** in one short line: the business, the platform, the goal, and the
   angle of attack. Get a yes before spending research effort.
3. **Live research — trends, competitors, sound, ads.** Source real data using the tiered strategy
   in `references/data_sourcing.md`. Find the *formats* winning in the niche, real competitor reels
   (with links), trending audio + hashtags, and — only if there's a paid budget — Meta Ad Library
   creatives. Label every number as verified or estimated.
4. **CHECKPOINT — present findings and co-select.** Show the user what's working as a short menu of
   3–6 format directions, each with a real reference link and why it works. Let them pick which to
   develop. Do not skip this. This is the collaboration moment and it prevents wasted scripts.
5. **PRODUCTION & DIRECTION CHECKPOINT — ask before writing a single script.** This is the step that
   stops the back-and-forth. Once the directions are chosen, ask the precise production questions
   (equipment, how many people on camera, locations, constraints) AND invite the client's own rough
   ideas — *one line each is enough*. See "Production & creative-direction checkpoint" below. The
   client should never have to write a full concept; turning a one-liner into a shootable script is
   the skill's job. You may merge this into the step-4 message to save a round-trip.
6. **Develop the concepts.** For each chosen direction AND each one-line idea the client gave, run the
   adaptation framework (`references/adaptation_framework.md`): deconstruct the format, map it onto the
   brand, localize it for an Israeli audience, and write the full reel — hook, beat-by-beat script/shot
   list, Hebrew on-screen text, sound rec, caption + hashtags, effort level, and AI-generation prompts.
   Build every concept to fit the production answers from step 5 (e.g. don't write a two-person skit if
   only one person is on camera).
7. **Assemble and deliver the brief.** Produce the Hebrew, client-ready document using the template
   in `references/brief_template.md`. Offer to save it to Google Drive and to hand the AI prompts
   straight to the generation pipeline.

---

## Intake (the creative profile)

Ask these before researching. Group them into one or two messages so the user answers fast — don't
drip one question per turn. For a returning client, pull the profile from the prior brief and just
confirm what changed.

The eight things worth knowing up front (keep it to framing — production specifics come later):

1. **Business + niche** — name, and the specific category (not "food" but "neighborhood shawarma
   joint" / "boutique law firm" / "barber"). Niche specificity drives the whole search.
2. **Where & who** — location and target audience. Israeli regional nuance is real: a Negev /
   periphery audience, a Tel Aviv audience, and a religious-sector audience respond to different
   tones and references. Note it.
3. **Content language** — Hebrew (default), and whether any Arabic or English is wanted. Most
   client-facing text is Hebrew.
4. **Brand voice** — funny / warm / premium / blunt-and-local / authoritative. One or two words is
   enough to steer hooks and captions.
5. **Platform priority** — Instagram Reels (default for most Israeli SMBs), TikTok, Facebook video,
   YouTube Shorts. This decides which sources matter and how long/loud the edit is.
6. **Goal** — awareness, follower growth, leads/DMs, sales, or foot traffic. A foot-traffic reel and
   a lead-gen reel are built differently.
7. **Budget posture** — organic-only, or is there a paid campaign? Only research the Meta Ad Library
   when there's budget, because organic reels and paid ads are different animals.
8. **What they've tried** — anything posted already, and what flopped or worked. Saves repeating
   dead ends.

Deliberately NOT asked here: equipment, how many people are on camera, locations, and the client's
own rough ideas. Those belong to the **production & creative-direction checkpoint** below (run after
research) — they're far more useful once we know which formats we're aiming at, and asking them too
early just adds a round-trip.

If an answer is "I don't know," pick the safest sensible default (Instagram Reels, Hebrew, the niche
as stated, organic), proceed, and flag the assumption in the brief rather than blocking.

---

## Data sourcing — the tiered strategy

Short-form platforms block direct scraping, so reliability comes from tiering the sources and being
honest about which numbers are real. Full search recipes, URL patterns, and the Chrome playbook are
in `references/data_sourcing.md` — read it before the research step. The summary:

- **Tier 1 — Claude in Chrome (real numbers, real links).** When the Chrome connection is available,
  navigate Instagram, TikTok, and the Meta Ad Library in the user's logged-in browser and read
  *actual* posts, like/view counts, and creative. This is the only way to get verified engagement
  and live reel links, so prefer it whenever the question hinges on "what's actually performing."
- **Tier 2 — web_search + web_fetch + public trend hubs.** Without Chrome, or to go broad fast:
  search for trend roundups and niche listicles; pull **TikTok Creative Center** (public, no login —
  trending songs, hashtags, and top ads, filterable by region) for audio and ad inspiration; and
  construct **Meta Ad Library** search URLs for `country=IL`. Note that the Ad Library is a
  JavaScript app, so `web_fetch` returns partial content — escalate to Chrome for the real grid.
- **Tier 3 — reasoning from format knowledge.** When live data is thin (a tiny niche, a quiet
  period), fall back to known reel-format patterns and the adaptation framework, and say plainly
  that the concepts are pattern-based rather than tied to a specific trending post.

Honesty rules, always: mark every engagement figure as **verified** (seen live) or **estimated**;
never present a constructed example as a real post; and if a "trending sound" can't be confirmed
live, call it a *suggested* sound, not a trending one.

---

## Production & creative-direction checkpoint (after research, before scripts)

This checkpoint exists because of a real failure mode: you present a format menu, and the client ends
up writing full concepts themselves just to get the direction across. That's backwards. Once the
directions are chosen (step 4), and **before writing any script**, run this — it captures the
client's exact thinking so development is aimed right the first time and you don't loop.

Ask two things together, in one message (and you can fold this into the co-select menu to save a
round-trip). Use tappable options for the structured bits where possible.

**A. The production reality — what can they actually shoot?**
- **Equipment** — phone only / DJI Osmo Pocket 3 / gimbal / lighting / drone? Sets how ambitious the
  shot list can be.
- **People on camera — and how many.** None (→ hands-only / voiceover / AI), one presenter, or two+?
  Ask the *number*, not just yes/no — a two-person skit dies if only one person will film. (This is
  the exact gap that bit the first run.)
- **Who** — a staff member, the owner, a friend/influencer, or actors?
- **Locations / props accessible** — the signature spots (e.g. the oven, the bar, the evening
  setting) and any prop the format needs.
- **Effort per shoot** — quick phone grabs between shifts, or a planned shoot day? Sets realism.
- **Hard constraints** — brand no-nos, people who can't be filmed, kashrut/sector sensitivities,
  anything off-limits.

**B. The client's own ideas — one line each is plenty.** Explicitly invite them: *"Throw me any ideas
or angles you have — even a single sentence. I'll turn each into a full script."* This is the core of
the upgrade. The client should be able to drop a one-liner like "a skit where a customer orders the
whole menu right before closing" and get back a complete, shootable card — hook, shot list, on-screen
text, sound, caption. **Never make the client write a full concept; that's the skill's job.** Treat
their one-liners as first-class concepts alongside the researched directions and develop them with
the same rigor.

Then lock the direction in one line ("developing #1, #3, and your closing-time skit — all
live-action, two staff on camera") and move to development. Every concept you write must fit the
production answers; don't propose what they can't shoot.

---

## The adaptation framework (the core value)

Finding a viral format is the easy part. The skill's real job is translating it into *this* brand,
for an Israeli audience, on-brand — so the output is a shootable reel, not "do what they did." Apply
the same method to the client's own one-line ideas: a single sentence from them becomes a full concept
card here, developed with the same rigor as a researched direction. The method is **Deconstruct → Map
→ Localize → Script**, detailed with worked examples (barber, restaurant, law firm) in
`references/adaptation_framework.md`:

- **Deconstruct** the reference reel into its mechanics: the hook (first 1–2 seconds), the structure
  (what pattern carries it — transformation, listicle, POV, before/after, day-in-the-life, a bit),
  the sound's role, the on-screen text rhythm, and *why* it holds attention.
- **Map** each mechanic onto the target business: what's our version of the reveal, our list, our
  "before," our punchline. Keep the *structure* that works; swap the *content* for the brand's.
- **Localize** for Israel: Hebrew copy that actually sounds native (not translated), Israeli humor
  and references, RTL on-screen text conventions, and holiday/seasonal tie-ins where they fit (see
  `references/israeli_context.md`).
- **Script** it concretely: a hook line, a beat-by-beat shot list, the Hebrew on-screen text per
  beat, the sound rec, and a caption + hashtags.

---

## Israeli localization

The Israeli-ness is the differentiator, not a coat of paint. Pull from
`references/israeli_context.md` for: the holiday/seasonal calendar with content angles (Pesach,
Mimouna, Yom Ha'atzma'ut, the Chagim, summer, back-to-school) so concepts ride the moment; Hebrew
on-screen-text and caption conventions (short, punchy, RTL, when to use English loanwords); Israeli
humor and reference notes; hashtag norms; and regional-audience cues. A reel that lands in Tel Aviv
can fall flat in the periphery and vice-versa — match the profile from intake.

---

## Output: the client-ready brief

The deliverable is a single Hebrew document the user can send to a client or hand to an editor, not a
chat blob. Use the exact structure in `references/brief_template.md`. It contains, in Hebrew:

- a short **trend snapshot** for the niche (what's working and why, this period);
- a **competitor benchmark** table — accounts, the format they're winning with, and a real link per
  row, with engagement marked verified/estimated;
- the **3–5 concept cards**, each with: title, the hook, beat-by-beat script/shot list, Hebrew
  on-screen text, recommended sound (with link), caption + hashtags, goal it serves, production
  effort (low / live-action / AI-generated), and the **AI-generation prompts** where relevant;
- a brief **posting note** (cadence, best-fit platform, any holiday timing).

Client-facing text is Hebrew. AI-generation prompts are written in English with technical specs
(the pipeline's convention), even inside a Hebrew brief.

---

## Tie-in to the Shift Digital pipeline

Concepts should land ready to produce, not as abstractions. Map each concept to the toolchain:

- **AI image reels** → Nano Banana Pro or Higgsfield GPT Image 2 prompts (English, detailed, with the
  brand product injected where possible).
- **AI video reels** → Veo / Higgsfield video prompts following Subject → Action → Scene → Camera →
  Lighting → Style → Pacing → Audio → Negative.
- **Original music** → a Suno brief when a trending licensed sound can't be used in a paid context.
- **Edit** → CapCut/Premiere notes (cut points, text timing, captions).

Honesty about the environment: Claude's web sandbox **cannot upload files to Higgsfield's CloudFront
CDN**, so deliver the generation prompts for the user to run in Higgsfield Studio or via their n8n
pipeline rather than implying the asset will be generated here. Offer to save the finished brief and
the profile to Google Drive (connected) so each client engagement is resumable and comparable.

---

## Hard-won conventions (carry into every brief)

- **Never fabricate engagement or links.** Verified-or-estimated on every number; real posts only.
  This is the credibility of the whole deliverable.
- **Inspiration, not plagiarism.** Adapt the *format/structure*; never tell the client to copy a
  competitor's exact reel shot-for-shot. Keep the brand's own content.
- **Music licensing is real.** Trending sounds are cleared for use *inside* Instagram/TikTok organic
  posts, but not necessarily for paid ads or off-platform use — flag this when there's a campaign,
  and offer a Suno original as the safe path.
- **Co-select before developing.** Present the format menu and let the user choose; don't burn effort
  writing every concept in full. This is also what makes it collaborative.
- **Lock production, then write.** After research and before any script, ask what they can actually
  shoot (equipment, how many people on camera, locations) and invite their one-line ideas — then build
  every concept to fit those answers. Never make the client write a full concept; develop their
  one-liners for them.
- **Hebrew out, English prompts in.** Client-facing copy is native Hebrew; AI prompts stay English
  with specs.
- **Match the profile.** Tone, references, and holiday angle all bend to the audience from intake —
  a periphery shawarma joint and a Tel Aviv boutique are not the same brief.

---

## Delivery format

After assembling the brief: present the Hebrew document, then give a tight handover —

1. **What's in it** — one line on the concepts and which the user picked.
2. **What needs a real value** — any assumption flagged at intake, any sound marked *suggested*
   rather than confirmed, any engagement number that's an estimate.
3. **Run-the-prompts step** — that the AI-generation prompts go into Higgsfield Studio / the n8n
   pipeline (CloudFront limitation), and the offer to save to Drive.
4. **Next step** — usually "pick the first concept to produce" or "wire this into an n8n weekly
   trend run," offered as the natural continuation.

Keep it short. The user can read the brief; they need the map and the honest flags, not a re-read.

---

## Reference files

Read the one that matches the step. Don't load all of them for a quick idea.

- `references/data_sourcing.md` — the tiered search strategy in full: the Chrome navigation playbook
  for IG / TikTok / Meta Ad Library, exact search recipes and URL patterns (incl. `country=IL`),
  TikTok Creative Center, and the verified-vs-estimated rules and fallback ladder.
- `references/adaptation_framework.md` — Deconstruct → Map → Localize → Script in detail, the hook
  taxonomy, common reel-structure patterns, and full worked examples (barber, restaurant, law firm).
- `references/israeli_context.md` — the holiday/seasonal calendar with content angles, Hebrew
  on-screen-text and caption conventions, Israeli humor/reference notes, hashtag norms, regional cues.
- `references/brief_template.md` — the exact Hebrew client-ready brief template, the concept-card
  structure, the competitor benchmark table, the sound-rec and AI-prompt blocks, with a filled
  example.
