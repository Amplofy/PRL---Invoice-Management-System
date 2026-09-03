-- =============================================================
-- PRL-EOMS incremental migration
-- Finance pay-order approval, payment release, PO history
-- Run in Supabase SQL Editor on an existing database.
-- Safe to re-run.
-- =============================================================

alter table public.po_versions
  add column if not exists status text;

alter table public.po_versions
  add column if not exists amount numeric(18,2);

alter table public.po_versions
  add column if not exists finance_approved_by text;

alter table public.po_versions
  add column if not exists finance_approved_at timestamptz;

alter table public.po_versions
  add column if not exists finance_remarks text;

alter table public.po_versions
  add column if not exists released_amount numeric(18,2);

alter table public.po_versions
  add column if not exists released_by text;

alter table public.po_versions
  add column if not exists released_at timestamptz;

update public.po_versions
   set status = coalesce(nullif(status, ''), 'Generated')
 where status is null or status = '';

update public.po_versions po
   set amount = coalesce(po.amount, inv.approved_amount, inv.amount, 0)
  from public.invoices inv
 where po.invoice_id = inv.id
   and po.amount is null;

alter table public.po_versions
  alter column status set default 'Generated';

alter table public.po_versions
  alter column amount set default 0;

update public.po_versions set amount = 0 where amount is null;
update public.po_versions set status = 'Generated' where status is null;

alter table public.po_versions
  alter column status set not null;

alter table public.po_versions
  alter column amount set not null;

do $$
begin
  alter table public.po_versions drop constraint if exists po_versions_status_check;
  alter table public.po_versions
    add constraint po_versions_status_check
    check (status in ('Generated', 'Cleared', 'Rejected'));
exception
  when others then null;
end $$;

create table if not exists public.po_history (
  id          uuid primary key default gen_random_uuid(),
  po_id       uuid not null references public.po_versions(id) on delete cascade,
  invoice_id  uuid references public.invoices(id) on delete set null,
  action      text not null,
  actor       text,
  amount      numeric(18,2),
  remarks     text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_po_versions_status on public.po_versions(status);
create index if not exists idx_po_history_po on public.po_history(po_id);
create index if not exists idx_po_history_created on public.po_history(created_at);

alter table public.po_history enable row level security;

insert into public.permissions (id, name, category) values
  ('po.approve', 'Approve Payment Orders', 'Finance')
on conflict (id) do nothing;

insert into public.roles (id, name, description, color) values
  ('00000000-0000-0000-0000-000000000006', 'finance', 'Final pay-order approval and payment release', '#22d3ee')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000001', 'po.approve'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id) values
  ('00000000-0000-0000-0000-000000000006', 'invoice.view'),
  ('00000000-0000-0000-0000-000000000006', 'contract.view'),
  ('00000000-0000-0000-0000-000000000006', 'reports.view'),
  ('00000000-0000-0000-0000-000000000006', 'po.approve')
on conflict do nothing;

insert into public.po_history (po_id, invoice_id, action, actor, amount, remarks, created_at)
select po.id, po.invoice_id, 'Generated', po.generated_by, po.amount, null, po.generated_at
from public.po_versions po
where not exists (
  select 1 from public.po_history h where h.po_id = po.id and h.action = 'Generated'
);

do $$
begin
  alter table public.invoices drop constraint if exists invoices_status_check;
  alter table public.invoices
    add constraint invoices_status_check
    check (status in ('Pending','Approved','Rejected','Draft','Void','Paid'));
exception
  when others then null;
end $$;

update public.invoices inv
   set status = 'Paid'
  from public.po_versions po
 where po.invoice_id = inv.id
   and po.status = 'Cleared'
   and inv.status in ('Approved', 'Accepted', 'Submitted');
