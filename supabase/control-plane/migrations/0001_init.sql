-- BotOps control-plane schema (Phase 2, Option B: a dedicated `botops` schema
-- hosted inside an existing project — NOT the public schema, so it is never
-- exposed to the anon/PostgREST data API). Migrating to a dedicated project
-- later is only a connection-string change. All DDL is idempotent.

create schema if not exists botops;

-- Provider projects that host data planes (client Supabase projects).
create table if not exists botops.data_plane_refs (
  supabase_ref text primary key,
  org         text,
  plan        text,
  shared      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- A tenant = a customer/workspace owner of one or more bots.
create table if not exists botops.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  workspace     text not null check (workspace in ('mine','clients')),
  accent        text,
  owner_user_id uuid,
  status        text not null default 'active' check (status in ('active','archived')),
  created_at    timestamptz not null default now()
);

-- A bot supersedes the old lib/registry.ts ClientDef.
create table if not exists botops.bots (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references botops.tenants(id) on delete cascade,
  slug               text unique not null,
  name               text not null,
  supabase_ref       text not null references botops.data_plane_refs(supabase_ref),
  table_include      text[] not null default '{}',
  table_exclude      text[] not null default '{}',
  n8n_prefixes       text[] not null default '{}',
  whapi_key          text,
  sheet_id           text,
  channel            text,                 -- 'whapi' | 'green'
  current_version_id uuid,                 -- bot_versions, added in Phase 6
  template_id        uuid,                 -- bot_templates, added in Phase 6
  status             text not null default 'live'
                       check (status in ('draft','provisioning','live','paused','archived')),
  created_at         timestamptz not null default now()
);
create index if not exists idx_bots_tenant on botops.bots(tenant_id);

-- Attributed action log (populated in Phase 3; created now so the shape is frozen).
create table if not exists botops.audit_log (
  id            bigint generated always as identity primary key,
  actor_user_id uuid,
  action        text not null,
  target_type   text,
  target_id     text,
  payload       jsonb,
  result        text,
  ip            text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_target on botops.audit_log(target_type, target_id, created_at);

-- Identity/RBAC placeholders (filled in Phase 3).
create table if not exists botops.app_users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  name       text,
  role       text not null default 'viewer' check (role in ('owner','operator','viewer')),
  status     text not null default 'active',
  last_login timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists botops.invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text not null default 'viewer',
  token       text unique not null,
  expires_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create table if not exists botops.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references botops.app_users(id) on delete cascade,
  issued_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip         text
);

-- Defense in depth: enable RLS on every control-plane table. Access is via the
-- Management SQL endpoint (superuser, bypasses RLS); with no policies, the anon
-- and authenticated roles get nothing even if the schema were ever exposed.
alter table botops.data_plane_refs enable row level security;
alter table botops.tenants         enable row level security;
alter table botops.bots            enable row level security;
alter table botops.audit_log       enable row level security;
alter table botops.app_users       enable row level security;
alter table botops.invites         enable row level security;
alter table botops.sessions        enable row level security;
