# EOMS UI/UX Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the PRL-EOMS frontend to the approved design (nav, invoice workspace, enhanced invoice modal, kanban, audit log, PO history, notifications) and swap the brand logo for the transparent PRL PNG everywhere.

**Architecture:** Pure frontend restructure on the existing React/Vite/TypeScript app. All data comes from existing endpoints (`/api/invoices`, `/api/invoices/:id`, `/api/invoices/:id/po`, `/api/audit-log`, `/api/payment-orders`, `/api/service-matrix`, `/api/cost-elements`, `/api/contracts`). Demo mode mirrors these via `lib/mockApi.ts`. New shared UI components live in `components/ui/`.

**Tech Stack:** React 19, react-router-dom, Vite 8, TypeScript, Tailwind v4 (custom classes in `index.css` `@layer components`), lucide-react, chart.js (existing).

## Global Constraints

- Brand logo = `public/brand/prl-logo.png` (transparent, 333×184). Render it with NO box, background, or border in every professional-logo slot.
- No emojis anywhere — use lucide icons. Credit line: "Abdul Moiz".
- Demo mode must mirror every new page (button-triggered only, never touches real data).
- Reuse existing `@layer components` classes (`.btn`, `.badge`, `.chip`, `.input`, `.glass`, `.section-title`, `.nav-item`, `.data-table`); utilities win over components (Tailwind v4 layering).
- All new routes go under the existing authenticated layout; admin-only views stay admin-only.
- Verification gate before claiming done: `npm run build` + `npm run lint` pass, then manual preview checks.

---

### Task 1: Transparent PRL brand logo everywhere

**Files:**
- Modify: `frontend/src/components/BrandLogo.tsx` (full rewrite)
- Modify: `frontend/src/components/ui/BootScreen.tsx:35-40` (boot-logo slot)

**Interfaces:**
- Produces: `BrandLogo({ size?: number })` renders the transparent PRL PNG (`/brand/prl-logo.png`) with `width=size`, `height=auto`, no wrapper box, no background/border.

- [x] **Step 1: Rewrite `BrandLogo.tsx`**

Replace the entire file with:

```tsx
interface BrandLogoProps {
  size?: number
  className?: string
}

export default function BrandLogo({ size = 40, className = '' }: BrandLogoProps) {
  return (
    <img
      src="/brand/prl-logo.png"
      alt="PRL"
      width={size}
      height={Math.round((size * 184) / 333)}
      style={{ width: size, height: 'auto', display: 'block' }}
      className={`shrink-0 ${className}`}
      draggable={false}
    />
  )
}
```

- [x] **Step 2: Boot screen logo**

In `BootScreen.tsx`, replace `<div className="boot-logo">PRL</div>` with `<div className="boot-logo"><BrandLogo size={56} /></div>` and import `BrandLogo`. The `.boot-logo` box keeps its gradient/glow; the transparent logo sits inside (aspect-ratio preserved, no distortion).

- [x] **Step 3: Verify**

Run: `cd frontend && npm run build` — Expected: PASS. Preview login page + a logged-in page; confirm the logo is the transparent PRL mark (no white box) in Sidebar, mobile drawer, login hero emblem, and both login auth-panel headers.

- [x] **Step 4: Commit**

```bash
git add frontend/src/components/BrandLogo.tsx frontend/src/components/ui/BootScreen.tsx
git commit -m "feat(brand): use transparent PRL PNG logo everywhere"
```

---

