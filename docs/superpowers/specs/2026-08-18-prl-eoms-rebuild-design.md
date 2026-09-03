# PRL-EOMS Rebuild — Design Specification

Date: 2026-08-18
Status: Approved
Author: Abdul Moiz

## 1. Overview

Rebuild the Pakistan Refinery Limited Enterprise Operations Management System (PRL-EOMS) as a
modern, three-tier web application. The existing repository contains three prototype variants
(CloudBaseInteg.html, Loadinpg.html, prl-eoms-web). The best UI/UX (Loadinpg.html) is used as
the visual and functional reference and rebuilt from scratch using a modern stack.

### 1.1 Goals

- Keep the proven UI/UX of Loadinpg.html (dark glassmorphism, 4 accent themes, light/dark mode,
  boot screen, dashboard/reports/invoice workflow).
- Remove all legacy backend simulation (Cloudflare worker, D1 schema, mock sync, CF_CONFIG,
  "Edge Connected" chips, Information Gateway view).
- Deploy: frontend on Netlify, API on Render, database on Supabase (Postgres + Auth).
- Add three new modules: CSV/PDF Import, Pending-Invoice Email Follow-up, Document Comparison.

### 1.2 Non-Goals

- OCR for scanned PDFs (only digital/text-based PDFs supported).
- Real-time collaboration, offline-first sync, or SSR/SEO.
- Batch invoice operations (selection checkboxes exist but no batch actions).

## 2. Architecture

```
┌──────────────────────┐        ┌───────────────────┐        ┌────────────────────┐
│  Frontend (Netlify)  │  HTTP  │  API (Render)     │  SQL   │  Database (Supabase)│
│  Vite + React +      │ ─────► │  Node.js/Express  │ ─────► │  PostgreSQL + Auth  │
│  Tailwind + Chart.js │ ◄───── │  pdf-parse, csv,  │ ◄───── │  Resend (email)     │
└──────────────────────┘        │  xlsx, resend     │        └────────────────────┘
                                └───────────────────┘
```

- **Frontend**: Vite + React + TypeScript + Tailwind CSS + Chart.js. Static build deployed to
  Netlify. Talks to the Render API over HTTPS using `VITE_API_URL`.
- **Backend**: Node.js + Express on Render. Owns parsing (CSV/PDF/Excel), comparison logic,
  email sending, and all database writes via the Supabase **service-role** key (server-side
  only; never exposed to the browser). Public Supabase anon key is used for client-side auth.
- **Database**: Supabase Postgres. RLS disabled for service-role usage; row access enforced by
  the API layer and role-based checks.
- **Auth**: Supabase Auth (email/password). Backend middleware verifies the JWT and role.

### 2.1 Repository layout

```
/workspace
├── frontend/                  # Vite + React app (Netlify)
│   ├── src/
│   │   ├── api/               # API client
│   │   ├── components/        # UI components
│   │   ├── hooks/
│   │   ├── lib/               # supabase client, utils
│   │   ├── pages/             # route pages
│   │   └── styles/
│   └── ...
├── backend/                   # Express API (Render)
│   ├── src/
│   │   ├── routes/
│   │   ├── services/          # import, compare, email
│   │   ├── middleware/        # auth, roles, errors
│   │   └── config/
│   └── ...
├── docs/superpowers/specs/    # this spec
└── README.md                  # project + deployment guide
```

## 3. Data Model (Supabase tables)

