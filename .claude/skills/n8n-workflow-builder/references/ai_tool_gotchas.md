# AI tool gotchas — `$fromAI`, Google Calendar Tool, and live-edit traps

Hard-won lessons from real debugging sessions. These are the failures that *don't* show up until
the workflow runs against a real model and a real Google API, so the Python builder + validation
won't catch them. Read this whenever a build attaches tools to a `langchain.agent`, especially
Google Calendar or Google Sheets tools.

---

## 1. Tool names must be ASCII — Hebrew node names break tool calling

n8n derives the **tool name** the model sees from the **node name**, by replacing every
non-`[a-zA-Z0-9_]` character with `_`. A node named purely in Hebrew (e.g. `בדיקת זמינות`) becomes
a string of underscores → effectively an empty/garbage tool name. Two failure modes follow:

- **"You have multiple tools with the same name: '_'"** on import/open — several Hebrew-named tools
  all collapse to `_` and collide.
- **Tool-call narration leaks to the user.** When the derived name is malformed (e.g. ends in a
  trailing `_` like `Calendar_Availability_Admin_____________`), Gemini's function-calling gets
  destabilized and it sometimes emits the call as *plain text* —
  `Calling Calendar_Availability_Admin_ with input: {"timeMin":...}` — which then flows through the
  agent `output` straight to WhatsApp.

**Rule:** every tool node attached to an agent must have a node name whose **leading token is ASCII**.
Bonus Hebrew for humans is fine *after* the ASCII part, but the cleanest is ASCII-only:

- Good: `Calendar_Book_Admin`, `Search_Lead_Sheet`, `Check_Availability`
- Risky: `Calendar_Book_Admin קביעת פגישה` (n8n appends underscores for the Hebrew → trailing-`_` name)
- Broken: `קביעת פגישה ידנית` (all underscores → `_`)

When building tools in the Python script, give every `ai_tool` node an ASCII-only `name`. Put any
Hebrew explanation in a sticky note, not the node name.

