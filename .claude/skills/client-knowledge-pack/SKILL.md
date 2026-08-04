---
name: client-knowledge-pack
description: Build a complete, upload-ready knowledge pack for a single client. A knowledge pack is a small set of structured Markdown files loaded as Project Knowledge in a dedicated Claude Project, so every future chat about the account already knows the client, offerings, positioning, marketing-language rules, active work, and house style. Use whenever someone onboards a new client, starts a new account or brand project, or asks to build a knowledge base, client brain, project knowledge, or onboarding pack for a business. Trigger it even when they just paste a sales-call summary, a brief, or scattered client notes and ask to turn them into knowledge files, set up a project for them, or make a pack like an example. Adapts the whole pack to the client's niche, applying heavy compliance discipline for regulated or sensitive industries like health, supplements, finance, legal, and aesthetics, and light brand-voice rules for everything else. Works in any language and locale, defaulting to the client's working language.
---

# Client Knowledge Pack

## What this builds and why

The deliverable is a folder of short Markdown files that get uploaded as **Project Knowledge** in a Claude Project dedicated to one client. Claude's memory is per-project: a fresh project starts blank, so this pack is its foundation. Once loaded, anyone on the account can open a chat and Claude already knows the stakeholders, the offerings, the positioning, the compliance rules, the active work, and the team's format preferences, with no re-explaining.

This skill is **agency-agnostic and locale-agnostic**. It hardcodes no brand, no colors, no house style, and no language. Everything specific to the operator (their agency name, their voice rules, their palette) and to the client is captured during intake and written into the files at generation time. The same skill serves any operator working with any business in any market.

## The file architecture

A standard pack is six numbered files (numbering keeps them ordered in the Knowledge panel):

1. **00 read-me** — orientation for the downstream project's Claude, a niche-criticality note, and a ready-to-paste Project Instructions block.
2. **01 client overview** — who the client is, stakeholders, contacts, external partners and channels.
3. **02 offerings and positioning** — products/services/categories, brand positioning, the core strategic challenge.
4. **03 marketing language** — approved vs forbidden language, campaign lines, the governing creative principle. **This is the file that scales most by niche.**
5. **04 workstreams** — every active and upcoming project, each with goal, status, format, and ground rules.
6. **05 principles, format and spec** — the account's strategic throughlines, the operator's house style, brand assets, and the technical production spec.

Templates for all six live in `assets/`. They are written with English section labels as a neutral base, `[bracketed placeholders]`, and `> 📝` guidance blocks. **Localize every heading and write all content in the client's working language at generation time**, and delete the `> 📝` blocks from the final files.

For simple clients you may merge or drop files (see niche matrix). Keep the numbering stable so the panel stays ordered.

## Workflow

Follow these steps in order. Do not skip intake, and do not hand back raw template files with placeholders still in them.

### Step 1 — Harvest what's already known

Before asking anything, mine the conversation, any uploaded notes, call summaries, briefs, or linked docs for facts. People hand over a lot implicitly. Pull out the client name, the offering, obvious stakeholders, the niche, anything regulated, projects mentioned, and the working language. You will confirm these rather than re-ask them.

### Step 2 — Run the intake interview

Ask only for what's missing, grouped and tight. Lead by confirming what you already extracted ("I've got X, Y, Z from your notes, correct?"), then fill gaps. Do not interrogate. If a section stays thin, infer a sensible default, mark it clearly as an assumption in the file, and move on. The intake covers:

- **Operator identity** — the agency/studio/freelancer name, the lead person and role. This names the agency in the read-me and Project Instructions. (If the operator has run this before and their identity is stable, carry it forward instead of re-asking.)
- **Client** — exact name and any branding/spelling rules (capitalization, stylization), plus a one-line description.
- **Niche and market** — the industry, the target audience, the country/market, and the working language for all deliverables.
- **Offerings** — the products, services, or categories, and the standout selling point of each.
- **Regulatory exposure** — is anything in this niche regulated or sensitive? What claims, words, or ingredients are restricted? What approvals exist? This drives file 03.
- **Stakeholders and contacts** — decision-makers, founders, advisors/experts, operational/field contacts, and external partners (media buyers, downstream tools, integrations).
- **Active work** — current and upcoming projects, campaigns, shoots, or builds.
- **Brand and house style** — colors (hex if known), fonts, logo, preferred document types, voice/tone rules, language-per-audience rules, and any hard formatting rules (for example a ban on em dashes, or a specific numbering style).
- **Tools and channels** — ad platforms, CRMs, downstream generation tools, sheets/trackers, anything the account runs on.

### Step 3 — Classify the niche

Decide which archetype the client falls into. This determines how the whole pack is shaped, especially file 03. Read `references/niche-matrix.md` for the full per-file adaptation logic. The three archetypes:

- **Regulated / sensitive** (health, wellness, pharma, supplements, cosmeceuticals, finance, insurance, investing, legal, medical aesthetics, cannabis, gambling): compliance file is mandatory and central; approved/forbidden language lists are required; the core conversion lever is usually trust; creative leans on association rather than direct claims.
- **Visual / lifestyle / consumer** (restaurants and food, fashion and apparel, retail and ecommerce, beauty, travel and hospitality, events, fitness studios): compliance is light and collapses into brand-voice dos and don'ts; the offerings file becomes product lines, menus, or collections; creative is visual-led; social proof and aesthetics carry the work.
- **Considered / B2B / service** (real estate, SaaS and tech, professional services, education and courses, automotive, home services): authority and education are central; the hero is the expert or founder, not the product; funnels are longer; case studies and trust signals matter most.

When a client straddles two archetypes, pick the more demanding one for compliance and note the blend.

### Step 4 — Assemble the files

Copy each template from `assets/`, then fill it from the intake, niche classification, and matrix. Replace every placeholder. Write in the client's working language with localized headings. Apply the operator's house style to the prose itself (if they ban em dashes, don't use them; if they want a specific numbering style, use it). Add the niche-specific sections the matrix calls for, and drop the ones it says are irrelevant. Generate the read-me's Project Instructions block from the captured operator identity, voice rules, palette, and compliance posture.

Write the finished files to `/mnt/user-data/outputs/` with numbered filenames in the client's language (mirror the ordering: `00_...`, `01_...`, and so on).

### Step 5 — Hand off

Present the files and give a short, plain hand-off: create a new Claude Project for the client, upload these files as Project Knowledge, and paste the Project Instructions from file 00 into the project's custom instructions. Keep it to a few lines, no long postamble.

## Quality bar

- No placeholder ever survives into a delivered file. If a fact is genuinely unknown, write a marked assumption or a clean "to confirm" line, not `[bracketed text]`.
- Every file reads as if a sharp account lead wrote it about a real client, not as a filled-in form.
- File 03 matches the niche. A regulated client without real approved/forbidden language lists is a failure. A restaurant with a heavy legal-compliance section is over-engineered.
- Headings and content are in the client's working language; only internal structure follows the English template.
- The pack is internally consistent: the same stakeholder names, the same offering names, the same positioning across all six files.
