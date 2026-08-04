# Integrations catalog — payment providers, PM/CRM platforms, channels

Reference material for builds beyond the core WhatsApp/AI stack. Each section gives the auth model,
the endpoint(s) that matter, the response field you actually read, and the **gotchas that cost a
debugging cycle**. Read the section for the integration in the build; don't load the whole file.

The recurring rule for all of them, same as Hyp/EZcount: **a payment call or a side-effect call goes
in the main flow as an HTTP Request node (or its native node), never inside a `toolCode`**, and every
secret goes in `$env` or an n8n credential, never in a node field or a prompt.

---

## PART 1 — Israeli payment providers (sliqa)

Five providers cover almost the entire Israeli SMB market beyond Hyp/Yaad. Pick by what the client
already has a terminal with — never migrate a client off a working processor to suit the build.
The shared shape: **create a payment page/link via one API call → send the returned URL on WhatsApp →
the provider POSTs a webhook to your n8n Webhook node on success → match it back to the order by phone
or your own reference field**. The order-state machine (Pattern J) and the EZcount paid-webhook
matching pattern apply unchanged — only the field names differ per provider.

### §1A — PayPlus (the cleanest modern JSON API; default for new card-link builds)

The easiest Israeli processor to integrate — real JSON, one POST returns a hosted link.

- **Base URL:** production `https://restapi.payplus.co.il/api/v1.0`, sandbox
  `https://restapidev.payplus.co.il/api/v1.0`. (Two separate keys — a sandbox key on the production
  URL fails, exactly like EZcount.)