**Renaming a tool node breaks its connections.** After renaming in the UI, the `ai_tool` wire to the
agent is lost — re-drag it. (In the builder this is free; in the live UI it's a manual re-connect.)

---

## 2. Always add a routing-code safety net that filters tool-call traces

Even with ASCII names, defend against narration leaking to the user. When an agent's text output is
forwarded to a channel (WhatsApp reply, etc.), pass it through a Code node that suppresses anything
that looks like a tool-call trace instead of sending it:

```js
const out = $json.output || '';
const txt = String(out).trim();
const looksLikeToolTrace =
  /Calling\s+\w+\s+with\s+input/i.test(txt) ||
  /^\s*\{?\s*"?(timeMin|timeMax|action_input|tool|name)"?\s*[:=]/i.test(txt) ||
  /Calendar_(Availability|Book)|Search_Lead/i.test(txt);   // your tool-name stems
if (looksLikeToolTrace || txt.length === 0) {
  return [{ json: { reply: 'רק רגע, בודק…' } }];   // friendly placeholder, never the trace
}
return [{ json: { reply: out } }];
```

This is a band-aid over the real fix (ASCII names), but it guarantees a raw trace never reaches a
client even if the model misbehaves on one turn.

---

## 3. Google Calendar Tool: the **"From list" calendar selector causes 400 Bad Request**

This is the big one and it wasted the most time. Symptom: event creation fails with
`400 - Bad Request` from Google **even when Start, End, Summary, and Description all resolve to
correct values**, and even when driven by the agent (not a manual run).

Cause (confirmed by multiple n8n community reports on self-hosted 1.10x–2.10x): when the **Calendar**
field is in **`From list`** mode (the `__rl` resource-locator object with
`{ "__rl": true, "mode": "list", "value": "...", "cachedResultName": "..." }`), the node serializes
the calendar id as a **list/array** to Google instead of a plain string, corrupting the payload.

**Fix:** set the Calendar field to **By ID** and supply the calendar id as a **plain string**:

```
c2…45fe@group.calendar.google.com
```

In a Python-built node, write the calendar parameter as a plain string under the by-id shape rather
than the `__rl` list object. For `googleCalendar` and `googleCalendarTool`:

```python
# RISKY (can 400 as an AI tool): "calendar": {"__rl": True, "mode": "list", "value": CAL_ID, ...}
# SAFE: by-id resource locator with mode "id"
"calendar": {"__rl": True, "mode": "id", "value": CAL_ID}   # value is the bare calendar-id string
```

Apply this to **every** calendar node in the workflow — both the lead-facing and admin tools — since
they all hit the same bug. Lead bookings that "mostly worked" before were getting lucky.

If By-ID still 400s, the next suspect is timezone: add an explicit `Asia/Jerusalem` timezone field.
Reminders (`Use Default Reminders`) are **not** the cause — leave them on.

---

## 4. `$fromAI` field hygiene — anchors, duplicate keys, and the +30min trap

The Google Calendar Tool fills fields via `$fromAI('Key', 'description', 'type')`. Lessons:

### a. Date/time fields MUST carry a live time anchor
A bare `$fromAI('Start', 'ISO start time', 'string')` gives the model **no reference for "now"**, so
"tomorrow 10:00" drifts — we saw it land on *today* at 22:00–23:00, outside work hours, and on the
wrong date than what the agent told the client. Inject the current time by **concatenating** `$now`
into the instruction string (NOT nested `{{ }}` — see §5):

```
={{ $fromAI('Start', 'Current Israel time is ' + $now.setZone('Asia/Jerusalem').toISO() +
   '. Return START as full ISO-8601 WITH Asia/Jerusalem offset (e.g. 2026-06-09T18:00:00+03:00).
   tomorrow = current date + 1 day. Time MUST be 12:00-21:00 Israel, Sun-Thu. Never in the past.',
   'string') }}
```

### b. Never reuse a `$fromAI` key with a different description
Trying to compute End by reading Start via `$fromAI('Start','','string')` throws
**"Duplicate key 'Start' found with different description or type."** Each key may appear once with
one consistent description. So End must be its **own** key:

```
={{ $fromAI('end', 'END as full ISO-8601 with Asia/Jerusalem offset, exactly 30 minutes after Start.', 'string') }}
```

The model fills Start and End together in one tool call, so this works in real runs.

### c. Give Summary (and any Google-required field) a fallback
Google rejects an event with no title. Make Summary resilient:

```
={{ $fromAI('summary', 'Hebrew title: Shift Digital — שיחת היכרות עם [lead]', 'string') || 'Shift Digital — שיחת היכרות' }}
```

---

## 5. n8n expression rules that bit us

- **No nested `{{ }}`.** Inside an `={{ … }}` expression you cannot write another `{{ }}`. To embed a
  live value into a `$fromAI` description, use **string concatenation with `+`** (see §4a). A nested
  `{{ $now }}` is passed to the model as literal text, not a resolved time.
- **`require()` is disallowed in Code nodes** on many self-hosted instances →
  `Module 'luxon' is disallowed`. **Luxon's `DateTime` is already a global** in n8n Code nodes — use
  it directly, never `const { DateTime } = require('luxon')`. Same for `$now`, `$json`, `$input`,
  `$getWorkflowStaticData`.

---

## 6. "Execute step" on an AI tool node ALWAYS fails — test from the real trigger

A tool node (e.g. `googleCalendarTool`) run via the **"Execute step"** button does **not** invoke the
agent, so every field set to "Defined automatically by the model" / `$fromAI(...)` comes back
**empty**. Google then 400s on the incomplete event. This looks like a bug but is expected.

- **Only valid test:** trigger the real flow (send the WhatsApp message, hit the webhook). That's the
  only path where the model populates all `$fromAI` fields in one function call.
- Tell the user this explicitly so they don't chase empty-field 400s field by field.

Also: the **✨ "let the model define this parameter" sparkle button** next to each field will **wipe**
a pasted expression back to model-mode. After pasting an expression, leave the field alone, and
remind the user not to click the sparkle.

---

## 7. The n8n REST update API rejects stored `settings` keys

When updating an existing workflow via the API (`update_workflow`), a 400
`request/body/settings must NOT have additional properties` occurs if the stored workflow's
`settings` contains keys the PUT endpoint doesn't accept (e.g. `binaryMode`, `availableInMCP` on
newer self-hosted versions). The update tool here doesn't expose a clean way to strip them.

