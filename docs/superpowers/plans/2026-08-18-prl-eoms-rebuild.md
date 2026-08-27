# PRL-EOMS Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild PRL-EOMS as a modern three-tier app (Vite+React frontend on Netlify, Express API on Render, Supabase DB+Auth) with CSV/PDF import, invoice follow-up email, and two-file comparison modules, plus official PRL branding.

**Architecture:** Static React frontend talks to an Express API over HTTPS. The API owns all parsing, comparison, email sending, and DB writes using the Supabase service-role key. Supabase Auth handles login; role-based middleware protects admin endpoints.

**Tech Stack:** Node 22, Vite 7, React 19, TypeScript, Tailwind CSS 4, Chart.js 4, Express 5, supabase-js, csv-parse, xlsx, pdf-parse, resend.

## Global Constraints

- Official PRL logo file is user-provided; until provided, use a branded placeholder SVG component `BrandLogo` with a refinery-tower motif. Never invent a real PRL logo asset from the web.
- Credit text in UI is exactly `Abdul Moiz` (name only — no "sole developer" text).
- `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` on frontend; `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CORS_ORIGIN` on backend.
- No OCR for scanned PDFs; only digital/text-based PDFs supported.
- Do not commit `.env`, `node_modules`, `dist`, `.supabase`, or generated secrets. `.env.example` files ARE committed.
- All UI copy in English, PKR currency formatting (en-PK), date format `DD-Mon-YYYY`.
- No backend simulation content from legacy HTML (no Cloudflare/D1/CF_CONFIG/edge chips) may appear anywhere.

---

### Task 1: Scaffold monorepo layout and remove legacy files

**Files:**
- Create: `/workspace/.gitignore`
- Create: `/workspace/frontend/` (Vite scaffold), `/workspace/backend/` (Express scaffold)
- Delete: `/workspace/CloudBaseInteg.html`, `/workspace/Loadinpg.html`, `/workspace/prl-eoms-web/`

**Interfaces:**
- Consumes: nothing.
- Produces: repo layout `frontend/` and `backend/`; root `.gitignore`.

- [ ] **Step 1: Create root `.gitignore`**

```
node_modules/
dist/
.env
.env.local
.env.production
*.log
.DS_Store
.supabase/
backend/tmp/
```

- [ ] **Step 2: Remove legacy files** (inform user these are deleted per approved plan)

Run: `git rm -r CloudBaseInteg.html Loadinpg.html prl-eoms-web`

- [ ] **Step 3: Scaffold frontend**

Run:
```bash
cd /workspace/frontend
npm create vite@latest . -- --template react-ts
npm install
npm install tailwindcss @tailwindcss/vite chart.js react-chartjs-2 @supabase/supabase-js lucide-react react-router-dom
npm install -D @types/react @types/react-dom typescript vite @vitejs/plugin-react
```

- [ ] **Step 4: Scaffold backend**

```bash
mkdir -p /workspace/backend/src/{routes,services,middleware,config,types}
cd /workspace/backend
npm init -y
npm install express cors dotenv @supabase/supabase-js jsonwebtoken multer csv-parse xlsx pdf-parse resend
npm install -D typescript tsx @types/express @types/cors @types/node @types/jsonwebtoken @types/multer @types/xlsx
npx tsc --init
```

- [ ] **Step 5: Verify scaffolds**

Run: `cd /workspace/frontend && npm run build` — expect success.
Run: `cd /workspace/backend && npx tsc --noEmit` — expect success (empty project).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo, remove legacy prototypes"
```

---

### Task 2: Supabase schema and seed SQL

**Files:**
- Create: `/workspace/supabase/schema.sql`
- Create: `/workspace/supabase/seed.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: canonical table definitions; `app_settings` keys `followup_template`, `discrepancy_template`, `maximum_invoice_amount`, `expiring_threshold_days`, `financial_year`, `cost_center`.

- [ ] **Step 1: Write `supabase/schema.sql`** with all tables from spec section 3 (profiles, roles, permissions, role_permissions, users, vendors+email, contracts, service_matrix, cost_elements, invoices, po_versions, audit_log, notifications, app_settings, import_logs, comparisons, comparison_results, discrepancy_emails, followup_emails). Include UUID PKs, FKs, `created_at timestamptz default now()`, indexes on `invoices(contract_id)`, `invoices(status)`, `vendors(name)`, `contracts(vendor_id)`, `comparison_results(comparison_id)`.

