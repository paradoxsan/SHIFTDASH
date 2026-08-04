---
name: n8n-workflow-builder
description: >-
  Build complete, importable n8n workflows from a client's available resources. Use whenever the user
  wants to create, design, or scaffold an n8n automation, workflow, bot, or agent — WhatsApp/Green
  API/WHAPI bots, AI agents with memory, content pipelines (Gemini/Nano Banana Pro/Veo), CRM syncs,
  lead capture, scrapers, or sales bots that send payment links (Hyp/Yaad) or classify customer images
  (artwork vs payment-proof/אסמכתא), read a name+amount off a receipt with Vision, and mark an order
  paid. Trigger it even when the user just describes a goal ("I want a bot that…") without saying
  "n8n", or hands you a workflow JSON to extend. Always run the intake interview before building and
  deliver a validated, importable JSON with placeholder credentials. Beyond building, proactively run
  the Gotchas check — scanning the Gotchas Catalog of hard-won failures and surfacing the critical,
  relevant ones — when designing, planning, onboarding a client, preparing for import, or fixing a
  live bot.
---

# n8n Workflow Builder

Build production-shaped, **importable** n8n workflows tailored to whatever tools a client actually
has. This skill is opinionated toward the kinds of automations Shift Digital builds — WhatsApp bots
on Green API, AI agents with conversation memory, and AI content-generation pipelines — but it
generalizes to any n8n automation.

The non-negotiable rule: **never build before the intake interview is done, and never hand over JSON
that hasn't been programmatically validated.** Skipping the interview produces workflows wired to the
wrong assumptions; skipping validation produces JSON that fails on import. Both waste the user's time.

---

## The process (always in this order)

1. **Intake interview** — nail down the resources and shape before touching any code. See
   "Intake interview" below. Do not skip, even if the user is in a hurry; a 60-second interview
   prevents a rebuild.
2. **Research the nodes** — before building, verify the nodes you intend to use actually exist, are
   spelled correctly, and have the parameters you think. n8n ships new nodes and changes schemas
   constantly, and many capabilities live in community nodes. Do not trust memory for node types,
   parameter names, or whether a native node exists. See "Research nodes before building" below and
   `references/research.md`. This step is what prevents building against a node that doesn't exist or
   using the wrong parameter names.
3. **Confirm the plan** — state back the node-by-node shape in one short paragraph and get a yes.
4. **Build with a Python builder script** — assemble the workflow JSON programmatically, not by
   hand. See "Why build with Python" and `references/build_method.md`.
5. **Validate** — run the validation checks (broken references, connection types, required nodes).
   See `references/validation.md`.
6. **Gotchas check** — before you confirm a plan, before you hand over JSON, and again before the
   user imports, run the **Gotchas check** below against what's actually being built. This is not a
   one-time gate at the end; it fires at several moments (see next section).
7. **Deliver** — copy to the outputs directory, present the file, and give a short import +
   "what to replace" guide. Be honest about the parts that need manual finishing.

---

## Gotchas check (run proactively — not just on build or fix)

Every failure in the **Gotchas Catalog** below was paid for once already, on a live client bot, in a
debugging cycle that shouldn't have happened twice. The whole point of this section is to spend those
failures *before* they recur. So don't treat gotchas as a thing you only remember when something
breaks — **actively scan for the relevant ones at every decision point**, surface the ones that
matter *right now*, and route to the reference that has the fix. Think for yourself about which
gotchas are live for this specific situation; the catalog is the menu, not a checklist to recite.

### When to run it (the trigger moments)

Run a gotchas pass — silently scanning the catalog, then surfacing only what's relevant — whenever
any of these happens, not only on a build:

- **After designing a new system** — the moment you've sketched the node-by-node shape (even
  verbally, even before any JSON), name the gotchas that shape will hit. If it has agent tools, the
  ASCII-name and "Execute step" traps are already in play. If it writes to Supabase, RLS and the
  zero-item-halt are already in play. Catch them at design time, not at debug time.
- **Before confirming a plan / at the confirm step** — fold the relevant gotchas into the one-
  paragraph plan you state back, so the user signs off on a shape that already routes around them.
- **When thinking through a system *together* with the user** — if they're reasoning aloud about an
  architecture ("should the payment go in a tool?", "can the sub-workflow read the order?"), proactively
  flag the gotcha that answers it *before* they build toward the wrong answer. This is the highest-
  value moment to surface one.
- **When onboarding / scoping a NEW client** — as soon as you learn the client's stack (which
  WhatsApp provider, whether there's a DB, whether there's a payment step, whether there's calendar
  booking), call out the gotchas that come bundled with *that* stack, so they're designed-around from
  day one. A new WHAPI client → the `messages[]` batching + `READY`/`AUTH` gate + don't-stack-a-
  debounce trio. A new client taking card payments → payments-in-main-flow + EZcount env-key. A new
  client with calendar booking → the Calendar "From list" 400 + `$fromAI` anchoring.
- **Before the user imports a delivered workflow** — restate the import-time gotchas (community-node
  install, credential re-pick on version mismatch, sub-workflow import order, Always-Output-Data on
  Supabase gates) as part of the delivery notes.
- **When asked to find or review gotchas, or when *you* notice one applies** — if the user asks
  "what could break here?" or you simply recognize mid-conversation that a catalog entry fits, raise
  it then and there. Don't wait to be asked twice.
- **Before "fixing" a live bot** — read `references/debugging.md`, then scan the catalog for the
  failure signature the symptom matches (most live bugs ARE a catalog entry — "bot goes silent on
  some chats" = the zero-item Supabase halt; "owner talks but bot keeps replying" = the PK-upsert
  takeover bug).

### How to run it (decide for yourself what's live and critical)

1. **Scan the whole catalog mentally against the current situation** — provider, AI/agent + tools,
   memory, DB, payments, calendar, media, RTL/Hebrew, import. Don't dump the list; filter it.
2. **Select the ones that genuinely apply right now,** and **rank them** — separate the *critical*
   (will silently break a live bot or bill a real customer wrong: RLS, zero-item halt, PK-upsert
   takeover, payments-in-a-tool, EZcount env-key, ASCII tool names, Calendar "From list") from the
   *good-to-know* (RTL bidi ordering, retry-on-fail, anti-ban warm-up). Lead with the critical ones.