### Task 2: Navigation restructure + routes

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx` (`NAV_GROUPS`, lines 32-63)
- Modify: `frontend/src/components/Header.tsx` (`TITLES` 33-47, `COMMAND_ITEMS` 49-62)
- Modify: `frontend/src/App.tsx` (routes)

**Interfaces:**
- Produces routes: `/workflow`, `/invoices/:id`, `/audit-log`, `/po-history`.
- Consumes: none (static nav data).

- [x] **Step 1: Sidebar groups**

Replace `NAV_GROUPS` with:

```tsx
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Main',
    entries: [{ to: '/control-tower', label: 'Control Tower', icon: LayoutDashboard }],
  },
  {
    title: 'Operations',
    entries: [
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/workflow', label: 'Workflow Board', icon: Kanban },
      { to: '/contracts', label: 'Contracts', icon: FileText },
      { to: '/approvals', label: 'Approvals', icon: FileCheck2 },
      { to: '/payment-orders', label: 'Payment Orders', icon: Banknote },
      { to: '/po-history', label: 'PO History', icon: History },
    ],
  },
  {
    title: 'Insights',
    entries: [
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/audit-log', label: 'Audit Log', icon: ScrollText },
      { to: '/compare', label: 'Compare', icon: GitCompareArrows },
      { to: '/followups', label: 'Follow-ups', icon: Mail },
    ],
  },
  {
    title: 'Administration',
    entries: [
      { to: '/import', label: 'Data Import', icon: Upload },
      { to: '/admin', label: 'System Admin', icon: Settings, adminOnly: true },
      { to: '/users', label: 'Users & Roles', icon: Users, adminOnly: true },
    ],
  },
]
```

Add imports: `Kanban`, `History`, `ScrollText` from `lucide-react`. Rename existing "Workflow"→"Workflow Board", "Admin Panel"→"System Admin".

- [x] **Step 2: Header titles + commands**

In `Header.tsx`: update `TITLES` (add `/workflow: 'Workflow Board'`, `/audit-log: 'Audit Log'`, `/po-history: 'PO History'`, and a `/invoices/:id` fallback handled by `location.pathname.startsWith('/invoices/')`), and `COMMAND_ITEMS` entries for `Workflow Board`, `Audit Log`, `PO History` with matching lucide icons.

- [x] **Step 3: App routes**

In `App.tsx` inside the protected layout add:

```tsx
<Route path="invoices/:id" element={<InvoiceWorkspacePage />} />
<Route path="audit-log" element={<AuditLogPage />} />
<Route path="po-history" element={<PoHistoryPage />} />
```

Import the three pages (created in Tasks 5, 7, 8).

- [x] **Step 4: Verify**

Run: `cd frontend && npm run build` — Expected: FAIL on missing `InvoiceWorkspacePage`/`AuditLogPage`/`PoHistoryPage` imports (this is expected until Tasks 5/7/8). Verify nav renders by temporarily commenting the three imports only if needed; otherwise defer full verify to Task 5. Commit the sidebar/header changes only after those tasks exist.

---

### Task 3: Shared UI components

**Files:**
- Create: `frontend/src/components/ui/ServiceSelects.tsx`
- Create: `frontend/src/components/ui/ContractSummaryPanel.tsx`
- Create: `frontend/src/components/ui/ValidationSummary.tsx`
- Create: `frontend/src/lib/invoice.ts` (cascade + cost-element + validation + utilization math)

**Interfaces:**
- `lib/invoice.ts` exports:
  - `interface ServiceMatrixRow { id: string; t1: string; t2: string | null; t3: string | null; cost_element: string | null; tanker_required: boolean; trips: boolean }`
  - `interface ContractLite { id: string; contract_no: string; value: number; start_date: string | null; end_date: string | null; vendor: string | null; service: string | null }`
  - `t2Options(matrix, t1): string[]`, `t3Options(matrix, t1, t2): string[]`
  - `resolveCostElement(matrix, t1, t2, t3): string | null`
  - `matrixRowFor(matrix, t1, t2, t3): ServiceMatrixRow | undefined`
  - `interface Utilization { used: number; remaining: number; pct: number; count: number }`
  - `contractUtilization(invoices, contractId, excludeInvoiceId?): Utilization` — used = sum of `amount` for invoices with `status==='Approved'` (or `'Pending'`+`'Approved'`? **Decision:** approved-only, matching reference) and `contract_id===contractId`, excluding `excludeInvoiceId`. `pct = contract.value ? (used/contract.value)*100 : 0`.
  - `validateInvoice(form, opts): Array<{ field: string; message: string }>` — rules: `invoice_no` required; if `contract_id` set and `amount>0` and `contractUtilization(...).used > contract.value` → overdraw warning.
- `ServiceSelects.tsx` default export props:
  - `{ matrix, value: {t1,t2,t3,tanker_name,trips}, onChange(patch), disabled? }` — renders T1/T2/T3 cascade `<select className="input">`, conditional Tanker/Trips inputs based on `matrixRowFor`, and a read-only auto Cost Element field.
- `ContractSummaryPanel.tsx` default export props:
  - `{ contract: ContractLite | null, utilization: Utilization, draftAmount?: number, invoiceCountNote?: string }` — renders Contract ID, Vendor, Start/End, Value, Used (Approved), a "this invoice" preview line when `draftAmount>0` (shows `Used + draftAmount`), Remaining (color-coded red when negative), utilization bar (`div.util-bar > span` width = `min(100,pct)%`), count note.
- `ValidationSummary.tsx` default export props: `{ issues: Array<{field,message}>, count: number }` — green "Valid" chip or red issue list.

- [x] **Step 1: Write `lib/invoice.ts`** (all math above; no UI). Reference: reuse `formatMoney`/`formatAmountWords` from `lib/format.ts`.

- [x] **Step 2: Write `ServiceSelects.tsx`** per interface.

- [x] **Step 3: Write `ContractSummaryPanel.tsx`** per interface.

- [x] **Step 4: Write `ValidationSummary.tsx`** per interface.

- [x] **Step 5: Verify**

Run: `cd frontend && npm run build` — Expected: PASS (components compiled even if unused). Lint: `npm run lint`.

- [x] **Step 6: Commit**

```bash
git add frontend/src/lib/invoice.ts frontend/src/components/ui/ServiceSelects.tsx frontend/src/components/ui/ContractSummaryPanel.tsx frontend/src/components/ui/ValidationSummary.tsx
git commit -m "feat(invoice): shared service-selects, contract summary, validation utils"
```

---

### Task 4: Enhanced invoice modal

**Files:**
- Modify: `frontend/src/pages/InvoicesPage.tsx` (the `InvoiceFormModal` function, lines ~434-577)

**Interfaces:**
- Consumes: `ServiceSelects`, `ContractSummaryPanel`, `ValidationSummary`, `lib/invoice.ts`, `formatAmountWords`.
- Produces: `InvoiceFormModal` now loads `service-matrix` + `cost-elements` + invoices (for utilization), uses cascade selects, live contract summary, amount-in-words, validation.

- [x] **Step 1: Load supporting data**

In `InvoiceFormModal`, on open, fetch `Promise.all([apiGet('/api/service-matrix'), apiGet('/api/invoices')])`; keep in state `matrix`, `allInvoices`.

- [x] **Step 2: Replace the grid**

Replace the free-text T1/T2/T3/tanker/trips/cost-element fields with `<ServiceSelects ...>` bound to `form`. Layout: left column (fields) + right column `<ContractSummaryPanel>` + `<div>Amount in words: {formatAmountWords(Number(form.amount)||0)}</div>` when a contract is selected and amount entered. Compute:

```tsx
const selectedContract = contracts.find(c => c.id === form.contract_id) ?? null
const utilization = selectedContract
  ? contractUtilization(allInvoices, selectedContract.id, invoice?.id ?? undefined)
  : null
