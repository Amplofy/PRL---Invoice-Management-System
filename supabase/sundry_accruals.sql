-- Sundry accruals + optional payment-release channel.
-- Apply after schema.sql / finance_po.sql / contract_services.sql on existing DBs.

alter table public.po_versions
  add column if not exists released_via text;

alter table public.po_versions
  add column if not exists release_reference text;

do $$
begin
  alter table public.po_versions drop constraint if exists po_versions_released_via_check;
  alter table public.po_versions
    add constraint po_versions_released_via_check
    check (released_via is null or released_via in ('cheque', 'bank_transfer', 'rtgs', 'other'));
exception
  when duplicate_object then null;
end $$;

insert into public.app_settings (key, value)
values ('fy_accrual_overrides', '[]')
on conflict (key) do nothing;