3. **Surface them briefly and in context** — one line each: the trap, the consequence, the fix, and
   the reference section. Tie each to the part of *this* build it touches ("because your agent has a
   Sheets tool, name it ASCII-first or n8n collapses it to `_`"). Skip anything irrelevant silently.
4. **Route to the reference for the fix** — don't re-explain the whole thing inline; point to the
   `references/*.md` section that carries it (the catalog bullets already cite them).
5. **Self-prompt when the catalog has a gap** — if the situation smells like a class of bug the
   catalog doesn't cover (a new provider, an unusual node), say so, reason about the likely failure,
   and research it (web_search / n8n MCP) rather than staying silent. The catalog is a living list.

Keep it proportional: a trivial single-node workflow needs almost no gotchas pass; a Supabase-backed
WHAPI sales bot with payments and an agent touches most of the critical list and deserves a real one.

---

## Intake interview

Ask these before building. Group them so the user can answer fast — don't drip one question at a
time across many turns. If the current conversation already answers some (e.g. the user described
the bot in detail, or handed you an existing workflow), extract those answers and only ask about the
gaps. Confirm extracted answers rather than silently assuming.

The six things you must know before building:

1. **Trigger** — what starts the workflow? (incoming WhatsApp message via Green API **or WHAPI**
   webhook, schedule/cron, form submission, inbound webhook from another app, manual.) For WhatsApp
   on either Green API or WHAPI, default to a plain core **Webhook** node that the provider posts to,
   unless the user wants the provider's community node. **Confirm which WhatsApp provider the client
   uses** — Green API and WHAPI have different endpoints, auth, and payload shapes (see
   `references/green_api.md` / `references/whapi.md`).
2. **Core logic / AI** — is there an AI step? If so: one agent or several? Routing between them
   (a deciding agent + branches) or a fixed chain? Which LLM (default to one shared model unless
   told otherwise)?
3. **Memory** — does the AI need to remember the conversation? If yes, **for bots default to
   Simple Memory** (`@n8n/n8n-nodes-langchain.memoryBufferWindow`), keyed by a stable
   `sessionKey` (e.g. the sender's phone number) with a `contextWindowLength` of ~10–20 turns.
   It's zero-setup (no DB, no table), and for a WhatsApp/chat bot the last N turns are all the
   agent needs. **Trade-off to state plainly:** Simple Memory is in-process and **volatile** — it
   resets on n8n restart/redeploy and isn't shared across multiple worker instances. That's an
   acceptable default for most SMB bots (a conversation that survives a server restart is rarely
   worth a database). **Upgrade to a persistent store when** the client needs memory to survive
   restarts, runs n8n in queue/multi-worker mode, wants conversations auditable/queryable, or wants
   history to outlive the process — then use **Postgres Chat Memory**
   (`memoryPostgresChat`, can point at the client's Supabase since it's Postgres) or Redis Chat
   Memory, same phone-number session key. See `references/supabase.md` for the Supabase-backed
   memory + RAG setup. Whatever you pick, set the session key explicitly — never leave it on the
   default, or every user shares one conversation.
4. **External services** — what does it call or write to? (Gemini image/video, Meta Graph API,
   Google Sheets, Supabase, HTTP APIs, Google Calendar, **a payment provider like Hyp/Yaad**.) For
   each, note whether a native n8n node exists or it needs an HTTP Request node. **If Google Calendar
   booking is involved, read `references/ai_tool_gotchas.md` first** — it has several non-obvious
   failures (the "From list" 400 bug, `$fromAI` date anchoring) that will otherwise cost a debugging
   cycle. **If a payment/checkout link is involved, read `references/payments_hyp.md` and
   `references/toolcode_limits.md` first** — the Hyp call must go in the main flow, not a tool.
5. **Credentials available** — what does the client actually have? This is the "company resources"
   question and it is central. Ask explicitly. Never assume a credential exists; if unknown, put a
   fake placeholder and flag it.
6. **Output / destination** — where does the result go? (reply on WhatsApp, post to a platform,
   write a row, return data.) And confirm the deliverable is an importable JSON file.

If the answer to any of these is "I don't know," pick the safest sensible default, build with a fake
placeholder, and clearly flag it in the delivery notes rather than blocking.

---

## Research nodes before building

n8n changes fast. Native nodes get added, parameters get renamed between type versions, and a huge
amount of capability lives in **community nodes** that aren't installed by default. Building from
memory alone is how you end up referencing a node that doesn't exist or guessing wrong parameter
names — which produces JSON that fails on import. Before building, do a quick research pass. It takes
a minute and saves a rebuild. Full guidance is in `references/research.md`; the essentials:

- **Check whether a native node exists** for each integration before falling back to a raw HTTP
  Request node. Search the n8n docs (`https://docs.n8n.io/integrations/`) — there are native nodes
  for far more services than you'd expect (e.g. a native Facebook Graph API node).
- **Look for community nodes** when there's no native one, or when a dedicated node would be much
  cleaner than raw HTTP. Search npm (`https://www.npmjs.com/search?q=n8n-nodes-<service>`) and GitHub.
  Community nodes often wrap multi-step flows into one node (e.g. an Instagram node that does the
  container→poll→publish dance internally). Note that community nodes require the user to install
  them on a self-hosted instance — always flag that in delivery.
- **Verify the exact node type string and parameters** before writing them into the builder. For a
  native node, the docs page gives the type (`n8n-nodes-base.<name>`) and its operations. For a
  community node, the npm/GitHub README gives the package, the node type
  (`<package-short>.<node>`), and the resource/operation parameter names.
- **Confirm current type versions and connection types.** For AI/LangChain nodes especially, verify
  the `ai_languageModel` / `ai_memory` / `ai_tool` connection types and current node versions, since
  these shift and are the most common source of broken imports.
- **When in doubt, search.** A 30-second web search beats an assumption. Treat any node you haven't
  personally verified recently as "verify before use."

Use the web_search / web_fetch tools for this, and any connected n8n MCP tools (e.g. to list nodes
or inspect an existing workflow on the user's instance). Come to the confirm step already knowing the
nodes are real and correctly specified.

---

## Shift Digital default stack (the opinionated part)

When the user is building a typical Shift Digital automation and doesn't specify otherwise, assume
this stack and these patterns. This is what makes the skill fast for their real work. Still confirm
in the interview — defaults are a starting point, not a mandate.

- **WhatsApp:** Green API **or** WHAPI (Whapi.Cloud) — both are unofficial linked-device
  gateways filling the same slot (webhook in, HTTP out). Ask which the client has; default to
  Green API unless they say WHAPI.
  - *Green API:* incoming via a core Webhook node (filter on
    `typeWebhook === 'incomingMessageReceived'`); outgoing via HTTP Request to
    `https://api.green-api.com/waInstance{id}/sendMessage/{token}` for text and
    `.../sendFileByUrl/{token}` for media. To send a generated file you must first host it — use
    Green API's `uploadFile` (host is `media.green-api.com`, body is the raw binary) to get a
    public URL, then `sendFileByUrl`. See `references/green_api.md` for the full method catalog
    and the base64→binary→upload chain.
  - *WHAPI:* one host `https://gate.whapi.cloud`, **Bearer token** auth (one token per channel).
    Incoming via a core Webhook node (POST); **filter `from_me === false`** to avoid the bot
    replying to itself (the WHAPI analogue of the `incomingMessageReceived` filter). Outgoing via
    HTTP Request to `POST /messages/text`, `/messages/image`, `/messages/interactive`, etc. Big
    DX win: the `media` field takes a **public URL or base64 directly** — no upload/host dance.
    Has native interactive buttons/lists, catalogs/orders, stories, channels. See
    `references/whapi.md` for the full catalog, webhook payload shape, and n8n wiring. **If the
    build sends a card payment, still use the main-flow Hyp/Yaad pattern** — `references/payments_hyp.md`.
    **If the bot must tell a customer's payment screenshot (אסמכתא) apart from artwork, extract the
    payer name/amount, and mark an order paid — read `references/media_receipts.md` first** (the
    three-layer keyword→Vision→DB-match design, the Gemini `400 Unable to process input image` fix,
    the confirm-gate, and the `wa.me` group-alert pattern).
- **AI agents:** `@n8n/n8n-nodes-langchain.agent`. Sub-nodes connect via the special LangChain
  connection types — `ai_languageModel`, `ai_memory`, `ai_tool` — **not** `main`. Getting this wrong
  is the most common import failure.
- **Memory:** **for bots, default to Simple Memory**
  (`@n8n/n8n-nodes-langchain.memoryBufferWindow`), `sessionKey` = sender phone number,
  `contextWindowLength` ~10–20. Zero-setup and good enough for the vast majority of SMB chat bots;
  it's volatile (resets on restart, not shared across workers) — flag that and offer the upgrade.
  **Upgrade path:** `@n8n/n8n-nodes-langchain.memoryPostgresChat` (point it at the client's Supabase
  — it's Postgres) when persistence, multi-worker, or queryable history is needed. See
  `references/supabase.md`.
- **Image generation:** Gemini "Nano Banana Pro" (`gemini-3-pro-image:generateContent`). It returns
  **base64**, has **no negative-prompt parameter** — fold negatives into the prompt text as
  "Avoid: …". For realism, prompt for camera/lens/natural-light and avoid words like
  perfect/flawless/8k. Inject a real product photo via an `inlineData` part for brand consistency.
- **Video generation:** Veo (`veo-3.1-fast-generate-preview:predictLongRunning`). Long-running —
  start, wait, then poll the returned operation name. Max ~8s clips. Veo *does* support negative
  prompts (in-text). Follow the official Veo structure: Subject → Action → Scene → Camera → Lighting
  → Style → Pacing → Audio → Negative.
- **Multi-agent content bot pattern:** a Router/Copywriter agent decides type (image/video/text) and
  writes the caption, a Switch branches, and specialist prompt-engineer agents build the generation
  prompts. Shared brand-knowledge block in every agent's system prompt + a short per-agent role
  section. See `references/patterns.md`.
- **Publishing to Instagram + Facebook:** for Instagram use the community node
  `n8n-nodes-instagram` (MookieLian) — Resource `Image`/`Reels`/`Stories`/`Carousel`, Operation
  `Publish`; it does the container→poll→publish flow internally and needs a public media URL. Requires
  community-node install (flag it). For Facebook Page posts use the **native** Facebook Graph API node
  (`n8n-nodes-base.facebookGraphApi`) posting to the Page's `photos` edge. Both run on a long-lived
  Meta token. Gate publishing behind an approval step (see Pattern C) unless the user wants
  auto-publish.
- **Payments (Israeli sliqa):** default to **Hyp / Yaad-Sarig (YaadPay)** — the classic API with
  `Masof` + `KEY` + `PassP`. It's a two-step GET flow (`action=APISign&What=SIGN` → Hyp returns a
  `signature` → wrap into `pay.hyp.co.il/p/?…`), **not** JSON. **Critical:** the HTTP call must live
  in the **main flow as an HTTP Request node**, never inside a `toolCode` tool (which can't do HTTP).
  Model payment as the deterministic pattern: agent emits an `[ORDER:{…}]` marker → Parse → IF → Hyp
  APISign HTTP → build link → send. Put `Masof`/`KEY`/`PassP` in `$env`, never in a node or the
  prompt. EZcount/Morning (חשבונית ירוקה) is the invoice side and can double as a payment page via its
  `doc_uuid` link. Full details in `references/payments_hyp.md`.
- **Supabase (database + CRM + RAG + memory):** Supabase is Postgres with a REST gateway, so it has
  three distinct doors into n8n and choosing the wrong one is the usual mistake. **For ordinary
  reads/writes (a leads/CRM table, order log, bot state) prefer the native Postgres node over the
  Supabase node** — it connects straight to Postgres via the **Session/Transaction Pooler**, supports
  **upsert** and bulk ops, and isn't filtered by RLS. Use the **Supabase node** when you specifically
  want the REST API (e.g. you only have the API URL + key, or you want RLS to apply). For an AI
  knowledge base, use the **Supabase Vector Store** (`vectorStoreSupabase`) with pgvector +
  `match_documents`. For agent conversation memory that must persist, use **Postgres Chat Memory**
  pointed at the same Supabase. **Credential gotcha:** the Supabase node needs the **`service_role`**
  key (it bypasses RLS so the bot can actually read/write); the `anon` key returns empty results the
  moment RLS is on. Keep `service_role` in `$env`/a credential, never in a prompt or a node field.
  Full operation tables, the pooler-vs-API decision, the RLS failure dictionary, the pgvector SQL,
  and AI-tool wiring are in `references/supabase.md`.
- **Bot chat model (the agent LLM):** for a WhatsApp sales agent default to **Gemini 3.1 Flash**
  (`models/gemini-flash-latest`) — clean output and high RPM/RPD. **Avoid `gemini-pro-latest`
  (3.1 Pro)** for high-volume bots: its RPD cap is low and the agent dies when it's exhausted.
  **Avoid `gemini-2.5-flash`** — it leaks its chain-of-thought into the reply text. (Separately, for
  agents that lean hard on `$fromAI` tool-calling, GPT-4o-mini is more reliable than Gemini — see
  `references/ai_tool_gotchas.md`.) Image/video models above are unaffected by this.
- **Order durability & state:** for a sales bot that issues invoices/links, don't treat invoicing as
  one-shot. Use the **order-state machine** (reuse the stored link on a repeat, replace on a change,
  block re-charge after payment) and, for load/restart resilience, the **ack-fast Receiver + `inbox`
  idempotency** decoupling. Both in `references/patterns.md` (Patterns J & K). Keep the state machine
  **inline** (see `references/subworkflows.md`).
- **Other Israeli payment processors (when the client isn't on Hyp/Yaad):** the same main-flow,
  create-link-then-webhook shape works for **PayPlus** (cleanest — JSON, `api-key`+`secret-key`
  headers, one POST → `data.payment_page_link`; default for a new card-link build), **Cardcom v11**
  (when they also invoice in Cardcom — one call charges + issues the invoice; success is
  `ResponseCode===0`), **Grow/ex-Meshulam** (when **bit** matters), **Tranzila** (iframe + Handshake
  `thtk` — heaviest, only if they're committed to it), and **Pelecard** (bank-locked enterprise).
  Don't migrate a client off a working processor. Full auth, endpoints, webhook shapes, and the
  per-provider gotchas (PayPlus raw-body signature, Cardcom numeric-code success) are in
  `references/integrations.md` Part 1.
- **Project-management / database / CRM platforms (when the client lives in a real tool, not Sheets):**
  **ClickUp**, **Airtable**, **Monday.com**, **Notion**, plus the dedicated sales CRMs **HubSpot** and
  **Pipedrive** all have native n8n nodes (and ClickUp's can be an agent tool). Reach for them when the
  client *already* uses the tool — otherwise Google Sheets stays the Shift default (zero cost, team
  reads it directly, SDR write-back already built). Pick a sales CRM when the client sells through a
  pipeline: **Pipedrive** for a lighter deal-focused SMB, **HubSpot** for enterprise. Each has one
  parameter-shape trap that breaks builds (ClickUp epoch-ms dates + the Get-Filtered-Team-Tasks-via-
  HTTP rule; Monday `column_values` must be a `JSON.stringify`d string; Airtable omits empty fields +
  linked records are record-id arrays; Notion typed properties + per-resource sharing; HubSpot internal
  property names + association type IDs; Pipedrive 40-char custom-field hash keys + `stage_id`-per-
  pipeline). Full auth, ID hierarchy, and gotchas in `references/integrations.md` Part 2.
- **Telegram (free, instant second channel):** native node + trigger; a clean alternative/addition to
  WhatsApp for internal bots, alerts, and approval flows. Bot via @BotFather → token. Two setup traps:
  **`/setprivacy` must be Disabled** for the bot to see group messages, and the trigger **polls
  (1–3 min)** unless given a webhook; use **HTML parse mode**, not Markdown. See
  `references/integrations.md` Part 3.
- **"WhatsApp → task-summary bot" (a sellable internal product):** reads a group's messages, turns
  the task-like ones into real tasks in ClickUp/Airtable/Monday, and posts a scheduled digest of open
  tasks back to the group. It's an **assembly** of existing patterns (I debounce, hard-parse guard,
  Pattern N day-gated digest) pointed at a PM tool — its forgotten step is the **phone→user mapping**.
  See `references/integrations.md` Part 4.

For non-typical builds (a CRM sync, a scraper, an email flow), drop the WhatsApp/AI assumptions and
just build the right nodes for the job — the skill is still useful, just less opinionated.

---

## Why build with Python (not hand-written JSON)

n8n workflow JSON is large and full of cross-references: every connection names a source and target
node, and a single typo produces a workflow that imports broken. Writing it by hand at any real size
is error-prone. Instead, **write a small Python script that assembles the workflow** — define nodes
with a helper, define connections with a helper that can't misname a target, then `json.dump` it.
This keeps node ids, positions, and connection wiring consistent, and lets you validate
programmatically before delivery.

The build method, with a reusable helper pattern, is in `references/build_method.md`. Read it before
building. The validation checks are in `references/validation.md`.

---

## Hard-won conventions (carry these into every build)

- **Fake placeholders for every secret.** Never invent real-looking credentials. Use obvious fakes
  (`AIzaSy-FAKE-…`, `FAKEGREENTOKEN…`, instance id `1101000000`) and list every one in the delivery
  notes so the user knows exactly what to replace. This is a safety and clarity requirement.
- **Sticky notes document the canvas.** Add `n8n-nodes-base.stickyNote` nodes explaining the flow
  and the "replace after import" checklist. Match the user's language (Hebrew for Shift Digital
  clients).
- **Be honest about manual-finish steps.** Some things can't be fully wired blind — version-specific
  node schemas may need a credential re-pick on import, exact API response paths may need verifying
  on first run, file-hosting needs real storage. Flag these plainly instead of implying it's
  turn-key. Trust comes from accuracy, not from overpromising.
- **One shared LLM credential** across multiple agents unless told otherwise — simpler and cheaper.
- **Node versions:** use current type versions (e.g. agent `1.7`, toolWorkflow `2.2`,
  memoryPostgresChat `1.3`, memoryBufferWindow `1.3` (Simple Memory), supabase `1`,
  vectorStoreSupabase `1.3`, httpRequest `4.4`, switch `3.4`, set `3.4`). If the user's n8n is older,
  warn that a node may need re-selecting on import.

---

## Build efficiency, time, and service (planning + iteration economics)

This section makes time estimates realistic and keeps iteration cheap. The `shift-quote-pdf` skill
consults these numbers when pricing automation projects — keep them grounded.

**Effort tiers (rough build time, validated on real Shift Digital bots):**
- **Simple** (lead capture, single webhook → DB write → one notification; FAQ reply bot): ~2–4 h.
- **Medium** (WhatsApp sales bot: agent + Simple Memory + WHAPI receive/send + Supabase state +
  human-takeover): ~1–2 days for V1, because the *patterns* are pre-built — most time is intake,
  prompt-writing, and client-specific pricing/inventory.
- **Complex** (the above **plus** payments/EZcount, an order state machine, media classification +
  Vision, daily digests, group alerts): ~3–5 days to a production-ready V1, then an **iteration
  tail**. The T-CENTER bot reached V2.6 over many short cycles — *budget for the tail, don't promise
  it's done at V1.*

**Where the time actually goes (and how to cut it):**
- **Reuse beats rebuild.** Every pattern in `references/patterns.md` and every integration in
  `references/integrations.md` was paid for once. A new client bot on the same stack (WHAPI +
  Supabase + Gemini + EZcount) is mostly *re-skinning* an existing one — copy the architecture, swap
  prompt/pricing/credentials. Quote the *first* bot of a kind at full effort and later ones at a
  fraction.
- **Intake before building saves the most time.** A 5-minute confirm-and-fill interview (prices,
  inventory, tone, group id, who issues invoices) prevents the expensive rebuilds. The single most
  common rework cause is pricing/inventory that changes after V1 — collect it precisely up front and
  expect updates.
- **Build with Python + validate before delivery** (see `references/build_method.md`,
  `references/validation.md`). A broken import wastes a whole round-trip; the validator (refs resolve,
  targets exist, ai_* connections intact) catches it in seconds.
- **One coordinated edit per change, not many.** A pricing or product change usually touches three
  places at once (the price table, the "products we sell" line, the order-collection field list). Do
  them together or the agent gives inconsistent answers.

**Iteration cost is dominated by the test loop, not the edit.** Most of this cycle's fixes were tiny
code/prompt changes whose cost was the *round-trip*: build → import → send a real WhatsApp message →
read the Execution. Make that loop fast:
- Add a **diagnostic field** when a step is opaque (e.g. `vision_debug` = `len/sniff/head`). It turns
  3 blind guesses into 1 informed fix — see `references/media_receipts.md` §3.
- **Test from the real trigger, never "Execute step"** on a mid-flow node (empty input → 400/empty —
  see `references/ai_tool_gotchas.md` §6). Tell the client this explicitly so their tests are valid.
- When a fix doesn't land, **read the data, don't theorize** — the column value, the node's INPUT
  panel, the Execution output. Several "logic bugs" this cycle were actually wording or a stale
  reference, visible immediately in the data (see `references/debugging.md`).

**Service & versioning conventions:**
- **Bump the version in the workflow `name` and a sticky note** each delivery (V2.3 → V2.4 → …), with
  a short "what's new" + "replace after import" list. The client tracks changes by version.
- **Work from the file the client last edited**, not your last build — they make manual changes
  (removing features, editing nodes). Diff their upload against your copy and apply changes *on top*
  of theirs, preserving their edits (e.g. a removed Daily-Summary feature stays removed).
- **Schema changes go live via migration, and say so.** When a change needs a new column
  (`graphics.kind`, `orders.invoice_name`), run the Supabase migration on the client's project,
  backfill existing rows, and note it in the delivery — the workflow JSON alone isn't enough.
- **Secrets exposed in screenshots are compromised.** When a client pastes a node showing a live key
  (Gemini / WHAPI token), tell them plainly to rotate it, and keep secrets in `$env`, not inline —
  inline secrets travel with every exported JSON.

---

## Gotchas Catalog (the menu the Gotchas check scans)

This is the running list of hard-won failure modes — each is a trap, the consequence, and the fix.
**The "Gotchas check" section above is what makes this list useful:** scan it proactively at every
trigger moment (designing, planning together, onboarding a client, before import, before a fix),
pick the ones live for the current situation, rank critical vs good-to-know, and route to the cited
reference. Treat it as living — when you hit a new one, it belongs here. Critical entries (silent
live breakage or a mis-billed customer) are flagged **[CRITICAL]**.

- **[CRITICAL] Tool node names MUST be ASCII.** n8n derives the model-facing tool name from the node
  name by replacing non-`[a-zA-Z0-9_]` chars with `_`. A Hebrew-named tool collapses to `_` →
  "multiple tools with the same name '_'" errors and tool-call traces leaking to the user. Name every
  `ai_tool` node with an ASCII leading token; put Hebrew in a sticky note. See
  `references/ai_tool_gotchas.md` §1–2.
- **[CRITICAL] Google Calendar nodes: use Calendar "By ID" (plain string), NOT "From list".** The
  `__rl` list-mode selector serializes the calendar id as an array and causes a `400 Bad Request` on
  event create, even when every other field is correct. Use
  `{"__rl": True, "mode": "id", "value": CAL_ID}`. See `references/ai_tool_gotchas.md` §3.
- **`$fromAI` date fields need a live `$now` anchor (via `+` concatenation, never nested `{{ }}`),**
  each key used once with a consistent description, and Google-required fields (summary) need a `||`
  fallback. See `references/ai_tool_gotchas.md` §4–5.
- **In Code nodes, never `require('luxon')`** — it's disallowed on many self-hosted instances.
  `DateTime` is a global. Same for `$now`, `$json`, `$getWorkflowStaticData`. See §5.
- **[CRITICAL] `toolCode` (Custom Code Tool) can't make HTTP calls.** Inside a `toolCode` body,
  `fetch` is undefined *and* `this.helpers.httpRequest` is unavailable — any external call fails
  (often with the misleading `Cannot assign to read only property 'name'… No execution data
  available`). Use `toolCode` only for pure string/logic. For agent-invoked HTTP use `toolHttpRequest`
  or `toolWorkflow`; for payments/side-effects use the deterministic main-flow pattern (agent emits
  `[ORDER:{…}]` → Parse → IF → HTTP Request node). A *plain* Code node *does* have
  `this.helpers.httpRequest` — use it there, never `fetch`. See `references/toolcode_limits.md`.
- **[CRITICAL] Payments go in the main flow, not in a tool, and secrets go in `$env`.** Build
  Hyp/Yaad payment links with a real HTTP Request node doing the `APISign` GET, then wrap the returned
  string (which already contains `action=pay`) into the link — don't add `action=pay` twice. Keep
  `Masof`/`KEY`/`PassP` in `$env`. See `references/payments_hyp.md`.
- **[CRITICAL] Supabase node returns nothing? It's RLS, not your query.** When a table has Row Level
  Security on (Supabase enables it by default on Table-Editor tables in `public`), the **`anon`** key
  returns zero rows and inserts fail with *"new row violates row-level security policy"*. Use the
  **`service_role`** key in the credential (it has `BYPASSRLS`) so the bot can read/write, OR write a
  policy. For straight DB work, sidestep the API entirely with the **Postgres node on the pooler**.
  Never put `service_role` in a prompt — it's god-mode over the whole project. See
  `references/supabase.md` §RLS.
- **"Execute step" on a tool node always fails** (no agent → empty `$fromAI` fields → 400). Tell the
  user to test from the real trigger, and not to click the ✨ sparkle button (it wipes pasted
  expressions). See `references/ai_tool_gotchas.md` §6.
- **[CRITICAL] WHAPI batches inbound messages — `messages[]` can hold several.** Whapi.Cloud
  coalesces a customer's rapid messages into **one** webhook whose `messages` array has multiple,
  mixed-type items (text/image/voice/echo/status). Parse with a **Code** node that filters
  `from_me===false && type==='text'` then joins — never assume `messages[0]` is the whole turn, and
  never `.map(m => m.text.body)` without filtering. Because WHAPI already groups, **do not stack a
  Supabase debounce on top of it** (that's a Green-API pattern); doing so makes the bot answer stale
  messages or reply multiple times. And a channel in `status AUTH` (not `READY`) can't send —
  `POST /messages/*` then 404s "Channel not found" / 401s regardless of perfect wiring. See
  `references/whapi.md`.
- **[CRITICAL] A Supabase node that returns ZERO items halts the chain silently — NOT only Delete.**
  Both a successful **Delete** (emits no items) **and** a **getAll used as a gate** (returns 0 rows
  when there's no match — the normal state) stop the flow with **no error** when *Always Output Data*
  is off. The canonical getAll case: a **`Check Human Mode` getAll on `human_mode`** — an empty table
  /
  no row for this chat returns 0 items, the next node never runs, and **the bot goes dead-silent on a
  perfectly normal message** (real T-CENTER outage: chats without a human_mode row stopped replying).
  Set **Settings → Always Output Data: ON** on every Supabase Delete **and** every getAll gate whose
  empty result must still flow. Also use the **same `chat_id` expression** across Insert/Get/Delete
  (a mismatch deletes nothing), and put a debounce Clear **after** Get-All and **before** the agent
  reply. "Bot silently stops on some chats but not others" = this bug. See `references/patterns.md`
  Pattern I and `references/supabase.md`.
- **[CRITICAL] Human-takeover that expires under an active human ("owner sends voice but the bot
  keeps talking").** `human_mode.chat_id` is a PRIMARY KEY, so the `Create`/insert that marks
  takeover
  **succeeds once then silently fails on every later message** (duplicate key, swallowed by
  `onError: continue*`) → `updated_at` never refreshes → the window expires `WINDOW_MIN` after the
  human's *first* message even while they keep replying (usually by **voice**). A **corrupted/empty
  Delete filter** (`"keyValue": "="` → deletes `WHERE chat_id=''` → 0 rows) is the common trigger.
  Detection is type-agnostic: `from_me===true && source!=='api'` (voice/image/action all count). Fix
  with a **true upsert** (REST `Prefer: resolution=merge-duplicates`, or Postgres `ON CONFLICT`), or
  point the Delete filter at the real chatId. See `references/patterns.md` Pattern I,
  `references/supabase.md`, and **`references/debugging.md`** (how it was caught: stale
  `human_mode.updated_at` vs the `inbox` audit log).
- **Two silence windows from one keyword detector (manual vs "paid").** When the owner types a
  payment word ("שולם"/"הלקוח שילם"/"סגור") the bot should go quiet *until the next business day*, not
  for the usual few minutes. Add `silenced_until timestamptz` to `human_mode`, detect the keyword on
  the takeover branch, and compute the deadline as **start of tomorrow in the business timezone**
  (`DateTime.now().setZone('Asia/Jerusalem').plus({days:1}).startOf('day')`) — **never `now + 24h`**,
  which frees the bot at the wrong hour. Keep the regex tight or the owner quoting a customer
  ("הוא אמר שכבר שילם") silences a live chat for a day. Write it with the same PK-safe upsert. See
  `references/patterns.md` Pattern L.
- **Inbound media caption never reaches the agent → it re-asks.** The media branch stores+emails the
  image while the agent only gets a synthetic `[המערכת: הלקוח שלח גרפיקה]` sentinel with **no
  caption** — so if the customer wrote "זה מקדימה בגדול" on the image, the bot still asks "where do we
  print it?". Reading the DB *confirms the caption saved*, which is why it looks like a bug but is an
  architecture gap. Make the sentinel caption-aware in **both** writers (the buffer row **and** the
  parallel handoff Set), thread `caption` through every Code node on the media path, and tell the
  agent not to re-ask when a location is present. See `references/patterns.md` Pattern M.
- **[CRITICAL] Agent writes a prompt instruction as a field value (junk on real invoices).** An
  `invoice_name` described as "the name the invoice is issued to" comes back literally as
  `"על שם הלקוח"`/`"על שמי"`/
  `"לקוח"` — and bills a customer under that string (~25–30% of orders before guarding). Diagnose by
  reading the column (`order_snapshot->>'invoice_name'`), not by watching chats. Fix in **two layers**:
  prompt reject-list **plus** a regex hard-block in the `[ORDER]` parse Code node that blanks
  placeholders so no invoice issues on a junk name. See `references/supabase.md` (placeholder guard).
- **Hebrew label + `5M, 20L` breakdown renders reversed in WhatsApp (bidi).** A line like
  `מידות: 20 M, 5 L` can display as `M, 5 L 20` — quantities/sizes visually swapped, though the DB is
  correct. Digits + Latin letters + commas inside RTL text get reordered by the bidi algorithm. Fix
  by emitting **one item per line** (`M × 20` / `L × 5`), computed in a Code node with a parser that
  accepts every format the agent uses; nudge the agent toward compact `5M, 20L`. See
  `references/whapi.md` (RTL/bidi). The same per-weekday Schedule digest that surfaces this (orders
  to a group, gated by closing time, dedup'd over `superseded` rows) is **Pattern N**.
- **Supabase REST drops a connection under load → Retry On Fail, not a logic hunt.** A per-message
  bot makes several Supabase calls per turn; the REST endpoint occasionally returns *"connection
  closed unexpectedly, perhaps it is offline"* — a transient blip that fails the whole message
  (often on `Check Human Mode`). Enable **Settings → Retry On Fail** (Max Tries 3, Wait ~2000ms) on
  Supabase nodes. Safe on reads; acceptable on these writes (effectively idempotent). **Do NOT**
  auto-retry EZcount `createDoc` (duplicate invoice) or WHAPI sends (double message). See
  `references/supabase.md`.
- **[CRITICAL] EZcount invoice errors are environment/key, not syntax.** A `createDoc` failure saying
  the API key "is not correct for the environment production" means a **demo key hit the production
  URL** (or
  vice-versa) — each environment has its own key. The api_key goes in the **body**, not a header
  (don't attach Header Auth). Build the payment link from the returned `doc_uuid` as
  `https://www.ezcount.co.il/dp/?key=<doc_uuid>`. Single-quotes in the expression are never the cause.
  See `references/payments_hyp.md` §10.
- **Sub-workflow data hand-off is fragile — prefer INLINE for state/side-effect logic.** A called
  sub-workflow (`executeWorkflow → executeWorkflowTrigger`) can't reference parent nodes
  (`$('Parse Order')` doesn't exist inside the child), and the hand-off breaks three silent ways:
  importing the child *into* the parent ("only one Execute Workflow Trigger allowed"); the parent
  passing an **empty** `workflowInputs` so the child gets nothing (fix: child trigger →
  **Accept all data**, then **re-add** the parent Execute Workflow node); and an **HTTP node between
  the source and the call** replacing `$json` with its response so the child receives the API reply,
  not the order. For an order-state machine / invoice logic on the main path, **inline the nodes on
  the `IF[true]` branch referencing `$('Parse Order')`** instead of splitting — it's simpler and has
  zero hand-off surface. Reserve sub-workflows for **agent tools** (`toolWorkflow`) and genuinely
  reusable units. Full rules in `references/subworkflows.md`.
- **"JSON parameter needs to be valid JSON" (HTTP, Using JSON) is almost never the body format.**
  The object expression `={{ { … } }}` works and **`JSON.stringify(...)` is NOT required** (red
  herring). The real cause is an **expression inside the body that throws** — usually a reference
  that's `undefined` (e.g. `…chatId.split('@')` when the node got an empty sub-workflow hand-off) or
  a `$('Node')` that doesn't exist in this workflow. Check the node's **INPUT panel**: if the
  referenced fields are missing, fix the data flow, don't touch the body. See
  `references/payments_hyp.md` §10.
- **[CRITICAL] PayPlus webhook signature must be verified over the RAW body, not parsed JSON.**
  PayPlus signs its callback with a `hash` header = base64 **HMAC-SHA256 of the exact raw request
  body** keyed by your `secret-key` (+ `user-agent: PayPlus`). Verifying against n8n's parsed-then-
  re-stringified JSON changes the bytes and fails every legitimate webhook (the Stripe/PayPal raw-
  body trap). Compute the HMAC over the raw body in a Code node and compare. To create the link:
  `POST /PaymentPages/generateLink`, auth via `api-key` + `secret-key` **headers** (not
  `Authorization`), read `data.payment_page_link`, and a sandbox key on the production URL fails just
  like EZcount. See `references/integrations.md` §1A.
- **[CRITICAL] Cardcom/Pelecard success is a numeric `ResponseCode === 0`, not HTTP 200.** A failed
  deal still returns HTTP 200 with a non-zero code, so branching on the status code passes failures
  through. Identity (`TerminalNumber`/`ApiName`/`ApiPassword`) goes in the **body**, not a header;
  read the hosted page from `Url`; and treat the **webhook + `GetLowProfileResult` lookup** as the
  source of truth, not the browser redirect (which is lost if the customer closes the tab). See
  `references/integrations.md` §1B.
- **[CRITICAL] monday.com `column_values` is a JSON STRING and dynamic values inside it break.**
  `change_multiple_column_values`/`create_item` take `column_values` as a **stringified** object of
  `column_id → typed value`; static values work but interpolating an n8n expression *inside* that
  JSON collapses the escaping → `Invalid GraphQL request`. Build the object in a **Code node and
  `JSON.stringify`** it, pass it as a GraphQL **variable** (`$columnValues: JSON!`), and address
  columns by **`column_id`** (slug like `status`/`date4`), never the title — each column type wants a
  different value shape. See `references/integrations.md` §2C.
- **[CRITICAL] ClickUp "my tasks due this week" needs the Get Filtered Team Tasks endpoint via HTTP,
  not the native getAll.** The native "Get Many → List" can't express assignee + status + due-window
  and paginates 100/page silently. Use `GET /api/v2/team/{team_id}/task?assignees[]=…&statuses[]=…&
  due_date_lt=<epoch_ms>&include_closed=false` with an **HTTP Request node**. Auth is a `pk_` personal
  token as the **raw `Authorization` value (no `Bearer`)**; **dates are Unix epoch MILLISECONDS**; and
  custom fields are addressed by **field id (UUID)**, not name. Rate limit 100/min. See
  `references/integrations.md` §2A.
- **Airtable omits empty fields from responses, and linked records are arrays of record IDs.** Any
  field that is `""`/`[]`/`false` is **absent** from the API response, so a field read returns
  `undefined` for a merely-empty cell — guard every read with `|| ''`. Link fields take
  `["recXXXX"]` (the linked row's record id), not the display name, so resolve name→id with a Search
  first. PAT needs explicit **scopes** (`data.records:read/write`, `schema.bases:read`) + base
  access; rate limit **5 req/s/base** → harsh **30 s** lockout on 429 (batch up to 10 records/req).
  See `references/integrations.md` §2B.
- **Notion sees nothing unless the integration is shared into the database, and every property type
  has its own shape.** A "no results"/404 is usually an **unshared** database (Notion's per-resource
  sharing), not a bad query. Reads/writes are typed per property (`title`=rich-text array,
  `select`=`{name}`, `date`=`{start}`, `relation`=`[{id}]`, `number`=bare) — map the database's
  property types and write a per-property mapper rather than guessing. See `references/integrations.md` §2D.
- **HubSpot writes use *internal* property names and links need association type IDs, not labels.** A
  custom field's friendly label isn't its API name — pull `GET /crm/v3/properties/contacts` and map
  label→internal name, or the value silently drops. Linking contact↔company/deal is a separate
  associations call with a typed association id, not a "company" field (the "saved but nothing linked"
  trap). Auth via **Private App token** with the exact scopes (legacy `hapikey` is deprecated); Search
  is eventually consistent so match on the returned `id`, don't immediately re-search. See
  `references/integrations.md` §2E.
- **Pipedrive custom fields are 40-char hash keys and a Deal moves by `stage_id` (tied to a pipeline),
  not a status field.** Custom fields are auto-generated hex keys (not "Lead Source") — map label→key
  from `GET /dealFields`/`personFields` first, and an enum field's value is the option **id**. Stage
  IDs belong to a specific pipeline; a stage from the wrong pipeline fails. Phone/email are arrays of
  `{value,label,primary}`, not strings. Token is **user-scoped** (a limited user returns partial data).
  See `references/integrations.md` §2F.
- **Telegram bots are starved in groups (privacy mode) and the trigger polls.** In a group the bot
  only receives @-mentions until you send **`/setprivacy` → Disable** to @BotFather (the analogue of
  the WHAPI `from_me`/group-filter setup) — a "summarize this group" bot otherwise gets almost
  nothing. The Telegram Trigger **polls by default (1–3 min delay)** and only when the workflow is
  active; use **HTML parse mode** (legacy Markdown silently fails on special chars); private group
  ids are negative `-100…`. See `references/integrations.md` §3A.
- **The "WhatsApp → tasks" summarizer is an ASSEMBLY, and its forgotten step is the phone→user
  mapping.** Listen-to-group → classify (cheap AI, strict JSON) → extract (hard parse + reject-list
  guard) → **map participant phone to the PM-tool user id** (keep a small lookup table; without it
  assignees can't be set) → write the task (idempotent on message id) → day-of-week-gated digest
  back to the group (**Pattern N**). It reuses Patterns I, J/K, M, N pointed at ClickUp/Airtable/
  Monday instead of an invoice; inherits WHAPI `messages[]` batching (+ no extra debounce), the
  per-platform field traps above, and RTL bidi digest formatting. See `references/integrations.md` §4.
- **[CRITICAL] Classifying an inbound image by CAPTION keywords mislabels graphics as payments.** A
  bot that splits "artwork vs proof-of-payment" on caption/filename words ("העברה", "שולם", "paid",
  "invoice", "receipt") flips a *design* into a *receipt* the moment a customer writes "הדמיה לחולצה,
  **שילמתי** כבר" or names a file `invoice_design.png`. Keyword routing must be **asymmetric**:
  explicit *graphic* words (הדמיה/גרפיקה/לוגו/קדמי/אחורי/חולצה) win outright; *receipt* needs a
  **STRONG** signal (אסמכתא/אישור תשלום/צילום העברה/ביט) — a weak word alone ("העברה"/"paid") or a
  graphic+payment **conflict** must defer to Vision, never decide from text. See
  `references/media_receipts.md` §1.
- **[CRITICAL] Vision can't classify a receipt from the TEXT printed on it — judge by visual
  STRUCTURE.** A shirt design that literally prints "שילמתי 65 שקל" + a phone number will fool a
  text-reading classifier into extracting a fake "amount"/"name". A flash-lite prompt that asks "is
  this a receipt?" is not enough. The prompt must classify by **layout**: a real asmachta looks like
  a *bank/app document* (ordered fields — מס׳ אסמכתא, שם המוטב, מועד ביצוע — bank logo, uniform
  background), a graphic looks like *artwork* (illustration, art type, composition) **even if it
  contains payment-like text**. Add a **confidence** score and treat `receipt` with `confidence < 55`
  as graphic. The final backstop is the **name+amount match against an open order** — a stray "65" on
  a design won't match a real order. Three independent layers (structure prompt → confidence gate →
  DB match) must all fail for a false-paid. See `references/media_receipts.md` §2.
- **[CRITICAL] Gemini Vision `400 Unable to process input image` = mime↔bytes mismatch, not a bad
  request.** WhatsApp re-encodes images to **WebP**, but the WHAPI message object (or your default)
  may report `image/jpeg`; sending WebP bytes labeled JPEG → Gemini 400. **Sniff the real type from
  the byte signature** (`FF D8 FF`=jpeg, `89 50 4E 47`=png, `RIFF…WEBP`=webp, `25 50 44 46`=pdf,
  `ftyp`=heic) and send the matching `mimeType`; strip any `data:` prefix; only send `image/*` Gemini
  supports (jpeg/png/webp/heic/heif). Also **pre-build the whole request body in a Code node** and
  pass it as `={{ $json.geminiBody }}` — n8n's `{{ {…} }}` object expression can mangle a long base64
  string. Use camelCase `inlineData`/`mimeType` (v1beta). Guard with `IF vision_ok` so a non-image
  (HTML error page from an expired link, a PDF) never reaches Gemini. See `references/media_receipts.md` §3.
- **[CRITICAL] A tight `maxOutputTokens` silently truncates the Vision JSON → `amount=0`, receipt
  "ignored".** A Hebrew payer name plus the `{…}` object easily exceeds a small cap (the real bug was
  `maxOutputTokens: 80`): Gemini returns a **half-written JSON**, `Vision: Parse Kind`'s `JSON.parse`
  throws, the `catch` falls back to `graphic`/`amount=0`, and the asmachta looks **unread** — name and
  amount both empty though the image and model were fine. It mimics "Vision didn't fire," but `vision_ok`
  is true and `candidates[0]…text` ends mid-object with no closing `}`. Fix: **`maxOutputTokens: 512`**
  + **`responseMimeType: 'application/json'`** (clean JSON, no fence, far less truncation), and **coerce
  the amount hard** (`Number(String(o.amount ?? 0).replace(/[^0-9.]/g,''))||0`) since Gemini may emit
  `"100.00"`/`"₪100"`. Carry a `vision_parse_debug` (`raw=<first 180 chars>`) so the next miss is one
  glance. See `references/media_receipts.md` §3.
- **[CRITICAL] A single quote inside a Hebrew prompt string breaks the Code node (`SyntaxError:
  Unexpected identifier`).** A `promptText = '…'` JS string that embeds a Hebrew label in single
  quotes — `'שם המוטב'`, `'מחשבון'`, `'סכום'`, or an apostrophe in copy — **closes the string early**;
  n8n then throws *"Problem in node … Unexpected identifier 'שם'"*, which reads like a node bug, not a
  quoting bug (real T-CENTER V2.7 break while editing the Vision prompt). Fix: wrap inner labels in
  Hebrew gershayim `«…»`/guillemets (just text to the model), or use double quotes inside the
  single-quoted string, or make `promptText` a backtick **template literal**. Always **syntax-check
  every Code node before delivery** — wrap its `jsCode` in `async function f(){ … }` and `node --check`
  — which also catches `await` outside async and stray braces. The Python builder should do this on
  every emitted Code node. See `references/media_receipts.md` §3.
- **Don't download inbound media twice — reuse the bytes the classifier already fetched.** Once
  `Vision: Fetch & B64` (a Code node) has downloaded and base64'd the image, a later `Receipt:
  Download` HTTP node that re-fetches `{{ $json.link }}` fails with **`Invalid URL: …must start with
  http`** because `link` is no longer on the item after it passed through the Vision/IF chain. Make
  the receipt step a **Code node that reuses `vision_b64`** when present and only downloads (via
  `GET /media/{id}`, fallback `link`) on the keyword path that skipped Vision. Saves a request and
  removes the empty-URL crash. See `references/media_receipts.md` §4.
- **[CRITICAL] Payment link fires at the SUMMARY stage because `[ORDER]` is emitted before the
  customer confirms.** If "is this an order?" is computed as `total > 0` the instant the agent prints
  an `[ORDER:{…}]` block, the link goes out while the bot is still *asking* "האם לאשר?" — the customer
  never said yes. A prompt rule ("only emit [ORDER] after confirmation") is necessary but **not
  sufficient** on small models. Add a **deterministic confirm-gate** in the parse Code node: read the
  customer's last text and require an explicit yes-word (כן/מאשר/סגור/אפשר לסגור…) with a negation
  guard (לא/רגע/אולי), and force `isOrder=false` otherwise. **If you add the gate as a separate node
  rather than folding it into the parse node, repoint the downstream `IF` at the gate** — an
  `IF Order Closed` still reading `={{ $('Parse Order').item.json.isOrder }}` pulls the *pre-gate*
  value and the link fires anyway while the new node sits inert (a node-by-name ref always returns that
  node's own output, never "whatever ran last on the wire"). Prefer folding the check into the existing
  parse node to remove the trap entirely. See `references/media_receipts.md` §5.
- **Asmachta→order matching: name AND amount, with safe fallbacks (never auto-pay on a partial
  match).** Match the Vision-extracted `full_name` + `amount` against the chat's **open** orders:
  name **and** amount → mark `paid` automatically; amount-only or name-only → **manual-check alert,
  do NOT pay**; nothing → alert. Normalize names (strip spaces/quotes, `בע"מ`↔`בעמ`, fuzzy
  includes) and allow ±1 on the amount. Store `invoice_name` as a real column (backfill from
  `order_snapshot->>'invoice_name'`) so the match is indexable. There is **no shared id** between a
  T-CENTER invoice (`91096`) and the customer's bank asmachta (`008836`) — the bank never carries the
  invoice number — so name+amount is the only viable key, not a document id / EZcount `doc_uuid`. See
  `references/media_receipts.md` §6.
- **A "we're checking it manually" message makes customers re-send the asmachta repeatedly.** On the
  *failed/needs-check* branch, a cautious wording ("we're verifying, we'll contact you if there's a
  gap") reads as *something's wrong* and the customer fires the screenshot again and again. Use a
  **reassuring** close ("קיבלנו את האסמכתא, תודה! 🙏 הצוות יוודא את התשלום ויחזור אליך בהקדם") on the
  not-matched branch, and keep the matched branch unambiguous ("אימתנו את התשלום ✅"). The team still
  gets the truthful manual-check alert; only the customer-facing copy is calm. See
  `references/media_receipts.md` §6.
- **Group "verification" alerts: emoji header + full phone + short order desc + `wa.me` deep link.**
  The proven BRJewelry/Shai pattern for owner-facing group notices (handoff, visit, manual payment
  check): post to the group `…@g.us` with `🔴 בדיקת תשלום ידנית!`, `👤 שם`, `📞 <full intl phone>`,
  `📦 <short order desc from order_snapshot>`, and a **clickable `https://wa.me/<972…>` link straight
  to the customer chat** (phone already `972XXXXXXXXX`, no `+`). Pull the short desc from
  `order_snapshot.desc || product+quantity`. Reusable for any "owner needs to act on this chat" alert.
  See `references/media_receipts.md` §7.

---

## Delivery format

After validating, copy the JSON to the outputs directory and present it. Then give a compact guide:

1. **Import order** — if there are sub-workflows the agent calls as tools, import those first
   (so their workflow ids exist), then the main workflow, then paste the ids into the tool nodes.
2. **What to replace** — the exact list of fake placeholders (credentials, ids, tokens, the brand
   block).
3. **Manual-finish flags** — the honest list of things needing a real value or a first-run check
   (file hosting, API response paths, credential re-pick).
4. **Next step** — usually "fill in the brand/system prompts" or "wire the credentials," offered as
   the natural continuation.

Keep the guide tight. The user can read the workflow; they need the map, not a re-explanation.

---

## Reference files

- `references/research.md` — how to research nodes (native + community) and use the n8n docs before
  building; verifying type strings, parameters, versions, and connection types.
- `references/build_method.md` — the Python builder pattern, node/connection helpers, positioning.
- `references/validation.md` — the validation checks to run before delivery.
- `references/green_api.md` — Green API method catalog, payload shapes, the uploadFile binary chain.
- `references/whapi.md` — **read for any build on WHAPI (Whapi.Cloud) instead of Green API.** Base
  URL + Bearer-token auth, Chat ID / `to` formats, the two n8n integration paths (community node vs
  HTTP+Webhook), the webhook envelope and Message-object parsing (incl. the `from_me` loop-guard),
  **the `messages[]` batching behavior and the correct merge-and-extract Code node, why NOT to stack
  a Supabase debounce on WHAPI, the `READY` vs `AUTH` channel gate that makes sends 404/401, and
  persistent-webhook retry storms**, the full send catalog (text/media/interactive buttons &
  lists/carousel/location/poll/contact), the URL-or-base64 `media` model (no upload dance), commerce
  (catalog/products/orders), stories, groups/communities/channels, mark-read/reactions/typing, the
  status lifecycle, and the anti-ban/rate-limit rules (warm-up, 6–12 msg/min, 429 soft ban) for
  delivery notes.
- `references/supabase.md` — **read for any build that touches Supabase** (CRM/leads table, order
  log, bot state, RAG knowledge base, or persistent chat memory). The three doors into Supabase
  (Postgres node on the pooler vs Supabase REST node vs Vector Store) and when to use each; the full
  Supabase-node operation table; the **`service_role` vs `anon` / RLS** failure dictionary; the
  pgvector + `match_documents` SQL with the embedding-dimension trap; using Supabase as an AI-agent
  tool, vector store, and Postgres Chat Memory; and the connection wiring for each.
- `references/payments_hyp.md` — **read for any build that takes a card payment / sends a "לינק
  לתשלום".** Hyp / Yaad-Sarig (YaadPay) two-step APISign flow, full parameter tables, the
  return/`CCode` and Verify flow, the main-flow node shape, the sandbox test card, a failure
  dictionary, and **§10 the EZcount invoice-as-payment-page pattern** (api_key in the body not a
  header, `type:300` → `doc_uuid` → `ezcount.co.il/dp/?key=` link, the demo-vs-production-key error,
  and its failure dictionary). Why the Hyp call must NOT live in a `toolCode`.
- `references/toolcode_limits.md` — **read before using a Custom Code Tool (`toolCode`).** Why
  `toolCode` can't make HTTP calls (`fetch` undefined, `this.helpers` unavailable), the
  Execute-step trap, and the decision table: `toolCode` vs `toolHttpRequest` vs `toolWorkflow` vs the
  deterministic main-flow pattern for side effects.
- `references/patterns.md` — common workflow shapes (single agent + tools, multi-agent + router,
  approval gate via Wait node, publishing to Instagram/Facebook, lead capture, SDR/booking agent,
  reminders, **Pattern I: the Supabase message-debounce buffer + human-takeover** — with its silent
  bugs (chatId-must-match across Insert/Get/Clear, **any zero-item Supabase node — Delete or a getAll
  gate — needs Always-Output-Data**, Extract-must-be-Code-not-Set, Clear-runs-before-the-agent),
  **Pattern J: the order-state machine** (reuse/replace/new/paid→human idempotent invoicing),
  **Pattern K: the durable ack-fast Receiver + `inbox` idempotency**,
  **Pattern L: dual-tier human silencing** (manual 30-min vs payment-keyword until-next-day),
  **Pattern M: threading a media caption into the agent sentinel** (so it stops re-asking), and
  **Pattern N: a day-of-week-gated daily summary to a group** (dedup'd over `superseded` rows)) with
  the connection wiring spelled out.
- `references/subworkflows.md` — **read before splitting logic into a called sub-workflow.** Why the
  Execute Workflow data hand-off breaks three silent ways (only-one-trigger import error, empty
  `workflowInputs` / Accept-all-data + re-add, an HTTP node replacing the item), the bridge Code
  node, the standalone-testing caveat, publish ordering, and the **inline-vs-sub-workflow decision**
  (inline state/side-effect logic that needs upstream data; sub-workflow only for agent tools).
- `references/ai_tool_gotchas.md` — **read this for any build that attaches tools to a
  `langchain.agent`, especially Google Calendar/Sheets.** The runtime failures the builder +
  validation can't catch: ASCII tool-name requirement, the Calendar "From list" → 400 bug, `$fromAI`
  anchoring and duplicate-key rules, no-`require('luxon')` / no-nested-`{{ }}` expression rules, why
  "Execute step" on a tool node always 400s, the REST-update `settings` rejection, add-on import
  merge behavior, and the dedup'd reminder pattern.
- `references/debugging.md` — **read before "fixing" a workflow that's already deployed and
  misbehaving.** How to instrument instead of guess: pull *both* the Receiver and Processor via the
  n8n MCP, query the live `inbox`/`human_mode`/`orders` tables via the Supabase MCP (stale
  `updated_at` = broken refresh), confirm surprise PK/UNIQUE constraints, decode a double-encoded
  `payload`, and deliver the **smallest** fix — a one-field change or a **node pasted onto the canvas
  as JSON** — instead of a re-import that drops credentials.
- `references/integrations.md` — **read when the build touches a payment processor other than
  Hyp/Yaad, a PM/CRM platform (ClickUp/Airtable/Monday/Notion), Telegram/email, or is a "WhatsApp →
  tasks" summarizer.** Part 1: the five Israeli processors (PayPlus, Cardcom, Grow, Tranzila,
  Pelecard) — auth, create-link endpoint, the URL field to send, the webhook shape, and the critical
  gotchas (PayPlus raw-body HMAC signature; Cardcom/Pelecard numeric `ResponseCode===0` success;
  Tranzila's iframe+`thtk` flow needing a hosted page), with a provider-choice table. Part 2: the
  four PM/DB platforms — auth, ID hierarchy, and each one's parameter-shape trap (ClickUp epoch-ms +
  Get-Filtered-Team-Tasks-via-HTTP + custom-field ids; Airtable empty-field omission + linked-record
  arrays + scopes + 5 req/s; Monday `column_values` JSON-string + column ids; Notion typed properties
  + per-resource sharing). Part 3: Telegram (privacy mode, polling, HTML) and email channels. Part 4:
  the WhatsApp→task-summarizer as a composition of Patterns I/J/K/M/N with the phone→user mapping as
  its forgotten step.

Read the reference that matches the build. Don't load all of them for a simple workflow. For
anything with calendar booking or agent tools, `references/ai_tool_gotchas.md` is not optional. For
**debugging a live bot, read `references/debugging.md` before touching the JSON** — the bug is
usually in the other workflow or in the live DB state, not where the symptom points. And whichever
reference you open, run the **Gotchas check** against the situation first — it tells you *which*
reference sections carry the fixes for the traps this particular build, client, or live bug is
exposed to.