| Table | Key fields |
|---|---|
| `profiles` | `id` (FK auth.users), `full_name`, `role_id` |
| `roles` | `id`, `name`, `description`, `color` |
| `permissions` | `id`, `name`, `category` |
| `role_permissions` | `role_id`, `permission_id` |
| `users` | `id`, `username`, `full_name`, `email`, `role_id`, `status`, `auth_id` |
| `vendors` | `id`, `name`, `email` (admin-editable), `created_at` |
| `contracts` | `id`, `vendor_id`, `service`, `start_date`, `end_date`, `value`, `status` |
| `service_matrix` | `id`, `t1`, `t2`, `t3`, `cost_element`, `tanker_required`, `trips` |
| `cost_elements` | `code`, `name` |
| `invoices` | `id`, `serial_no`, `processing_date`, `contract_id`, `invoice_no`, `invoice_date`, `t1`, `t2`, `t3`, `tanker_name`, `trips`, `item_no`, `cost_element`, `service_from`, `service_to`, `amount`, `status` (Pending/Approved/Rejected/Draft/Void), `approved_by`, `approved_date`, `approved_amount`, `remarks`, `row_version`, `created_at/by`, `updated_at/by` |
| `po_versions` | `id`, `invoice_id`, `serial_no`, `generated_at`, `generated_by` |
| `audit_log` | `id`, `timestamp`, `user`, `action`, `entity_type`, `entity_id`, `summary` |
| `notifications` | `id`, `user_id`, `type`, `title`, `message`, `read`, `time` |
| `app_settings` | `key`, `value` (email templates, thresholds) |
| `import_logs` | `id`, `user_id`, `type`, `file_name`, `rows_parsed`, `rows_imported`, `status`, `created_at` |
| `comparisons` | `id`, `user_id`, `base_file_name`, `compare_file_name`, `join_key`, `columns`, `status`, `created_at` |
| `comparison_results` | `id`, `comparison_id`, `kind` (mismatch/missing/extra), `key_value`, `base_value`, `compare_value`, `column`, `resolved` |
| `discrepancy_emails` | `id`, `comparison_id`, `vendor_id`, `subject`, `body`, `sent_at`, `status`, `recipient` |
| `followup_emails` | `id`, `invoice_id`, `vendor_id`, `recipient`, `subject`, `body`, `sent_at`, `status` |

## 4. Backend API (Express on Render)

Base URL: `https://<render-service>.onrender.com/api`

### 4.1 Auth middleware

- `POST /auth/login` — not needed; client signs in with Supabase Auth directly.
- `verifyJwt` middleware: parses `Authorization: Bearer <supabase-jwt>`, verifies with Supabase
  (or JWT secret), loads profile/role, attaches to `req.user`.
- `requireRole('admin')` middleware for admin-only endpoints.

### 4.2 Endpoints

**Master data**
- `GET/POST /contracts`, `GET/PUT/DELETE /contracts/:id`
- `GET/POST /vendors`, `GET/PUT/DELETE /vendors/:id`
- `GET/POST /invoices`, `GET/PUT/DELETE /invoices/:id`
- `POST /invoices/:id/approve`, `POST /invoices/:id/reject`
- `GET/POST /service-matrix`, `GET/POST /cost-elements`
- `GET /reports/dashboard`, `GET /reports/summary`

**Admin**
- `GET/PUT /vendors/:id/email` (admin-only) — set surveyor email
- `GET/PUT /settings` (admin-only) — email template, thresholds, `followup_template`

**Import module**
- `POST /import/parse` — multipart file upload (CSV/PDF/Excel) + `type` (invoices/contracts/vendors)
  → parses, validates, returns preview rows + issues (no DB write).
- `POST /import/confirm` — body: parsed rows from preview → inserts into DB, writes `import_logs`.
  Requires `requireRole('admin')`.

**Compare module**
- `POST /compare` — body: `{ baseFileId, compareFileId, joinKey, columns, tolerance }` →
  parses both, aligns on join key, returns comparison results. Files uploaded via `POST /uploads`
  (multipart, temp storage in memory).
- `GET /compare/:id/results` — fetch stored comparison results.
- `POST /compare/:id/send-discrepancy` — sends discrepancy email to relevant surveyor
  (requires user confirmation in UI first). Writes `discrepancy_emails`.

**Follow-up module**
- `GET /followups/pending` — pending invoices with surveyor emails.
- `POST /followups/send` — body: `{ invoiceIds, templateOverride? }` → sends templated email to
  each invoice's vendor email. Requires confirmation in UI. Writes `followup_emails`.

**Uploads**
- `POST /uploads` — multipart upload, stores file temporarily, returns `fileId` (used by compare).

### 4.3 Parsing services

- CSV: `csv-parse` — header detection, column mapping, type coercion, duplicate detection.
- Excel: `xlsx` — first sheet, header detection.
- PDF: `pdf-parse` — extract text, heuristic table/row extraction for known layouts.
- Validation rules mirror Loadinpg.html: required dates, contract window, future-date block,
  duplicate invoice-number check, max amount check, contract balance check.

## 5. Frontend (Vite + React + Tailwind)

### 5.1 Views (ported from Loadinpg.html)

