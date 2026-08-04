# Common workflow patterns

Reusable shapes for the builds Shift Digital does most. Each lists the nodes and the wiring. Pick the
one closest to the request and adapt; combine pieces freely.

---

## Pattern A — Single AI agent + tools

The agent reads each message, remembers the conversation, decides what the user wants, and calls
tools when needed. Simplest conversational bot.

**Nodes:** Webhook (in) → IF (filter incoming) → Set (extract fields) → AI Agent → HTTP (reply out).
Sub-nodes on the agent: a chat model (`ai_languageModel`), **Simple Memory**
(`memoryBufferWindow`, `ai_memory`, `sessionKey` = sender phone, `contextWindowLength` ~10–20), and
one or more tools (`ai_tool`). Simple Memory is the bot default — zero setup, no DB. Swap it for
Postgres Chat Memory (same `ai_memory` slot, same session key) only when the client needs memory to
survive restarts or run across multiple workers; see `references/supabase.md`.

**Wiring:**
```
Webhook → IF → Set → Agent → Reply
model  --ai_languageModel--> Agent
memory --ai_memory-->        Agent     (Simple Memory by default; Postgres Chat Memory if persistent)
tool   --ai_tool-->          Agent     (repeat per tool)
```

Tools can be `toolHttpRequest` (call an API), `toolWorkflow` (call another workflow), or
`toolCode`. The agent decides routing internally — no Switch needed.

---

## Pattern B — Multi-agent with router (Option 1)

A deciding agent classifies the request and writes shared output (e.g. a caption), then a Switch
branches to specialist agents. Best when each branch needs genuinely different logic and you don't
want to pay for every branch every time.

**Nodes:** Webhook → IF → Set(extract) → Agent 1 (router+copy) → Set(parse JSON) → Switch →
{ branch: Agent 2 → generate; branch: Agent 3 → generate; branch: text → send } → Merge → send.

Agent 1 returns strict JSON like
`{"type":"image|video|text|question","topic":"…","caption":"…"}`; the Set node after it parses those
fields; the Switch routes on `type`.

**Shared knowledge, per-agent role:** put one identical brand-knowledge block at the top of every
agent's `systemMessage`, then a short role-specific section. Editing the brand in one place (and
pasting to each) is how you reuse the workflow across clients.

**Shared memory:** connect one memory node to the router agent (it holds the conversation context) —
Simple Memory by default, or Postgres Chat Memory if it must persist; specialist agents are usually
stateless prompt-builders.

**Wiring note:** each agent still needs its own `ai_languageModel` connection (can be the same
credential). Switch outputs use `src_index` 0/1/2; branches recombine into a Merge using distinct
`dst_index`.

---

## Pattern C — Approval gate (human in the loop)

Generate something, send it for approval, pause, and only act on a yes. Splits into two flows joined
by a Wait node.

**Flow A:** … generate … → send preview with approve/reject buttons →
**Wait** (`resume: webhook`) — the workflow freezes here, holding state.
**Flow B (resumes on reply):** IF (which button) → if approved: do the action (publish, etc.) →
confirm; if rejected: offer a new version.

The Wait node set to resume-on-webhook is purpose-built for approval. State (the generated content,
ids) is preserved across the pause. If multiple items can be pending, include a reference id in the
preview so the reply maps to the right paused run.

---

## Pattern D — Lead capture / data write

No AI needed. Trigger → shape data → write to a store → optional notify.

**Nodes:** Webhook or Form trigger → Set/Code (normalize fields) → Google Sheets (append) or
Supabase/Postgres (insert) → optional HTTP (Slack/WhatsApp notify).

Straightforward `main` wiring throughout. Use the native node where one exists (Google Sheets,
Postgres); fall back to HTTP Request for services without a node.

---

## Pattern E — Content generation pipeline (image)

The generation half used inside Patterns A/B.

