# Supabase in n8n — every door, and which one to use

Supabase is **Postgres + a REST gateway (PostgREST) + Auth + Storage + pgvector**, all on one
project. That means there is no single "Supabase integration" in n8n — there are several, and the
single most common mistake is reaching for the Supabase REST node when the native **Postgres** node
is the better tool. This file is the decision guide plus the gotchas that actually cost a debugging
cycle (RLS returning nothing, wrong key, embedding-dimension mismatch).

Read this for any build that touches Supabase: a leads/CRM table, an order log, bot state, a RAG
knowledge base, or persistent chat memory.

---

## The three (really four) doors into Supabase

| Door | Node | Use it when | Avoid it when |
|---|---|---|---|
| **Direct Postgres** | `n8n-nodes-base.postgres` on the **Session/Transaction Pooler** | Ordinary DB work: read/insert/**upsert**/update/delete a CRM/leads/orders/state table, bulk ops, raw SQL, joins. **Default for plain data.** | You only have the API URL+key and no DB password, or you specifically want RLS enforced. |
| **Supabase REST** | `n8n-nodes-base.supabase` | You only have the project URL + API key (no pooler password), you want the REST API semantics, or you want RLS to apply to the bot. Also works as an **AI-agent tool**. | You need upsert or bulk update (the REST node doesn't expose them cleanly) → use Postgres. |
| **Vector store (RAG)** | `@n8n/n8n-nodes-langchain.vectorStoreSupabase` | AI knowledge base / semantic search over documents (pgvector + `match_documents`). | Plain key/value lookups — that's a normal table, not a vector store. |
| **Chat memory** | `@n8n/n8n-nodes-langchain.memoryPostgresChat` pointed at Supabase | Agent conversation memory that must **persist** across restarts / multiple workers. | A simple bot where the last N turns are enough → use **Simple Memory** (`memoryBufferWindow`), the bot default. |

**Rule of thumb:** *data → Postgres node; documents/RAG → Vector Store; persistent memory → Postgres
Chat Memory; only use the Supabase REST node when you literally can't use the pooler or you want RLS.*

### Why Postgres-over-pooler beats the REST node for CRUD
- It exposes **Upsert** ("insert or update on conflict") and bulk operations the REST node doesn't.
- It connects straight to Postgres, so it **isn't filtered by RLS** — your bot reads/writes what you
  expect without writing policies.
- It does joins and arbitrary SQL.

Connection details live in the Supabase dashboard under **Project Settings → Database → Connection
pooler**. Use the **Transaction pooler** (port `6543`) for n8n's short-lived queries, or the Session
pooler (`5432`) if you need session features. Copy host, port, database (`postgres`), user, password
into the n8n **Postgres credential**. (On IPv4-only networks the pooler is required anyway — the
direct connection is IPv6.)

---

## The Supabase REST node — operations

Resource is **Row** (the node also has limited table support). Operations:

- **Create** a row — provide table + fields (data-to-send as defined fields or auto-map).
- **Get** a row — by a filter (e.g. `id = X`).
- **Get Many** rows — `Return All` toggle or `Limit` (default 50), with **Filters** and **Must Match**
  (AND/OR). This is the workhorse for "fetch matching leads/orders".
- **Update** a row — by filter, set new field values.
- **Delete** a row — by filter (permanent).

By default the node only sees the **`public`** schema. Filters build `column operator value`
conditions; multiple filters combine by the Must-Match (AND/OR) setting.

**As an AI-agent tool:** the Supabase node can be attached to an agent via `ai_tool`; many params can
be set by the model (`$fromAI`). Give it a tight description and an ASCII node name (see
`ai_tool_gotchas.md` §1) so the agent calls it reliably. For a leads bot, though, a deterministic
Postgres-upsert in the main flow is usually more reliable than letting the model write rows.

Node snippet (builder style):
```python
n_supa = add({
    "parameters": {
        "operation": "create",
        "tableId": "leads",
        "dataToSend": "defineBelow",
        "fieldsUi": {"fieldValues": [
            {"fieldId": "phone", "fieldValue": "={{ $json.from }}"},
            {"fieldId": "name",  "fieldValue": "={{ $json.name }}"}
        ]}
    },
    "id": "supa-create", "name": "Supabase Create Lead",
    "type": "n8n-nodes-base.supabase", "typeVersion": 1,
    "position": pos(800, 200),
    "credentials": {"supabaseApi": {"id": "FAKE-SUPA-CRED", "name": "Supabase service_role (REPLACE)"}}
})
```

Preferred CRM upsert via Postgres instead:
```python
n_pg = add({
    "parameters": {
        "operation": "upsert",
        "schema": {"__rl": True, "mode": "list", "value": "public"},
        "table":  {"__rl": True, "mode": "list", "value": "leads"},
        "columns": {
            "mappingMode": "defineBelow",
            "matchingColumns": ["phone"],
            "value": {
                "phone": "={{ $json.from }}",
                "name":  "={{ $json.name }}",
                "status":"new"
            }
        },
        "options": {}
    },
    "id": "pg-upsert-lead", "name": "Upsert Lead (Postgres)",
    "type": "n8n-nodes-base.postgres", "typeVersion": 2.6,
    "position": pos(800, 360),
    "credentials": {"postgres": {"id": "FAKE-PG-CRED", "name": "Supabase Pooler (REPLACE)"}}
})
```

---

## Credentials & RLS — the #1 silent failure

**Supabase enables Row Level Security by default** on any table you create in the `public` schema via
the Table Editor. With RLS on and no policy, the API is **default-deny**:

- the **`anon`** key returns **zero rows** on read and fails inserts with
  *"new row violates row-level security policy"*;
- *"permission denied for schema public"* = RLS / schema-grant problem;
- a missing required column gives *"null value in column …"* (that's a **constraint**, not RLS —
  don't chase RLS when the message says null).

**Fixes, in order of preference for a server-side bot:**

1. **Use the `service_role` key** in the Supabase credential. It maps to a Postgres role with
   `BYPASSRLS`, so the bot reads/writes everything. This is the right call for a backend automation —
   but it is **god-mode over the entire project** (including the `auth` schema with password hashes).
   Keep it in the n8n credential / `$env`, **never in a prompt, a node text field, or a sticky note**,
   and never expose it to anything client-facing. (The `anon` key is the public one and is safe to
   expose; `service_role` is the secret one and never is.)
2. **Or sidestep the API**: the **Postgres node on the pooler** isn't subject to RLS at all — often
   the cleanest path for pure DB work.
3. **Or write a policy** if you actually want row-level isolation (e.g. multi-tenant). Example:
   ```sql
   alter table leads enable row level security;
   create policy "service can do anything" on leads
     for all to service_role using (true) with check (true);
   ```

**Telling the keys apart:** both are JWTs starting `eyJ…`; the `service_role` JWT has
`"role":"service_role"` in its payload. In the dashboard: **Project Settings → API keys** (legacy
tab shows `anon` and `service_role`). If a read "mysteriously" returns nothing, check the key before
you touch the query.

Delivery note to always include: *"The Supabase credential must use the **service_role** key, or the
bot will read empty results once RLS is on. Keep it secret."*

---

## Transient REST drops & the empty-result halt — two reliability traps

**1. "The connection to the server was closed unexpectedly, perhaps it is offline" (Supabase REST).**
A bot makes several Supabase REST calls **per message** (buffer insert/get/clear, human-mode check,
order lookup/insert…). Under that load the REST endpoint occasionally drops a single HTTP connection
— a **transient blip**, not an outage, and not a logic bug. But the node that hit it (commonly
`Check Human Mode`, which runs on *every* message) **fails the whole message**. Fix: enable
**Settings → Retry On Fail** on the Supabase nodes — `Max Tries 3`, `Wait Between Tries ~2000 ms`.
That auto-recovers from blips.
- **Safe to retry:** all Supabase **reads** (getAll) — idempotent. Writes here are effectively
  idempotent enough (a duplicate buffer row is deduped by "Am I Last?"; a duplicate order row is
  handled by reuse-by-latest+hash), so retrying them is acceptable.
- **Do NOT blanket-retry side-effecting HTTP nodes:** an EZcount `createDoc` retry can issue a
  **duplicate invoice**; a WHAPI send retry can **double-send** a message. Leave Retry Off on those
  (or make them idempotent first). Retry-on-fail is a Supabase-node remedy here, not an EZcount/WHAPI
  one.
- Bulk-apply by editing the exported JSON: set `retryOnFail:true, maxTries:3, waitBetweenTries:2000`
  on every `n8n-nodes-base.supabase` node, then re-import — faster than toggling each in the UI.

**2. A getAll that returns 0 rows halts the chain (Always Output Data).** Covered in
`references/patterns.md` Pattern I bug #2, but it belongs here too: a **`getAll` used as a gate**
(e.g. `human_mode` check) returns **0 items** when there's no matching row — the normal state — and
the next node never runs, killing the message **with no error**. Turn **Settings → Always Output
Data: ON** on every Supabase getAll whose empty result must still flow downstream, exactly like you
do on Delete. "Bot silently stops on some chats but not others" = this, until proven otherwise.

**3. The empty-expression filter — a Delete/Update/getAll that silently targets nothing.** A filter
value of just `"="` (an expression with an **empty body**) resolves to `''`, so the node operates on
`WHERE col = ''` → matches **0 rows** with **no error**. This happens when an expression gets cleared
in the UI and looks "set" because the `=` is still there. It's invisible until behaviour drifts:
a Clear-before-insert that deletes nothing, a "mark done" update that updates nothing. Grep your
exported JSON for `"keyValue": "="` (and `"={{ }}"`/`"={{}}"`); every filter value must reference a
real field, e.g. `={{ $('Extract Chat (Agent)').item.json.chatId }}`.

**4. No native upsert → a PK/UNIQUE table that "stops updating after the first row."** The REST node
has **no upsert** (Create/Get/Update/Delete only). On a table whose key column is a **PRIMARY KEY /
UNIQUE** (e.g. `human_mode.chat_id`), `Create` succeeds once then **fails on every later insert for
that key** (duplicate). With `onError: continue*` the failure is silent and the row's `updated_at`
**never refreshes** — the #1 cause of "the human-takeover timer expires under an active human" (see
`references/patterns.md` Pattern I). Two real upserts that *do* refresh on every write:
- **Supabase REST via HTTP Request node:** `POST {{baseURL}}/rest/v1/<table>` with headers
  `apikey`/`Authorization: Bearer <service_role>` **and `Prefer: resolution=merge-duplicates`**
  (PostgREST on-conflict upsert). Body is the row; conflict on the PK updates in place.
- **Postgres node (pooler):** `INSERT … ON CONFLICT (chat_id) DO UPDATE SET active=true,
  updated_at=now()`. Preferred when a Postgres credential exists (it's also the door this skill
  recommends for CRUD — see §"Why Postgres-over-pooler beats the REST node").

The Clear-then-Create (Delete the key, then insert) is a workable *substitute* for an upsert **only**
if the Delete filter actually targets the key (trap #3) and has Always-Output ON — and it carries a
small delete→insert race. Prefer a true upsert for anything timer-like.

**5. Reading a `payload` you wrote with `JSON.stringify(...)` into a `jsonb` column — it's
double-encoded.** Storing `JSON.stringify($json.body)` into `jsonb` saves a **JSON string scalar**,
not an object. `payload -> 'messages'` then returns null for every row and
`jsonb_object_keys(payload)` throws `cannot call … on a scalar`. Decode the inner text first:
`(payload #>> '{}')::jsonb -> 'messages' -> 0 ->> 'from_me'`. Going forward, write the **object**
(`={{ $json.body }}`), not the stringified form, so rows are real jsonb and queryable directly.

## Supabase as a RAG vector store (pgvector)

Use `vectorStoreSupabase`. It needs pgvector enabled, a `documents` table, and a `match_documents`
similarity function — n8n's node docs ship a Quick-Start SQL block; the canonical setup is:

```sql
-- 1. enable pgvector (once per project)
create extension if not exists vector;

-- 2. table: content + metadata + embedding
create table if not exists documents (
  id        bigint generated by default as identity primary key,
  content   text,
  metadata  jsonb,
  embedding vector(1536)        -- MUST match your embedding model's dimension
);

-- 3. similarity search function the node calls
create or replace function match_documents (
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint, content text, metadata jsonb, similarity float
) language plpgsql as $$
begin
  return query
  select documents.id, documents.content, documents.metadata,
         1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

**The embedding-dimension trap (state it every time):** the `vector(N)` in the table **and** in the
function MUST equal the embedding model's output dimension, or inserts/searches fail:
- OpenAI `text-embedding-3-small` / `ada-002` → **1536**
- OpenAI `text-embedding-3-large` → **3072**
- Google Gemini `text-embedding-004` / many Vertex models → **768**
Pick the model first, then set `N` to match. Changing models later means re-creating the table.

**Vector Store node modes:** `Insert Documents`, `Get Many`, `Retrieve Documents (As Vector Store for
Chain/Tool)`, `Retrieve Documents (As Tool for AI Agent)`, `Update Documents`. Key params: **Table
Name** (`documents`), **Query Name** (`match_documents`), **Limit**, and a **metadata filter** (AND
across fields) for Get-Many. Insert is fed by a **Default Data Loader** + a **Text Splitter**
sub-node; the model side needs an **Embeddings** sub-node (`embeddingsOpenAi` / `embeddingsGoogleGemini`).

**Two wiring shapes:**
- *Ingestion* (regular flow): `Trigger → (extract/split) → Vector Store (Insert)` with
  `Embeddings → Vector Store` and `Default Data Loader → Vector Store`.
- *Retrieval as an agent tool*: `AI Agent --ai_tool--> Vector Store (Retrieve as Tool)`, or via a
  **Vector Store Question-Answer Tool** in between for summarized answers.

```python
# embeddings -> vector store, loader -> vector store, vector store -> agent (as tool)
link(n_embed,  n_vstore, typ="ai_embedding")
link(n_loader, n_vstore, typ="ai_document")
link(n_vstore, n_agent,  typ="ai_tool")   # retrieve-as-tool mode
```
Node type: `@n8n/n8n-nodes-langchain.vectorStoreSupabase`, typeVersion `1.3`. The Supabase credential
here also wants `service_role` (the documents table will have RLS).

---

## Supabase as persistent chat memory

When Simple Memory isn't enough (must survive restarts, queue/multi-worker mode, or you want history
you can query), use Postgres Chat Memory against the same Supabase:

```python
n_mem = add({
    "parameters": {
        "sessionIdType": "customKey",
        "sessionKey": "={{ $json.from }}",          # phone number, per-user thread
        "tableName": "n8n_chat_histories",
        "contextWindowLength": 15
    },
    "id": "pg-chat-mem", "name": "Postgres Chat Memory (Supabase)",
    "type": "@n8n/n8n-nodes-langchain.memoryPostgresChat", "typeVersion": 1.3,
    "position": pos(600, 480),
    "credentials": {"postgres": {"id": "FAKE-PG-CRED", "name": "Supabase Pooler (REPLACE)"}}
})
link(n_mem, n_agent, typ="ai_memory")
```
The node auto-creates its history table on first run. Use the **pooler** Postgres credential (same as
CRUD), and **always set `sessionKey` explicitly** to the phone number — leaving the default makes
every user share one conversation.

---

## Other Supabase capabilities worth knowing exist

- **Storage** (file buckets): no native operation in the core Supabase node. To upload/serve files,
  either use an **HTTP Request node** against the Storage REST API
  (`{project}.supabase.co/storage/v1/object/{bucket}/{path}`, `service_role` bearer) or a community
  node (`n8n-nodes-supabase`, sudsarkar13) that adds bucket/file ops. For a WhatsApp bot that just
  needs a public URL to send media, Green API's `uploadFile` is usually simpler (see `green_api.md`).
- **Postgres trigger / Realtime**: to *react* to DB changes, use the **Postgres Trigger** node
  (LISTEN/NOTIFY) on the pooler — a real trigger, not polling.
- **Edge Functions / RPC**: call a Postgres function or an Edge Function via HTTP Request
  (`/rest/v1/rpc/{fn}` for RPC). Good for wrapping multi-step logic server-side (e.g. a
  `SECURITY DEFINER` function so an `anon` caller can do one specific privileged thing without the
  `service_role` key).
- **Auth schema**: never read `auth.users` with the `anon` key; it requires `service_role` and you
  almost never want the bot touching it.

---

## Delivery checklist for any Supabase build
- [ ] Credential uses **`service_role`** (REST/Vector Store) or the **pooler** password (Postgres
      node) — flagged as a placeholder to replace.
- [ ] If RLS is on and you used the `anon` key, you've told the user reads will be empty.
- [ ] For RAG: `vector(N)` matches the embedding model; `match_documents` exists; pgvector enabled.
- [ ] For memory: `sessionKey` is set to the phone number, not left default.
- [ ] CRUD that needs upsert/bulk uses the **Postgres node**, not the REST node.
- [ ] Per-message REST nodes have **Retry On Fail** (3 / 2000ms); getAll **gates** have **Always
      Output Data: ON**; EZcount/WHAPI side-effect nodes do **not** auto-retry.
- [ ] No `service_role` key anywhere in a prompt, node field, or sticky note.

---

## Node type strings & versions (verify against the user's instance)
- `n8n-nodes-base.postgres` — typeVersion `2.6` (Insert/Update/Upsert/Delete/Select/Execute SQL)
- `n8n-nodes-base.postgresTrigger` — react to DB changes
- `n8n-nodes-base.supabase` — typeVersion `1` (Row: Create/Get/Get Many/Update/Delete)
- `@n8n/n8n-nodes-langchain.vectorStoreSupabase` — typeVersion `1.3`
- `@n8n/n8n-nodes-langchain.memoryPostgresChat` — typeVersion `1.3`
- `@n8n/n8n-nodes-langchain.memoryBufferWindow` (Simple Memory) — typeVersion `1.3`
- Embeddings sub-nodes: `embeddingsOpenAi`, `embeddingsGoogleGemini`

## Guard placeholder values the agent writes (invoice_name, etc.)

When an LLM agent fills a field from a *prompt instruction* rather than real customer input, it tends
to write the **instruction text as the value**. The classic: an `invoice_name` field described as
"the name the invoice is issued to" comes back as literally `"על שם הלקוח"` / `"שם הלקוח"` / `"על שמי"`
/ `"לקוח"` — and that string goes straight onto a real tax invoice. Seen at ~25–30% of orders before
guarding. Same failure mode for any "fill this in" field (company name, address label, reference).

**Diagnose by reading the column**, not by watching chats: in a sales-bot orders table, the name
usually lives inside the `order_snapshot` jsonb, so
`select order_snapshot->>'invoice_name' from orders order by created_at desc limit 30;` surfaces the
placeholder cluster immediately.

**Two-layer fix (don't rely on the prompt alone):**
1. **Prompt:** require a *real* value (person first+last, or a company/registered name), and give an
   explicit reject list — if the customer answers "על שמי"/"זה בסדר"/"מה שאתה רוצה", that's **not** a
   name; ask once more, and if they truly refuse, leave it empty rather than inventing one.
2. **Parse-layer hard block (the safety net):** in the Code node that parses the agent's `[ORDER]`
   JSON, regex-reject placeholders and blank the field so a downstream invoice never issues on a
   junk name:
   ```javascript
   const BAD_NAME = /^\s*(לקוח|לקוחה|על\s*שמי|על\s*שם\s*הלקוח(ה)?|שם\s*הלקוח(ה)?|שמי|זה\s*בסדר|מה\s*שאתה\s*רוצה|—|-)\s*$/i;
   let invName = (order.invoice_name || order.customer_name || '').toString().trim();
   if (BAD_NAME.test(invName)) invName = '';   // force a re-ask / leave blank, never bill on it
   ```
The same `BAD_NAME` list is reused by the daily-summary builder (Pattern N) to decide when to fall
back to phone-only — keep one canonical list if both features exist in the build.