const draftAmount = Number(form.amount) || 0
const issues = validateInvoice(form, { matrix })
```

- [x] **Step 3: Save uses cascaded values**

`submit()` already posts `t1/t2/t3/tanker_name/trips/cost_element` — unchanged since `ServiceSelects` writes into `form`.

- [x] **Step 4: Verify**

Run build + lint. Manual preview: open New Invoice — confirm T1→T2→T3 cascade, auto cost element, conditional tanker/trips, and the Contract Summary showing "Used (Approved) + this invoice" updating as you type the amount, with a red remaining when overdrawn.

- [x] **Step 5: Commit**

```bash
git add frontend/src/pages/InvoicesPage.tsx
git commit -m "feat(invoice): enhanced entry modal with live contract summary"
```

---

### Task 5: Invoice workspace page

**Files:**
- Create: `frontend/src/pages/InvoiceWorkspacePage.tsx`
- Modify: `frontend/src/pages/InvoicesPage.tsx` (row links)
- Modify: `frontend/src/pages/ApprovalsPage.tsx` (open workspace on review)
- Modify: `frontend/src/pages/WorkflowPage.tsx` (Task 6)

**Interfaces:**
- Consumes: all shared components from Task 3, `Tabs` (`components/ui/Tabs.tsx`), `Button`, `Modal`, `StatusBadge`, `Field`, `apiGet/apiPost/apiPut/apiDelete`, `formatAmountWords`, `formatRelative`.
- Produces: `InvoiceWorkspacePage` — reads `useParams().id`, loads `GET /invoices/:id`, `GET /invoices/:id/po`, `GET /audit-log`, `GET /service-matrix`, `GET /invoices` (utilization).

- [x] **Step 1: Page shell + data loading**

Header row: back button (`navigate(-1)`), title `{invoice.serial_no} · {invoice.invoice_no}`, `StatusBadge`, action bar buttons — Clear (reset local form to saved invoice), Delete (only when `status!=='Approved'` and no POs; confirm modal; `DELETE /invoices/:id` then back), Approve/Reject (only `status==='Pending'`; reject opens reason modal), Generate PO (only `status==='Approved'`; `POST /invoices/:id/po`), Save (PUT). All actions call the same endpoints InvoicesPage uses.

- [x] **Step 2: Tabs**

`Tabs` with `details | history | po`.
- `details`: same two-column layout as the modal (ServiceSelects + ContractSummaryPanel + ValidationSummary + Amount in words) using the workspace's local form state.
- `history`: timeline list from audit events where `entityId === invoice.id` (client-side filter on loaded audit log), newest first — action badge, summary, user, relative time.
- `po`: table from `GET /invoices/:id/po` — PO id, generated by, generated at, status; View opens a `Modal` showing PO id + amount in words + linked invoice.

- [x] **Step 3: Wire invoices list**

In `InvoicesPage`, make the invoice `serial_no` cell a `Link to={'/invoices/'+inv.id}` (keep the po/open buttons as-is for now, or convert to "Open" too).

- [x] **Step 4: Wire approvals**

In `ApprovalsPage`, add an "Open" button/link on each pending card to `/invoices/:id`.

- [x] **Step 5: Verify**

Run build + lint. Preview: open an invoice from the list → workspace renders, switch tabs, approve/reject/PO actions work, contract summary updates while editing.

- [x] **Step 6: Commit**

```bash
git add frontend/src/pages/InvoiceWorkspacePage.tsx frontend/src/pages/InvoicesPage.tsx frontend/src/pages/ApprovalsPage.tsx
git commit -m "feat(invoice): add invoice workspace page with history and PO versions"
```

---

### Task 6: Workflow Board (kanban)

**Files:**
- Modify: `frontend/src/pages/WorkflowPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `apiGet`, `ServiceSelects`-style filters or plain selects, `formatMoney`, `Link`, `StatusBadge`.
- Produces: 3-column kanban (Pending/Approved/Rejected), cards clickable → `/invoices/:id`.

