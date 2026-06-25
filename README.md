# BOT DASHBOARD

A real-time, multi-tenant operations dashboard for WhatsApp bots built on
**n8n + Supabase + WHAPI**. One screen to see every customer's bot health, live
n8n executions, WhatsApp conversations, and an organized view of each customer's
database — with **zero manual per-bot setup**.

## How it works (the "no connecting anything first" design)

- **Each customer = one Supabase project.** A single Supabase Management token
  auto-discovers every project (and future ones) and reveals their service keys
  server-side. No per-bot configuration.
- **Live data via Supabase Realtime.** New WhatsApp messages (`inbox`), `orders`,
  and `leads` stream in over websockets the moment they're written.
- **n8n executions** are pulled from the n8n REST API (one instance, one API key)
  and shown live with success/error + drill-down into the failing node.
- **WhatsApp conversations** are read primarily from each bot's `inbox` table
  (already populated by your bots). WHAPI (token per customer) is used for sending
  replies and fetching media.

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind + shadcn/ui · @supabase/supabase-js
(data + realtime) · TanStack Query (n8n polling) · deployed on Vercel with a login gate.

All secrets are server-only and proxied through `/app/api/*` route handlers — the
browser never sees a Supabase service key, the management token, the n8n key, or
WHAPI tokens.

## Screens

1. **Overview** — one tile per customer/bot: up/down, messages today, stuck/failed
   messages, open orders, human-takeover count, recent errors.
2. **Executions** — a live feed of n8n runs across all workflows; filter by
   status; click into errors.
3. **WhatsApp** — chat-style conversation viewer per `chat_id`, with human-mode
   state and media; send replies via WHAPI.
4. **Database** — schema-adaptive explorer per customer: every table, row counts,
   search, with smart cards for `leads` / `orders` / `inbox`.

## Setup

1. `cp .env.example .env.local` and fill in the values (see `.env.example`).
2. `npm install`
3. `npm run dev` → http://localhost:3000
4. Deploy: push to GitHub, import into Vercel, set the same env vars.

See **`docs/DATA-MODEL.md`** for the real per-customer schemas this dashboard
understands, and **`docs/ARCHITECTURE.md`** (generated from API research) for the
integration spec.

## Security notes

- Server-only secrets; nothing sensitive is exposed to the client.
- ⚠️ The **T center** project currently has RLS disabled on 6 tables (`orders`,
  `human_mode`, `graphics`, `audit_log`, `message_buffer`, `media_buffer`). See
  `docs/DATA-MODEL.md` for the remediation SQL. The dashboard reads server-side so
  it is unaffected, but the anon key currently over-exposes those tables.
