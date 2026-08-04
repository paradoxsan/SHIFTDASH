-- Copilot threads. Conversation state lives SERVER-SIDE on purpose: the agent
-- loop replays a thread's messages to continue after a write is approved, and a
-- client-supplied transcript would let the browser forge tool results. The
-- browser only ever sends a thread id plus its new message or decision.
--
-- `content` holds Anthropic content blocks verbatim (text / tool_use /
-- tool_result), so a thread can be handed straight back to the Messages API.
-- RLS-on. Idempotent.

create table if not exists botops.ai_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references botops.app_users(id) on delete set null,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_threads_user on botops.ai_threads(user_id, updated_at desc);

create table if not exists botops.ai_messages (
  id         bigint generated always as identity primary key,
  thread_id  uuid not null references botops.ai_threads(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_messages_thread on botops.ai_messages(thread_id, id);

-- A write tool the model proposed. It does NOT run until a row here flips to
-- 'approved', which is what makes "read + act on approval" an enforced property
-- of the system rather than a prompt instruction.
create table if not exists botops.ai_pending_actions (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references botops.ai_threads(id) on delete cascade,
  tool_use_id text not null,
  tool_name   text not null,
  input       jsonb not null,
  summary     text,
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'executed', 'failed')),
  result      jsonb,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index if not exists uq_pending_tool_use on botops.ai_pending_actions(tool_use_id);
create index if not exists idx_pending_thread on botops.ai_pending_actions(thread_id, status);

alter table botops.ai_threads         enable row level security;
alter table botops.ai_messages        enable row level security;
alter table botops.ai_pending_actions enable row level security;