- [x] **Step 1: Rewrite page**

Layout: `PageHeader` ("Workflow Board"), a toolbar row (search + T1/T2/T3 selects reusing the existing cascade logic), then a `grid grid-cols-1 md:grid-cols-3 gap-4` with three columns. Each column: header (badge + count + total value) and a scrollable list of cards. Card: serial no + relative time, invoice no, vendor, contract chip, amount; whole card is a `Link` to `/invoices/${i.id}`.

- [x] **Step 2: Keep drill-down value**

The existing `t1/t2/t3` cascade filter state and `filtered` memo remain; columns derive from `filtered` by status.

- [x] **Step 3: Verify**

Run build + lint. Preview: columns populate from demo data, filters narrow cards, clicking a card opens the workspace.

- [x] **Step 4: Commit**

```bash
git add frontend/src/pages/WorkflowPage.tsx
git commit -m "feat(workflow): replace drill-down with kanban workflow board"
```

---

### Task 7: Audit Log page

**Files:**
- Create: `frontend/src/pages/AuditLogPage.tsx`

**Interfaces:**
- Consumes: `GET /api/audit-log` → `{ auditLog: Array<{ id, timestamp, user, action, entity_type, entity_id, summary }> }`; `DataToolbar`, `formatRelative`.
- Produces: `/audit-log` page.

- [x] **Step 1: Page**

