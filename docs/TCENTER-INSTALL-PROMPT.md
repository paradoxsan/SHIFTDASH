# MEGA PROMPT — install the T-Center takeover + friction changes into the live bot

Paste everything below the line into a new Claude session that can reach the T-Center n8n server
(e.g. Claude Code on the computer that has the SHIFTDASH repo and its `.env.local`).

---

You are installing an already-designed, already-tested change into a LIVE production WhatsApp sales
bot (T-Center, a print/embroidery shop; owner: Asi). Real customers are talking to it right now, so
work carefully: back up first, change only what is listed here, test on a test number, and keep a
one-step rollback. If anything below does not match what you find in the live workflow, stop and ask
me — do not improvise around it.

## 0. What the change does (so you can sanity-check decisions)

1. **Takeover — when Asi writes to a customer from the business number, the bot stays out.**
   Asi never learns commands; the bot classifies what he already writes:
   - ordinary message mid-conversation ("בודק", "שניה", ".", "סבבה", a voice note, a sticker, an image) →
     bot silent for **90 minutes**, refreshed by each of his messages (was 30).
   - order moved past the sale ("ההזמנה מוכנה", "מחר יהיה מוכן", "תודה מתקדם", "שולח לינק לתשלום",
     "אפשר להגיע לקחת", "אודיע לך", a pasted EZcount link, the Google-review request) → bot silent
     **until 00:00 Israel time**. A short pause never shortens a longer silence already running.
   - "🤖" or "#בוט" in the customer chat → bot back on immediately.
   - In the orders group, replying **"בוט"** to an alert card → bot back on for that customer;
     **"שקט"** → silent for that customer until tomorrow. The customer never sees these.
2. **Friction — the bot never argues with an upset customer.** Data showed: when Asi answered an upset
   customer ~8 in 9 calmed down; when the bot answered ~2 in 3 stayed upset. So, BEFORE the agent
   answers, a gate checks the customer's message. If the customer asks for a person, complains,
   asks for a discount, asks about an existing order's status, is angry, or soft signals ("??",
   "לא הבנתי") pile up, or the bot is about to repeat its previous line:
   - the bot sends the customer **NOTHING** (no "קיבלנו את הפנייה", no promises),
   - the bot goes silent in that chat for 12h (or until Asi takes over — then the takeover rules apply),
   - the orders group gets an alert card (who, why, what they wrote, wa.me link, "reply בוט to hand back"),
   - if nobody from the business writes in that chat within 15 minutes (shop hours only), the group gets
     ONE reminder.
   - Only exception: a sincere "זה בוט?" gets one honest line — "כן, זה הבוט של טי-סנטר. העברתי את
     השיחה לאסי." — then the same handoff. The bot must never pretend to be a person.
3. **Style — the bot writes like Asi**, not like a chatbot (see section 6).

## 1. Sources of truth (do not rewrite this logic yourself)

Repository `paradoxsan/SHIFTDASH`, branch **`claude/kind-hawking-ll5bi8`**:

```
git fetch origin claude/kind-hawking-ll5bi8 && git checkout claude/kind-hawking-ll5bi8
npm ci && npm test            # must be all green before you touch n8n
node scripts/n8n/build-tcenter-nodes.mjs --check   # must print nothing and exit 0
```

