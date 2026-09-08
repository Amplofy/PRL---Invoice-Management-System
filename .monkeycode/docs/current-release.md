# Current release notes

Branch: `260903-feat-finance-po-paid`
Date: 2026-09-08

## What this branch adds

- Finance last-decision pay orders, Paid invoices, optional Released Via / Reference
- Sundry Accrual per closed FY; Accrual Balance drops on prior-year Payment Release
- Master Access for budget increases and accrual overrides (first budget from 0 is not an increase)
- Budget / accrual FY is the year in which service ends (`service_to`, else `invoice_date`)
- Reports: PageHeader + Gen Report Excel workbook + FY chips + Invoices-style Filter + ribbon tabs
- Control Tower spotlight capsule; charts grow one-way with no wave or pop-out

## Existing Supabase (keep data)

SQL Editor, in order, skip any already applied:

1. `supabase/finance_po.sql`
2. `supabase/contract_services.sql`
3. `supabase/sundry_accruals.sql`

Do not run `supabase/reset.sql` on production data.

Fresh project: `schema.sql` then `seed.sql` then `rls-hardening.sql`.

## After git pull / merge

1. Redeploy backend (Render) so new API routes and PO columns are live
2. Redeploy frontend (Cloudflare Pages or Netlify)
3. Set `CORS_ORIGIN` to the live frontend origin if the URL changed
4. Hard-refresh the browser
5. Production login uses Supabase Auth. Demo mode does not need backend
6. Non-demo local preview needs backend on `:3001` (`/api` proxy)

## Smoke test

- Approve & Release a running-FY PO: remaining budget falls
- Approve & Release a closed-FY unpaid PO without FY unlock: Accrual Balance falls, running-FY remaining stays
- Closed-FY invoice field edits stay locked until FY unlock
- Admin Master Access: increase a budget line; override Sundry Accrual
- Reports: FY chips, Filter, Gen Report workbook download
