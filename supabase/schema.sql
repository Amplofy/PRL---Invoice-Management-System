-- =============================================================
-- PRL-EOMS Database Schema
-- Pakistan Refinery Limited - Enterprise Operations Management
-- Run in Supabase SQL Editor
-- =============================================================

-- -------------------------------------------------------------
-- Roles (created before profiles, which references roles)
-- -------------------------------------------------------------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null default '',
  color       text not null default '#60a5fa',
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Profiles (linked to Supabase auth.users)
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role_id     uuid references public.roles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------
create table if not exists public.permissions (
  id          text primary key,
  name        text not null,
  category    text not null default 'General'
);

-- -------------------------------------------------------------
-- Role-Permission mapping
-- -------------------------------------------------------------
create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- -------------------------------------------------------------
-- Users (application users)
-- -------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  username    text not null unique,
  full_name   text not null,
  email       text not null unique,
  role_id     uuid references public.roles(id),
  auth_id     uuid references auth.users(id) on delete set null,
  status      text not null default 'active' check (status in ('active','inactive')),
  last_login  timestamptz,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Vendors / Surveyors
-- -------------------------------------------------------------
create table if not exists public.vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Contracts
-- -------------------------------------------------------------
create table if not exists public.contracts (
  id          uuid primary key default gen_random_uuid(),
  contract_no text not null unique,
  vendor_id   uuid not null references public.vendors(id) on delete restrict,
  service     text not null,
  start_date  date not null,
  end_date    date not null,
  value       numeric(18,2) not null default 0 check (value >= 0),
  status      text not null default 'Open' check (status in ('Open','Closed','Expiring')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Service Matrix
-- -------------------------------------------------------------
create table if not exists public.service_matrix (
  id              uuid primary key default gen_random_uuid(),
  t1              text not null,
  t2              text not null,
  t3              text not null,
  cost_element    text not null,
  tanker_required boolean not null default false,
  trips           boolean not null default false
);

-- -------------------------------------------------------------
-- Cost Elements
-- -------------------------------------------------------------
create table if not exists public.cost_elements (
  code        text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Invoices
-- -------------------------------------------------------------
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  serial_no       text,
  processing_date date,
  contract_id     uuid references public.contracts(id) on delete restrict,
  invoice_no      text not null,
  invoice_date    date,
  t1              text,
  t2              text,
  t3              text,
  tanker_name     text,
  trips           integer,
  item_no         text,
  cost_element    text,
  service_from    date,
  service_to      date,
  amount          numeric(18,2) not null default 0 check (amount >= 0),
  status          text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Draft','Void','Paid')),
  approved_by     text,
  approved_date   timestamptz,
  approved_amount numeric(18,2),
  remarks         text,
  row_version     integer not null default 1,
  created_at      timestamptz not null default now(),
  created_by      text,
  updated_at      timestamptz not null default now(),
  updated_by      text
);

-- -------------------------------------------------------------
-- Payment Order versions
-- -------------------------------------------------------------
create table if not exists public.po_versions (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  serial_no    text not null,
  generated_at timestamptz not null default now(),
  generated_by text,
  status       text not null default 'Generated' check (status in ('Generated','Cleared','Rejected')),
  amount       numeric(18,2) not null default 0 check (amount >= 0),
  finance_approved_by text,
  finance_approved_at timestamptz,
  finance_remarks     text,
  released_amount     numeric(18,2),
  released_by         text,
  released_at         timestamptz
);

-- -------------------------------------------------------------
-- Payment Order history (finance decisions and payment releases)
-- -------------------------------------------------------------
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

-- -------------------------------------------------------------
-- Audit log
-- -------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  timestamp   timestamptz not null default now(),
  user_email  text,
  action      text not null,
  entity_type text,
  entity_id   text,
  summary     text
);

-- -------------------------------------------------------------
-- Notifications
-- -------------------------------------------------------------
create table if not exists public.notifications (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type    text not null default 'info',
  title   text not null,
  message text,
  read    boolean not null default false,
  time    timestamptz not null default now()
);

-- -------------------------------------------------------------
-- App settings (email templates, thresholds)
-- -------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Import logs
-- -------------------------------------------------------------
create table if not exists public.import_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  type          text not null,
  file_name     text,
  rows_parsed   integer not null default 0,
  rows_imported integer not null default 0,
  status        text not null default 'completed',
  created_at    timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Comparisons
-- -------------------------------------------------------------
create table if not exists public.comparisons (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  base_file_name     text not null,
  compare_file_name  text not null,
  join_key           text not null,
  columns            jsonb not null default '[]',
  tolerance          numeric(10,4) not null default 0,
  status             text not null default 'completed',
  created_at         timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Comparison results
-- -------------------------------------------------------------
create table if not exists public.comparison_results (
  id            uuid primary key default gen_random_uuid(),
  comparison_id uuid not null references public.comparisons(id) on delete cascade,
  kind          text not null check (kind in ('mismatch','missing_in_compare','missing_in_base')),
  key_value     text not null,
  column_name   text,
  base_value    text,
  compare_value text,
  resolved      boolean not null default false
);

-- -------------------------------------------------------------
-- Discrepancy emails
-- -------------------------------------------------------------
create table if not exists public.discrepancy_emails (
  id            uuid primary key default gen_random_uuid(),
  comparison_id uuid references public.comparisons(id) on delete cascade,
  vendor_id     uuid references public.vendors(id) on delete set null,
  recipient     text,
  subject       text,
  body          text,
  status        text not null default 'sent',
  sent_at       timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Follow-up emails
-- -------------------------------------------------------------
create table if not exists public.followup_emails (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  vendor_id  uuid references public.vendors(id) on delete set null,
  recipient  text,
  subject    text,
  body       text,
  status     text not null default 'sent',
  sent_at    timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Indexes
-- -------------------------------------------------------------
create index if not exists idx_invoices_contract on public.invoices(contract_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_vendors_name on public.vendors(name);
create index if not exists idx_contracts_vendor on public.contracts(vendor_id);
create index if not exists idx_comparison_results_cmp on public.comparison_results(comparison_id);
create index if not exists idx_audit_timestamp on public.audit_log(timestamp);
create index if not exists idx_po_versions_invoice on public.po_versions(invoice_id);
create index if not exists idx_po_versions_status on public.po_versions(status);
create index if not exists idx_po_history_po on public.po_history(po_id);
create index if not exists idx_po_history_created on public.po_history(created_at);
