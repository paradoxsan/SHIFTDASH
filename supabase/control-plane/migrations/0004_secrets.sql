-- BotOps Phase 4 — least-privilege credential storage + data-plane migration log.
-- Per-tenant data-plane secrets (e.g. a project's service_role key) are stored
-- ENCRYPTED (AES-256-GCM ciphertext + nonce); the KEK lives only in a server env
-- var, so a DB dump cannot decrypt them. This lets data MUTATIONS move off the
-- god management-PAT toward least-privilege per-bot credentials. All idempotent.

create table if not exists botops.bot_secrets (
  bot_id     uuid not null references botops.bots(id) on delete cascade,
  kind       text not null check (kind in ('service_role','db_url','anon','other')),
  ciphertext text not null,                 -- base64 AES-256-GCM (enc bytes + tag)
  nonce      text not null,                 -- base64 12-byte IV
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  primary key (bot_id, kind)
);

-- Record of DDL/migrations applied to client (data-plane) projects, so the
-- platform has the history the Supabase API does not expose.
create table if not exists botops.data_plane_migrations (
  id         bigint generated always as identity primary key,
  bot_id     uuid references botops.bots(id) on delete cascade,
  name       text not null,
  sql_hash   text not null,
  applied_at timestamptz not null default now(),
  applied_by uuid                            -- botops.app_users.id
);
create index if not exists idx_dpm_bot on botops.data_plane_migrations(bot_id, applied_at);

-- Defence in depth: RLS on, no policies. Reached only via the Management SQL
-- endpoint (superuser, bypasses RLS); anon/authenticated get nothing.
alter table botops.bot_secrets           enable row level security;
alter table botops.data_plane_migrations enable row level security;