- [ ] **Step 2: Write `supabase/seed.sql`** — roles (admin, approver, processor, viewer, auditor), permissions (19 from legacy), role_permissions (admin=all, approver=invoice.view/approve/reject, processor=invoice.create/update, viewer=invoice.view, auditor=reports.view), default settings rows, sample vendors + contracts.

- [ ] **Step 3: Verify** — SQL is syntactically valid (run through `psql` if available, else node `pg` query parser; if unavailable, manual review).

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase schema and seed SQL"
```

---

### Task 3: Backend core — config, supabase client, auth middleware

**Files:**
- Create: `backend/src/config/env.ts`, `backend/src/config/supabase.ts`, `backend/src/middleware/auth.ts`, `backend/src/middleware/error.ts`, `backend/src/types/index.ts`, `backend/src/app.ts`, `backend/package.json` (scripts), `backend/.env.example`, `backend/src/index.ts`
- Modify: `backend/tsconfig.json`

**Interfaces:**
- Consumes: nothing (Task 2 is SQL-only).
- Produces:
  - `export function getSupabase(): SupabaseClient` (service-role client)
  - `export function verifyJwt(token: string): Promise<{ sub: string }>`
  - `export async function authRequired(req,res,next)` — sets `req.user = { id, role }`
  - `export function requireRole(...roles: string[])` — 403 if `req.user.role` not included
  - `export function errorHandler(err,req,res,next)` — JSON `{ error }` with status
  - `export const app = express()`
  - `export const PORT = Number(process.env.PORT || 3001)`

- [ ] **Step 1: Write `backend/src/config/env.ts`** loading `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CORS_ORIGIN`, `PORT`; throw if required ones missing.

- [ ] **Step 2: Write `backend/src/config/supabase.ts`**

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'
let _client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient {
  if (!_client) _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  return _client
}
```

- [ ] **Step 3: Write `backend/src/middleware/auth.ts`** — verify JWT with `jsonwebtoken.verify(token, env.SUPABASE_JWT_SECRET)`, decode `sub`, fetch profile role from `users` table via `getSupabase()`, set `req.user`. `requireRole` checks `req.user.role`.

- [ ] **Step 4: Write `backend/src/middleware/error.ts`** and `backend/src/types/index.ts` (Request user typing, shared DTO interfaces: `PreviewRow`, `Issue`, `ImportConfirmBody`, `CompareBody`, `CompareResult`, `EmailResult`).

- [ ] **Step 5: Write `backend/src/app.ts`** — express instance with `cors({ origin: env.CORS_ORIGIN.split(',') })`, `express.json()`, health route `GET /api/health` returning `{ ok: true }`.

- [ ] **Step 6: Write `backend/src/index.ts`** — starts `app.listen(PORT)`.

- [ ] **Step 7: Write `backend/.env.example`** with placeholders. Update `backend/package.json` scripts: `"dev": "tsx watch src/index.ts"`, `"start": "tsx src/index.ts"`, `"build": "tsc"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 8: Verify** — `npm run typecheck` passes; start server with dummy env, `curl localhost:3001/api/health` returns `{"ok":true}`.

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat(backend): core config, supabase client, auth middleware, health route"
```

---

### Task 4: Backend parsing services (CSV / Excel / PDF)

**Files:**
- Create: `backend/src/services/parseCsv.ts`, `backend/src/services/parseExcel.ts`, `backend/src/services/parsePdf.ts`, `backend/src/services/parse.ts`
- Test: `backend/test/parse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseCsv(buffer: Buffer): Promise<Record<string, unknown>[]>` — header row from first line, returns array of row objects (string values)
  - `parseExcel(buffer: Buffer): Promise<Record<string, unknown>[]>` — first worksheet
  - `parsePdf(buffer: Buffer): Promise<Record<string, unknown>[]>` — text extraction + naive table heuristic (split lines on 2+ spaces; if header row detected map columns)
  - `parseFile(file: { buffer: Buffer; originalname: string }): Promise<{ rows: Record<string, unknown>[]; format: 'csv'|'xlsx'|'pdf' }>`