- **Auth:** two **headers** — `api-key` and `secret-key`. JSON body. No `Authorization` header.
- **Create the link:** `POST /PaymentPages/generateLink` with a JSON body. Required fields:
  `payment_page_uid` (the page's UID from the PayPlus dashboard), `amount`, `currency_code` (`"ILS"`),
  `sendEmailApproval`. Useful: `charge_method` (1 = normal J4 charge), `refURL_success`,
  `refURL_failure`, `refURL_callback` (**this is the webhook/IPN URL — point it at your n8n Webhook
  node**), `more_info` / `more_info_2…5` (free string fields — **stuff your order id / phone here so
  you can match the webhook back**), `customer` (object: `customer_name`, `email`, `phone`),
  `items` (array). `expiry_datetime` is minutes-to-expiry.
- **Response you read:** `data.payment_page_link` (the URL to send) and `data.page_request_uid`
  (the id that comes back in the webhook — store it on the order to match later).
- **Webhook (IPN) shape:** PayPlus POSTs JSON with `transaction_type`, `transaction.status_code`
  (`"000"` = approved), `transaction.uid`, `transaction.amount`, and the `page_request_uid` you
  stored. There's also a fuller "IPN FULL" variant with the customer object.
- **[CRITICAL gotcha] Verify the webhook signature over the RAW body.** PayPlus signs the callback:
  it sends a `hash` header = **base64 HMAC-SHA256 of the exact raw JSON body** keyed with your
  **secret-key**, plus `user-agent: PayPlus`. To verify in n8n, the Webhook node must expose the raw
  body — compute `crypto.createHmac('sha256', SECRET).update(rawBody).digest('base64')` in a Code
  node and compare to the header. If you verify against n8n's *parsed-then-re-stringified* JSON the
  bytes differ and every legitimate webhook fails. (Same raw-body trap as Stripe/PayPal.) For a
  low-stakes internal bot you can skip verification and just trust `status_code` + match the
  reference, but say so explicitly in delivery notes.
- **No native n8n node** — use HTTP Request for the create call and a Webhook node for the callback.
- Sandbox test cards live at `docs.payplus.co.il` ("Sandbox Credit Card Numbers").

### §1B — Cardcom (LowProfile; default when the client also invoices through Cardcom)

Very common with businesses that already do invoicing in Cardcom. The modern interface is **v11 JSON**
(there's also a legacy GET-querystring "LowProfile.aspx" interface still in the wild — prefer v11).

- **Base URL:** `https://secure.cardcom.solutions/api/v11`.
- **Auth / identity:** `TerminalNumber` + `ApiName` (+ `ApiPassword` for some operations) sent **in
  the JSON body**, not a header.
- **Create the link:** `POST /LowProfile/Create` with `TerminalNumber`, `ApiName`, `Amount`,
  `ISOCoinId` (1 = ILS), `Operation` (`"ChargeOnly"` / `"ChargeAndCreateToken"` / `"CreateTokenOnly"`),
  `SuccessRedirectUrl`, `FailedRedirectUrl`, **`WebHookUrl`** (the server-to-server callback → your
  n8n Webhook node), `ReturnValue` (**your order id — echoed back in the webhook, use it to match**),
  and a `Document` object if you want Cardcom to also issue an invoice. (In the legacy interface the
  webhook param was called `IndicatorUrl`.)
- **Response you read:** `Url` (the hosted payment page to send) and `LowProfileId`.
- **Webhook shape:** Cardcom POSTs `ResponseCode` (**`0` = success**, everything else is a failure
  code), `LowProfileId`, `TranzactionId`, `ReturnValue`, and a `TranzactionInfo` object. There are
  separate response codes per concern: `DealResponse` (charge), `TokenResponse`, `InvoiceRespondCode`.
- **[gotcha] Success is `ResponseCode === 0`, not HTTP 200** — a failed deal still returns HTTP 200
  with a non-zero `ResponseCode`. Branch on the code, not the status.
- **[gotcha] Pull the full result rather than trusting the redirect.** After the webhook gives you a
  `LowProfileId`, the canonical confirmation is `GetLowProfileResult` (POST with the id). The browser
  redirect can be lost (customer closes the tab); the webhook + result lookup is the source of truth.
- **No native n8n node** — HTTP Request + Webhook. Docs: `secure.cardcom.solutions/Api/v11/Docs`
  (downloadable OpenAPI v3).

### §1C — Grow (ex-Meshulam) / PayPlus-style page + Bit

Grow (formerly Meshulam) is very common and supports **bit** prominently. Model is the same: a
"createPaymentProcess" API call returns a hosted page URL; a server callback (`successUrl` /
`cancelUrl` / a server-to-server notify) confirms. Fields differ (`pageCode`, `userId`, `apiKey`,
`sum`, `successUrl`, `cancelUrl`, `notifyUrl`, `cField1…` custom fields for your order id). Treat it
exactly like PayPlus: HTTP Request to create, Webhook node for `notifyUrl`, match on your custom
field, branch on the status field. **No native node.** Confirm the exact field names against the
client's Grow developer docs at build time (Grow's API has shifted names across versions — this is a
"verify before building" provider).

### §1D — Tranzila (iframe + Handshake V2 — heavier; only when the client is on Tranzila)

Tranzila is widespread but its modern flow is **iframe-based, not a simple link**, which makes it the
least bot-friendly of the five. Two pieces:

- **Auth (API V2):** custom headers — `X-tranzila-api-app-key` (app key) + an HMAC: the docs compute
  `hash_hmac('sha256', app_key, secret + request-time + nonce)` sent with `X-tranzila-api-request-time`
  and `X-tranzila-api-nonce` headers. (More moving parts than a static key.)
- **Handshake V2 → iframe:** call the Handshake endpoint to get a time-limited transaction token
  **`thtk`**, then render the payment **iframe** at
  `https://direct.tranzila.com/<terminal>/iframenew.php` with the `thtk`. On completion the iframe
  redirects to your success/fail page and you do a **3-sided handshake** (back-to-back verify of the
  returned `thtk` + `index`/`txId` against Tranzila's CG) to confirm the transaction is genuinely
  successful.
- **Why it's awkward for a WhatsApp bot:** there's no "send one link and you're done" — the customer
  needs a browser surface to host the iframe. For a pure WhatsApp flow this means hosting a thin
  payment page yourself that mounts the iframe, then your page's backend posts the confirmation to
  n8n. **If the client isn't already committed to Tranzila, steer to PayPlus/Cardcom/Grow** (true
  hosted links). If they are on Tranzila, the cleanest path is: bot sends a link to *your* hosted
  page → page mounts the Tranzila iframe → page backend → n8n Webhook. Flag the extra hosting in
  delivery. **No native node.**

### §1E — Pelecard (bank-grade, legacy)

Pelecard is a bank-oriented processor some enterprise clients are locked to. It exposes a JSON API
(`/services/...`) with `terminalNumber` + `user` + `password`, an `init`/`PaymentInit` style call that
returns a redirect URL, and a server callback. It's stable but old; treat like Cardcom (body-auth,
branch on a numeric status, pull the result rather than trusting the redirect). **No native node** —
HTTP Request + Webhook; verify exact endpoint/field names against the client's Pelecard docs.

