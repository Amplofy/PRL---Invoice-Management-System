# PRL-EOMS Production Deployment

Frontend on Cloudflare Pages (or Netlify), API on Render, database + auth on Supabase.
Repo is already on GitHub, so both hosting platforms connect to it directly.

## 0. Prerequisites

- GitHub repo: `Amplofy/PRL---Invoice-Management-System` (pushed)
- Accounts: dash.cloudflare.com, render.com, supabase.com (free tiers work)

## 0.5 Resetting an existing Supabase project

If the database already has old/partial tables, clean it first:

1. SQL Editor → run `supabase/reset.sql` (drops every EOMS table — destroys data).
2. Then run the three scripts from step 1 below, in order.

## 1. Supabase (database + auth)

1. Create a project at supabase.com — pick region closest to Pakistan
   (Singapore or Mumbai) for lowest latency.
2. SQL Editor → run these in order:
   1. `supabase/schema.sql` (tables, including `import_batches`)
   2. `supabase/seed.sql` (roles, permissions, settings)
   3. `supabase/rls-hardening.sql` (locks anon access on every table; API is the only data path)
3. Create auth users: Authentication → Users → Add user.
   Create one user per real account, then link each to an EOMS role by
   inserting into `public.users` (role, auth_id) via SQL editor.
4. Collect values for later steps:
   - Project URL → `SUPABASE_URL`
   - Settings → API → `anon` key → `SUPABASE_ANON_KEY` (frontend + backend)
   - Settings → API → `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend ONLY)
   - Settings → API → JWT Secret → `SUPABASE_JWT_SECRET` (backend)

### Existing database (do not re-run schema.sql)

If the project already has tables from an earlier release, skip `schema.sql` / `seed.sql` / `reset.sql`. In SQL Editor, run these additive scripts in order and skip any already applied. Every script is idempotent (`if not exists` / `on conflict do nothing`), adds schema only, and back-fills new columns from existing rows — none of them delete rows, drop columns or overwrite business data.

1. `supabase/finance_po.sql` — `po_versions` status/amount/finance/release columns, `po_history`, `po.approve` permission + `finance` role, and a back-fill that marks already-cleared invoices `Paid`
2. `supabase/contract_services.sql` — `vendor_emails` + `contract_services` tables, `contracts.status` constraint, back-filled from existing vendors/contracts
3. `supabase/sundry_accruals.sql` — `released_via` / `release_reference` + `fy_accrual_overrides`
4. `supabase/service_locations.sql` — `service_matrix.locations` + `invoices.location`, with default locations for the seeded services
5. `supabase/import_batches.sql` — `import_batches` table for the admin import-approval workflow (skip if it already exists)
6. `supabase/rls-hardening.sql` — enables RLS on every table, including the new ones (safe to re-run)
7. `supabase/fix_zero_amounts.sql` — one-off data repair: clears `approved_amount = 0`, restores zero PO amounts from their invoice, and realigns `po_history` (safe to re-run, deletes nothing)

Before running, take a backup (Supabase Dashboard → Database → Backups, or `pg_dump`). Only `reset.sql` is destructive; the seven scripts above are safe.

Verify afterwards (each query should return the listed objects):

```sql
-- tables
select 'import_batches' as object, to_regclass('public.import_batches') is not null as present
union all select 'vendor_emails',     to_regclass('public.vendor_emails') is not null
union all select 'contract_services', to_regclass('public.contract_services') is not null
union all select 'po_history',        to_regclass('public.po_history') is not null;

-- columns
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'invoices' and column_name in ('location','service_from','service_to')) or
  (table_name = 'service_matrix' and column_name = 'locations') or
  (table_name = 'po_versions' and column_name in ('status','amount','released_via','release_reference'))
)
order by 1, 2;

-- settings (po_template is created on first save from Administration)
select key from public.app_settings where key in ('po_template','fy_accrual_overrides','cost_center');

-- amount repair: both counts should be 0 after fix_zero_amounts.sql
select
  (select count(*) from public.invoices where approved_amount = 0) as zero_approved_invoices,
  (select count(*) from public.po_versions where amount = 0) as zero_po_amounts;
```

Then redeploy backend and frontend from branch `260903-feat-finance-po-paid`.

## 2. Render (backend API)

1. New → Blueprint → connect the GitHub repo → Render reads `render.yaml`.
2. Fill the `sync: false` variables when prompted:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
     `SUPABASE_ANON_KEY`
   - `CORS_ORIGIN`: after step 3 you know the Netlify URL — use
     `https://<your-netlify-site>.netlify.app` (no trailing slash).
     Update it after the first Netlify deploy and the service redeploys.
3. Deploy. Note the service URL, e.g. `https://prl-eoms-backend.onrender.com`.
   Verify: `curl https://<render-url>/api/health` → `{"status":"ok"}`.

## 3. Frontend hosting (SPA)

### Option A — Cloudflare Pages (recommended: free unlimited builds)

Netlify's free plan caps build minutes per month. Cloudflare Pages has no
build-minute cap, so prefer it when the Netlify quota is exhausted.

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Select the repo, then set:
   - Framework preset: Vite
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Output directory: `dist`
3. Environment variables (Production):
   - `VITE_API_URL` = `https://<render-url>` (NO trailing slash, NO `/api`)
   - `VITE_SUPABASE_URL` = `https://<project>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon key
4. Save and deploy. SPA fallback works via `frontend/public/_redirects`.

### Option B — Netlify (when build minutes are available)

1. Add new site → Import from Git → pick the repo.
2. `netlify.toml` at the repo root is auto-detected (build + SPA redirects).
3. Set the same three `VITE_*` environment variables as above.
4. Deploy. Cloudflare Pages URL like https://<site>.pages.dev or Netlify URL like: `https://<site>.netlify.app`.

## 4. Close the loop

1. Set `CORS_ORIGIN` on Render to the final frontend URL (Cloudflare Pages or Netlify) → save → redeploy.
2. Optional custom domains on both platforms (HTTPS is automatic).
3. Log in with a Supabase auth user (not demo mode) and smoke-test:
   invoices list → create → Payment Orders approve/release → Admin yearly budgets / sundry accrual → Reports Gen Report → import wizard.
   Hard-refresh the browser after deploy. Closed-FY invoice field edits stay locked; unpaid prior-year POs remain approvable until Paid.

## Environment variable summary

| Variable | Where | Value |
|---|---|---|
| `SUPABASE_URL` | Render + Netlify (`VITE_` prefixed on Netlify) | project URL |
| `SUPABASE_ANON_KEY` | Render + Netlify (`VITE_` prefixed) | anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Render only — NEVER the frontend | service key |
| `SUPABASE_JWT_SECRET` | Render only | JWT secret |
| `CORS_ORIGIN` | Render only | Netlify site URL |
| `VITE_API_URL` | Netlify only | Render URL, no trailing slash |
| `RESEND_API_KEY` | Render only (optional) | enables email sends |

## Notes and recommendations

- Render's free plan sleeps after inactivity (~50s cold start on first hit).
  Use the `starter` plan (already set in `render.yaml`) to avoid cold starts.
- The service-role key bypasses RLS — keep it in Render env vars only.
  `rls-hardening.sql` guarantees the exposed anon key cannot read tables.
- Email (Resend) is optional; the app runs without it.
- Demo mode (sessionStorage flag) still works on production builds — it is a
  client-side escape hatch and touches no real data.
- GitHub repo: `Amplofy/PRL---Invoice-Management-System` (pushed)