| Route | View | Notes |
|---|---|---|
| `/` | Dashboard | KPI cards (animated count-up), trend chart, status doughnut, utilization bars, recent invoices |
| `/control-tower` | Control Tower | alert KPIs, pending invoices, expiring contracts |
| `/invoices` | Invoices | filterable table, multi-select, new/edit invoice workspace |
| `/workflow` | Workflow Board | Pending/Approved/Rejected kanban columns |
| `/contracts` | Contracts | KPIs + utilization table |
| `/approvals` | Approvals | pending queue with Review |
| `/payment-orders` | Payment Orders | Finance last-decision queue: Approve & Release or Reject; print |
| `/po-history` | PO History | Generated / cleared / rejected pay-order trail |
| `/reports` | Reports | vendor bar chart, service pie, summary + CSV export |
| `/admin` | System Admin | password gate, master data CRUD, settings |
| `/users` | User Management | users/roles/permissions/sessions tabs |
| `/import` | **Import** (new) | upload → preview → confirm |
| `/followups` | **Follow-up** (new) | pending invoices, one-click email |
| `/compare` | **Compare** (new) | two-file comparison |
| `/login` | Login | Supabase Auth |

### 5.2 Removed vs added

- **Removed**: Cloud Backend view, Information Gateway view, CF_CONFIG/sync, "Edge Connected"
  chips, mock D1/worker/deployment content.
- **Added**: Import, Follow-up, Compare modules; PRL branding; "Abdul Moiz" credit.

### 5.3 Theming

- Same design tokens: dark glassmorphism defaults, light mode override, 4 themes
  (default/aurora/sunset/ocean), Inter font, gradient mesh background.
- Boot/loading screen, toasts, modals, FAB, command palette (Cmd+K), keyboard shortcuts.

### 5.4 Branding

- Official PRL logo (file provided by user) rendered in sidebar, login page, and header.
- Footer/login credit: **"Abdul Moiz"** (name only, no "sole developer" text).

## 6. New Modules (UI flows)

### 6.1 Import module
1. Choose type (Invoices / Contracts / Vendors) + upload CSV/PDF/Excel.
2. Backend parses → returns preview table with per-row validation flags/issues.
3. User (must be admin) reviews preview, corrects nothing inline (re-upload if bad),
   clicks **Confirm Import**.
4. Backend inserts rows, logs to `import_logs`, toasts success/failure counts.

### 6.2 Follow-up module
1. `/followups` shows pending invoices grouped by vendor with surveyor email.
2. User selects invoices → **Send Follow-up** → confirmation modal shows recipients +
   message preview (templated from `app_settings.followup_template`).
3. Confirmed → API sends email per invoice to vendor email, writes `followup_emails`.

### 6.3 Compare module
1. Upload two files (CSV/PDF/Excel) via `/uploads`.
2. Select base file ("Compare FROM") and candidate file ("Compare TO").
3. Column mapping UI: auto-detected columns; choose join key + columns to compare + tolerance.
4. **Compare** → backend aligns rows, flags mismatches/missing/extra.
5. Results: side-by-side diff table with highlights + summary KPIs.
6. Discrepancy follow-up: **Send to surveyor** button → confirmation prompt → email to relevant
   vendor email highlighting discrepancies. Writes `discrepancy_emails`.

## 7. Error Handling

- API returns `{ error }` with proper HTTP status codes; frontend shows toasts.
- File parse errors return per-row issues, not hard failures.
- Email send failures are recorded in `followup_emails`/`discrepancy_emails` with `status=failed`
  and surfaced in the UI.

## 8. Testing

- Backend: unit tests for parsing services (CSV/PDF/Excel), comparison logic, validation.
- Frontend: Vitest for key utilities (formatting, validation mirrors), happy path smoke tests.
- Manual end-to-end: import → verify rows; compare → verify diff; follow-up → verify email sent.

## 9. Deployment Guide (in README.md)

### 9.1 Supabase
1. Create project. Run `supabase/schema.sql` (tables + seed roles/permissions/settings).
2. Enable Auth (email/password). Create an admin user.
3. Copy `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`.

### 9.2 Backend (Render)
1. Create a Web Service pointing at `backend/` (root directory, Node runtime).
2. Build: `npm install`; Start: `npm start`.
3. Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `RESEND_API_KEY`,
   `EMAIL_FROM` (e.g. `noreply@prl-eoms.com`), `CORS_ORIGIN` (Netlify URL).

### 9.3 Frontend (Netlify)
1. Create a new site from Git; base directory `frontend/`; build `npm run build`;
   publish `dist/`.
2. Env vars: `VITE_API_URL=https://<render-service>.onrender.com/api`,
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Rebuild on push or manual deploy.

### 9.4 Email (Resend)
1. Create Resend account, add domain, get API key → `RESEND_API_KEY` on Render.
2. `EMAIL_FROM` must be a verified domain.

## 10. Open Items

- Official PRL logo file (user to provide path) — placeholder branded mark used until provided.
- PDF table parsing heuristic needs real PRL report samples for tuning.
