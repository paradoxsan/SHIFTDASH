# WHAPI (Whapi.Cloud) — method catalog and n8n payload shapes

Whapi.Cloud is an **unofficial linked-device WhatsApp gateway** (a WhatsApp Web–style
session paired by QR/pairing code, kept alive on Whapi's backend sockets). It fills the
**same architectural slot as Green API** in this skill — incoming via a webhook, outgoing
via HTTP — so everything the skill already does for Green API bots applies, just with
different endpoints and a different (and frankly nicer) media model. No Meta approval, no
per-message fees, full WhatsApp feature surface (buttons, lists, stories, channels,
groups, communities, catalogs/orders).

Base URL (single host for everything, including media):

```
https://gate.whapi.cloud
```

Spec this reference was built from: WhatsApp API **v1.8.7**, OpenAPI at
`github.com/Whapi-Cloud/whatsapp-api-docs` (`openapi.yaml`). Interactive reference:
`whapi.readme.io`. Help desk: `support.whapi.cloud` (append `.md` to any page URL for a
clean Markdown version). One **channel** = one WhatsApp number/session.

Use obvious fakes in templates: token `FAKE_WHAPI_TOKEN_xxxxxxxx`.

---

## Authentication

Every request authenticates with the **channel token** (one token per WhatsApp number).
Two equivalent ways:

- **Bearer (use this):** header `Authorization: Bearer <token>`.
- **Query param:** `?token=<token>` appended to the URL.

In n8n, on the HTTP Request node set **Authentication → Generic → Header Auth** (or the
predefined **Bearer Auth** credential type) with `Authorization` = `Bearer FAKE_WHAPI_TOKEN_xxx`.
Flag the token as a placeholder in delivery notes. Never put the token in the prompt or a
Code node — keep it in the credential or `$env`.

---

## IDs and the `to` field (read this once)

The `to` field on every send accepts **either** a bare international phone number (digits
only, **no `+`**) **or** a full Chat ID — the docs are explicit that either works. Pattern:
`^[\d-]{9,31}(@suffix)?$`. The suffixes:

- **Private chat:** `<phone>@s.whatsapp.net` (e.g. `972501234567@s.whatsapp.net`).
  Older `@c.us` form is still seen in some payloads.
- **Group:** `<groupid>@g.us`. Get the id from **GET /groups**.
- **Channel / newsletter:** `<id>@newsletter`.

So `"to": "972501234567"` and `"to": "972501234567@s.whatsapp.net"` are equivalent. For a
bot replying to an inbound message, just echo back the inbound `chat_id`.

---

## Two ways to wire WHAPI into n8n

**A. Community node `n8n-nodes-whapi`** (Whapi-Cloud). Covers basic ops (send text/media,
get message by id, check phone) and trigger events (message/group events). Clean, but it's
a community node → **requires install on a self-hosted instance** (Settings → Community
Nodes → `n8n-nodes-whapi`) and won't exist on locked-down/n8n Cloud setups. Flag the
install in delivery, and note the node only wraps a subset of the API.

**B. Core Webhook node + HTTP Request nodes (recommended default).** Version-stable, works
on any n8n, and exposes the *entire* API. This is the same shape the skill already uses for
Green API, so prefer it unless the user explicitly wants the community node. The rest of
this reference assumes path B.

---

## Receiving — the trigger (webhook)

1. Add a core **Webhook** node (HTTP method **POST**). Copy its Production URL (for testing,
   the Test URL only listens while "Listen for test event" is active and the workflow must
   be **Active** for the Production URL to accept posts).
2. Point the channel at that URL — either in the dashboard (channel → Webhooks) or via the
   API (**PATCH /settings**, see below). Enable the events you want (at minimum `messages`).
3. WHAPI POSTs an envelope. The body is an object keyed by event type, each value an array:

```
{
  "messages":          [ <Message>, ... ],   // event "messages" (post = incoming, put = your sent echo)
  "statuses":          [ <Status>, ... ],    // delivery/read acks
  "chats":             [ <Chat>, ... ],
  "chats_updates":     [ ... ],
  "contacts":          [ ... ],
  "groups":            [ <Group>, ... ],
  "groups_participants":[ <ParticipantEvent>, ... ],
  "presences":         [ ... ],
  "channel_id":        "XXXX-ABCDE",
  "event":  { "type": "messages", "event": "post" }
}
```

**Extracting the inbound message in n8n** (Set / Code / agent input):

- message object: `{{ $json.body.messages[0] }}`
- chat id (reply target): `{{ $json.body.messages[0].chat_id }}`
- sender wa id: `{{ $json.body.messages[0].from }}`
- sender name: `{{ $json.body.messages[0].from_name }}`
- text body: `{{ $json.body.messages[0].text.body }}`
- type: `{{ $json.body.messages[0].type }}`

**Critical loop-guard:** the `messages` array also fires for **your own outgoing** messages
(`from_me: true`) when the event method is `put`. Filter to inbound only — an IF / Filter
node on `{{ $json.body.messages[0].from_me }} === false` (or only act on `event.event === "post"`).
Skipping this makes the bot reply to itself. (Green API users: this is the equivalent of
filtering `typeWebhook === 'incomingMessageReceived'`.)

**Webhook delivery `mode`** (per webhook): `body` (default — everything in the JSON body,
what n8n wants), `path`, or `method`. Keep `body`. Up to 5 custom `headers` can be attached
to the webhook (e.g. an `Authorization` your n8n validates).

### ⚠️ WHAPI batches messages — `messages[]` can hold MORE THAN ONE message

This is the single biggest source of "the bot answers weird / replies to old messages /
sends many messages at once" bugs, and it is **specific to WHAPI** (Green API delivers one
message per webhook). Straight from the docs:

