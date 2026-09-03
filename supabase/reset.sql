-- Full database reset for PRL-EOMS.
-- Run this in the Supabase SQL editor to wipe all EOMS tables,
-- then re-run schema.sql, seed.sql and rls-hardening.sql in order.
--
-- WARNING: destroys all existing data. Intended for a fresh start.

drop table if exists public.followup_emails cascade;
drop table if exists public.discrepancy_emails cascade;
drop table if exists public.comparison_results cascade;
drop table if exists public.comparisons cascade;
drop table if exists public.import_logs cascade;
drop table if exists public.app_settings cascade;
drop table if exists public.notifications cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.po_history cascade;
drop table if exists public.po_versions cascade;
drop table if exists public.invoices cascade;
drop table if exists public.cost_elements cascade;
drop table if exists public.service_matrix cascade;
drop table if exists public.contracts cascade;
drop table if exists public.vendors cascade;
drop table if exists public.users cascade;
drop table if exists public.role_permissions cascade;
drop table if exists public.permissions cascade;
drop table if exists public.profiles cascade;
drop table if exists public.roles cascade;
