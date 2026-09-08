# PRL-EOMS — Pakistan Refinery Ltd Enterprise Operations & Management Suite

A validated 3-tier invoice/operations manager for Pakistan Refinery Limited.

- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS 4 (dark glassmorphism, 4 themes)
- **Backend**: Express 5 + TypeScript (CSV/Excel/PDF import, comparison engine, Resend email)
- **Database & Auth**: Supabase (Postgres + Auth + role-based access)
- **Email**: Resend transactional API

Built by **Abdul Moiz**.

---

## Architecture

```
┌──────────────┐     /api proxy (dev)      ┌──────────────┐
│  Frontend    │ ────────────────────────▶ │  Backend     │
│  Vite/React  │   Netlify (prod)          │  Express/TS  │
└──────────────┘                           └──────┬───────┘
       │                                          │
       │  Supabase Auth (JWT)                     │ service-role key (server-only)
       ▼                                          ▼
┌──────────────┐                           ┌──────────────┐
│  Supabase    │ ◀──────────────────────── │  Supabase    │
│  Auth        │                           │  Postgres    │
└──────────────┘                           └──────────────┘
```

- The frontend authenticates via **Supabase Auth** and sends the resulting JWT to the backend.
- The backend verifies the JWT with `SUPABASE_JWT_SECRET`, loads the user's role from `profiles` → `roles`, and enforces admin-only endpoints.
- All DB writes go through the backend using the service-role key — never exposed in the browser.

---

## Modules

| Module | Description |
| --- | --- |
| **Control Tower** | KPI dashboard, FY spotlight, invoice value trend, status breakdown, contract utilization |
| **Invoices** | Full CRUD, status filters, search, approve/reject with mandatory reason |
| **Workflow** | T1 → T2 → T3 cascading drill-down over the service matrix |
| **Approvals** | Queue of pending invoices with one-click approve/reject |
| **Payment Orders** | Finance last-decision queue: approve & release payment (clears budget remaining) or reject. Print PO documents. |
| **PO History** | Immutable record of generated, cleared, and rejected pay orders, including released amounts |
| **Contracts** | Vendor service contracts with expiry badges and utilization |
| **Reports** | FY-scoped spend, budget vs actual, sundry accrual ledger, cash pipeline, Excel workbook export |
| **Data Import** | Upload CSV/XLSX/XLS/PDF → validate → admin-confirm → commit |
| **Follow-ups** | One-click pending-invoice reminders to surveyor emails |
| **Compare** | Two-file diff with join key + column mapping + tolerance + discrepancy email |
| **Admin** | Yearly budgets, sundry accruals, vendor emails, service matrix, cost elements, Master Access, audit log |
| **Users & Roles** | Users, roles and permission coverage |

---

## Project layout

```
.
├── frontend/          # Vite + React + Tailwind app
│   ├── src/
│   │   ├── components/   # shared UI + layout
│   │   ├── lib/          # api client, supabase client, auth, format utils
│   │   ├── pages/        # one file per route
│   │   ├── App.tsx       # router
│   │   ├── theme.tsx     # dark/light + 4 themes
│   │   └── index.css     # PRL design tokens
│   └── .env.example
├── backend/           # Express + TypeScript API
│   ├── src/
│   │   ├── routes/       # import, compare, followups, settings, master, invoices, reports, payment-orders
│   │   ├── services/     # csv/excel/pdf parsers, import, compare, email, settings, audit
│   │   └── middleware/   # auth (JWT), error handler
│   ├── test/            # 20 unit tests (node:test)
│   └── .env.example
└── supabase/
    ├── schema.sql             # tables + RLS (fresh installs)
    ├── seed.sql               # roles, permissions, settings, sample data
    ├── rls-hardening.sql      # lock anon access; API is the only data path
    ├── finance_po.sql         # additive: Paid status + finance PO columns
    ├── contract_services.sql  # additive: vendor_emails + contract_services
    └── sundry_accruals.sql    # additive: released_via/reference + fy_accrual_overrides
```

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/schema.sql`, then `supabase/seed.sql`, then `supabase/rls-hardening.sql`.
3. Enable **Email** provider under **Authentication → Providers** (sign-ups), or create users from the dashboard.
4. Copy credentials from **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY` (frontend)
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend only)
5. Copy the **JWT secret** from **Project Settings → API → JWT Settings** → `SUPABASE_JWT_SECRET`.

### Creating the first admin

Run in the SQL Editor (replace the values):

