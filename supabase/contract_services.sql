-- =============================================================
-- PRL-EOMS incremental migration
-- Vendor emails + contract catalog services
-- Run in Supabase SQL Editor on an existing database.
-- Safe to re-run.
-- =============================================================

alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts
  add constraint contracts_status_check check (status in ('Open','Closed','Expiring','Expired'));

create table if not exists public.vendor_emails (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors(id) on delete cascade,
  email       text not null,
  label       text not null default 'surveyor',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (vendor_id, email)
);

create table if not exists public.contract_services (
  id                 uuid primary key default gen_random_uuid(),
  contract_id        uuid not null references public.contracts(id) on delete cascade,
  service_matrix_id  uuid not null references public.service_matrix(id) on delete restrict,
  t1                 text not null,
  t2                 text,
  t3                 text,
  unique (contract_id, service_matrix_id)
);

create index if not exists idx_vendor_emails_vendor on public.vendor_emails(vendor_id);
create unique index if not exists idx_vendor_emails_one_primary on public.vendor_emails(vendor_id) where is_primary;
create index if not exists idx_contract_services_contract on public.contract_services(contract_id);

alter table public.vendor_emails enable row level security;
alter table public.contract_services enable row level security;

insert into public.vendor_emails (vendor_id, email, label, is_primary)
select v.id, v.email, 'surveyor', true
from public.vendors v
where v.email is not null and length(trim(v.email)) > 0
on conflict (vendor_id, email) do nothing;

insert into public.contract_services (contract_id, service_matrix_id, t1, t2, t3)
select c.id, m.id, m.t1, m.t2, m.t3
from public.contracts c
join public.service_matrix m on m.t2 = c.service
on conflict (contract_id, service_matrix_id) do nothing;
