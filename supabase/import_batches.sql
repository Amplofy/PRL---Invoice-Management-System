-- -------------------------------------------------------------
-- Import batches (admin approval workflow)
-- Run once in Supabase SQL Editor. Idempotent.
-- -------------------------------------------------------------
create table if not exists public.import_batches (
  id             uuid primary key default gen_random_uuid(),
  import_type    text not null check (import_type in ('invoices','contracts','vendors')),
  file_name      text not null default '',
  total_rows     integer not null default 0,
  duplicate_rows integer not null default 0,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  mode           text not null default 'append' check (mode in ('append','overwrite')),
  rows           jsonb not null default '[]',
  conflicts      jsonb not null default '[]',
  submitted_by   text not null default '',
  decided_by     text,
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists import_batches_status_idx
  on public.import_batches (status, created_at desc);

-- RLS: the frontend never reads this table directly; the backend
-- (service_role) handles all access. service_role bypasses RLS but
-- still needs table-level grants on manually created tables.
alter table public.import_batches enable row level security;
grant all on public.import_batches to service_role;

-- Upgrade note: if you created this table before the mode column existed, run:
-- alter table public.import_batches add column if not exists mode text not null default 'append';