```sql
insert into auth.users (id, email, raw_user_meta_data)
values (gen_random_uuid(), 'admin@prl.com.pk', '{"full_name":"PRL Admin"}')
on conflict do nothing;

-- then create the matching profile row via the auth.users id above
insert into public.profiles (id, email, full_name, role_id)
select u.id, u.email, 'PRL Admin', r.id
from auth.users u
cross join public.roles r
where u.email = 'admin@prl.com.pk'
  and r.name = 'admin'
on conflict do nothing;
```

Then set a password from the Supabase dashboard (Authentication → Users).

---

## 2. Backend (Render)

1. Create a **Render Web Service** from the `backend/` folder.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Add environment variables from `backend/.env.example`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
   - `RESEND_API_KEY`, `EMAIL_FROM`
   - `CORS_ORIGIN` → your Netlify URL (e.g. `https://your-app.netlify.app`)
   - `PORT=10000`

### Resend

- Add your sending domain in Resend and verify it.
- Set `EMAIL_FROM` to an address on that domain (e.g. `PRL Finance <noreply@your-domain.com>`).

---

## 3. Frontend (Netlify)

1. Create a **Netlify** site from the `frontend/` folder.
2. Build command: `npm install && npm run build`
3. Publish directory: `dist`
4. Add environment variables from `frontend/.env.example`:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` → your Render backend URL (e.g. `https://your-backend.onrender.com`)

---

## 4. Local development

### Backend

```bash
cd backend
cp .env.example .env      # fill in real values
npm install
npm run dev               # http://localhost:3001
```

### Frontend

```bash
cd frontend
cp .env.example .env      # fill in real values
npm install
npm run dev               # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:3001`, so `VITE_API_URL` can stay empty locally.

### Demo mode (no Supabase or backend needed)

On the Login page, click **Enter demo**. That writes `prl-eoms-demo=1` to `sessionStorage` and loads in-memory data from `frontend/src/lib/mockApi.ts` — no backend, no database, no emails sent.

Demo finance user: `f.hussain@prl.com.pk`. Admin and superadmin can also clear pay orders (`isFinanceOfficial`).

Refresh the tab or click sign out to leave demo. `VITE_DEMO_MODE` is unused.

### Tests & checks

```bash
cd backend
npm test                  # 20 unit tests
npm run typecheck

cd frontend
npm run lint              # oxlint
npm run build
```

---

## Email templates

Stored in `app_settings` and editable from **Admin → Email Templates**:

- `followup_template` — tokens: `{{vendorName}}`, `{{contractNo}}`, `{{invoiceNo}}`, `{{invoiceDate}}`, `{{amount}}`, `{{invoiceList}}`
- `discrepancy_template` — tokens: `{{vendorName}}`, `{{baseFileName}}`, `{{compareFileName}}`, `{{keyValue}}`, `{{discrepancyList}}`

---

## Data model (summary)

`profiles` · `roles` · `permissions` · `role_permissions` · `users` · `vendors` · `vendor_emails` · `contracts` · `contract_services` · `service_matrix` · `cost_elements` · `invoices` · `po_versions` · `audit_log` · `notifications` · `app_settings` · `import_logs` · `comparisons` · `comparison_results` · `discrepancy_emails` · `followup_emails`

See `supabase/schema.sql` for the canonical DDL.

### Invoice and payment lifecycle

Invoice statuses (DB check constraint): `Pending` | `Approved` | `Rejected` | `Draft` | `Void` | `Paid`.

1. Operations approve an invoice (`Approved`).
2. A pay order is generated (`po_versions.status = Generated`) and sits in Payment Orders awaiting finance.
3. A finance official (`admin` / `superadmin` / `finance`) **Approve & Release**. The PO becomes `Cleared`, `released_amount` is stored (optional Released Via / Reference), the invoice becomes `Paid`. Running-FY remaining budget falls only when the invoice belongs to the running FY. Closed-FY unpaid invoices deduct **Sundry Accrual Balance** instead.
4. Finance may instead **Reject** the PO (`Rejected`). The invoice stays `Approved`.
5. PO History records generate / clear / reject events. Reports show invoice approved, PO generated, and payment released side by side.

Budget / accrual FY is the year in which **service ends** (`service_to`, else `invoice_date`).

Master Access (Admin) is required to increase a yearly budget line (including a closed FY) or to override Sundry Accrual. First budget entry from 0 is not an increase.

### Existing databases

Run in the SQL Editor, in order, skipping scripts already applied:

1. `supabase/finance_po.sql` — Paid status + finance PO columns
2. `supabase/contract_services.sql` — vendor emails + contract catalog services
3. `supabase/sundry_accruals.sql` — `released_via` / `release_reference` + `fy_accrual_overrides`

Fresh installs use `schema.sql` + `seed.sql` + `rls-hardening.sql` only.