**Nodes:** (prompt source) → prompt-engineer Agent (returns JSON with positive + negatives +
aspect) → Set (fold negatives into one prompt string: `positive + '. Avoid: ' + negative.join(', ')`)
→ HTTP to Nano Banana Pro (`gemini-3-pro-image:generateContent`, `responseModalities:['IMAGE']`) →
Convert to File (base64→binary) → HTTP uploadFile (Green media host) → Set (grab urlFile) →
sendFileByUrl.

For brand consistency and a non-AI look, add an `inlineData` part (base64 of a real product photo)
alongside the text part in the generation call.

---

## Pattern F — Content generation pipeline (video)

**Nodes:** (prompt source) → prompt-engineer Agent (single rich Veo-structured prompt) → HTTP start
Veo (`veo-3.1-fast-generate-preview:predictLongRunning`) → Wait (~60s) → HTTP poll the operation
name → Set (extract video uri) → deliver.

Veo is long-running: you start it, wait, then GET
`https://generativelanguage.googleapis.com/v1beta/{operation.name}`. Clips are ~8s. See the video
caveat in `green_api.md` about hosting before sending.

---

## Pattern G — SDR / booking agent (WhatsApp → calendar + CRM)

A conversational agent that qualifies a lead, then books a real calendar event and writes to a
Sheets CRM. Also supports a second "admin" agent that books manually on a manager's command. This is
the most gotcha-dense pattern — read `ai_tool_gotchas.md` before building it.

**Nodes:** Webhook (Green API in) → Switch (manager vs lead) → Set (extract) → Agent → reply.
On the agent: chat model (`ai_languageModel`), memory (`ai_memory`, phone-keyed — Simple Memory is
fine for the chat thread; use Postgres Chat Memory on the client's Supabase if the lead conversation
must persist across restarts), and calendar tools
(`ai_tool`): a `googleCalendarTool` in **availability** mode and one in **create** mode. If the CRM
is Supabase rather than Sheets, write leads with a **Postgres node (upsert on phone) via the pooler**,
not the Supabase REST node — see `references/supabase.md`.

**Wiring + must-dos:**
- Tool nodes named ASCII-only (`Check_Availability`, `Book_Call`) — §1.
- Calendar field on every calendar node = **By ID, plain string**, not "From list" — §3.
- `Start`/`End`/`Summary`/`Description` via `$fromAI` with a live `$now` anchor on the date fields,
  distinct keys, and a summary fallback — §4.
- CRM auto-updates without extra write code: a `googleCalendarTrigger` on `eventCreated` watches the
  same calendar, so both bot-booked and manually-booked events fan out to a "parse description → write
  Sheets row" tail. The booking agent never writes the meeting row itself.
- The event **description** is the integration contract: write labelled lines
  (`שירות מבוקש:`, `טלפון: 972…`, …) so the trigger tail and the reminder pattern can parse them.

**Two-agent admin variant:** a separate manager-only agent (gated by a Switch on sender phone) shares
the same calendar tools but adds a Sheets-update path behind a confirm gate. Manager says "book X" →
agent checks availability, warns if busy, confirms, then calls the create tool. A routing Code node
distinguishes a JSON write-command from plain reply text, and (per §2) filters any tool-call trace.

---

## Pattern H — Reminder N-minutes-before (dedup'd)

Remind people before a calendar event without double-sending. Works for events created by anything
(a bot, a human, another flow) because it reads the calendar, not the booking path.

**Nodes:** Schedule Trigger (every 15 min) → Google Calendar `getAll` (window `now`..`now+2h`,
`singleEvents: true`, tz Asia/Jerusalem, **By ID** calendar) → Code (filter + dedup) →
fan-out HTTP sends; gate the client send behind an IF that checks a phone was found.

**The Code node** (Luxon `DateTime` is global — no `require`, §5):
- keep only events `55 ≤ minutesUntil ≤ 65` (a 15-min cron catches each once);
- dedup with `$getWorkflowStaticData('global')` — store fired event ids, skip seen ones, prune >24h;
- parse phone/fields from the event description; if no phone, skip the client send but still notify
  the team (resilient to missing data).

