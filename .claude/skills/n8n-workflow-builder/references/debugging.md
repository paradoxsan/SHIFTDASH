# Debugging a LIVE bot — instrument, don't guess (read before "fixing" a deployed workflow)

When a deployed WHAPI/Supabase bot misbehaves ("the bot keeps talking after a human jumps in",
"it answered the wrong thing", "some chats go silent"), the failure is almost never where the
symptom points. Don't reason about what the JSON *should* do — pull the real workflows and query the
real state. You usually have two MCP servers wired for exactly this: **n8n** (read the live
workflows) and **Supabase** (read the live state tables). Use them.

## The loop

1. **Pull BOTH workflows, not just the one you were handed.** A WHAPI bot is normally a
   **Receiver + Processor** pair (Pattern K). A takeover/dedup/routing bug is often in the *other*
   workflow than the symptom suggests, or in a node you'd never re-read because "it obviously works."
   - `n8n-mcp:search_workflows(query="…")` → find the pair (e.g. "T-CENTER" → the V2 Receiver +
     the Processor it calls). The Receiver's `Call Processor` node names the Processor's id.
   - `n8n-mcp:get_workflow_details(workflowId)` → exact node params **as deployed** (the user's
     uploaded JSON can be stale or pre-edit). If `get_workflow_details` returns "not found" for a
     Processor referenced by id, it just isn't exposed to MCP — fall back to the uploaded file, but
     say so.

2. **Query the state tables — timestamps are the tell.** The bug is usually "a row that should have
   refreshed didn't." Read the actual rows and cross-reference times against the audit log:
   - `human_mode` — is `updated_at` *fresh*? If a human sent a voice note at 10:01 but the row says
     08:43, the **refresh path is broken** (see supabase.md "no upsert → PK insert fails silently").
   - `message_buffer`, `orders`, `inbox` — same idea. Compare to when the message actually arrived.
   - Confirm constraints you didn't write: `select tc.constraint_type, kcu.column_name from
     information_schema.table_constraints tc join information_schema.key_column_usage kcu using
     (constraint_name) where tc.table_name='human_mode'`. A surprise **PRIMARY KEY / UNIQUE** flips
     a Supabase "Create" from "always inserts" to "fails on the 2nd message" — and that changes
     everything about delete-then-insert vs upsert.

3. **The `inbox` table is an audit log — read it instead of speculating about the payload.** Pattern K
   stores the full webhook `body` of *every* message. Query it to see exactly what the provider sent
   — `from_me`, `type`, `source`, `chat_id` — for the real messages that misbehaved. This is how you
   learn, e.g., that owner voice notes really do arrive as `from_me=true, type="voice",
   source="mobile"` (so the takeover *should* fire — pushing you to look downstream at the refresh,
   not at detection).
   - **Double-encoding gotcha:** if the Receiver inserted `payload = JSON.stringify(body)` into a
     `jsonb` column, it's stored as a **JSON string scalar**, not an object. Symptoms: `->'messages'`
     returns null for every row, or `ERROR: cannot call jsonb_object_keys on a scalar`. Decode the
     inner text first: `(payload #>> '{}')::jsonb -> 'messages' -> 0 ->> 'from_me'`. (Fix the
     Receiver to pass the object, not the stringified form, so future rows are real jsonb.)

4. **Verify real field shapes before trusting provider docs.** Batching, `source` values, `chat_id`
   format (international, no leading 0; `970`/`972`; `@g.us` for groups) — confirm from one real
   `inbox` payload. A number the user types as `0509506702` is `972509506702@s.whatsapp.net` in the
   data, *not* `0509506702@…`; matching the typed form silently never fires.

5. **Only then edit — and prefer the smallest fix you can hand over as a paste.** A one-field change
   (a corrupted/empty filter expression) beats a 50-node re-import. Preserve the user's credentials
   (see "Delivering surgical fixes" below).

## State you can safely read (paradoxsan's stack)

`inbox` (per-message audit + idempotency), `human_mode` (takeover gate; **PK on chat_id**),
`message_buffer` (debounce), `orders` (order-state machine), `graphics` (inbound media). Reads
(`getAll`/`select`) are non-destructive — query freely. Never run a destructive migration to "fix
data" mid-debug (don't clear `human_mode` rows — some are chats a human is genuinely handling).

## Delivering surgical fixes (preserve credentials)

Re-importing a whole workflow replaces it and can **drop credential bindings** on any node you
rebuilt from MCP output (MCP `get_workflow_details` does **not** return the `credentials` block, so a
reconstructed Receiver loses its Supabase cred on import). For a small change, hand the user one of
these instead, in increasing size:

- **One field:** name the node + field + exact new value to type. Example: *"Open `Clear Old Human`,
  set the `chat_id` filter value to `={{ $('Extract Chat (Agent)').item.json.chatId }}`"*. Zero
  import, zero cred risk.
- **One or a few nodes — paste JSON straight onto the canvas.** n8n's clipboard format is
  `{"nodes":[ … ], "connections":{ … }}`; **Ctrl+V on the canvas instantiates the node(s)**. Give the
  user that JSON for the new node, then tell them which 1–2 wires to drag — connections *to
  pre-existing* nodes are **not** recreated on paste (only links among the pasted set are), so the
  re-wire is manual. This is the cleanest way to drop in a Filter/Code gate (e.g. a blocklist before
  `Call Processor`) without touching anything else. Build the snippet with the same Python approach as
  a full workflow, just emit one node.
- **The whole workflow** only when the change is broad or structural — and call out that creds may
  need re-binding after import, and that re-import is the only safe path if the workflow id must stay
  stable (keep the same `id` so it updates in place and existing `Execute Workflow` references by id
  keep resolving).