- [ ] **Step 1: Write failing tests** for `parseCsv` (basic 2-row CSV), `parseExcel` (needs a generated xlsx buffer via `xlsx`), `parsePdf` (a simple generated text PDF buffer via pdf-parse on a minimal PDF string), `parseFile` dispatch.

- [ ] **Step 2: Run tests to verify they fail** — `npx tsx --test test/parse.test.ts`

- [ ] **Step 3: Implement `parseCsv`** using `csv-parse/sync` with `columns: true`, `skip_empty_lines: true`.

- [ ] **Step 4: Implement `parseExcel`** using `xlsx.read(buffer)`, first sheet, `sheet_to_json` with `defval: ''`.

- [ ] **Step 5: Implement `parsePdf`** using `pdf-parse(buffer)` to get text; split into lines; group into table rows by splitting on `\s{2,}`; if first non-empty line contains recognizable headers, map columns; otherwise return raw one-column rows.

- [ ] **Step 6: Implement `parseFile`** dispatcher by extension (`.csv`, `.xlsx`/`.xls`, `.pdf`); throw `UnsupportedFormatError` otherwise.

- [ ] **Step 7: Run tests to verify they pass.**

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat(backend): CSV/Excel/PDF parsing services"
```

---

### Task 5: Backend import module (parse + confirm)

**Files:**
- Create: `backend/src/services/importService.ts`, `backend/src/routes/import.ts`
- Modify: `backend/src/app.ts` (mount route)
- Test: `backend/test/import.test.ts`

**Interfaces:**
- Consumes: `parseFile`, `authRequired`, `requireRole('admin')`, `getSupabase`.
- Produces:
  - `validateRows(rows, type): { preview: PreviewRow[]; issues: Issue[] }` — per-row validation per type (invoices/contracts/vendors) mirroring legacy rules (required fields, duplicate invoice no, contract window, max amount, contract balance).
  - `POST /api/import/parse` (multipart `file`, field `type`) → `{ preview, issues, totalRows, validRows }`
  - `POST /api/import/confirm` (body `{ type, rows }`) → inserts valid rows to Supabase, writes `import_logs`, returns `{ imported, skipped }`.

- [ ] **Step 1: Write failing tests** for `validateRows` (valid invoice, missing fields, duplicate invoice number, over-max amount) and confirm endpoint flow (mock supabase via injected client).

- [ ] **Step 2: Run tests, verify fail.**

- [ ] **Step 3: Implement `validateRows`** with type-specific rules. Invoice: require processingDate, contractId (must exist), invoiceNo, invoiceDate, amount>0, amount<=`maximum_invoice_amount` setting, duplicate invoiceNo within file AND existing DB, service dates within contract window. Contract: require id unique, vendorId exists, dates valid, value>=0. Vendor: require name non-empty unique.

- [ ] **Step 4: Implement routes** — `POST /api/import/parse` uses multer memory storage, calls `parseFile`, `validateRows`, returns preview. `POST /api/import/confirm` requires admin, upserts rows (vendors dedupe by name; contracts upsert by id; invoices insert with generated serial), writes `import_logs` row, returns counts.

- [ ] **Step 5: Mount routes in `app.ts`** under `/api/import`.

- [ ] **Step 6: Run tests, verify pass.**

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): import parse/confirm endpoints with validation"
```

---

### Task 6: Backend comparison module

**Files:**
- Create: `backend/src/services/compareService.ts`, `backend/src/routes/compare.ts`, `backend/src/routes/uploads.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/compare.test.ts`

**Interfaces:**
- Consumes: `parseFile`, `getSupabase`, `authRequired`.
- Produces:
  - `compareFiles(baseRows, compareRows, opts: { joinKey: string; columns: string[]; tolerance?: number }): CompareResult` — result `{ mismatches: Mismatch[], missingInCompare: Row[], missingInBase: Row[], summary }`. A `Mismatch` = `{ keyValue, column, baseValue, compareValue }`.
  - `POST /api/uploads` (multipart `file`) → `{ fileId }` (temp in-memory cache with 30-min TTL)
  - `POST /api/compare` (body `{ baseFileId, compareFileId, joinKey, columns, tolerance }`) → runs comparison, stores `comparisons` + `comparison_results`, returns results.
  - `GET /api/compare/:id/results` → stored results.
  - `POST /api/compare/:id/send-discrepancy` (body `{ vendorId, notes? }`) → sends discrepancy email via Task 7 email service, writes `discrepancy_emails`.