> *"The messages array contains all messages that were sent to the webhook URL."*

When a customer fires several messages in quick succession, WHAPI may coalesce them into a
**single webhook** whose `messages` array has multiple items (`messages[0]`, `messages[1]`,
`messages[2]`, …). It may also split them across multiple webhooks if they arrive far
enough apart — the timing is not under your control. **Never assume `messages[0]` is the
whole story.** Two consequences you must design for:

1. **`messages[]` is mixed-type and may include non-text.** The same array can contain a
   `text`, an `image`, a `voice`, a `sticker`, an `action` (reaction/edit), etc. — see the
   Message-object table. A naïve `messages.map(m => m.text.body)` throws on the first
   non-text item or silently produces `undefined`. **Filter first**, then map.
2. **Status/echo events ride the same envelope shape.** `from_me: true` echoes and
   `statuses` updates arrive too. Acting on them re-triggers the agent on the bot's own
   output. Filter `from_me === false` **and** `type === 'text'` (or whatever types you
   actually handle) before doing anything.

**Correct merge-and-extract Code node** (this is the WHAPI-correct version of the Pattern A
"Set (extract fields)" step — use a **Code** node, not a Set node, because you need real JS
to filter+join the array):

```javascript
// Extract Fields (Code node, "Run Once for All Items")
const msgs = ($json.body.messages || [])
  .filter(m => m.from_me === false && m.type === 'text' && m.text?.body);
if (msgs.length === 0) { return []; }          // nothing actionable → stop the branch
const chatId     = msgs[0].chat_id;
const senderName = msgs[0].from_name || 'לקוח';
const userText   = msgs.map(m => m.text.body).join('\n');   // 4 msgs → one merged turn
return [{ json: { chatId, senderName, userText } }];
```

Returning `[]` (empty) is the clean way to halt a branch when the webhook carried only
non-text / echo / status items — downstream nodes simply don't run.

### Do NOT stack a Supabase debounce on top of WHAPI's batching (usually)

Because WHAPI **already** groups rapid messages into one `messages[]`, the Supabase
"debounce buffer" pattern that's correct for **Green API** (where each message is a separate
webhook) becomes a **second, conflicting** layer on WHAPI. Symptoms when you double up:
the `message_buffer` table fills and never clears, the bot answers stale messages, or it
replies several times. **Default for a WHAPI bot: skip the Supabase debounce entirely** and
just merge `messages[]` in the extract Code node above:

```
Webhook → IF (messages exist & from_me===false) → Extract+Merge (Code) → Agent → Send Reply
```