### Payment-provider decision table

| Client situation | Use | Why |
|---|---|---|
| New card-link build, no incumbent | **PayPlus** | Cleanest JSON, one POST → link, signed webhook |
| Already invoices in Cardcom | **Cardcom v11** | One call charges + issues the invoice |
| Already invoices in EZcount/Morning | **EZcount link** (`references/payments_hyp.md` §10) | Invoice doubles as payment page |
| Needs **bit** front-and-center | **Grow** or PayPlus (`charge_default:"bit"`) | Both surface bit cleanly |
| Already on Hyp/Yaad | **Hyp APISign** (`references/payments_hyp.md`) | Don't migrate a working terminal |
| Already on Tranzila | **Tranzila iframe** (+ thin hosted page) | Only if committed — heaviest integration |
| Bank-locked enterprise | **Pelecard** | When they can't move processor |

For all: model payment as the deterministic main-flow pattern (agent emits `[ORDER:{…}]` → Parse →
IF → HTTP create-link → send), keep the create call out of any tool, and put terminal/keys in `$env`.
The webhook handler is its own workflow (durable **ack-fast Receiver**, Pattern K) that matches the
callback to the order (normalize phone the same way EZcount does) and flips the order to paid.

---

## PART 2 — Project-management / database platforms (CRM, task stores, "second brain")

These let the skill serve clients who already live in a real PM/DB tool instead of Google Sheets.
All four below have a **native n8n node**, but each has one parameter-shape trap that breaks builds.

### §2A — ClickUp (native node + can be an AI-agent tool)

Node `n8n-nodes-base.clickup`; trigger `n8n-nodes-base.clickuptrigger`. The node **can be attached to
an agent as a tool** (it advertises AI-tool params).