- [ ] **Step 1: Write failing tests** — same-rows no mismatches; one value differs → mismatch flagged; row missing in compare → flagged; numeric tolerance 0.01; missing join key handling.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `compareService.compareFiles`** — normalize headers (trim/lower), build map on joinKey, iterate base rows, compare listed columns with numeric tolerance (parse floats), collect mismatches + missing.

- [ ] **Step 4: Implement `uploads` route** — multer memory storage, store buffer in `Map<fileId,{buffer,name}>` with TTL cleanup.

- [ ] **Step 5: Implement `compare` route** — parse both files, call compareFiles, persist comparison + results, return payload.

- [ ] **Step 6: Implement `send-discrepancy`** — fetch comparison + mismatches, load vendor email, call email service.

- [ ] **Step 7: Mount routes.**

- [ ] **Step 8: Run tests, verify pass.**

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat(backend): two-file comparison with discrepancy email"
```

---

### Task 7: Backend email + follow-up module

**Files:**
- Create: `backend/src/services/emailService.ts`, `backend/src/routes/followups.ts`, `backend/src/routes/settings.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/followups.test.ts`

**Interfaces:**
- Consumes: `getSupabase`, `authRequired`, `requireRole('admin')`.
- Produces:
  - `sendEmail(to: string, subject: string, html: string): Promise<{ id: string }>` via Resend SDK.
  - `renderTemplate(template: string, data: Record<string, unknown>): string` — replaces `{{token}}` placeholders.
  - `GET /api/followups/pending` → `[{ invoice, vendor, email }]` (pending invoices with vendor email)
  - `POST /api/followups/send` (body `{ invoiceIds: string[], templateOverride? }`) → renders `followup_template` per invoice, sends, writes `followup_emails`, returns `{ sent, failed }`.
  - `GET /api/settings` → all `app_settings` rows (admin-only for PUT)
  - `PUT /api/settings` (admin-only) — body `{ key, value }[]` upserts.

- [ ] **Step 1: Write failing tests** — `renderTemplate` placeholder substitution; `sendEmail` mocked Resend; pending query mapping; send endpoint (mock sendEmail).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `emailService`** — Resend client, `sendEmail`, `renderTemplate` (`{{key}}` → value via simple regex replace), email failure wrapped in try/catch returning `{ error }`.

- [ ] **Step 4: Implement `followups` routes** — pending query joins invoices(contracts(vendors)) where status='Pending' and vendors.email not null; send renders template with invoice/vendor/amount/date tokens, sends each, records `followup_emails`.

- [ ] **Step 5: Implement `settings` routes** — GET all; PUT admin-only upsert with `onConflict('key').merge()`.

- [ ] **Step 6: Mount routes.**

- [ ] **Step 7: Run tests, verify pass.**

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat(backend): email service, follow-up and settings endpoints"
```

---

### Task 8: Backend remaining CRUD endpoints

**Files:**
- Create: `backend/src/routes/master.ts`, `backend/src/routes/invoices.ts`, `backend/src/routes/reports.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `getSupabase`, `authRequired`.
- Produces: CRUD routes for `/api/vendors`, `/api/contracts`, `/api/service-matrix`, `/api/cost-elements`, `/api/invoices` (+approve/reject), `/api/users`, `/api/roles`, `/api/reports/dashboard`, `/api/reports/summary`, and admin-only `GET/PUT /api/vendors/:id/email`.

- [ ] **Step 1: Implement `master.ts`** — vendors (list/create/update/delete with referential guards + admin-only email field update), contracts (CRUD + status), service-matrix (list/create/delete), cost-elements (list/create/delete).

- [ ] **Step 2: Implement `invoices.ts`** — list (filters status/contract/search), get, create, update, delete (guard: no delete if PO exists), approve (sets status/approvedBy/date/amount/remarks + audit), reject (mandatory reason + audit).

- [ ] **Step 3: Implement `reports.ts`** — dashboard aggregates (counts/values by status, monthly trend, contract utilization), summary (vendor breakdown, service distribution).

- [ ] **Step 4: Mount routes.**

- [ ] **Step 5: Verify** — `npm run typecheck` passes; spot-check a route with curl against a mock.

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): master data, invoices, reports CRUD endpoints"
```

