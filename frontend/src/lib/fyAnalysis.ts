import { invoiceAccrualAmount, type AccrualSnapshot } from './accrual'
import { FY_MONTHS, fiscalBounds, invoiceBudgetDate, invoiceBudgetFy, isClosedFiscalYear } from './fiscal'
import { invoiceApprovedAmount, poGeneratedAmount, poReleasedAmount, PO_STATUS } from './paymentOrder'

export interface FyAnalysisInvoice {
  id?: string
  status?: string | null
  amount?: unknown
  approved_amount?: unknown
  invoice_date?: string | null
  service_to?: string | null
  cost_element?: string | null
  contract_id?: string | null
}

export interface FyAnalysisPo {
  status?: unknown
  amount?: unknown
  released_amount?: unknown
  invoice_id?: string | null
  invoices?: {
    invoice_date?: string | null
    service_to?: string | null
    cost_element?: string | null
    status?: string | null
    amount?: unknown
    approved_amount?: unknown
  } | null
}

export interface FyBudgetLine {
  fy: string
  cost_element?: string
  amount: number
}

export interface FyKpis {
  fy: string
  totalInvoices: number
  totalValue: number
  avgInvoice: number
  pendingCount: number
  pendingValue: number
  approvedCount: number
  approvedValue: number
  rejectedCount: number
  rejectedValue: number
  paidCount: number
  paidValue: number
  approvedInvoiceValue: number
  poGeneratedValue: number
  poGeneratedCount: number
  paymentReleasedValue: number
  paymentReleasedCount: number
  financePendingValue: number
  financePendingCount: number
}

export interface YearlyBudgetFigures {
  fy: string
  yearly: number
  released: number
  remaining: number
}

export interface PaymentSplit {
  thisYear: number
  fromAccrual: number
}

export interface CostBreakRow {
  code: string
  budget: number
  invoiced: number
  released: number
  remaining: number
  unpaid: number
}

export interface MonthTrendRow {
  label: string
  key: string
  count: number
  total: number
  isCurrent: boolean
}

export function invoicesOfFy<T extends FyAnalysisInvoice>(invoices: T[], fy: string): T[] {
  return invoices.filter((i) => invoiceBudgetFy(i) === fy)
}

export function posOfFy<T extends FyAnalysisPo>(pos: T[], fy: string): T[] {
  return pos.filter((p) => invoiceBudgetFy(p.invoices ?? {}) === fy)
}

export function fyKpis(invoices: FyAnalysisInvoice[], pos: FyAnalysisPo[], fy: string): FyKpis {
  const ofFy = invoicesOfFy(invoices, fy)
  const pending = ofFy.filter((i) => String(i.status ?? '') === 'Pending')
  const approved = ofFy.filter((i) => String(i.status ?? '') === 'Approved')
  const rejected = ofFy.filter((i) => String(i.status ?? '') === 'Rejected')
  const paid = ofFy.filter((i) => String(i.status ?? '') === 'Paid')
  const signedOff = ofFy.filter((i) => ['Approved', 'Paid', 'Accepted'].includes(String(i.status ?? '')))
  const ofFyPos = posOfFy(pos, fy)
  const cleared = ofFyPos.filter((p) => String(p.status ?? '') === PO_STATUS.Cleared)
  const financePending = ofFyPos.filter((p) => String(p.status ?? PO_STATUS.Generated) === PO_STATUS.Generated)
  const totalValue = ofFy.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  return {
    fy,
    totalInvoices: ofFy.length,
    totalValue,
    avgInvoice: ofFy.length ? totalValue / ofFy.length : 0,
    pendingCount: pending.length,
    pendingValue: pending.reduce((s, i) => s + Number(i.amount ?? 0), 0),
    approvedCount: approved.length,
    approvedValue: approved.reduce((s, i) => s + Number(i.amount ?? 0), 0),
    rejectedCount: rejected.length,
    rejectedValue: rejected.reduce((s, i) => s + Number(i.amount ?? 0), 0),
    paidCount: paid.length,
    paidValue: paid.reduce((s, i) => s + Number(i.amount ?? 0), 0),
    approvedInvoiceValue: signedOff.reduce((s, i) => s + invoiceApprovedAmount(i), 0),
    poGeneratedValue: ofFyPos.reduce((s, p) => s + poGeneratedAmount(p, p.invoices), 0),
    poGeneratedCount: ofFyPos.length,
    paymentReleasedValue: cleared.reduce((s, p) => s + poReleasedAmount(p), 0),
    paymentReleasedCount: cleared.length,
    financePendingValue: financePending.reduce((s, p) => s + poGeneratedAmount(p, p.invoices), 0),
    financePendingCount: financePending.length,
  }
}

export function yearlyBudgetFigures(
  fy: string,
  budgets: FyBudgetLine[],
  pos: FyAnalysisPo[],
  costElements?: Set<string>,
): YearlyBudgetFigures {
  const lines = budgets.filter((b) => {
    if (b.fy !== fy) return false
    if (!costElements || costElements.size === 0) return true
    return costElements.has(String(b.cost_element ?? ''))
  })
  const yearly = lines.reduce((s, b) => s + Number(b.amount ?? 0), 0)
  const released = pos.reduce((s, p) => {
    if (invoiceBudgetFy(p.invoices ?? {}) !== fy) return s
    if (costElements && costElements.size > 0) {
      const ce = String(p.invoices?.cost_element ?? '')
      if (!costElements.has(ce)) return s
    }
    return s + poReleasedAmount(p)
  }, 0)
  return { fy, yearly, released, remaining: yearly - released }
}

