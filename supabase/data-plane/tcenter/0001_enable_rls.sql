-- BotOps Phase 4 — close the anon-exposure hole on the T-CENTER data plane.
-- These 6 tables had RLS DISABLED → the project's anon key could read/write every
-- row (orders, human_mode, graphics, audit_log = customer PII + payment data).
-- Enabling RLS with NO policies denies anon/authenticated entirely. The bot
-- (n8n `supabaseApi` = service_role) and the dashboard (Management PAT) both
-- BYPASS RLS, so neither is affected. Verified safe via:
--   • all 19 supabase nodes + 2 httpRequest nodes use the service_role credential
--   • PARADOX already runs RLS-on / 0-policy on inbox/media_sent/message_buffer
--   • anon read test: readable before, blocked after.
-- Rollback (if ever needed): alter table public.<t> disable row level security;
alter table public.orders         enable row level security;
alter table public.human_mode     enable row level security;
alter table public.graphics       enable row level security;
alter table public.audit_log      enable row level security;
alter table public.message_buffer enable row level security;
alter table public.media_buffer   enable row level security;