---

### Task 9: Frontend foundation — Vite config, Tailwind theme, routing, supabase client, API client

**Files:**
- Create: `frontend/vite.config.ts`, `frontend/src/index.css`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/supabase.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/format.ts`, `frontend/src/theme.tsx`
- Delete: `frontend/src/App.css` (if scaffolded), replace `frontend/src/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `apiGet<T>(path)`, `apiPost<T>(path, body, {multipart?})`, `apiPut<T>(path, body)`, `apiDelete(path)` — all attach Supabase JWT; base `import.meta.env.VITE_API_URL`.
  - `formatMoney(n): string`, `formatDate(iso): string`, `formatRelative(iso): string`, `numberToWords(n): string`
  - `ThemeProvider` context with `mode` (dark/light), `theme` (default/aurora/sunset/ocean), persisted in localStorage; applies `data-mode`/`data-theme` on `document.documentElement`.
  - Routes (react-router): `/login`, `/` dashboard, `/control-tower`, `/invoices`, `/workflow`, `/contracts`, `/approvals`, `/payment-orders`, `/reports`, `/import`, `/followups`, `/compare`, `/admin`, `/users`.

- [ ] **Step 1: Write `vite.config.ts`** — react plugin, `@tailwindcss/vite` plugin, `server.proxy` for `/api` → `http://localhost:3001` (per frontend reverse-proxy rule), `server.allowedHosts` include `['.monkeycode-ai.live']`.

- [ ] **Step 2: Write `src/index.css`** — Tailwind import + full design-token set ported from Loadinpg.html (`:root` dark glassmorphism vars, `[data-mode="light"]`, 4 theme accent overrides, mesh gradient background, `.glass`, `.glass-strong`, gradient buttons/badges/chips, custom scrollbar, boot screen styles, toast/modal animations, reveal animations, reduced-motion).

- [ ] **Step 3: Write `src/lib/supabase.ts`** — browser client from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 4: Write `src/lib/api.ts`** — fetch wrapper adding `Authorization: Bearer <supabase session>`; on 401 redirect to `/login`.

- [ ] **Step 5: Write `src/lib/format.ts`** — port formatters from legacy (en-PK money `Rs`, `DD-Mon-YYYY`, relative time, number-to-words crore/lakh).

- [ ] **Step 6: Write `src/theme.tsx`** — ThemeProvider + `useTheme()`.

- [ ] **Step 7: Write `src/App.tsx`** — router with all routes; protected-route wrapper that checks supabase session; layout with `Sidebar` + header + `<Outlet/>`; login route standalone.

- [ ] **Step 8: Write `src/main.tsx`** — render `<ThemeProvider><BrowserRouter><App/></BrowserRouter></ThemeProvider>`.

