-- Additive user/role hardening for existing databases.
-- Finance may view invoices and release payment orders, never create/edit/delete them.
-- Login lockout columns are optional telemetry; the API also tracks attempts in memory.

delete from public.role_permissions
where role_id = '00000000-0000-0000-0000-000000000006'
  and permission_id in ('invoice.create', 'invoice.update', 'invoice.delete');

alter table public.users
  add column if not exists failed_login_count integer not null default 0;

alter table public.users
  add column if not exists locked_until timestamptz;