---

## Pattern I — Message debounce buffer + human takeover (Supabase)

Merge a customer's rapid-fire messages into one agent turn, and let a human silently take over a
chat for a window. This is the T-CENTER / BRJewelry sales-bot shape. **It is gotcha-dense — most of
the bugs are silent (no error, just wrong behavior)** — so wire it exactly as below.

**First, a provider check that changes everything:** this debounce is built for **Green API**, where
each inbound message is a **separate webhook**, so you need a buffer to group them. **WHAPI already
batches** rapid messages into one `messages[]` array (see `references/whapi.md` → "WHAPI batches
messages"), so on WHAPI you usually **don't need this pattern at all** — just merge `messages[]` in
the extract Code node and go straight to the agent. Only use the Supabase buffer below on WHAPI if
you've **observed** the client's messages routinely arriving as separate webhooks. Stacking this on
top of WHAPI's own batching is the cause of "buffer never clears / bot answers stale messages / bot
replies several times."

### The buffer half (debounce)

**Table** `message_buffer`: `id` (int8 PK), `chat_id` (text), `message` (text), `created_at`
(timestamptz, default `now()`).

**Flow:** `Webhook → IF (incoming) → Extract Fields (Code) → Buffer: Insert → Wait 6s →
Buffer: Get All → Debounce: Am I Last? → Buffer: Clear → Agent → …`

- **Insert** (`Create` row): `chat_id = {{ $json.chatId }}`, `message = {{ $json.userText }}`.
- **Wait 6s** — fixed debounce window.
- **Get All** (`Get Many`, Return All): filter `chat_id = {{ $('Extract Fields').item.json.chatId }}`.
- **Debounce: Am I Last?** (Code) — compare this run's message/time to the rows fetched; if a newer
  buffered message exists, `return []` (this run loses, the later one will answer). Otherwise merge
  all buffered `message` rows into one `mergedText` and pass on. "Last message wins."
- **Clear** (`Delete` row): filter `chat_id = {{ $('Extract Fields').item.json.chatId }}`.

**The four silent bugs (all observed in production):**

1. **`chatId` must be the SAME expression in Insert, Get All, and Clear.** If Insert writes
   `Extract Fields.chatId` (normalized, e.g. `…@s.whatsapp.net`) but Clear deletes by a raw
   `$('Webhook').body.messages[0].chat_id`, the delete **matches nothing**, the buffer never empties,
   and every new message re-pulls the whole pile → the bot answers old messages. Pick one source —
   `{{ $('Extract Fields').item.json.chatId }}` — and use it verbatim in all three nodes. Verify by
   reading the actual value in the Supabase table vs the value the Clear node tries to delete.

2. **A Supabase node that returns ZERO items halts the chain silently — this is NOT only Delete.**
   Any Supabase node that legitimately yields no rows stops the flow with **no error** when
   *Always Output Data* is off:
   - **Delete** on success emits no items.
   - **Get Many (getAll) used as a GATE** returns 0 rows when there's no match. The canonical case:
     a **`Check Human Mode` getAll on `human_mode`** — when the table is empty / has no row for this
     chat (the *normal* state, i.e. no human has taken over), it returns 0 items and the next node
     (e.g. `Bot Allowed?`) **never runs**, so the bot goes dead-silent on a perfectly normal message.
     This is a real T-CENTER outage we hit: a chat with no `human_mode` row stopped replying, while a
     chat that happened to have a row worked.
   On **every** Supabase node whose empty result must still flow — Delete **and** any getAll gate —
   set **Settings → Always Output Data: ON**. The node then shows "will output an empty item if
   nothing would normally be returned," and the downstream gate (which already handles the empty
   case) gets to run. Treat "the bot silently stops on some chats but not others" as this bug until
   proven otherwise.