- [ ] **Step 9: Verify** — `npm run build` passes; `npm run dev` serves (spot-check via preview port).

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): foundation — theme, routing, api client, format utils"
```

---

### Task 10: Frontend shared UI components

**Files:**
- Create: `frontend/src/components/ui/GlassCard.tsx`, `KpiCard.tsx`, `StatusBadge.tsx`, `Button.tsx`, `Modal.tsx`, `Toast.tsx`, `ToastProvider.tsx`, `Table.tsx`, `EmptyState.tsx`, `Tabs.tsx`, `Field.tsx`, `Toggle.tsx`, `BootScreen.tsx`, `CommandPalette.tsx`, `FAB.tsx`
- Create: `frontend/src/components/Sidebar.tsx`, `frontend/src/components/Header.tsx`, `frontend/src/components/BrandLogo.tsx`

**Interfaces:**
- Consumes: `theme.tsx`, `format.ts`.
- Produces: reusable component library matching legacy design system; `Sidebar` with nav + PRL brand + "Abdul Moiz" credit footer; `Header` with breadcrumb/title, global search (opens command palette), notifications bell, theme panel, light/dark toggle, live clock; `BrandLogo` component (placeholder refinery mark until official logo provided); `BootScreen` (animated loader shown on first load); `CommandPalette` (Ctrl+K navigation + actions).

- [ ] **Step 1: Implement `BrandLogo.tsx`** — SVG refinery tower + "PRL" monogram, `size` prop, gradient accent. Also export `PRLLogoMark` variant for small (favicon/avatar) use.

- [ ] **Step 2: Implement base UI components** (`GlassCard`, `KpiCard` with animated count-up, `StatusBadge`, `Button`, `Modal`, `Toast`+`ToastProvider` with `useToast()`, `Table`, `EmptyState`, `Tabs`, `Field`, `Toggle`) using theme tokens.

- [ ] **Step 3: Implement `BootScreen`** — port loader markup/animations, runs once, fades out.

- [ ] **Step 4: Implement `Sidebar`** — nav groups (Main/Operations/Insights/Administration), active state, user block, logout (supabase signOut), PRL brand at top, "Abdul Moiz" credit at bottom.

- [ ] **Step 5: Implement `Header`** — sticky glass bar, breadcrumb + title from route map, search trigger, notifications (from `GET /api/notifications` fallback local), theme panel, mode toggle, live clock.

- [ ] **Step 6: Implement `CommandPalette`** and `FAB` with keyboard shortcuts (Ctrl+K, Ctrl+1-9, Ctrl+G, Ctrl+N, Esc).

- [ ] **Step 7: Wire `BootScreen`, `Sidebar`, `Header`, `CommandPalette`, `FAB`, `ToastProvider` into `App.tsx` layout.

- [ ] **Step 8: Verify** — `npm run build` passes; dev server renders layout with sidebar/header/boot screen.

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): shared UI components, layout, boot screen, command palette"
```

---

### Task 11: Frontend — Login + auth guard + Dashboard

**Files:**
- Create: `frontend/src/pages/Login.tsx`, `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiGet`, `useTheme`, `Sidebar/Header`, `KpiCard`, Chart.js.
- Produces: login page (email/password, Supabase auth, error state, PRL brand, "Abdul Moiz" credit); dashboard fetching `GET /api/reports/dashboard` → KPI cards (animated), monthly trend bar+line chart, status doughnut, contract utilization bars, recent invoices table.

- [ ] **Step 1: Implement `Login.tsx`** — full-page glass card, PRL logo, email+password, loading state, error banner, `signInWithPassword`, on success redirect to `/`.

- [ ] **Step 2: Implement `Dashboard.tsx`** — fetch dashboard data; render 4 KPI cards, 2 charts (Chart.js with theme-aware colors), utilization bars, recent invoices table (top 5).

- [ ] **Step 3: Wire auth guard in `App.tsx`** — `ProtectedRoute` checks session via `supabase.auth.getSession()`, redirects to `/login`.

- [ ] **Step 4: Verify** — build passes; dev shows login when unauthenticated, dashboard after mock login (or skip login when no Supabase env set: dev-mode bypass flag `VITE_DEV_BYPASS_AUTH=true`).

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): login page, auth guard, dashboard"
```

---

### Task 12: Frontend — Invoices, Workflow Board, Approvals, Payment Orders

**Files:**
- Create: `frontend/src/pages/Invoices.tsx`, `frontend/src/pages/InvoiceWorkspace.tsx`, `frontend/src/pages/Workflow.tsx`, `frontend/src/pages/Approvals.tsx`, `frontend/src/pages/PaymentOrders.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiGet/apiPost/apiPut/apiDelete`, UI components, `format.ts`.
- Produces: invoice list (filters, multi-select, new/edit workspace modal), invoice workspace (cascading t1→t2→t3 selects, live validation, save/approve/reject/delete/clear, PO print view), kanban board, approvals queue (review → approve/reject), payment orders (generate PO with print layout).

- [ ] **Step 1: Implement `Invoices.tsx`** — table with search/status/contract filters, selection checkboxes, "New Invoice" button, edit opens workspace.

- [ ] **Step 2: Implement `InvoiceWorkspace.tsx`** — port legacy form (fields, cascading selects from service-matrix, cost-element auto-resolve, contract summary sidebar, validation panel, amount-in-words, save/delete/approve/reject, audit history tab, PO versions tab).

- [ ] **Step 3: Implement `Workflow.tsx`** — 3 columns (Pending/Approved/Rejected), cards open invoice.

- [ ] **Step 4: Implement `Approvals.tsx`** — pending queue + approve (remarks) / reject (mandatory reason) modals.

- [ ] **Step 5: Implement `PaymentOrders.tsx`** — approved invoices, Generate PO (renders A4 print layout), PO version history, print via window.print.

- [ ] **Step 6: Wire routes.**

- [ ] **Step 7: Verify** — build + manual smoke via dev server.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): invoices, workflow board, approvals, payment orders"
```