| File | Role |
|---|---|
| `lib/bot/takeover.mjs` | takeover classifier (tested on the owner's real messages) |
| `lib/bot/friction.mjs` | friction gate, repeat guard, alert/reminder text, shop hours |
| `templates/tcenter-sales/code-nodes/classify-takeover.js` | paste-ready Code node |
| `templates/tcenter-sales/code-nodes/friction-gate.js` | paste-ready Code node |
| `templates/tcenter-sales/code-nodes/repeat-guard.js` | paste-ready Code node |
| `templates/tcenter-sales/code-nodes/group-bot-command.js` | paste-ready Code node |
| `templates/tcenter-sales/code-nodes/handoff-reminder.js` | paste-ready Code node |
| `supabase/data-plane/tcenter/0002_bot_handoffs.sql` | additive migration (table + view) |
| `templates/tcenter-sales/workflow.template.json` | OLD snapshot of the workflow (Aug) — for node names/shapes only; the live one is newer |
| `docs/TCENTER-TAKEOVER-FRICTION.md` | the analysis behind every default |

Rules: paste the generated `code-nodes/*.js` **verbatim** into n8n Code nodes ("Run Once for All
Items", JavaScript). They inline the modules, so the bot runs the exact bytes the tests run. If a
behaviour must change, edit `lib/bot/*.mjs`, rebuild with `node scripts/n8n/build-tcenter-nodes.mjs`,
run `npm test`, then re-paste. Never hand-edit a generated file. If the `n8n-workflow-builder` skill
is available, load it and run its Gotchas check (Always-Output-Data on Supabase gates, Code-node
naming, credential re-binding) before you wire anything.

## 2. Access

- n8n (GCloud/Coolify): `https://n8n-zul818glaz4rmhvsfw2nyy94.34.165.141.5.sslip.io` — REST API
  `/api/v1`, header `X-N8N-API-KEY`. The key is in the SHIFTDASH `.env.local` (`N8N_API_KEY`,
  `N8N_BASE_URL`) or n8n → Settings → n8n API. Never print, log, or commit the key.
- The live sales workflow: id **`KIIGQZPxugci8i1j`** (from `templates/tcenter-sales/artifact.json`);
  confirm by name (T-CENTER sales / processor). Its entry node is `Webhook (WHAPI In)`, an
  Execute-Workflow trigger — so a separate **receiver** workflow feeds it. List all workflows, find
  every T-Center one, and grep their nodes for `human_mode` to learn where takeover is written today.
- Supabase project **`xrvrjcnxogplmoybppay`** ("T center"). Relevant tables:
  `human_mode(chat_id PK, active bool, silenced_until timestamptz, updated_at)`,
  `chat_messages(chat_id, role 'user'|'bot'|'agent', text, created_at)` — `agent` = a human at the
  business number, `orders(chat_id, status, created_at, …)`.
- ⚠️ On this n8n server a workflow's editor draft has diverged from its running version before
  (the SDR: draft 6 nodes, running version far larger). Before editing, compare `nodes` with
  `activeVersion` (if the API returns it). Edit the version that is actually running. If they
  differ, stop and tell me.

## 3. Backup (before any change)

1. `GET /api/v1/workflows/{id}` for the sales workflow AND the receiver → save the full JSON to
   `backups/tcenter-<workflow>-<UTC timestamp>.json` (outside git or gitignored). Record each
   workflow's `active` flag.
2. Copy the agent's current system prompt (node `T-CENTER Sales Agent`) into the backup folder too.
3. Rollback = `PUT` the backup JSON back (only `name, nodes, connections, settings`), re-activate.
   Write the exact rollback command into your final report.

## 4. Database (additive only)

Apply `supabase/data-plane/tcenter/0002_bot_handoffs.sql` to `xrvrjcnxogplmoybppay` (Supabase MCP
`apply_migration`, or the SQL editor). It creates table `bot_handoffs` and view `bot_handoffs_due`;
it touches nothing existing. Verify: `select * from bot_handoffs_due limit 1;` runs.

## 5. n8n changes

Conventions for every new HTTP node, copied from the existing `Mark Human Mode` node:
Supabase REST via HTTP Request, credential `supabaseApi` (predefinedCredentialType), full URL
`https://xrvrjcnxogplmoybppay.supabase.co/rest/v1/...` (relative URLs fail in the HTTP node).
WhatsApp sends copy `Send Summary / Reply` (customer) and `Esc: Notify Group` (group): `POST
https://gate.whapi.cloud/messages/text`, the same httpHeaderAuth credential, the same group chat id
the existing group nodes use. Every Supabase read used as a gate: **Settings → Always Output Data ON**
(an empty result otherwise silently stops the flow). Re-bind credentials by picking the existing ones.

Create these two reusable nodes first and point every handoff below at them:
- **`Handoff: Silence`** — HTTP POST `/rest/v1/human_mode`, headers
  `Prefer: resolution=merge-duplicates,return=minimal`, body
  `{{ { chat_id: $json.chatId, active: true, updated_at: $now.toISO(), silenced_until: $json.silencedUntil } }}`
- **`Handoff: Record`** — HTTP POST `/rest/v1/bot_handoffs`, header `Prefer: return=minimal`,
  body `{{ $json.handoffRow }}`
- **`Handoff: Alert Group`** — WHAPI text to the orders group, body `{{ $json.frictionAlert }}`
- **`Handoff: Honest Reply`** — WHAPI text to `{{ $json.chatId }}`, body `{{ $json.frictionReply }}`,
  reached only through an IF `{{ $json.frictionReply !== null }}`.

### 5A. Takeover (where a human message from the business number is handled — `IF Agent Replied` → `Classify Takeover` → `Mark Human Mode` in the template; find its live equivalent)
1. Before `Classify Takeover` add **`Takeover: Read Current`**: Supabase getAll `human_mode`, filter
   `chat_id = {{ $('Webhook (WHAPI In)').first().json.body.messages[0].chat_id }}`, Always Output Data ON.
2. Replace `Classify Takeover`'s code with `classify-takeover.js`. It returns `[]` for non-human
   messages and `{chatId, active, silencedUntil, takeoverKind, takeoverReason}` otherwise.
3. Change `Mark Human Mode`'s body to
   `{{ { chat_id: $json.chatId, active: $json.active, updated_at: $now.toISO(), silenced_until: $json.silencedUntil } }}`
   (today `active` is hard-coded `true`; a release must write `false`).
4. Keep `Mark Human (paid)` and the receipt branch as they are.

### 5B. Group commands (orders group path, next to `QL: Filter (group + owner + cmd)`)
1. IF: chat_id equals the orders group id AND `from_me` is true AND `source != 'api'` AND the text
   matches `^\s*(בוט|🤖|החזר בוט|תחזיר בוט|שקט|השתק|🔇)`.
2. Code node `group-bot-command.js` → returns `{chatId, active, silencedUntil, confirm}` or nothing.
3. Upsert `human_mode` with those values (same body shape as 5A.3), then send `{{ $json.confirm }}`
   to the group.

### 5C. Friction Gate (between `Language Gate (Hebrew)` and `T-CENTER Sales Agent`)
Chain, in this order: `Language Gate (Hebrew)` → `Friction: Mode` → `Friction: Load Orders` →
`Friction: Load History` → `Friction Gate` → Switch. The order matters: the gate's `$input` must be
the History rows; it reads `Bot Allowed?` and `Friction: Load Orders` by node name.
1. **`Friction: Mode`** — Set node with one field `mode = "shadow"` (see section 7). Downstream IFs
   read it as `{{ $('Friction: Mode').first().json.mode }}`.
2. **`Friction: Load Orders`** — HTTP GET
   `/rest/v1/orders?chat_id=eq.{{ $('Bot Allowed?').first().json.chatId }}&created_at=gte.{{ $now.minus({days: 21}).toISO() }}&select=chat_id,status&limit=1`
   Always Output Data ON.
3. **`Friction: Load History`** — HTTP GET
   `/rest/v1/chat_messages?chat_id=eq.{{ $('Bot Allowed?').first().json.chatId }}&order=created_at.desc&limit=12&select=role,text,created_at`
   Always Output Data ON.
4. Code node named exactly **`Friction Gate`** with `friction-gate.js`. Output adds:
   `frictionAction` (`continue|handoff|hold`), `frictionReason`, `frictionReply`, `frictionNotify`,
   `frictionAlert`, `silencedUntil`, `handoffRow`, `lastBotText`, and passes the turn through.
5. Switch on `frictionAction`:
   - `continue` → `T-CENTER Sales Agent` (unchanged path).
   - `handoff` → `Handoff: Honest Reply` (IF reply not null) + `Handoff: Silence` + `Handoff: Record`
     + `Handoff: Alert Group`. Nothing else is sent to the customer.
   - `hold` → IF `frictionNotify` → `Handoff: Alert Group`. Nothing to the customer.
   - In **shadow mode**: every branch continues to the agent as today, and handoff/hold only send the
     group alert prefixed with `[מצב צל] ` — no silence, no record, no honest reply.
6. Media turns also reach `Bot Allowed?`; the gate handles an empty text (continues).

### 5D. Repeat Guard (between `Parse Order` and `Send Summary / Reply`)
Code node `repeat-guard.js` (reads `$('Friction Gate')` by name). IF `{{ $json.repeatBlocked }}`:
true → `Handoff: Silence` + `Handoff: Record` + `Handoff: Alert Group` and do NOT send the summary;
false → `Send Summary / Reply` exactly as today. Order summaries (`isOrder: true`) are never blocked —
that send releases the payment link through `Approval Gate`. Keep `Esc: Gate` connected to
`Parse Order` as today. Shadow mode: never block, only alert with the prefix.

### 5E. The agent's own escalation (`Parse Order` → `escalate: true` → `Esc: Gate`)
When `escalate` is true, the bot must not send its "נציג יחזור אליך…" sentence either: route that
turn to the same handoff nodes (reason `wants_human`, `silencedUntil = now + 12h`,
`handoffRow` built from chatId/senderName/the customer's text) instead of `Send Summary / Reply`.
Keep `Esc: Gate`'s 6h dedupe for the group card or replace its card with `Handoff: Alert Group` —
one card per handoff, not two.

### 5F. Handoff Reminder (new branch in the same workflow, or a small new workflow)
Schedule Trigger every 5 minutes → HTTP GET `/rest/v1/bot_handoffs_due?select=*`
(Always Output Data ON) → Code node `handoff-reminder.js` (returns nothing outside shop hours) →
WHAPI text to the orders group with `{{ $json.groupText }}` → HTTP PATCH
`/rest/v1/bot_handoffs?id=eq.{{ $json.id }}` body `{"reminded_at": "{{ $now.toISO() }}"}`.

## 6. Agent system prompt — write like Asi

Edit the `T-CENTER Sales Agent` system prompt (backup first). Keep every business fact unchanged
(prices, products, bank details, hours, payment flow, the order-summary template — `Approval Gate`
depends on its wording). Remove: emoji instructions, the "רוצה שנתקדם להזמנה?" closer, "בשמחה"
openers, and any "נציג יחזור אליך ברגעים הקרובים" / "קיבלנו את הפנייה" canned lines. Add this block:

```
## איך כותבים (כמו אסי)
- קצר. רוב ההודעות של אסי הן עד 3 מילים. משפט אחד, לעניין.
- עונים רק על מה שנשאל. לא מוסיפים שאלת מכירה בסוף כל הודעה.
- בלי אימוג'י, בלי סימני קריאה, בלי "בשמחה", בלי "רוצה שנתקדם?".
- מחירים כמו אסי: "45ש ליחידה".
- שאלה אחת לכל היותר, ורק כשצריך אותה כדי להתקדם בהזמנה: "מה המידות?"
- לא חוזרים על משפט שכבר נשלח בשיחה.
- "אחי" רק אם הלקוח כתב "אחי" קודם.
- אסור להעמיד פנים שאתה בן אדם. אם שואלים אם זה בוט — כן, זה הבוט של טי-סנטר.
- הנחות, מתי הזמנה קיימת מוכנה, שיחת טלפון ותלונות — לא עונים. מסמנים escalate.

דוגמאות אמיתיות של אסי:
"כמה עולה?" → "45ש ליחידה"
"יש בז' במידות?" → "היי כן יש"
"יש מצב שזה יהיה מוכן היום?" → "אני דואג לזה"
"מתי הכי מוקדם?" → "אכין לך תוך יום"
כשצריך לבדוק → "שניה בודק לך"
```
Do not change the JSON/output format the prompt asks the model for (`Parse Order` parses it).

## 7. Rollout and tests

1. Install with `Friction: Mode = shadow`. Takeover (5A), group commands (5B) and the reminder (5F)
   go live directly; the friction gate and repeat guard only alert with `[מצב צל]`.
2. Test on a TEST number (mine or a team phone) — never on a real customer:
   - test number → "אפשר לדבר עם נציג?" → shadow: normal bot answer + `[מצב צל]` card in the group.
   - business number → test chat "ההזמנה מוכנה" → `human_mode.silenced_until` = next 00:00 Israel;
     then "בודק" → unchanged (never shortens); then "🤖" → `active = false`.
   - group: reply "שקט" on a card → silenced until tomorrow; "בוט" → `active = false`, confirm posted.
   - check n8n executions for errors after each step; check the rows in Supabase.
3. Tell me the shadow cards that fired over 2–3 days. Only after I say so, set `mode = "live"` and
   repeat the friction tests (now: no reply to the customer, silence, `bot_handoffs` row, reminder
   after 15 min in shop hours, "זה בוט?" gets the one honest line).

## 8. Do not

- Do not change prices, EZcount/payment nodes, bank details, `Language Gate (Hebrew)`, the receipt
  flow, or the order-summary wording.
- Do not delete existing nodes; disconnect if you must, and say which.
- Do not touch BRJewelry, the SDR, or any other client's workflow.
- Do not enable/alter RLS or other tables beyond the migration in section 4.
- Do not print or commit secrets. Do not message real customers while testing.

## 9. Report back

List: workflows/nodes added or changed (by name), backup file paths and the exact rollback command,
migration result, each test with pass/fail and evidence (execution id or DB row), current
`Friction: Mode`, and anything in the live workflow that did not match this prompt.