/** Running-year payments vs closed-year accrual payments. Never combined. */
export function paymentSplit(pos: FyAnalysisPo[], runningFy: string): PaymentSplit {
  let thisYear = 0
  let fromAccrual = 0
  for (const p of pos) {
    const rel = poReleasedAmount(p)
    if (!rel) continue
    const fy = invoiceBudgetFy(p.invoices ?? {})
    if (!fy) continue
    if (fy === runningFy) thisYear += rel
    else if (isClosedFiscalYear(fy)) fromAccrual += rel
  }
  return { thisYear, fromAccrual }
}

export function costElementBreakup(
  fy: string,
  invoices: FyAnalysisInvoice[],
  pos: FyAnalysisPo[],
  budgets: FyBudgetLine[],
): CostBreakRow[] {
  const codes = new Set<string>()
  for (const b of budgets) if (b.fy === fy) codes.add(b.cost_element || 'Uncoded')
  for (const i of invoicesOfFy(invoices, fy)) codes.add(i.cost_element || 'Uncoded')
  for (const p of posOfFy(pos, fy)) codes.add(p.invoices?.cost_element || 'Uncoded')

  const rows = [...codes].map((code) => {
    const budget = budgets
      .filter((b) => b.fy === fy && (b.cost_element || 'Uncoded') === code)
      .reduce((s, b) => s + Number(b.amount ?? 0), 0)
    const ofCode = invoicesOfFy(invoices, fy).filter((i) => (i.cost_element || 'Uncoded') === code)
    const invoiced = ofCode.reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const unpaid = ofCode
      .filter((i) => String(i.status ?? '') !== 'Paid')
      .reduce((s, i) => s + invoiceAccrualAmount(i), 0)
    const released = posOfFy(pos, fy)
      .filter((p) => (p.invoices?.cost_element || 'Uncoded') === code)
      .reduce((s, p) => s + poReleasedAmount(p), 0)
    return { code, budget, invoiced, released, remaining: budget - released, unpaid }
  })
  return rows.sort((a, b) => b.budget - a.budget || b.invoiced - a.invoiced)
}

export function monthlyTrendByBudgetDate(
  invoices: FyAnalysisInvoice[],
  fy: string,
  monthsShown = 12,
): MonthTrendRow[] {
  const bounds = fiscalBounds(fy)
  if (!bounds) return []
  const ofFy = invoicesOfFy(invoices, fy)
  const now = new Date()
  return FY_MONTHS.slice(0, monthsShown).map((label, idx) => {
    const d = new Date(bounds.start.getFullYear(), bounds.start.getMonth() + idx, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let count = 0
    let total = 0
    for (const inv of ofFy) {
      if (String(invoiceBudgetDate(inv) ?? '').startsWith(key)) {
        count += 1
        total += Number(inv.amount ?? 0)
      }
    }
    const isCurrent = now.getFullYear() === d.getFullYear() && now.getMonth() === d.getMonth()
    return { label, key, count, total, isCurrent }
  })
}

export function statusBreakdown(invoices: FyAnalysisInvoice[], fy: string) {
  const ofFy = invoicesOfFy(invoices, fy)
  return {
    approved: ofFy.filter((i) => String(i.status ?? '') === 'Approved').length,
    paid: ofFy.filter((i) => String(i.status ?? '') === 'Paid').length,
    pending: ofFy.filter((i) => String(i.status ?? '') === 'Pending').length,
    rejected: ofFy.filter((i) => String(i.status ?? '') === 'Rejected').length,
  }
}

export type AccrualSortKey = 'fy' | 'secured' | 'unpaid' | 'consumed' | 'balance'

export function filterAccrualYears<T extends AccrualSnapshot>(
  years: T[],
  opts: { fy?: string; minBalance?: number; minUnpaid?: number; sort?: AccrualSortKey } = {},
): T[] {
  const fy = opts.fy?.trim()
  const minBalance = Number(opts.minBalance ?? 0) || 0
  const minUnpaid = Number(opts.minUnpaid ?? 0) || 0
  let rows = years.filter((y) => isClosedFiscalYear(y.fy) && (y.secured > 0 || y.unpaid > 0 || y.consumed > 0 || y.balance !== 0))
  if (fy && fy !== 'all') rows = rows.filter((y) => y.fy === fy)
  if (minBalance) rows = rows.filter((y) => y.balance >= minBalance)
  if (minUnpaid) rows = rows.filter((y) => y.unpaid >= minUnpaid)
  const sort = opts.sort ?? 'fy'
  return [...rows].sort((a, b) => {
    if (sort === 'fy') return b.fy.localeCompare(a.fy)
    return Number(b[sort] ?? 0) - Number(a[sort] ?? 0)
  })
}