Far fewer failure points, and it matches how WHAPI actually delivers. **That said, a debounce is not
forbidden on WHAPI — it's usually *redundant*, not broken.** A short, well-tuned Supabase debounce
can coexist with WHAPI's batching (T-CENTER runs a 6s one successfully); the risk is the
stale/double-reply symptoms above under bursts, not a guaranteed failure. So: **default to skipping
it**, but if the client already has one that works, you don't have to rip it out — just hold it to
the buffer-pattern rules below. Add one deliberately only if you've **observed** the client's
messages routinely arriving as *separate* webhooks (not batched) and the merge matters — and if you
do, follow the buffer-pattern rules in `patterns.md` (Pattern I) exactly, because every chatId
mismatch or empty-result-halt bug there will bite.

### The channel must be authorized (`READY`) or every send 404s/401s

Before blaming the workflow when sends fail: a WHAPI channel that isn't paired to WhatsApp
**cannot send**, and the error is misleading. `GET /health` returns a `status`:

- `{ "code": 0, "text": "READY" }` → paired and live, sends work.
- `{ "code": 4, "text": "AUTH" }` → stuck on the QR/pairing screen, **not connected**.
  Every `POST /messages/*` then fails — often as **`404 "Channel not found"`** (token is
  valid but there's no live session) or **`401 "Need channel authorization"`**. The body,
  auth header, and n8n wiring can all be perfect and it still fails. Fix the channel, not
  the node: re-pair (QR or `GET /users/login...` pairing code) until `health` reads `READY`.

A telltale of a dead/stuck session: each connection attempt bumps `device_id` (27→28→29…)
while `status` stays `AUTH` and `user.saved` is `false`. That's the handshake starting and
being rejected each time — almost always the number is **paired elsewhere** (another WHAPI
channel, a WhatsApp Web session, or — common for a number migrated from Green API — still
authorized in a Green API instance). One WhatsApp number = one linked-device API session;
log it out everywhere else first, then pair.

### Persistent webhook = automatic retries (can look like duplicate sends)

If `callback_persist` is on (or by default for up to ~15 min, see "Persistent webhook
setting"), WHAPI **re-delivers a webhook every minute until your endpoint returns HTTP 200.**
So if your n8n workflow throws on a webhook (e.g. a node failed because the channel was in
`AUTH`, or a Supabase node halted the chain), WHAPI keeps resending that same inbound — and
once things recover the bot processes a backlog of "old" messages. If you see the bot
replaying messages from a while ago, suspect **failed-webhook retries**, not the buffer.
Make the webhook branch fail-soft (return early / `[]` rather than error) so a transient
problem doesn't queue a retry storm.

### Webhook event types (enable per channel)

`messages`, `statuses`, `chats`, `contacts`, `groups`, `presences`, `calls`, `channel`
(instance status / QR update), `users` (login/logout), `labels`, `service`. Each event has
a `type` and a **method** sub-filter (`post` / `put` / `patch` / `delete`): e.g.
`messages.post` = new inbound, `messages.put` = sent/edit echo, `messages.patch` = edit,
`messages.delete` = deletion, `statuses.put` = ack updates. (Deprecated singular aliases
`message`/`ack`/`chat`/`status` exist — use the plural forms.)

---

## The Message object (parsing inbound)

Top-level fields (every inbound message has these):

- `id` — message id
- `type` — one of: `text`, `image`, `video`, `gif`, `audio`, `voice`, `short` (PTV),
  `document`, `link_preview`, `location`, `live_location`, `contact`, `contact_list`,
  `sticker`, `system`, `call`, `action`, `group_invite`, `newsletter_invite`, `product`,
  `catalog`, `interactive`, `reply`, `poll`, `order`, `story`, `event`, `buttons`, `list`,
  `pin`, `carousel`, `unknown`
- `chat_id`, `chat_name`, `from`, `from_me`, `from_name`, `timestamp`, `source`, `status`
- a **content object named after the type** — read the matching one:

| type | read from | key fields |
|------|-----------|-----------|
| text | `text.body` | the message string |
| image/video/gif/audio/voice/document/sticker | `image` (etc.) | `id` (MediaID), `link`, `mime_type`, `file_size`, `file_name`, `caption`, `width`, `height` |
| location | `location` | `latitude`, `longitude`, `address`, `name` |
| live_location | `live_location` | same + motion fields |
| contact | `contact` | `name`, `vcard` |
| poll | `poll` | `title`, `options[]`, `results[]` |
| reply / interactive | `reply` / `interactive` | the tapped button's `id` + `title` (quick-reply / list-row selection) |
| order | `order` | `order_id`, `seller`, `title`, `item_count`, `currency`, `total_price`, `status`, `token` |
| product | `product` | `catalog_id`, `product_id` |
| action | `action` | `target`, `type` (`reaction`/`edit`/`delete`/`vote`/`pin`…), `emoji`, `votes[]` |

`context` carries reply/quote + ad-click info: `quoted_id`, `quoted_type`,
`quoted_content`, `quoted_author`, `forwarded`, `mentions[]`. When a user taps a
quick-reply button you sent, expect `type: "reply"` (or `interactive`) with the button `id`
you defined — branch on that id.

### `from_me` / `source` matrix (who actually sent this — drives human-takeover & echo-skip)

WHAPI delivers a webhook for **outgoing** messages too, so you must tell three senders apart:

| sender | `from_me` | `source` | what to do |
|--------|-----------|----------|------------|
| the customer | `false` | `mobile`/`web`/`desktop` | normal inbound → process |
| **your bot's own send** (via the API) | `true` | **`api`** | **echo — ignore** (don't reply to yourself, don't mark takeover) |
| **a human at the business** (typed/recorded from the phone or WhatsApp Web) | `true` | `mobile`/`web`/`desktop` | **human takeover** → silence the bot |

So the takeover test is `from_me === true && source !== 'api'` — and it must be **type-agnostic**: a
human grabs the chat with a `voice` note, an `image`, even an `action` (reaction/edit) just as much
as with `text`. Don't gate it on `type === 'text'` or you'll miss the most common case (owners reply
by voice). Verify these exact values from one real `inbox` payload (see `references/debugging.md`) —
don't assume.

### `chat_id` / phone format (and why a typed number won't match)

- People: `<international-number, no leading 0>@s.whatsapp.net`. Israel `972XXXXXXXXX`, the West Bank
  `970XXXXXXXXX`. A number the user *types* as `0509506702` arrives as **`972509506702@s.whatsapp.net`**
  — matching the typed form (`0509506702@…`) silently never fires. Convert: drop the leading `0`,
  prepend the country code; or normalise both sides to the **last 9 digits**.
- Groups: `<group-id>@g.us`. Newsletters/channels: `…@newsletter`.
- The Processor's `IF Incoming Message` already restricts the *text-reply* path to
  `endsWith @s.whatsapp.net` (so groups can't trigger a reply) — but the **media** branch usually
  doesn't, so a group image still gets processed unless you filter it. **Always look up the real
  `chat_id` from the `inbox` data before hard-coding one.**

### Ignoring specific numbers / groups (blocklist) — one chokepoint in the Receiver

To make the bot ignore certain people or groups entirely (no reply, no media, no takeover), filter
once at the **Receiver**, right before `Call Processor` — not in three places in the Processor.
- **Filter node** (simplest, readable): `chat_id` **is not equal to** each blocked id, combinator
  **AND**; items that aren't any blocked id pass to `Call Processor`. Add to the list = add one more
  `is not equal to`. Use the *real* `@s.whatsapp.net`/`@g.us` strings (verified from `inbox`).
- **Code node** (tolerant of input format): normalise to the last-9-digits and compare, so the user
  can paste `05…`/`972…`/`970…` interchangeably:
  ```javascript
  const e = $('Extract Inbound').item.json;
  const BLOCKED_NUMBERS = ['0509506702'];          // any format
  const BLOCKED_GROUPS  = ['120363042713305823'];  // id before @g.us
  const BLOCK_ALL_GROUPS = false;
  const chatId = (e.chat_id||'').toString(), isGroup = chatId.endsWith('@g.us');
  const idPart = chatId.split('@')[0];
  const last9 = s => (s||'').replace(/\D/g,'').slice(-9);
  if (isGroup) {
    if (BLOCK_ALL_GROUPS) return [];
    if (BLOCKED_GROUPS.map(s=>s.replace(/\D/g,'')).includes(idPart.replace(/\D/g,''))) return [];
  } else if (BLOCKED_NUMBERS.map(last9).includes(last9(idPart))) return [];
  return [{ json: { message_id: e.message_id, chat_id: e.chat_id, body: e.body } }];
  ```
  Blocked chats are still logged in `inbox` (the insert ran upstream) but never reach the Processor.
  Deliver this as a **paste-onto-canvas** snippet, not a re-import (see `references/debugging.md`).

---

## Sending — endpoint catalog

All sends are `POST https://gate.whapi.cloud/<path>` with `Authorization: Bearer <token>`
and a JSON body. **Every** body takes `to` (required) and optionally `quoted` (message id
to reply to), `edit` (message id to edit), `mentions[]`, `view_once`, and `typing_time`
(seconds to simulate typing before the message lands — a built-in human-touch, no separate
typing call needed). Success returns `{ "sent": true, "message": <Message> }` with the new
message in **Pending** status; delivery/read arrive later via the `statuses` webhook.

### Messages (33 endpoints — the ones you'll actually use)

| method + path | body highlights |
|---|---|
| `POST /messages/text` | `to`, `body` (text)*, `no_link_preview`, `wide_link_preview`, `typing_time`, `mentions[]` |
| `POST /messages/image` | `to`, `media`*, `caption`, `mime_type`, `view_once`, `width`, `height` |
| `POST /messages/video` | `to`, `media`*, `caption` |
| `POST /messages/short` | PTV (round) video — `to`, `media`* |
| `POST /messages/gif` | `to`, `media`*, `caption`, `autoplay` |
| `POST /messages/audio` | `to`, `media`*, `seconds` |
| `POST /messages/voice` | `to`, `media`* (ogg/opus), `seconds`, `recording_time`, `waveform` |
| `POST /messages/document` | `to`, `media`*, `caption`, `filename` |
| `POST /messages/sticker` | `to`, `media`*, `animated` |
| `POST /messages/location` | `to`, `latitude`*, `longitude`*, `address`, `name` |
| `POST /messages/live_location` | live location |
| `POST /messages/contact` | `to`, `name`*, `vcard`* |
| `POST /messages/contact_list` | `to`, `list[]`* (VCards) |
| `POST /messages/poll` | `to`, `title`*, `options[]`*, `count` (0 = multi-select, 1 = single) |
| `POST /messages/link_preview` | `to` + url with rich preview |
| `POST /messages/interactive` | buttons / list menus / product — see below |
| `POST /messages/carousel` | `to`, `cards[]`* (each: media + text + buttons) |
| `POST /messages/media/{type}` | raw-body media send (pdf/image/audio/video…) when you'd rather not JSON |
| `POST /messages/{MessageID}` | **forward** a message to another chat |
| `PUT /messages/{MessageID}` | **mark as read** (✔✔) |
| `PUT /messages/{MessageID}/reaction` | react — body `{ "emoji": "👍" }` (empty string removes) |
| `DELETE /messages/{MessageID}/reaction` | remove reaction |
| `POST /messages/{MessageID}/pin` / `DELETE …/pin` | pin / unpin |
| `PUT /messages/{MessageID}/star` | star |
| `DELETE /messages/{MessageID}` | delete message |
| `GET /messages/list` / `GET /messages/list/{ChatID}` | fetch history — query: `count`, `offset`, `time_from`, `time_to`, `from_me`, `author`, `sort` (use for polling fallbacks, audits) |
| `GET /messages/{MessageID}` | get one message |

\* = required.

### Stories / statuses
`POST /messages/story/text` · `/story/media` · `/story/audio`; also `POST /stories`,
`/stories/send/{text,media,audio}`, `GET /stories`, `PUT /stories/{id}` (copy).
`GET /statuses/{MessageID}` returns who viewed a message/story (ACK).

### Chats / Contacts / Presence
- `GET /chats`, `GET /chats/{ChatID}`, `PATCH /chats/{ChatID}` (pin/mute/read/disappearing),
  `POST /chats/{ChatID}` (archive/unarchive), `DELETE /chats/{ChatID}`.
- `GET /contacts`, `POST /contacts` (**check which phones have WhatsApp** — batch validator),
  `PUT /contacts` (add), `GET/PATCH/DELETE /contacts/{ContactID}`,
  `GET /contacts/{ContactID}/profile`.
- `PUT /presences/me` (online/offline), `PUT /presences/{EntryID}`
  (typing/recording indicator), `POST /presences/{EntryID}` (subscribe),
  `GET /presences/{EntryID}`.

### Groups (21) / Communities (17) / Newsletters/Channels (19)
Full programmatic control. Groups: `GET/POST /groups`, `PUT /groups` (accept invite),
`GET/PATCH/PUT /groups/{id}`, participants `POST|DELETE /groups/{id}/participants`,
admins `PATCH|DELETE /groups/{id}/admins`, invite link `GET|DELETE /groups/{id}/invite`,
icon `PUT|GET|DELETE /groups/{id}/icon`, join requests `GET|POST|DELETE
/groups/{id}/applications`, leave `DELETE /groups/{id}`. Communities and Newsletters
(WhatsApp Channels) mirror this shape. Use these for group-onboarding / lead-gen flows
(welcome pack on join via the `groups_participants` webhook).

### Channel / account (service)
- `GET /health` — channel status / launch (query `wakeup`, `channel_type=web|mobile`). Use
  to gate a flow on the session being authorized.
- `GET /settings`, `PATCH /settings`, `DELETE /settings`, `GET /settings/events`,
  `POST /settings/webhook_test`.
- `GET /users/profile`, `PATCH /users/profile`, `PUT /status` (status text),
  `GET /users/login*` (QR/pairing), `POST /users/logout`, `GET /limits`.

### Configure the webhook via API (PATCH /settings)
```json
PATCH /settings
{
  "webhooks": [
    {
      "url": "https://YOUR-N8N/webhook/whapi-in",
      "mode": "body",
      "events": [
        { "type": "messages", "method": "post" },
        { "type": "statuses", "method": "put" }
      ],
      "headers": { "X-Auth": "optional-shared-secret" }
    }
  ],
  "media": { "auto_download": ["image", "document", "voice"] }
}
```

---

## The `media` field — the big DX win over Green API

For any media send (`/messages/image`, `/video`, `/document`, …) the `media` field accepts
**any** of:

1. **A public URL** (string) — `"media": "https://cdn.example.com/post.png"`. WHAPI fetches
   and sends it. **This is the easy path** and removes the entire Green API
   `uploadFile → sendFileByUrl` dance. If your generator (or a Supabase bucket / Drive
   public link) gives you a URL, just pass it.
2. **Base64** — `"media": "<base64string>"` (optionally a `data:` URI). Pass the bytes
   directly — **no hosting step required**. Set `no_encode: true` only if you've already
   encoded to WhatsApp's format and want Whapi to skip re-encoding.
3. **An uploaded media id** — upload once via **POST /media** (raw binary body with the
   right `Content-Type`, or JSON `{ "media": "<url-or-base64>" }`), which returns
   `{ "media": [ { "id": "<MediaID>" } ] }`; then reference that id as `media` in sends.
   Also `GET /media`, `GET /media/{id}`, `DELETE /media/{id}`. Worth it when you'll send the
   same asset repeatedly (upload once, reuse the id).

### Sending an AI-generated image in n8n (compare to green_api.md)

Because `media` takes a URL **or** base64 directly, the flow is much shorter than Green API:

- **If you have a public URL** (e.g. the image is already hosted): one HTTP Request to
  `POST /messages/image` with `{ to, media: <url>, caption }`. Done.
- **If you only have base64** (e.g. Gemini "Nano Banana Pro" returns base64 inline): pass it
  straight through — `{ to, media: "{{ $json...inlineData.data }}", caption }`. No Convert-
  to-File, no upload host. (Optionally upload via POST /media first if you want a reusable id
  or the payload is very large.)
- **Veo video** that lives behind a Google URL needing the API key: download it in n8n
  first, then send as base64 or via POST /media — same caveat as the Green API path.

---

## Interactive messages (buttons & lists — for sales bots)

`POST /messages/interactive`. Shape:

```json
{
  "to": "972501234567",
  "type": "button",                  // "button" | "list" | "product"
  "header": { "text": "..." },        // optional (text or media header)
  "body":   { "text": "Choose an option" },
  "footer": { "text": "..." },        // optional
  "action": {
    "buttons": [
      { "type": "quick_reply", "title": "Yes",        "id": "opt_yes" },
      { "type": "quick_reply", "title": "No",         "id": "opt_no" },
      { "type": "url",  "title": "Open site", "url": "https://..." },
      { "type": "call", "title": "Call us",   "phone_number": "+972..." },
      { "type": "copy", "title": "Copy code", "copy_code": "PROMO10" }
    ]
  }
}
```

For a **list menu**, set `type: "list"` and use `action.list` with sections of rows (each
row has an `id` + `title` + optional `description`). When the user taps a button/row, the
**inbound** message comes back as `type: "reply"` (or `interactive`) carrying the `id` you
defined — branch the agent/flow on that id, not on free text. Quick-reply buttons are the
clean way to drive a deterministic sales funnel (and they pair well with the skill's
"agent emits a marker → IF → action" payment pattern: a button id is itself a reliable
marker). **Carousel** (`POST /messages/carousel`) sends multiple media cards each with their
own buttons — good for a product picker.

---

## Commerce (catalog / products / orders)

Relevant for store bots (e.g. jewelry / print shops). WhatsApp Business catalog surface:

- `GET /business`, `POST /business` (edit business profile).
- Products: `GET/POST /business/products`, `GET/PATCH/DELETE /business/products/{id}`,
  **`POST /business/products/{id}`** (send a product card to a chat — body `{ to, catalog_id, … }`).
- Collections: `GET/POST /business/collections`, `…/{id}` CRUD, `…/{id}/products`.
- Catalog: **`POST /business/catalogs/{ContactID}`** (send your whole catalog), and
  `GET /business/{ContactID}/products` (read another business's products).
- Orders: **`GET /business/orders/{OrderID}`** returns the line items. When a customer
  places an order from your catalog, you receive an inbound message with `type: "order"`
  (fields: `order_id`, `total_price`, `currency`, `item_count`, `token`) — fetch the items
  with `GET /business/orders/{order_id}` (the `token` from the message authorizes it), then
  push to the CRM / generate a payment link with the existing Hyp/Yaad pattern
  (`references/payments_hyp.md`).

### Labels / Blacklist
- `GET/POST /labels`, `GET /labels/{id}`, `POST|DELETE /labels/{id}/{AssociationID}` —
  tag chats/contacts (CRM-style). `GET /blacklist`, `PUT|DELETE /blacklist/{ContactID}` —
  block/unblock.

---

## Status / delivery lifecycle

A send returns immediately with the message in **`pending`**. You then get `statuses`
webhooks as it progresses: `pending → sent → delivered → read → played` (voice/video),
or `failed`. The `Status` object: `{ id, status, recipient_id, code, timestamp, errors[] }`.
Don't block the flow waiting for `read`; treat the initial `{ sent: true }` as success and
let the webhook update state (write acks to Supabase if the client wants delivery auditing).

Common errors wrap as `{ "error": { ... } }`. **429 = soft ban** (see below), **401** =
channel not authorized / bad token, **400** = bad params.

---

## Anti-ban & rate limits (put the relevant bits in delivery notes)

WHAPI imposes **no hard API limit**, but it's an unofficial gateway over a real WhatsApp
account, so WhatsApp's own anti-spam AI is the real constraint. Bake pacing into any
broadcast/outreach workflow and warn the client:

- **Warm up a new number 3–10 days** before connecting it to the API (send/receive with real
  people, media, stickers). **Do not scan the QR right after registering** a fresh number —
  wait a day+. Virtual numbers are highest-risk. Whapi offers a free warm-up module.
- **Throttle:** ceiling **6–12 messages/minute** for normal use; for cold mailings start far
  lower — **≤2/min, ≤6 hours/day, ≤3 days in a row**. **Randomize the pause** between sends
  (in n8n: a Wait node with a randomized expression, or split batches). Sending 24/7 or
  blasting hundreds at once is the #1 ban cause.
- **Relevance:** message people who expect it; ask them to save your number; offer an opt-out
  (include a `STOP` keyword) for marketing. One-way blasting to strangers gets flagged.
- **`429 (Too Many Requests)` = soft ban** — a temporary partial block (e.g. can read but not
  send, or can't create groups). Not permanent: back off, slow down, resume later. Build a
  retry-with-backoff (or pause the workflow) rather than hammering.
- Optionally use a residential/Socks5 proxy on the channel (`proxy` in settings) if the
  account does high volume, ideally same country/city as the number.

---

## n8n build conventions for WHAPI (carry into every WHAPI build)

- **Default to path B** (core Webhook node POST + HTTP Request nodes with Bearer auth) for
  version-stability and full API access. Mention the `n8n-nodes-whapi` community node as an
  option, and flag its self-hosted install requirement if the user wants it.
- **Loop-guard every bot:** Filter/IF on `from_me === false` (or `event.event === "post"`)
  right after the webhook, before the agent. This is the WHAPI analogue of Green API's
  `incomingMessageReceived` filter and is the most common "bot talks to itself" bug.
- **Reply target** = the inbound `chat_id`; for sends, `to` can be that chat_id or the bare
  phone — either works.
- **Media:** prefer passing a **public URL** as `media`; fall back to **base64 inline** when
  you only have bytes. Only use POST /media (upload→id) for reused assets. You almost never
  need a separate hosting step (unlike Green API).
- **Human touch built in:** use `typing_time` on the send instead of a separate presence
  call; `quoted` to reply-quote; reactions via `PUT /messages/{id}/reaction`.
- **Buttons over free-text menus** for deterministic funnels; branch on the returned button
  `id`. Pairs with the marker→IF→action payment pattern.
- **Mark inbound read** with `PUT /messages/{id}` if the client wants ✔✔ to show (some flows
  deliberately don't, to look less botty).
- **Fake placeholders:** token `FAKE_WHAPI_TOKEN_xxxxxxxx`, base `https://gate.whapi.cloud`.
  List the token in delivery notes as the thing to replace, and remind the user the channel
  must be authorized (QR scanned, `GET /health` returns active) and the webhook URL set
  (dashboard or `PATCH /settings`) before the workflow will receive anything.
- **Webhook + workflow must both be live:** the n8n workflow has to be **Active** for the
  Production webhook URL to accept posts; otherwise Whapi's "Check Webhook" errors.

### RTL/bidi: numbers + Latin letters + commas flip in the WhatsApp display

A Hebrew order line like `מידות: 20 M, 5 L` can render in WhatsApp as `מידות: M, 5 L 20` — the
quantities and sizes appear **swapped**. The data is correct (the DB stores `20 M, 5 L`); WhatsApp's
bidi algorithm reorders a run of digits + Latin tokens + commas embedded in RTL text. This bites any
group/email line that mixes Hebrew labels with `5M, 20L, 13XL`-style breakdowns, English model
codes, or measurements.

**Why it happens:** a comma between a number and a Latin letter is a *neutral* character; the bidi
algorithm resolves its direction from surrounding context, and inside an RTL line it pulls the
visual order right-to-left, so `20 M, 5 L` displays reversed. It's purely visual — copy the text out
and it's intact.

**Fix (most robust): one item per line.** Don't try to fix bidi inline — restructure so every line
**starts with a clean token** and has no inline comma:
```
מידות:
M × 20
L × 5
XL × 13
```
Compute this in a small Code node before the send (so the message expression just interpolates the
finished string), and write a parser that accepts **every** format the agent emits — number-first
(`20 M`, `5M`), size-first (`M 20`), glued or spaced, comma-separated or space-separated, plus
parenthesised kids sizes (`4(18)`):
```javascript
function formatSizes(rawV){
  if(!rawV) return '';
  const s = String(rawV).trim();
  if(s==='—'||s==='-'||/לתיאום|מול הצוות/.test(s)) return s;   // non-breakdown values pass through
  const pairs=[]; let m;
  const reNumFirst=/(\d+)\s*([A-Za-z]{1,4}|\(\d+\))/g;
  const reSizeFirst=/([A-Za-z]{1,4}|\(\d+\))\s*(\d+)/g;
  const found=[]; while((m=reNumFirst.exec(s))!==null) found.push({qty:+m[1],size:m[2].toUpperCase()});
  if(found.length) for(const f of found) pairs.push(f);
  else while((m=reSizeFirst.exec(s))!==null) pairs.push({qty:+m[2],size:m[1].toUpperCase()});
  if(!pairs.length) return s;                                   // unparseable → show as-is, never crash
  return pairs.map(p=>p.size.replace(/[()]/g,'')+' × '+p.qty).join('\n');
}
```
Test the parser against **real stored values** before shipping — agents are inconsistent and you'll
see four different formats in one day's orders. Also nudge the agent in the prompt to write
breakdowns compactly (`5M, 20L`, number glued to size) so the parser and any inline fallback stay
reliable. (Lighter-touch alternative if you must keep it inline: wrap the value in Unicode
directional isolates `\u2066…\u2069` (LRI/PDI) so the run is treated as a unit — but per-line is
simpler and more readable for a team.)