**Implication:** programmatic edits to such a workflow may be blocked. Fall back to **surgical manual
edits** (give the user the exact field + value to paste) — which is also lower-risk than replacing a
41-node live workflow wholesale. To restore API-updatability, the user can open the workflow and
**re-save from the UI**, which sometimes normalizes the old settings.

---

## 8. Importing an add-on JSON merges into the open workflow

Importing a workflow JSON while another workflow is open **adds** the nodes to that canvas (and can
rename the whole thing to the import's name). Plan for it:
- Deliver add-ons as **self-contained** (own trigger) so they work whether merged or standalone.
- Edits that must touch *existing* nodes (a prompt, a Code node) can't be done by import — deliver
  those as **copy-paste snippets** with the exact target node named.
- Importing can **drop option sub-fields** (we saw a Google Calendar `getAll` lose its
  `timeMin`/`timeMax` window). After an import, re-verify any node that had Options set.

---

## 9. `toolCode` can't make HTTP calls — don't put network calls in a Custom Code Tool

The **Custom Code Tool** (`toolcode`) runs in a restricted context. Inside it, **`fetch` is undefined
AND `this.helpers.httpRequest` is not available** (confirmed on self-hosted 2.10.x). Any attempt to
call an external API from a `toolCode` body fails — `fetch` throws `fetch is not defined`, and
`this.helpers.httpRequest` throws the misleading
`Cannot assign to read only property 'name' of object 'Error: No execution data available'`. That
error is **not** about your code; it's the helper being unavailable in the tool context.

This wastes a full debugging cycle because the same `No execution data available` message also
appears when you click **Execute step** on the tool (§6), so it's easy to misread an HTTP-context
failure as the Execute-step trap and keep editing code that's actually fine.

**Rules:**
- `toolCode` is for **pure string/logic** (format, compute, validate, map an id → value) — no network.
- For an agent-invoked **HTTP** call, use **`toolHttpRequest`** (HTTP Request Tool, does the call via
  n8n internals) or **`toolWorkflow`** (sub-workflow doing the HTTP in normal nodes).
- For **money / payments / invoices / critical side-effects**, don't use a tool at all — use the
  **deterministic main-flow pattern**: agent emits a marker like `[ORDER:{…}]` in its text → a Code
  node parses+strips it → an IF branches → an **HTTP Request node** does the call. This is also safer
  (the amount flows through code, not the model's free choice).
- A **plain Code node** (main flow, not a tool) *does* expose `this.helpers.httpRequest` — use that,
  never `fetch`.

When converting a failing `toolCode` into a main-flow Code node, remember the return shape changes:
`toolCode` returns a **single string**; a Code node returns **`[{ json: {…} }]`**.

Full treatment — decision table, the T-CENTER deterministic pattern, and the Hyp case study — is in
`references/toolcode_limits.md`. For building payment links specifically, see
`references/payments_hyp.md`.

---

## 10. Reminder/dedup pattern (1-hour-before reminders)

For "remind N minutes before an event" without double-sending:

- **Schedule Trigger** every 15 min → **Google Calendar `getAll`** with a tight window
  (`timeMin = now`, `timeMax = now + 2h`, `singleEvents: true`, timezone `Asia/Jerusalem`) →
  **Code** filter → sends.
- In the Code node, keep the window check at **55–65 minutes** out so a 15-min cron catches each
  event exactly once, and **dedup via `$getWorkflowStaticData('global')`**: store fired event ids,
  skip ids already present, and prune entries older than 24h so the store doesn't grow.
- Parse the client's phone and fields out of the **event description** (labelled lines like
  `טלפון: 972…`). If a field is absent (no phone), skip that send (e.g. skip the client reminder)
  but still notify the team — make the branch resilient to missing data.
- This works for events created **either** by the bot **or** manually, because both live on the same
  calendar.