- **Auth:** ClickUp credential = a **personal token that starts `pk_`**, sent as the raw
  `Authorization` header value (**no `Bearer` prefix** — this trips people coming from OAuth APIs).
  For an internal bot acting as *one* account (e.g. Daniel's own tasks) the personal token is the
  right choice — generate it under Settings → Apps. **OAuth2 is only for a multi-user app** where
  each user authorizes their own Workspace: send them to
  `https://app.clickup.com/api?client_id={id}&redirect_uri={uri}`, then exchange the returned `code`
  at `POST https://api.clickup.com/api/v2/oauth/token` with `client_id` + `client_secret` + `code`
  (JSON or form-encoded body) → an access token used as `Authorization: Bearer {access_token}` that
  **doesn't expire**. Only Workspace owners/admins can create the OAuth app. Don't reach for OAuth on
  an internal single-account bot — it's pure overhead there.
- **ID hierarchy:** Workspace (the API calls it **`team`**) › Space › Folder › List › Task.
  "Get Many" tasks is scoped to a **List** (`GET /list/{list_id}/task`).
- **Dates are Unix epoch MILLISECONDS** (not seconds, not ISO) everywhere — `due_date`, `start_date`,
  and the `due_date_gt`/`due_date_lt` filters. Compute with
  `DateTime.now().setZone('Asia/Jerusalem').endOf('day').toMillis()`.
- **[CRITICAL gotcha] The native "Get Many → List" can't express "my tasks due this week" cleanly,
  and it paginates in pages of 100 silently.** For an assignee + status + due-window query, the right
  endpoint is **Get Filtered Team Tasks**: `GET /api/v2/team/{team_id}/task` with query params
  `assignees[]=USER_ID`, `statuses[]=...`, `due_date_lt=<epoch_ms>`, `include_closed=false`,
  `subtasks=true`, `order_by=due_date`. This is the one to reach for the "remind me of my tasks"
  build — do it with an **HTTP Request node**, not the native node, because the native node's filter
  UI doesn't cover the team-tasks endpoint's params. Responses cap at **100 tasks/page**; loop on
  `page` (0,1,2…) until a short page if the list can exceed 100.
- **[gotcha] Custom fields need the field's `id` (a UUID), not its name.** To set/read a custom field
  you must first know its id (`GET /list/{list_id}/field`). Same trap as Monday/Notion.
- **Rate limit:** **100 requests/min** per token (Free/Unlimited tier). 429 on exceed — enable Retry
  On Fail on read nodes.
- **Getting the IDs:** `GET /team` → workspace id; open a List in the browser and the URL has the
  list id; user ids come from `GET /team/{team_id}` (members array). Tell the user to grab these once
  and hardcode them in the workflow (they're stable).

### §2B — Airtable (native node; great Sheets replacement with real relations)

Node `n8n-nodes-base.airtable` (+ trigger). The natural upgrade from a Google-Sheets CRM when the
client needs linked records, views, and attachments.

- **Auth:** **Personal Access Token (PAT)** with explicit **scopes** — at minimum
  `data.records:read`, `data.records:write`, and `schema.bases:read`; the PAT must also be granted
  access to the specific base(s). An "insufficient permissions"/403 is almost always a missing scope
  or an un-granted base, not a code bug.
- **[CRITICAL gotcha] Empty fields are omitted from responses.** Airtable does **not** return any
  field whose value is `""`, `[]`, or `false`. So `$json.fields.SomeField` can be `undefined` simply
  because it was empty — guard every field read with `|| ''`. (To discover the full field list, read
  one fully-populated record.)
- **[gotcha] Linked records are an ARRAY OF RECORD IDS, not text.** To set a link field you pass
  `["recXXXXXXXX"]` (the linked row's record id), not the display name. You usually need a Search
  first to resolve a name → record id, then write the id.
- **Rate limit:** **5 requests/sec per base** (and 50/sec across all bases per token). 429 →
  **30-second** lockout (harsh). For bulk work, batch (Airtable takes up to **10 records per
  create/update request**) and/or put a Loop-Over-Items + ~250 ms Wait, or use the node's batching.
  Use `performUpsert` (match on a field) to find-or-create in one call.
- **Pagination:** lists return 100/page with an `offset`; the node's "Return All" handles the loop.

### §2C — Monday.com (native node; huge in Israel — GraphQL underneath)

Node `n8n-nodes-base.mondayCom` (+ trigger). API is **GraphQL** at `https://api.monday.com/v2`.

- **Auth:** API token in the `Authorization` header (**raw token, no `Bearer`**). API version is
  pinned via an `API-Version` header.
- **Hierarchy:** Board › Group › Item › Subitem; each board has typed **Columns**.
- **[CRITICAL gotcha] `column_values` is a JSON STRING, and dynamic values inside it break.** The
  single biggest Monday pain: `change_multiple_column_values` / `create_item` take a
  `column_values` argument that is itself a **JSON-encoded string** (a stringified object of
  `column_id → value`), so you're escaping quotes inside a GraphQL string. Static values work;
  the moment you interpolate an n8n expression *inside* that JSON the escaping collapses and you get
  `Invalid GraphQL request`. Fix: **build the column-values object in a Code node and
  `JSON.stringify` it**, then pass that single string into one variable — don't hand-concatenate
  expressions inside the GraphQL literal. Prefer GraphQL **variables** (`$columnValues: JSON!`) over
  inlining.
- **[gotcha] Columns are addressed by `column_id`, not title.** The id is a short slug
  (`status`, `text9`, `date4`) visible in column settings — not the human label. And each column
  **type** expects a different value shape (a `status` wants `{"label":"Done"}` or `{"index":1}`,
  a `date` wants `{"date":"2026-06-22"}`, etc.). Look up the board's columns first.
- **[gotcha] `board_id`/`item_id` are typed `ID!`** in current API versions — pass them as the right
  type or the mutation 500s.
- The native node hides some of this; for anything beyond simple create/update, an HTTP Request node
  posting GraphQL with variables is more predictable.

### §2D — Notion (native node; the "second brain" / docs DB)

Node `n8n-nodes-base.notion` (+ trigger). Good when the client runs their CRM/wiki in Notion.

- **Auth:** internal integration token; **the integration must be explicitly shared into each page/
  database** (Notion's per-resource sharing) or it sees nothing — a "no results"/404 is usually an
  unshared database, not a query bug.
- **[CRITICAL gotcha] Database properties are a typed nightmare — every property type has its own
  read/write shape.** A `title` is an array of rich-text objects; a `select` is `{name}`; a
  `multi_select` is `[{name}]`; a `date` is `{start}`; a `relation` is `[{id}]`; a `people` is
  `[{id}]`; a `number` is a bare number. Reading needs the same per-type unwrap. Map the target
  database's property types first and write a small per-property mapper in a Code node rather than
  guessing. The native node smooths common cases but exposes the raw shapes for the rest.
- **[gotcha] Pagination + rate.** Queries page at 100 with a `next_cursor`; Notion's API is ~3
  requests/sec average — enable Retry On Fail. Block ids and database ids are 32-char hex (with or
  without dashes).

### §2E — HubSpot (native node; the enterprise inbound-marketing CRM)

Node `n8n-nodes-base.hubspot` (+ trigger). Reach for it when an **enterprise client already runs
HubSpot** — its CRM, marketing, and deal pipeline are the system of record. Otherwise it's overkill
for an SMB.

- **Auth:** **Private App access token** (the modern path — a Bearer token scoped per object) or OAuth2
  for multi-portal. The legacy **API key (`hapikey`) is deprecated and being shut off** — don't build
  on it. Each Private App must be granted the exact scopes (`crm.objects.contacts.write`, etc.); a
  missing scope is a silent 403, not a helpful error.
- **[CRITICAL gotcha] Everything is keyed by internal `objectId`, and writes go through `properties`
  with the *internal* property name, not the label.** A contact's "First Name" is the property
  `firstname`; a custom field shows a friendly label in the UI but the API wants its internal name
  (lowercase, snake-ish, often auto-generated). Pull the property list
  (`GET /crm/v3/properties/contacts`) and map label→internal name first. Sending the label silently
  drops the value.
- **[CRITICAL gotcha] Associations between objects need association *type IDs*, not names.** Linking a
  contact to a company/deal is a separate associations call (`/crm/v4/objects/.../associations/...`)
  with a numeric/typed association definition — you can't just set a "company" field. For a
  contact→company link use the default association type; for custom ones, look up the type ID. This is
  the #1 HubSpot "the record saved but nothing's linked" failure.
- **[gotcha] Batch + rate.** Bulk reads/writes go through `/batch/` endpoints (up to 100/call). Rate
  limit ~100–190 req/10s depending on tier → 429 with a `Retry-After`; enable Retry On Fail. Search
  (`/crm/v3/objects/contacts/search`) is the way to find a record by email/phone — and it's eventually
  consistent, so a contact you just created may not appear in search for a few seconds (match by the
  returned `id` instead of re-searching).
- **Dedup match key:** email is HubSpot's natural unique key for contacts; for the Shift phone-first
  world, store the normalized phone in a custom property and search on it.

### §2F — Pipedrive (native node; the sales-pipeline CRM SMBs actually like)

Node `n8n-nodes-base.pipedrive` (+ trigger). A lighter, sales-focused CRM — common with Israeli sales
teams who want a real deal pipeline without HubSpot's weight. Good fit when the client's whole world is
**deals moving through stages**.

- **Auth:** **API token** (per-user, from Settings → API) as a query param `api_token`, or OAuth2 for
  marketplace apps. The token is **user-scoped** — data visibility follows that user's permissions, so
  a token from a limited user silently returns a partial dataset.
- **[CRITICAL gotcha] The core objects are Person / Organization / Deal / Activity, and a Deal needs a
  `stage_id` (which implies a `pipeline_id`) — moving a deal = changing `stage_id`, not a status
  field.** Stage IDs are integers tied to a specific pipeline; hard-coding a stage from one pipeline
  onto a deal in another fails. Fetch pipelines/stages (`GET /stages`) and map by name→id per pipeline.
- **[CRITICAL gotcha] Custom fields are referenced by a 40-char hash key, never the label.** Pipedrive
  exposes custom fields as auto-generated hex keys (e.g. `dcf558a�...`). Reading or writing one uses
  that key, not "Lead Source". Pull the field definitions
  (`GET /dealFields`, `/personFields`) and map label→key first — and the **value of an enum/set custom
  field is the option *id***, not its text.
- **[gotcha] Linking is by id, phone/email are arrays of `{value, label, primary}`.** A Person's phone
  is `[{value:"...", primary:true, label:"work"}]`, not a string — read `[0].value` / write the array
  shape. Associating a Deal needs `person_id` / `org_id` (integers).
- **[gotcha] Rate + pagination.** Token-bucket rate limit (budget per 2s); paginate with
  `start`/`limit` (and newer cursor pagination on some endpoints). Enable Retry On Fail. Webhooks are
  set per event (`added`/`updated` × object) and POST the full object — match deals back by `id`.
- **Dedup match key:** Pipedrive has a built-in search (`/persons/search?term=...&fields=phone`) — use
  it to find a Person by normalized phone before creating, to avoid duplicate contacts.

### PM/DB choice note

For a brand-new Shift Digital internal tool, **Google Sheets stays the default** (zero cost, the
team reads it directly, and the SDR write-back is already built). Reach for these when the **client
already lives in the tool**: ClickUp/Monday for task & project work, Airtable when they need real
relations/views/attachments beyond a flat sheet, Notion when their CRM/wiki is already there, and a
**dedicated sales CRM** when the client sells through a pipeline — **Pipedrive** for a lighter
deal-focused SMB sales team, **HubSpot** for an enterprise client whose marketing + sales + service
already live there. Don't migrate a client to a new platform to suit the build.

---

## PART 3 — Additional channels (beyond WhatsApp)

### §3A — Telegram (native node + trigger; the zero-friction second channel)

Node `n8n-nodes-base.telegram`; trigger `n8n-nodes-base.telegramtrigger`. Free, instant to set up,
and a clean alternative or addition to WhatsApp for internal bots, alerts, and approval flows.

- **Setup:** create the bot with **@BotFather** (`/newbot`) → it returns a **bot token**; paste it
  into a Telegram credential. Sends use the `sendMessage` operation (`chat_id` + `text`).
- **[CRITICAL gotcha] In group chats the bot only sees messages that @-mention it — unless you
  disable privacy mode.** Send **`/setprivacy` → Disable** to @BotFather for that bot, or a
  "summarize this group" bot receives almost nothing. (Direct analogue of the WHAPI `from_me` filter
  concern — a setup step that silently starves the trigger.)
- **[gotcha] The Telegram Trigger polls by default → a 1–3 minute delay.** It's not instant like a
  pushed webhook unless you configure a webhook. Fine for digests/alerts; flag it if the client
  expects real-time. Also: the workflow must be **active** for polling to run.
- **[gotcha] Use HTML parse mode, not Markdown.** `parse_mode: HTML` (`<b> <i> <code> <a>`) is
  reliable; Telegram's legacy Markdown silently fails on stray special characters in dynamic text.
- **IDs:** private group/supergroup ids are large **negative** numbers starting `-100…`; public
  channels can use `@channelusername`. Get a chat id from the Trigger output once. Limit: **30
  messages/sec**.

### §3B — Email (native nodes; the channel enterprise clients actually use)

For inbound: the **Gmail Trigger** (`n8n-nodes-base.gmailTrigger`) or a generic **IMAP Email** trigger;
for outbound: the **Gmail** node or **Send Email** (SMTP). Bigger clients run on email, not WhatsApp —
useful for lead intake from a contact form that emails, parsing inbound replies, and sending
confirmations/quotes. Parse inbound with a Code node (or feed the body to an agent for extraction).
SendGrid/Mailgun via HTTP Request when deliverability matters at volume.

---

## PART 4 — The "WhatsApp → task-summary bot" pattern (composition)

A high-value internal product: a bot that **reads messages in a WhatsApp (or Telegram) group, turns
the ones that are tasks into real tasks in ClickUp/Airtable/Monday, and sends a scheduled digest of
open tasks back to the group**. It composes pieces the skill already has — it's not a new primitive,
it's an assembly, so build it from the referenced patterns.

**Architecture (provider-agnostic):**
1. **Listen to the group.** WHAPI/Green API webhook (or Telegram Trigger with privacy **disabled**),
   filtered to the one target `chat_id`/group id, `from_me === false`. On WHAPI, parse the
   `messages[]` batch with a Code node (filter `from_me===false && type==='text'`, join) — and **do
   not stack a Supabase debounce on WHAPI** (it already groups). On Green API, the
   Supabase message-debounce buffer (**Pattern I**) is the right de-dup so a burst of rapid messages
   becomes one turn.
2. **Classify each message: task or not.** An AI node (Gemini Flash / GPT-4o-mini) returns strict
   JSON `{"is_task":true|false,"title":"…","assignee_hint":"…","due_hint":"…"}`. Keep the model
   cheap; this runs per message.
3. **Extract structure.** A Code node parses the JSON (same `[MARKER]`-style hard parse + reject-list
   guard as the order pipeline, so a prompt-instruction string never becomes a task title —
   `references/supabase.md` placeholder guard).
4. **Map the person.** WhatsApp **participant phone → platform user id** (ClickUp/Monday/Notion user
   id, or an Airtable collaborator). Keep a small phone→user lookup (a Sheet/Airtable/Supabase table);
   without it, assignees can't be set. This mapping is the step people forget.
5. **Write the task.** ClickUp `POST /list/{list_id}/task` (assignees = `[user_id]`, `due_date` =
   epoch ms), or Airtable create (linked assignee = `[recordId]`), or Monday `create_item`
   (`column_values` **built in a Code node and `JSON.stringify`d** — §2C). Use an idempotency key
   (message id) so a re-delivered webhook doesn't create the task twice.
6. **Daily/weekly digest back to the group.** A **Schedule Trigger**, day-of-week-gated exactly like
   **Pattern N** (a Code "is it digest time?" gate), reads open tasks (filtered team-tasks for
   ClickUp), formats a Hebrew RTL one-item-per-line summary (mind the bidi rule — `references/whapi.md`),
   and sends it to the group. Dedup over a `superseded`/sent marker so the same digest isn't sent
   twice in a polling window.

**The gotchas this build inherits (name them at design time):** WHAPI `messages[]` batching + the
"don't add a debounce" rule; the phone→user mapping gap; per-platform field-shape traps (ClickUp
epoch-ms + custom-field ids, Monday `column_values` stringify, Airtable empty-field omission +
linked-record arrays, Notion typed properties); webhook idempotency (message id) so re-delivery
doesn't double-create; and the RTL bidi digest formatting. Reuse Patterns I, J/K, M, N — this is an
assembly of them pointed at a PM tool instead of an invoice.
