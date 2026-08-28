-- RLS hardening for production.
-- The backend uses the service-role key (bypasses RLS).
-- The frontend anon key is only used for Auth; it should read no tables directly.
-- Run this AFTER schema.sql in the Supabase SQL editor.

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.users enable row level security;
alter table public.vendors enable row level security;
alter table public.contracts enable row level security;
alter table public.service_matrix enable row level security;
alter table public.cost_elements enable row level security;
alter table public.invoices enable row level security;
alter table public.po_versions enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;
alter table public.app_settings enable row level security;
alter table public.import_logs enable row level security;
alter table public.comparisons enable row level security;
alter table public.comparison_results enable row level security;
alter table public.discrepancy_emails enable row level security;
alter table public.followup_emails enable row level security;

-- No permissive policies are created on purpose:
-- anon/authenticated roles get zero table access, all data flows
-- through the backend API which uses the service-role key.