`PageHeader` ("Audit Log", description "Immutable trail of every action across the system."). `DataToolbar` with text search (matches summary/entity/user), an action-type filter select, and an entity-type filter select. Body: grouped-by-day or simple table — action badge (tone by action), entity type + id (mono), summary, user, relative + absolute time. Empty state when none. No mutate actions (read-only).

- [x] **Step 2: Verify**

Build + lint. Preview: filter by action, search works in demo mode.

- [x] **Step 3: Commit**

```bash
git add frontend/src/pages/AuditLogPage.tsx
git commit -m "feat(audit): add dedicated audit log page"
```

---

### Task 8: PO History page

**Files:**
- Create: `frontend/src/pages/PoHistoryPage.tsx`

**Interfaces:**
- Consumes: `GET /api/payment-orders` → `{ paymentOrders: Array<{ id, serial_no, generated_by, generated_at, status, invoices: { invoice_no, invoice_date, amount, contracts: { contract_no, vendors: Array<{name}> } } }> }`; `DataToolbar`, `Modal`, `formatAmountWords`.
- Produces: `/po-history` page.

- [x] **Step 1: Page**

`PageHeader` ("PO History", "Every payment order version ever generated."). `DataToolbar` (search + sort by generated_at desc). Table: PO id, invoice no, vendor, amount, status, generated by, generated at. Row click → `Modal` with PO id, amount in words, invoice link. Empty state.

- [x] **Step 2: Verify**

Build + lint. Preview: list renders in demo, detail modal opens.

- [x] **Step 3: Commit**

```bash
git add frontend/src/pages/PoHistoryPage.tsx
git commit -m "feat(po): add dedicated PO history page"
```

---

### Task 9: Notifications

**Files:**
- Create: `frontend/src/components/ui/Notifications.tsx`
- Modify: `frontend/src/components/Header.tsx` (replace inert bell, lines 152-155)

**Interfaces:**
- `Notifications.tsx` exports default `Notifications` (bell + panel). Internally: builds notifications from (a) session audit events captured via a lightweight in-app event emitter, and (b) on-mount signals from `GET /api/contracts` + `GET /api/invoices` (expiring ≤60 days, utilization >95%, pending approvals). Unread = ids not in `sessionStorage['prl-eoms-notif-seen']`.
- Produces: bell with unread count badge + slide-in right panel (backdrop, close button, Escape), item = type chip (ok/warn/err/info gradient), title, message, relative time, click → mark read + optional `navigate(to)`, "Mark all read".

- [x] **Step 1: Write `Notifications.tsx`**

Panel markup mirrors the reference (see `EOMS-FE.html:5387-5443`) but with lucide icons (CheckCircle2 / AlertTriangle / XCircle / Info) instead of text glyphs, and Tailwind/`@layer` classes.

- [x] **Step 2: Wire into Header**

Replace the inert bell button with `<Notifications />`. Keep `Bell` icon; unread badge = small accent dot with count when >0.

- [x] **Step 3: Verify**

Build + lint. Preview: bell shows a badge, panel slides in, actions (mark read, mark all, navigate on click, Escape close) work in demo.

- [x] **Step 4: Commit**

```bash
git add frontend/src/components/ui/Notifications.tsx frontend/src/components/Header.tsx
git commit -m "feat(notify): header notifications bell with slide-in panel"
```

---

### Task 10: Final verification + release

- [x] **Step 1: Full build + lint**

Run: `cd frontend && npm run build && npm run lint` — Expected: both PASS (warnings only).

- [x] **Step 2: Preview walkthrough**

Hit the live preview; verify every route in the sidebar navigates and renders: Control Tower, Invoices, Workflow Board, Contracts, Approvals, Payment Orders, PO History, Reports, Audit Log, Compare, Follow-ups, Data Import, System Admin, Users & Roles. Exercise the invoice workspace (tabs + actions), the enhanced modal (cascade + stamped contract summary), kanban filters, audit filters, PO detail, notifications. Confirm demo mode works on all pages.

- [x] **Step 3: Fix any regressions found**, re-run build/lint.

- [x] **Step 4: Commit + push**

```bash
git add -A
git commit -m "feat(frontend): full UI/UX restructure per EOMS-FE reference"
git push origin main
```