3. **"Extract Fields" must be a CODE node, not a Set node in JSON mode.** A Set node set to Mode=JSON
   does **not** execute JavaScript — paste `const msgs = …` there and it's treated as malformed JSON
   (red error, no output). The field-merge needs real JS (`.filter().map().join()`), so it must be a
   `n8n-nodes-base.code` node. If you swap a Set node for a Code node, **keep the name exactly
   `Extract Fields`** — other nodes reference `$('Extract Fields')`, and a renamed node throws
   *"Referenced node doesn't exist."*

4. **Clear must run AFTER Get All and BEFORE the agent replies** — never after. If the Clear sits
   downstream of the agent (so it deletes once the bot's own reply has been buffered), the customer's
   messages aren't cleared before the next turn and accumulate. Position: `Get All → Am I Last? →
   Clear → Agent`.

### The human-takeover half

Let a human grab a chat: when a **human** sends from the business number, suppress the bot for N
minutes (auto-returns after the window, resetting on each human message).

**Table** `human_mode`: `chat_id` (text), `active` (boolean), `updated_at` (text/timestamptz,
default `now()`).

- **Mark Human Mode** (`Create` row on `human_mode`) when a human-sent message is detected:
  `chat_id`, `active = {{ true }}`, `updated_at = {{ $now.toISO() }}`. Supabase has no upsert via the
  REST node, so precede it with a **Clear Old Human** (`Delete` where `chat_id = …`) so you replace
  rather than stack rows — and that Delete also needs **Always Output Data: ON** (bug #2).

  > **⚠️ The silent refresh-failure (this WILL bite — `human_mode.chat_id` is a PRIMARY KEY).**
  > Because `chat_id` is the PK, the `Create` node **inserts fine the first time** and then **fails
  > on every later message in that chat** (duplicate key). If the Create has
  > `onError: continueErrorOutput`/`continueRegularOutput`, that failure is **silent** — so
  > `updated_at` freezes at the *first* takeover and never refreshes. The window then expires
  > `WINDOW_MIN` after the human's **first** message even though they're still actively replying
  > (classic with a human who answers by **voice notes** — "owner sends voice but the bot keeps
  > talking"). The delete-then-insert only saves you if the Delete actually targets the row — and a
  > **corrupted/empty filter is the usual culprit**: a Supabase filter value of just `"="` is an
  > expression with an empty body → resolves to `''` → deletes `WHERE chat_id=''` → **0 rows**, so
  > the insert still hits the PK and fails. Diagnose by reading the table: if `human_mode.updated_at`
  > is stale and doesn't match the human's latest message time (cross-ref the `inbox` audit log,
  > see `references/debugging.md`), the refresh is broken.
  > **Fix, best → ok:** (a) **true upsert** — replace Clear+Create with one Supabase **REST** call
  > (`POST /rest/v1/human_mode`, header `Prefer: resolution=merge-duplicates`) or a **Postgres**
  > `INSERT … ON CONFLICT (chat_id) DO UPDATE SET active=true, updated_at=now()` — single node,
  > race-free, refreshes every time. (b) keep delete-then-insert but **point the Delete filter at the
  > real chat** (`={{ $('Extract Chat (Agent)').item.json.chatId }}`) with Always-Output ON; works,
  > but has a tiny race (a concurrent gate read between delete and insert sees 0 rows).
  > **Takeover detection is type-agnostic:** fire on `from_me === true && source !== 'api'`
  > (a human at the business number from `mobile`/`web`; the bot's own sends are `source: 'api'`).
  > **Do not** filter by message `type` — voice/image/action from the owner all count as a human
  > grabbing the chat (see whapi.md "from_me / source matrix").
- **Bot Allowed?** (Code, before the agent) reads `human_mode` rows for this chat and silences the
  bot only inside the window:
  ```javascript
  const rows = items.map(i => i.json).filter(r => r && r.chat_id);
  const WINDOW_MIN = 10;
  let silenced = false;
  for (const r of rows) {
    if (r.active === true && r.updated_at) {
      const ageMin = (Date.now() - new Date(r.updated_at).getTime()) / 60000;
      if (ageMin < WINDOW_MIN) { silenced = true; break; }
    }
  }
  if (silenced) { return []; }     // inside window → bot stays quiet
  // …otherwise pass the merged turn through to the agent
  ```
  **Gotcha:** this auto-returns the bot after `WINDOW_MIN`. If you observe the bot resuming "too
  early," check `updated_at` freshness — a stale timestamp (human spoke 49 min ago) correctly makes
  `ageMin > WINDOW_MIN` and the bot resumes. If you want a **hard** takeover (bot stays off until
  manually cleared), drop the age check and silence on `active === true` alone.

### Media branch parity

If the bot also handles inbound media, the media branch has its **own** buffer/clear nodes
(`Media: Get Buffer`, `Media: Clear Buffer`, `Media: Am I Last?`). Every rule above applies to them
too — same `chat_id` source across its Insert/Get/Clear, and **Always Output Data: ON** on its Delete.
A common miss is fixing the text branch's Clear but leaving the media branch's Clear on a different
chatId source or with Always-Output off.

---

## Pattern J — Order-state machine (idempotent invoicing: reuse / replace / paid-gate)

The shape that turns a one-shot "create an invoice and send a link" into a **durable order state**
that survives the customer asking again, changing their mind, or paying. Built on EZcount (see
`references/payments_hyp.md` §10) but the logic is provider-agnostic. **Keep it INLINE in the
Processor** on the `IF Order Closed[true]` branch (a sub-workflow needs the parent's `Parse Order`
data and the hand-off breaks — see `references/subworkflows.md`).

**Why:** without state, every "אפשר לינק שוב?" creates a **new invoice** (duplicate documents), and a
customer who already **paid** can be re-charged. This pattern fixes both.

**`orders` table (additive columns on top of `chat_id`):** `doc_uuid` (text), `payment_link` (text),
`order_hash` (text), `order_snapshot` (jsonb), `total` (numeric), `status` (text check
`open|paid|cancelled|superseded`, default `open`), `updated_at` (timestamptz default now()); index
`(chat_id, status, created_at desc)`.

**Flow:** `IF Order Closed[true] → Lookup Orders → Decide → IF Reuse / IF Route Human / IF Replace →
(Create EZcount Invoice → Build Payment Link → Insert Order Row) → Payment Ready → Send Link → …`

- **Lookup Orders** (Supabase getAll `orders` where `chat_id = $('Parse Order').item.json.chatId`,
  **Always Output Data ON** — empty is normal for a first order).
- **Decide** (Code) — compute a stable `order_hash` from the order contents (product, qty, sizes,
  delivery, address, graphic, invoice_name, total) with a tiny pure-JS hash (djb2 — **don't**
  `require('crypto')` on locked-down instances), take the latest order row, and branch:
  ```javascript
  const src = $('Parse Order').first().json;
  function h(s){let x=5381;for(let i=0;i<s.length;i++){x=((x<<5)+x)+s.charCodeAt(i);x&=0xffffffff;}return (x>>>0).toString(16);}
  const snapshot = { product:src.o_product, quantity:src.o_quantity, sizes:src.o_sizes,
    delivery:src.o_delivery, address:src.o_address, graphic:src.o_graphic,
    invoice_name:src.o_invoice_name, total:Number(src.total)||0, desc:src.desc };
  const newHash = h(JSON.stringify(Object.values(snapshot).slice(0,8)));
  const rows = items.map(i=>i.json).filter(r=>r&&r.chat_id)
                    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
  const latest = rows[0]||null;
  let action;
  if(!latest) action='new';
  else if(latest.status==='paid') action='route_human';           // never re-charge
  else if(latest.status==='open' && latest.order_hash===newHash) action='reuse'; // same order
  else if(latest.status==='open') action='replace';               // changed → new invoice
  else action='new';                                              // cancelled/superseded
  return [{ json:{ chatId:src.chatId, action, newHash, snapshot,
            existingId: latest?latest.id:null, existingLink: latest?(latest.payment_link||''):'' } }];
  ```
- **reuse** → resend the **stored** `existingLink`, create **no** new invoice (this is the whole
  point — kills duplicate documents on "send it again").
- **replace** → `Supersede Old` (Supabase update old row `status='superseded'`) → create a fresh
  invoice. A `type:300` proforma has **no binding accounting meaning**, so superseding is free — no
  credit note needed (that's only for issued tax invoices).
- **route_human** → set `human_mode` active (bot goes quiet) + send "ההזמנה כבר שולמה — נציג ייצור
  קשר", create nothing. The paid-gate's real purpose is **preventing a double charge**, not legal.
- **new / replace** → `Create EZcount Invoice → Build Payment Link → Insert Order Row` (status
  `open`, with `doc_uuid`, `payment_link`, `order_hash`, `order_snapshot`, `total`).
- **Converge** the reuse path and the new/replace path into one `Payment Ready` Set
  (`{chatId, paymentLink}`) so everything downstream (`Send Payment Link`, `Send Design Info`, the
  order email) references a **single** node — don't reference a branch node that only ran on the
  other path (it resolves to undefined and throws).

**Where `status='paid'` comes from:** a separate **Payment Receiver** — enable EZcount's
"send info on document creation" webhook, filter to the **paid** document (the tax-receipt /
חשבונית מס קבלה auto-created on payment — verify its exact `type` from one real payload, it is **not**
300), match the open order **by customer phone = chat_id**, and set `status='paid'`. Until that
webhook is wired, orders stay `open` and only the reuse/replace/new branches fire (the paid-gate is
dormant but harmless). State this honestly in delivery.

---

## Pattern K — Durable ack-fast Receiver + inbox idempotency (load/restart resilience)

Decouple "accept the message" from "process the message" so a burst, a restart, or a provider retry
storm can't drop or double-handle a conversation — ~80% of queue-mode durability at near-zero RAM,
because durability lives in a **Postgres row**, not in n8n execution state.

**`inbox` table:** `id`, `message_id` (text **UNIQUE** = idempotency key), `chat_id`, `payload`
(jsonb), `status` (`new|processing|done|failed` default `new`), `attempts`, `error`, `created_at`,
`processed_at`.

- **Receiver** (its own workflow): `Webhook (respond **immediately**, onReceived/instant 200 — this
  alone kills WHAPI/Green retry storms) → Extract Inbound (Code, pull message_id + chat_id) →
  Inbox: Insert (Supabase; set the node **onError: continueRegularOutput** so a duplicate
  `message_id` is a harmless no-op via the UNIQUE constraint) → Prep (Code, reconstruct
  {message_id, chat_id, body} since the Supabase insert replaced $json) → Execute Workflow →
  Processor`. Reuse the real Supabase credential id so it auto-wires on import.
- **Processor** (the existing brain as a sub-workflow): trigger = `executeWorkflowTrigger` named to
  preserve existing `$('Webhook (WHAPI In)')` refs, **Input data mode = Accept all data** (see
  `references/subworkflows.md` for the hand-off rules), then the unchanged logic + the human-gate
  fix + the order-state machine (Pattern J).
- **Reconciliation** (schedule): catch up from the provider's recent-messages endpoint
  (WHAPI `/messages/list`, short window — WHAPI doesn't store long), sweep `inbox` rows stuck in
  `processing`, and ping `checkHealth`. Idempotency note: the UNIQUE `message_id` prevents duplicate
  **rows**, not duplicate **processing** — add a processing-level skip (mark `processing`/`done`) if
  you re-drive the inbox.

**Staging:** Phase 1 = inbox + Receiver + Processor + human-gate fix + Flash model. Phase 2 =
Reconciliation + Payment Receiver + order-state machine. Phase 3 = ops hygiene (disable
save-successful-executions on the Receiver/poller, tighten pruning). Phase 4 = queue mode **only** if
OOM actually appears. Don't jump to queue mode for durability you can get from the inbox row.

---

## Pattern L — Dual-tier human silencing (manual vs paid keyword)

An extension of Pattern I's takeover. Sometimes the owner doesn't just "grab the chat for a few
minutes" — they type a **payment keyword** ("שולם" / "הלקוח שילם" / "סגור") that means *this customer
is done, silence the bot for the rest of the day*. Two different silence windows from one detector.

**Schema:** add `silenced_until timestamptz` to `human_mode` (keep `active`, `updated_at`). The
deadline is now **explicit** instead of computed from `updated_at + WINDOW_MIN`.

**The detector node** (`Classify Takeover`, Code) runs on the takeover branch (the same
`from_me === true && source !== 'api'` IF — see Pattern I; never fires on customer messages):
```javascript
const msg = $('Webhook (WHAPI In)').item.json.body.messages[0];
const chatId = msg.chat_id;
const text = (msg.text && msg.text.body ? msg.text.body : '').toString();
const PAY = /(שולם|שילם|שולמה|סגור|סגורה|נסגר|נסגרה|הלקוח שילם)/;
const isPaid = PAY.test(text);
let until;
if (isPaid) {
  // start of TOMORROW, Israel time — NOT "now + 24h"
  until = DateTime.now().setZone('Asia/Jerusalem').plus({ days: 1 }).startOf('day').toISO();
} else {
  until = DateTime.now().plus({ minutes: 30 }).toISO();  // ordinary manual takeover
}
return [{ json: { chatId, isPaid, silencedUntil: until } }];
```
- **"Until next calendar day" ≠ "+24h".** A payment at 14:00 should free the bot at **midnight**, not
  at 14:00 tomorrow. Use `.plus({days:1}).startOf('day')` in the **business timezone**, never a fixed
  millisecond offset. This is the single most common mistake in this pattern.
- **Keyword regex must be tight.** A loose `שילם` matches the owner *quoting* a customer
  ("הוא אמר שכבר שילם והכרטיס לא עבר") and silences a live chat for a day. Anchor to short owner
  messages or a dedicated word list; don't match mid-sentence in long quoted text.

**The gate** (`Bot Allowed?`, Code, before the agent) reads `silenced_until` with a legacy fallback:
```javascript
const rows = items.map(i => i.json).filter(r => r && r.chat_id);
const WINDOW_MIN = 30; // fallback for rows written before silenced_until existed
let silenced = false;
for (const r of rows) {
  if (r.active !== true) continue;
  if (r.silenced_until) {                       // new path: explicit deadline
    if (Date.now() < new Date(r.silenced_until).getTime()) { silenced = true; break; }
  } else if (r.updated_at) {                     // legacy path
    const ageMin = (Date.now() - new Date(r.updated_at).getTime()) / 60000;
    if (ageMin < WINDOW_MIN) { silenced = true; break; }
  }
}
if (silenced) return [];
```
**Write it with the PK-safe upsert from Pattern I** (delete-then-insert with the *real* chatId filter
+ Always-Output, or a REST `merge-duplicates`). The paid branch off the order-state machine
(Pattern J) writes the same way, with `silenced_until` = start of tomorrow.

---

## Pattern M — Media caption → agent (so it doesn't re-ask)

The media branch (Pattern I "media branch parity") is **separate** from the agent conversation: an
inbound image is stored and emailed, while the agent only receives a synthetic sentinel like
`[המערכת: הלקוח שלח גרפיקה]`. If the customer typed a **caption** on the image ("זה מקדימה בגדול"),
that caption lands in the DB and the email — but **not** in the sentinel — so the agent never sees it
and **asks again** "where should we print it?". The data is correct; the agent is just blind to it.

**Symptom:** customer sends image+caption, team email shows the caption fine, but the bot still asks
the question the caption already answered. Verifying the DB *confirms* the caption saved — which is
exactly why it's confusing. It's an **architecture** gap (two parallel branches), not a parse bug.

**Fix — make the sentinel caption-aware** in *both* places that write it (the buffer row the agent
reads **and** the parallel Set/handoff node — a common miss is fixing one and not the other). WHAPI
puts the caption on the media object, so thread it Extract Media → To Base64 → into the sentinel:
```
={{ $('To Base64').item.json.caption
   ? '[המערכת: הלקוח שלח גרפיקה. מיקום ההדפסה שכתב הלקוח: "' + $('To Base64').item.json.caption + '"]'
   : '[המערכת: הלקוח שלח גרפיקה]' }}
```
Then add one prompt line: *if the sentinel includes a stated location, acknowledge it and **don't**
re-ask; only ask if no location is present.* Carry `caption` through every Code node on the media
path (Extract Media → To Base64 → Graphics: Insert column → Build Attachments) — a dropped field
anywhere makes the ternary fall back to the no-caption branch silently.

---

## Pattern N — Daily summary to a group (day-of-week gated, dedup'd)

Post an end-of-day digest to a WhatsApp group **N minutes after closing**, where closing time varies
by weekday and some days are closed entirely (Israeli week: Sun–Thu full, Fri short, Sat closed).
Reads the orders table, not the order path, so it's fully decoupled from the live bot.

**Flow:** `Schedule Trigger (every 30 min) → Is Summary Time? (Code gate) → Get Today Orders
(Supabase getAll, structured gte filter, Always-Output ON) → Build Summary (Code) → Send to Group
(HTTP)`.

**The time gate** — fire only in the one 30-min tick that matches *today's* closing+offset
(Luxon weekday: **Mon=1 … Fri=5, Sat=6, Sun=7**):
```javascript
const now = DateTime.now().setZone('Asia/Jerusalem');
const dow = now.weekday;
let targetH, targetM;
if (dow === 6) return [];                          // Saturday: no summary
else if (dow === 5) { targetH = 14; targetM = 30; } // Friday close 14:00 → 14:30
else { targetH = 17; targetM = 0; }                 // Sun(7)+Mon–Thu(1-4) close 16:30 → 17:00
if (now.hour !== targetH) return [];
if (targetM === 0  && now.minute >= 30) return [];
if (targetM === 30 && now.minute <  30) return [];
return [{ json: { dayStartUtc: now.startOf('day').toUTC().toISO(),
                  todayLabel: now.toFormat('dd/MM/yyyy') } }];
```
- **Verify the engine's weekday numbering before trusting the mapping.** Luxon is Mon=1…Sun=7;
  JS `Date.getDay()` is Sun=0…Sat=6. Getting this wrong sends the digest on the wrong day, silently.

**Build (dedup + status split)** — the orders table accumulates `superseded` rows (every edit is a
new row), so a naive count multiplies one customer. Filter to the latest real state and one row per
chat:
```javascript
const rows = items.map(i => i.json).filter(r => r && r.chat_id);
const start = new Date($('Is Summary Time?').item.json.dayStartUtc).getTime();
const live = rows.filter(r => new Date(r.created_at).getTime() >= start
  && !['superseded','cancelled'].includes((r.status||'').toLowerCase()));
if (live.length === 0) return [];                  // empty day → send nothing
const byChat = {};                                 // keep most-recent per customer
for (const r of live) {
  const k = r.chat_id;
  if (!byChat[k] || new Date(r.created_at) > new Date(byChat[k].created_at)) byChat[k] = r;
}
const orders = Object.values(byChat);
const paid   = orders.filter(r => (r.status||'').toLowerCase() === 'paid');
const unpaid = orders.filter(r => (r.status||'').toLowerCase() !== 'paid');
```
- **`Get Today Orders` is a getAll gate → Always-Output-Data ON** (Pattern I bug #2): an empty day
  must still flow to Build, which returns `[]` and sends nothing. Without it the chain halts and a
  zero-order day is indistinguishable from a broken trigger.
- **Privacy in the digest:** when listing unpaid customers, prefer **first name + phone**, no chat
  deep-link, no full legal name — a group may have members who shouldn't see the full CRM. Strip
  placeholder names (see the placeholder-guard gotcha in `supabase.md`) and fall back to phone-only.
