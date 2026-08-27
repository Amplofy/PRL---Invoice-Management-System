-- =============================================================
-- PRL-EOMS Seed Data
-- Roles, permissions, settings, sample vendors + contracts
-- Run after schema.sql in Supabase SQL Editor
-- =============================================================

-- -------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------
insert into public.permissions (id, name, category) values
  ('invoice.view',        'View Invoices',          'Invoices'),
  ('invoice.create',      'Create Invoices',        'Invoices'),
  ('invoice.update',      'Update Invoices',        'Invoices'),
  ('invoice.delete',      'Delete Invoices',        'Invoices'),
  ('invoice.approve',     'Approve Invoices',       'Invoices'),
  ('invoice.reject',      'Reject Invoices',        'Invoices'),
  ('po.generate',         'Generate Payment Orders','Invoices'),
  ('contract.view',       'View Contracts',         'Contracts'),
  ('contract.create',     'Create Contracts',       'Contracts'),
  ('contract.update',     'Update Contracts',       'Contracts'),
  ('contract.delete',     'Delete Contracts',       'Contracts'),
  ('vendor.manage',       'Manage Vendors',         'Contracts'),
  ('import.data',         'Import Data',            'Data'),
  ('compare.data',        'Compare Documents',      'Data'),
  ('followup.send',       'Send Follow-up Emails',  'Data'),
  ('reports.view',        'View Reports',           'Reports'),
  ('users.manage',        'Manage Users',           'Administration'),
  ('roles.manage',        'Manage Roles',           'Administration'),
  ('settings.manage',     'Manage Settings',        'Administration')
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Roles
-- -------------------------------------------------------------
insert into public.roles (id, name, description, color) values
  ('00000000-0000-0000-0000-000000000001', 'admin',     'Full system access', '#60a5fa'),
  ('00000000-0000-0000-0000-000000000002', 'approver',  'Review and approve invoices', '#34d399'),
  ('00000000-0000-0000-0000-000000000003', 'processor', 'Create and process invoices', '#f472b6'),
  ('00000000-0000-0000-0000-000000000004', 'viewer',    'Read-only access', '#94a3b8'),
  ('00000000-0000-0000-0000-000000000005', 'auditor',   'Reports and audit access', '#fbbf24')
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Role-Permission mapping
-- -------------------------------------------------------------
-- admin: all permissions
insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000001', id from public.permissions
on conflict do nothing;

-- approver
insert into public.role_permissions (role_id, permission_id) values
  ('00000000-0000-0000-0000-000000000002', 'invoice.view'),
  ('00000000-0000-0000-0000-000000000002', 'invoice.approve'),
  ('00000000-0000-0000-0000-000000000002', 'invoice.reject'),
  ('00000000-0000-0000-0000-000000000002', 'contract.view'),
  ('00000000-0000-0000-0000-000000000002', 'reports.view')
on conflict do nothing;

-- processor
insert into public.role_permissions (role_id, permission_id) values
  ('00000000-0000-0000-0000-000000000003', 'invoice.view'),
  ('00000000-0000-0000-0000-000000000003', 'invoice.create'),
  ('00000000-0000-0000-0000-000000000003', 'invoice.update'),
  ('00000000-0000-0000-0000-000000000003', 'contract.view'),
  ('00000000-0000-0000-0000-000000000003', 'reports.view')
on conflict do nothing;

-- viewer
insert into public.role_permissions (role_id, permission_id) values
  ('00000000-0000-0000-0000-000000000004', 'invoice.view'),
  ('00000000-0000-0000-0000-000000000004', 'contract.view')
on conflict do nothing;

-- auditor
insert into public.role_permissions (role_id, permission_id) values
  ('00000000-0000-0000-0000-000000000005', 'invoice.view'),
  ('00000000-0000-0000-0000-000000000005', 'contract.view'),
  ('00000000-0000-0000-0000-000000000005', 'reports.view')
on conflict do nothing;

-- -------------------------------------------------------------
-- App settings
-- -------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('followup_template', 'Dear {{vendorName}},\n\nThis is a courteous reminder that the following invoice(s) against contract {{contractNo}} are currently pending with Pakistan Refinery Limited:\n\n{{invoiceList}}\n\nWe would appreciate your prompt attention so that processing may continue. Please do not hesitate to contact us should you require any clarification.\n\nKind regards,\nPRL Finance Department'),
  ('discrepancy_template', 'Dear {{vendorName}},\n\nDuring reconciliation of {{baseFileName}} against {{compareFileName}}, the following discrepancy was identified for key {{keyValue}}:\n\n{{discrepancyList}}\n\nWe request you to review and confirm the correct figures at your earliest convenience.\n\nKind regards,\nPRL Finance Department'),
  ('maximum_invoice_amount', '2500000'),
  ('expiring_threshold_days', '60'),
  ('financial_year', '2026-27'),
  ('cost_center', '11369'),
  ('duplicate_check', 'true'),
  ('future_date_allowed', 'false'),
  ('enable_audit', 'true')
on conflict (key) do nothing;

-- -------------------------------------------------------------
-- Sample vendors
-- -------------------------------------------------------------
insert into public.vendors (id, name, email) values
  ('00000000-0000-0000-0000-000000000101', 'M/s Abdul Moiz Enterprises', 'surveyor1@example.com'),
  ('00000000-0000-0000-0000-000000000102', 'M/s Karachi Surveyors',       'surveyor2@example.com'),
  ('00000000-0000-0000-0000-000000000103', 'M/s Delta Marine Services',   'surveyor3@example.com')
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Sample contracts
-- -------------------------------------------------------------
insert into public.contracts (id, contract_no, vendor_id, service, start_date, end_date, value) values
  ('00000000-0000-0000-0000-000000000201', 'BH-LD-26', '00000000-0000-0000-0000-000000000101', 'Surveying',          '2026-01-01', '2026-12-31', 5000000),
  ('00000000-0000-0000-0000-000000000202', 'TH-14-26', '00000000-0000-0000-0000-000000000102', 'Tanker Handling',    '2026-01-01', '2026-12-31', 8000000),
  ('00000000-0000-0000-0000-000000000203', 'SM-09-26', '00000000-0000-0000-0000-000000000103', 'Stock Measurement',  '2026-01-01', '2026-12-31', 3500000)
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Default application users (create Supabase auth users with same email)
-- -------------------------------------------------------------
insert into public.users (id, username, full_name, email, role_id, status) values
  ('00000000-0000-0000-0000-000000000301', 'a.malik', 'Abdul Moiz',   'a.malik@prl.com.pk', '00000000-0000-0000-0000-000000000001', 'active'),
  ('00000000-0000-0000-0000-000000000302', 'approver', 'S. Khan',      's.khan@prl.com.pk',  '00000000-0000-0000-0000-000000000002', 'active'),
  ('00000000-0000-0000-0000-000000000303', 'processor', 'R. Ahmed',    'r.ahmed@prl.com.pk', '00000000-0000-0000-0000-000000000003', 'active')
on conflict (id) do nothing;

-- Seed profiles for these users after their auth.users exist.
-- Create the auth users first, then map:
-- insert into public.profiles (id, full_name, role_id)
-- select au.id, 'Abdul Moiz', '00000000-0000-0000-0000-000000000001'
-- from auth.users au where au.email = 'a.malik@prl.com.pk'
-- on conflict (id) do nothing;
