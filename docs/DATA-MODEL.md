# Data Model — Real Schemas (discovered live from Supabase)

> Each **Supabase project = one customer/bot**. The dashboard auto-discovers all
> projects via the Supabase Management API, so any new bot appears automatically.
> Schemas differ per project, so the DB explorer is **schema-adaptive**: it lists
> whatever tables exist and renders generic views, plus "smart" cards for the
> recognized tables below.

## Project: `kracmhwzmgligxngmhmi` — "BRJewelry's Project" (CRM / leads bot)

RLS: **enabled on all tables** ✅ · Region: ap-northeast-1

| Table | Rows | Purpose | Key columns |
|-------|------|---------|-------------|
| `leads` | 30 | CRM leads | `id` uuid, `full_name`, `email`, `phone`, `status` (new/contacted/appointment_set/showed_up/won/lost), `business_type`, `services_required`, `appointment_at`, `lead_source` (default whatsapp), `communication_style`, `partner_name`, `is_security_forces`, `has_website`, `created_at`, `updated_at` |
| `inbox` | 324 | WhatsApp messages | `id` int8, `message_id`, `chat_id`, `payload` **text**, `created_at` |
| `activities` | 0 | Per-lead activity log | `id` uuid, `lead_id`→leads.id, `type` (default note), `body`, `created_at` |
| `message_buffer` | 0 | Inbound buffer | `id`, `chat_id`, `message`, `sender_name`, `created_at` |
| `media_sent` | 5 | Media-sent dedupe | `chat_id` (PK), `sent_at` |
| `app_config` | 0 | Key/value config | `key` (PK), `value` |

## Project: `xrvrjcnxogplmoybppay` — "T center" (orders / service bot)

RLS: **disabled on 6 tables** ⚠️ (orders, human_mode, graphics, audit_log, message_buffer, media_buffer) · Region: ap-southeast-1

| Table | Rows | Purpose | Key columns |
|-------|------|---------|-------------|
| `inbox` | 18,869 | WhatsApp message **queue** with status | `id` int8, `message_id`, `chat_id`, `payload` **jsonb**, `status` (new/processing/done/**failed**), `attempts` int, `error`, `created_at`, `processed_at` |
| `orders` | 151 | Orders | `id` int8, `chat_id`, `order_snapshot` jsonb, `total` numeric, `status` (open/paid/cancelled/superseded), `payment_link`, `invoice_name`, `doc_uuid`, `order_hash`, `created_at`, `updated_at` |
| `human_mode` | 338 | Bot-paused / human-takeover per chat | `chat_id` (PK), `active` bool, `silenced_until`, `updated_at` |
| `graphics` | 576 | Media/receipts (base64) | `id` int8, `chat_id`, `file_b64`, `mime`, `filename`, `caption`, `kind` (graphic/receipt), `created_at` |
| `audit_log` | 223 | Everything-log | `id` int8, `chat_id`, `from_me` bool, `msg_type`, `source`, `from_name`, `msg_count` int, `payload` jsonb, `created_at` |
| `message_buffer` | 0 | Inbound buffer | `id`, `chat_id`, `message`, `created_at` |
| `media_buffer` | 0 | Media buffer | `id`, `chat_id`, `message`, `created_at` |

## Derived dashboard metrics (per bot)

Computed from the tables above — all support live updates via Supabase Realtime:

- **Messages today** — `count(inbox where created_at >= today)`
- **Stuck / failed messages** — `count(inbox where status='failed' or attempts > 2)` *(T center has the status column; CRM bot has no status → fall back to recent volume)*
- **Open orders / paid today** — from `orders.status` + `total`
- **New leads** — `count(leads where status='new')`
- **Human-takeover active** — `count(human_mode where active=true)`
- **Last activity** — `max(created_at)` across inbox/audit_log → drives the "bot up/down" tile
- **Recent errors** — `inbox.error` + N8N failed executions

## Conventions

- `chat_id` is the WhatsApp conversation key across all tables → join messages,
  orders, human_mode, graphics by `chat_id` to build a full conversation view.
- Recognized tables get smart UIs; unrecognized tables get the generic explorer.
