-- Canonical data-plane schema for the tcenter-sales bot template (BotOps Phase 6).
-- Every new bot from this template gets these 7 tables. Authored RLS-ON by
-- default so a bot is never born exposed (the bot uses the service_role key,
-- which bypasses RLS; with no policies anon/authenticated get nothing).
-- Fully idempotent — safe to re-run.

-- Inbound message queue (the bot's work queue).
create table if not exists public.inbox (
  id           bigint generated always as identity primary key,
  message_id   text not null,
  chat_id      text not null,
  payload      jsonb not null,
  status       text not null default 'new',
  attempts     integer not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_inbox_status on public.inbox(status, created_at);
create index if not exists idx_inbox_chat on public.inbox(chat_id);

-- Orders / invoices funnel.
create table if not exists public.orders (
  id             bigint generated always as identity primary key,
  chat_id        text not null,
  created_at     timestamptz default now(),
  doc_uuid       text,
  payment_link   text,
  order_hash     text,
  order_snapshot jsonb,
  total          numeric,
  status         text not null default 'open',
  updated_at     timestamptz not null default now(),
  invoice_name   text
);
create index if not exists idx_orders_chat_status on public.orders(chat_id, status);

-- Per-conversation human takeover (the bot checks active + silenced_until).
create table if not exists public.human_mode (
  chat_id        text primary key,
  active         boolean not null default true,
  updated_at     timestamptz not null default now(),
  silenced_until timestamptz
);

-- Stored media/graphics (base64), e.g. receipts and design files.
create table if not exists public.graphics (
  id         bigint generated always as identity primary key,
  chat_id    text not null,
  file_b64   text not null,
  mime       text,
  filename   text,
  created_at timestamptz default now(),
  caption    text,
  kind       text not null default 'graphic'
);
create index if not exists idx_graphics_chat on public.graphics(chat_id);

-- Conversation audit log (every inbound/outbound message).
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  chat_id    text,
  from_me    boolean,
  msg_type   text,
  source     text,
  from_name  text,
  msg_count  integer,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_chat on public.audit_log(chat_id, created_at);

-- Debounce buffers (group rapid-fire messages before the agent runs).
create table if not exists public.message_buffer (
  id         bigint generated always as identity primary key,
  chat_id    text not null,
  message    text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.media_buffer (
  id         bigint generated always as identity primary key,
  chat_id    text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

-- Deny-all by default (service_role bypasses RLS; no policies = anon/auth get nothing).
alter table public.inbox          enable row level security;
alter table public.orders         enable row level security;
alter table public.human_mode     enable row level security;
alter table public.graphics       enable row level security;
alter table public.audit_log      enable row level security;
alter table public.message_buffer enable row level security;
alter table public.media_buffer   enable row level security;
