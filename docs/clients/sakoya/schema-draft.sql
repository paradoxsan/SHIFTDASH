-- SAKOYA kitchens bot — DRAFT data-plane schema (plan stage, not applied anywhere yet).
-- Same conventions as templates/tcenter-sales/migrations/0001_bot_schema.sql:
--   * RLS ON for every table, no policies -> anon/authenticated get nothing;
--     n8n uses the service_role key (bypasses RLS).
--   * Idempotent: safe to re-run.
--   * chat_id is the WhatsApp join key everywhere, so the SHIFTDASH dashboard
--     (inbox / leads / human_mode smart cards) picks the bot up automatically.

-- 1. Inbound queue (Pattern K: ack-fast Receiver + idempotency on message_id).
create table if not exists public.inbox (
  id           bigint generated always as identity primary key,
  message_id   text not null unique,
  chat_id      text not null,
  payload      jsonb not null,
  status       text not null default 'new',      -- new | processing | done | failed
  attempts     integer not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_inbox_status on public.inbox(status, created_at);
create index if not exists idx_inbox_chat   on public.inbox(chat_id);

-- 2. Leads (one row per WhatsApp chat). `status` keeps the dashboard's CRM vocabulary;
--    `stage` is the bot's own funnel position.
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  chat_id          text not null unique,
  phone            text,
  full_name        text,
  segment          text,                 -- new_apartment | renovation | other
  stage            text not null default 'new',
  -- new -> segment_set -> media_received -> style_chosen -> rendering
  --     -> options_sent -> booking -> booked | handed_off | lost
  status           text not null default 'new',  -- new | contacted | appointment_set | showed_up | won | lost
  city             text,
  project_name     text,                 -- new_apartment: project / contractor ("רוכשי פרויקט X")
  delivery_date    text,                 -- new_apartment: expected handover (אכלוס)
  kitchen_age      text,                 -- renovation: approx age of current kitchen
  timeline         text,                 -- when they want to start
  budget_range     text,
  style_key        text,                 -- chosen style (styles.style_key)
  chosen_option    int,                  -- 1/2/3 after renders were sent
  decision_makers  text,                 -- e.g. "couple, both will attend"
  lead_source      text default 'whatsapp',
  utm              jsonb,                -- ad / prefilled-message source
  summary          text,                 -- short AI summary for the sales team
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_leads_stage on public.leads(stage, updated_at);

-- 3. Media the customer sent (old-kitchen photos, floor plans). Files live in Storage,
--    not as base64 in the DB.
create table if not exists public.lead_media (
  id            bigint generated always as identity primary key,
  lead_id       uuid references public.leads(id) on delete cascade,
  chat_id       text not null,
  message_id    text,
  kind          text not null default 'unknown', -- kitchen_photo | floor_plan | other | unknown
  storage_path  text not null,                   -- bucket "uploads"
  mime          text,
  caption       text,
  vision        jsonb,     -- classification + extracted layout (shape, walls, window, island...)
  usable        boolean,   -- Vision verdict: good enough to render from?
  created_at    timestamptz not null default now()
);
create index if not exists idx_lead_media_chat on public.lead_media(chat_id, created_at);

-- 4. Style catalogue — editable by the client without touching n8n.
create table if not exists public.styles (
  style_key      text primary key,            -- ascii id, also the WhatsApp button/list row id
  label_he       text not null,               -- what the customer sees
  description_he text,
  prompt_block   text not null,               -- English style description injected into the image prompt
  variations     jsonb,                       -- the 3 option variations (palette/material per option)
  segments       text[] default '{new_apartment,renovation}',
  sort           int default 0,
  active         boolean default true
);

-- 5. Reference library built from SAKOYA's own project photos.
create table if not exists public.style_library (
  id            bigint generated always as identity primary key,
  storage_path  text not null unique,        -- bucket "style-library"
  style_key     text references public.styles(style_key),
  tags          jsonb,     -- Vision tags: colors, fronts, handles, countertop, layout, lighting
  description   text,
  quality       int,       -- 1-5 from Vision + human review
  is_reference  boolean default false,       -- curated: allowed as a generation reference
  created_at    timestamptz not null default now()
  -- V2: embedding vector(768) for similarity pick (pgvector)
);
create index if not exists idx_style_library_style on public.style_library(style_key, is_reference);

-- 6. Render jobs (one per "generate 3 options" request). Idempotency + cost tracking.
create table if not exists public.render_jobs (
  id            bigint generated always as identity primary key,
  lead_id       uuid references public.leads(id) on delete cascade,
  chat_id       text not null,
  style_key     text,
  input_media   bigint[],     -- lead_media ids used
  reference_ids bigint[],     -- style_library ids used
  status        text not null default 'queued',  -- queued | running | done | failed | sent
  prompts       jsonb,
  outputs       jsonb,        -- [{option:1, storage_path, signed_url}]
  model         text,
  attempts      int not null default 0,
  latency_ms    int,
  cost_usd      numeric,
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists idx_render_jobs_chat on public.render_jobs(chat_id, created_at);

-- 7. Appointments.
create table if not exists public.appointments (
  id                 bigint generated always as identity primary key,
  lead_id            uuid references public.leads(id) on delete cascade,
  chat_id            text not null,
  kind               text not null default 'showroom',  -- showroom | home_visit | video
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  calendar_event_id  text,
  status             text not null default 'booked',    -- booked | rescheduled | cancelled | showed_up | no_show
  reminded_day_before boolean default false,
  reminded_same_day   boolean default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_appointments_time on public.appointments(starts_at, status);

-- 8. Human takeover (same shape as the template; write it with a TRUE upsert).
create table if not exists public.human_mode (
  chat_id        text primary key,
  active         boolean not null default true,
  updated_at     timestamptz not null default now(),
  silenced_until timestamptz
);

-- 9. Conversation audit log (every inbound/outbound message).
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

-- 10. Key/value config (showroom address, opening hours, slot rules, team group id...).
create table if not exists public.app_config (
  key   text primary key,
  value jsonb
);

alter table public.inbox         enable row level security;
alter table public.leads         enable row level security;
alter table public.lead_media    enable row level security;
alter table public.styles        enable row level security;
alter table public.style_library enable row level security;
alter table public.render_jobs   enable row level security;
alter table public.appointments  enable row level security;
alter table public.human_mode    enable row level security;
alter table public.audit_log     enable row level security;
alter table public.app_config    enable row level security;

-- Storage buckets (private; n8n reads/writes with service_role, WhatsApp gets signed URLs):
--   uploads        — customer photos / plans
--   renders        — generated options
--   style-library  — SAKOYA's curated project photos