---

### Task 13: Frontend — Contracts, Control Tower, Reports

**Files:**
- Create: `frontend/src/pages/Contracts.tsx`, `frontend/src/pages/ControlTower.tsx`, `frontend/src/pages/Reports.tsx`

**Interfaces:**
- Consumes: `apiGet`, UI components.
- Produces: contracts list with utilization bars + CRUD modal; control tower alert KPIs + expiring contracts; reports with vendor bar chart, service pie, summary table, CSV export (client-side via formatMoney/escapeHtml).

- [ ] **Step 1: Implement `Contracts.tsx`** — KPI cards, table (utilization bars, status badges), create/edit/delete modals.

- [ ] **Step 2: Implement `ControlTower.tsx`** — alert KPIs (pending approvals, expiring contracts, high utilization, active users), pending invoices table, expiring contracts table.

- [ ] **Step 3: Implement `Reports.tsx`** — Chart.js charts + summary table + CSV export button (Blob download).

- [ ] **Step 4: Wire routes.**

- [ ] **Step 5: Verify** — build passes.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): contracts, control tower, reports"
```

---

### Task 14: Frontend — Admin and User Management

**Files:**
- Create: `frontend/src/pages/Admin.tsx`, `frontend/src/pages/Users.tsx`

**Interfaces:**
- Consumes: `apiGet/apiPost/apiPut/apiDelete`, `requireRole` gating on API.
- Produces: admin password gate (re-uses Supabase password / local passcode), tabs for vendors/contracts/services/cost-elements/settings (incl. email template editing via `PUT /api/settings`); user management tabs users/roles/permissions/sessions, user CRUD, role permission matrix, admin-only vendor email editor.

- [ ] **Step 1: Implement `Admin.tsx`** — gate + tabs (Vendors, Contracts, Services, Cost Elements, Settings incl. `followup_template` + `discrepancy_template` textareas).

- [ ] **Step 2: Implement `Users.tsx`** — Users/Roles/Permissions/Sessions tabs with CRUD.

- [ ] **Step 3: Vendor email editing** — in Admin vendors tab (admin-only), inline email field editing via `PUT /api/vendors/:id/email`.

- [ ] **Step 4: Wire routes.**

- [ ] **Step 5: Verify** — build passes.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): admin panel and user management"
```

---

### Task 15: Frontend — Import module

**Files:**
- Create: `frontend/src/pages/Import.tsx`

**Interfaces:**
- Consumes: `apiPost` (multipart), `requireRole('admin')` enforced server-side.
- Produces: 3-step wizard — (1) select type + upload file; (2) `POST /api/import/parse` → preview table with per-row issues highlighted + summary; (3) `Confirm Import` → `POST /api/import/confirm` → success toast with imported/skipped counts. Admin-only (non-admin sees read-only notice).

- [ ] **Step 1: Implement upload step** — type selector (Invoices/Contracts/Vendors), drag-drop/file input, calls parse, shows loading state.

- [ ] **Step 2: Implement preview step** — table with all parsed rows, invalid rows highlighted with issue text, valid count summary, back button.

- [ ] **Step 3: Implement confirm step** — Confirm button → POST confirm → result panel + reset.

- [ ] **Step 4: Wire route `/import`.**

- [ ] **Step 5: Verify** — build passes.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): CSV/PDF import module with preview and admin confirmation"
```

---

### Task 16: Frontend — Follow-up module

**Files:**
- Create: `frontend/src/pages/Followups.tsx`

**Interfaces:**
- Consumes: `apiGet/apiPost`, `format.ts`.
- Produces: pending invoices list grouped by vendor with email column, multi-select, "Send Follow-up" → confirmation modal showing recipients + rendered message preview → `POST /api/followups/send` → result toast (sent/failed). Admin sees link to edit template in settings.

- [ ] **Step 1: Implement list + selection** — `GET /api/followups/pending`, group/select, show email presence badge.

- [ ] **Step 2: Implement confirmation modal** — preview subject/body rendered from template for first invoice, recipient list, confirm/cancel.

- [ ] **Step 3: Implement send + result handling** — POST, show per-recipient status.

- [ ] **Step 4: Wire route `/followups`.**

- [ ] **Step 5: Verify** — build passes.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): pending invoice email follow-up module"
```

