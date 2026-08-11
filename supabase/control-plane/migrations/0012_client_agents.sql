-- Per-client agents: a dedicated copilot per customer, with a dossier it reads
-- before every turn and appends to after a debug session.
--
-- Keyed on TENANT, not bot — same reasoning as client_contracts (0011): the
-- knowledge is about the business ("T center sells per-design, the owner is
-- reachable on X, the order flow lives in order_drafts"), and a client that ever
-- runs a second bot should not need its history re-entered.
--
-- WHY A TABLE AND NOT MARKDOWN IN THE REPO: the point of the dossier is that it
-- compounds. The agent proposes an entry at the end of a debug session, the
-- operator approves it, and the next session starts knowing. That write path
-- cannot exist if the store is a file that needs a git push to change.
--
-- RLS-on. Idempotent.

-- ── The dossier ───────────────────────────────────────────────────────────────
-- `kind` is deliberately a small closed set rather than free tags: the system
-- prompt groups entries by kind, so an open vocabulary would degrade into an
-- unordered pile the moment two entries disagreed on a label.
create table if not exists botops.client_knowledge (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null references botops.tenants(id) on delete cascade,
  kind       text not null check (kind in (
               'architecture',   -- how this client's bot is actually wired
               'incident',       -- something that broke, the cause, the fix
               'business_rule',  -- how the business works: pricing, hours, policy
               'contact',        -- who to reach and how
               'ops'             -- runbook steps, gotchas, manual procedures
             )),
  title      text not null,
  body       text not null,
  -- 'seed'  — imported from the operator's notes at setup
  -- 'human' — written or edited in the dashboard
  -- 'agent' — proposed by the client's agent and approved by the operator
  source     text not null default 'human' check (source in ('seed', 'human', 'agent')),
  -- Pinned entries are never dropped when the dossier is trimmed to fit the
  -- prompt budget. Without this, the oldest load-bearing fact silently falls out
  -- of context as a client accumulates incidents.
  pinned     boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_knowledge_tenant
  on botops.client_knowledge(tenant_id, pinned desc, updated_at desc);

-- Re-running a seed import must not fan out duplicates of the same note.
create unique index if not exists uq_client_knowledge_seed
  on botops.client_knowledge(tenant_id, title)
  where source = 'seed';

-- ── Agent persona ─────────────────────────────────────────────────────────────
-- Optional. A client with no row here still gets an agent built from its
-- control-plane record and dossier; this table only carries overrides, so
-- adding a client never requires remembering to create its agent.
create table if not exists botops.client_agents (
  tenant_id    uuid primary key references botops.tenants(id) on delete cascade,
  display_name text,
  -- Extra system-prompt lines for this client only ("answer in Hebrew but the
  -- owner writes in Russian", "never message the customer directly").
  persona      text,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Threads belong to an agent ────────────────────────────────────────────────
-- Null = the agency-wide copilot, which is the behaviour every existing thread
-- was created under, so backfilling is intentionally a no-op.
alter table botops.ai_threads
  add column if not exists tenant_id uuid references botops.tenants(id) on delete cascade;

create index if not exists idx_ai_threads_tenant
  on botops.ai_threads(tenant_id, updated_at desc);

alter table botops.client_knowledge enable row level security;
alter table botops.client_agents    enable row level security;
