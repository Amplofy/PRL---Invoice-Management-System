-- Service catalog locations + invoice location snapshot.
-- Apply after schema.sql on existing DBs. Safe to re-run.

alter table public.service_matrix
  add column if not exists locations text[] not null default '{}'::text[];

alter table public.invoices
  add column if not exists location text;

update public.service_matrix
set locations = array['Keamari', 'Port Qasim']
where id = '00000000-0000-0000-0000-000000000401'
  and coalesce(cardinality(locations), 0) = 0;

update public.service_matrix
set locations = array['Keamari', 'Port Qasim']
where id = '00000000-0000-0000-0000-000000000403'
  and coalesce(cardinality(locations), 0) = 0;

update public.service_matrix
set locations = array['Keamari']
where id = '00000000-0000-0000-0000-000000000404'
  and coalesce(cardinality(locations), 0) = 0;