---

### Task 17: Frontend — Compare module

**Files:**
- Create: `frontend/src/pages/Compare.tsx`

**Interfaces:**
- Consumes: `apiPost` multipart, `apiGet`.
- Produces: upload 2 files → `POST /api/uploads` each; select base ("Compare FROM") vs candidate ("Compare TO"); column mapping (join key select, compare-column checkboxes, tolerance input); `POST /api/compare`; results view (summary KPIs, side-by-side diff table with highlights, mismatches/missing sections); "Send to surveyor" button → confirmation modal → `POST /api/compare/:id/send-discrepancy` → toast.

- [ ] **Step 1: Implement upload + base/candidate selection** — two file slots with file names, "Compare FROM"/"Compare TO" labels, swap button.

- [ ] **Step 2: Implement column mapping** — parse result headers from upload response, join-key dropdown, column checkboxes, tolerance number input, Compare button.

- [ ] **Step 3: Implement results view** — KPI summary, diff table (highlight mismatches), sections for missing-in-compare/missing-in-base.

- [ ] **Step 4: Implement discrepancy email flow** — "Send to surveyor" → confirm modal (recipient, message preview) → POST → toast.

- [ ] **Step 5: Wire route `/compare`.**

- [ ] **Step 6: Verify** — build passes.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): document comparison module"
```

---

### Task 18: README + deployment guide

**Files:**
- Create: `/workspace/README.md`
- Modify: `/workspace/docs/superpowers/specs/2026-08-18-prl-eoms-rebuild-design.md` (if needed)

**Interfaces:**
- Consumes: everything.
- Produces: project overview, architecture diagram, local dev setup, Supabase setup (schema.sql/seed.sql), backend Render deployment (env vars, start command), frontend Netlify deployment (build/publish dir, env vars), Resend email setup, feature list, credits ("Abdul Moiz").

- [ ] **Step 1: Write README** per spec section 9 with exact env var names and commands.

- [ ] **Step 2: Add `frontend/start.sh`** and `backend/start.sh` convenience scripts (start both via `npm run dev`) per reverse-proxy rule.

- [ ] **Step 3: Verify** — README commands match actual package scripts.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with deployment guide"
```

---

### Task 19: End-to-end verification and polish

**Files:**
- Modify: as needed across `frontend/`, `backend/`.

**Interfaces:**
- Consumes: all modules.

- [ ] **Step 1: Backend verification** — run all tests: `cd backend && npx tsx --test test/*.test.ts` — all pass; `npm run typecheck` passes.

- [ ] **Step 2: Frontend verification** — `npm run build` passes with no type errors; `npm run lint` (if configured) passes.

- [ ] **Step 3: Integration smoke test** — start backend (mock env), start frontend dev; verify login/dashboard/import/compare/follow-up screens render and call API endpoints without 500s.

- [ ] **Step 4: Audit** — grep entire repo for forbidden legacy content: `grep -ri "cloudflare\|d1\|cf_config\|edge connected\|workers.dev\|syncBackend" frontend backend README.md` → expect no matches.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification and polish"
```

---

### Self-Review Summary

- **Spec coverage:** All sections covered — architecture (Tasks 3-9), data model (Task 2), import (Tasks 5, 15), compare (Tasks 6, 17), follow-up (Tasks 7, 16), ported views (Tasks 11-14), branding (Tasks 9-11, 18), deployment (Task 18), testing (Tasks 4-7, 19).
- **Placeholders:** None — every step has concrete file paths, code, or commands.
- **Type consistency:** `PreviewRow`/`Issue`/`CompareResult`/`EmailResult` defined once in `types/index.ts` and used consistently; `validateRows`, `compareFiles`, `renderTemplate`, `sendEmail`, `parseFile` signatures referenced in consumers match producer tasks.
