-- Seed the control-plane from the existing static lib/registry.ts so the
-- DB-backed registry reproduces today's 3 clients / 2 refs EXACTLY. Idempotent.

insert into botops.data_plane_refs (supabase_ref, org, shared) values
  ('kracmhwzmgligxngmhmi', 'qckbfcwfqepmzxapinxi', true),
  ('xrvrjcnxogplmoybppay', 'qckbfcwfqepmzxapinxi', false)
on conflict (supabase_ref) do nothing;

insert into botops.tenants (slug, name, workspace, accent) values
  ('shift-digital', 'Shift Digital', 'mine',    '#5b8cff'),
  ('brjewelry',     'BRJewelry',     'clients', '#d4a14e'),
  ('t-center',      'T center',      'clients', '#2fbf71')
on conflict (slug) do nothing;

insert into botops.bots
  (tenant_id, slug, name, supabase_ref, table_include, table_exclude, n8n_prefixes, whapi_key, sheet_id, channel, status)
select t.id, v.slug, v.name, v.supabase_ref, v.table_include, v.table_exclude, v.n8n_prefixes, v.whapi_key, v.sheet_id, v.channel, 'live'
from (values
  ('shift-digital', 'Shift Digital', 'kracmhwzmgligxngmhmi',
     array['leads','activities','app_config'], array[]::text[],
     array['SDR','CRM Bridge','Shift'], 'shift-digital',
     '1IBhC6YCCVV9UHknv9_omW8eBwx8NYnNS1pkpooPHOkc', 'green'),
  ('brjewelry', 'BRJewelry', 'kracmhwzmgligxngmhmi',
     array[]::text[], array['leads','activities'],
     array['BRJewelry','BR Jewelry'], 'kracmhwzmgligxngmhmi',
     '1O-Z_NQP_d-3ppg623eY66yj_lyOFUyEcXl72Bc_WECE', 'whapi'),
  ('t-center', 'T center', 'xrvrjcnxogplmoybppay',
     array[]::text[], array[]::text[],
     array['T-CENTER','T CENTER','T center','T-center'], 'xrvrjcnxogplmoybppay',
     null, 'whapi')
) as v(slug, name, supabase_ref, table_include, table_exclude, n8n_prefixes, whapi_key, sheet_id, channel)
join botops.tenants t on t.slug = v.slug
on conflict (slug) do nothing;
