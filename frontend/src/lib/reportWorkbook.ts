import {
  QUARTERS,
  costCategory,
  currentFiscalYear,
  elapsedInFiscalYear,
  fyMonthIndex,
  FY_MONTHS,
  invoiceBudgetDate,
  invoiceBudgetFy,
  invoiceBudgetInfo,
  isAccrualOpenInvoice,
  isClosedFiscalYear,
  isMiscCostElement,
  shiftFiscalYear,
  type FiscalQuarter,
} from './fiscal'
import { invoiceApprovedAmount, poReleasedAmount } from './paymentOrder'
import { isSignedOff } from './invoice'
import { yearlyBudgetFigures } from './fyAnalysis'
import { downloadXlsx } from './export'
import { vendorNameOf } from './relations'

export const REPORT_TEMPLATES = [
  { id: 'overview', label: 'Overview pack' },
  { id: 'spend', label: 'Spend ledger' },
  { id: 'budget', label: 'Budget vs actual' },
  { id: 'accrual', label: 'Accrual ledger' },
  { id: 'aging', label: 'AP aging' },
  { id: 'outlook', label: 'Outlook' },
  { id: 'full', label: 'Full workbook' },
] as const

export type ReportTemplate = (typeof REPORT_TEMPLATES)[number]['id']

export const REPORT_STATUSES = ['Pending', 'Approved', 'Rejected', 'Draft', 'Void', 'Paid'] as const

export interface ReportInvoice {
  id: string
  invoice_no: string | null
  invoice_date: string | null
  service_to?: string | null
  contract_id: string | null
  cost_element: string | null
  amount: number
  approved_amount?: number | null
  status: string
  t1?: string | null
  t2?: string | null
  t3?: string | null
  contracts?: { contract_no: string | null; vendors: Array<{ name: string | null }> | null } | null
}

export interface ReportPo {
  id: string
  invoice_id?: string | null
  status: string | null
  amount?: number | null
  released_amount?: number | null
  invoices?: {
    id?: string
    invoice_date?: string | null
    amount?: number
    approved_amount?: number | null
    cost_element?: string | null
    status?: string | null
    service_to?: string | null
  } | null
}

export interface ReportContract {
  id: string
  contract_no: string
  value: number | null
  vendors: Array<{ name: string | null }> | null
}

export interface ReportBudget {
  fy: string
  cost_element: string
  amount: number
}

export interface ReportAccrual {
  fy: string
  unpaid: number
  consumed: number
  computed: number
  override: number | null
  secured: number
  balance: number
  invoices?: Array<{
    id: string
    invoice_no: string | null
    invoice_date: string | null
    service_to?: string | null
    status: string | null
    amount: number
  }>
}

export interface ReportExportFilters {
  template: ReportTemplate
  fys: string[]
  quarter: string
  vendors: string[]
  contractIds: string[]
  costElements: string[]
  statuses: string[]
  includeAccruals: boolean
  metric: 'spend' | 'invoices' | 'approved'
}

export interface ReportExportData {
  invoices: ReportInvoice[]
  contracts: ReportContract[]
  yearBudgets: ReportBudget[]
  paymentOrders: ReportPo[]
  accrualYears: ReportAccrual[]
}

type Sheet = { name: string; rows: Array<Record<string, unknown>> }

function money(n: number) {
  return Math.round(n * 100) / 100
}

function vendorOf(inv: ReportInvoice) {
  return vendorNameOf(inv)
}

function contractNoOf(inv: ReportInvoice, contracts: ReportContract[]) {
  const rel = inv.contracts
  const cn = Array.isArray(rel) ? rel[0] : rel
  if (cn?.contract_no) return cn.contract_no
  return contracts.find((c) => c.id === inv.contract_id)?.contract_no ?? '—'
}

function metricValue(inv: ReportInvoice, metric: ReportExportFilters['metric']) {
  if (metric === 'invoices') return 1
  if (metric === 'approved') return isSignedOff(inv.status) ? invoiceApprovedAmount(inv) : 0
  return Number(inv.amount ?? 0)
}

function filterInvoices(invoices: ReportInvoice[], filters: ReportExportFilters) {
  const fySet = new Set(filters.fys)
  const vendorSet = new Set(filters.vendors)
  const contractSet = new Set(filters.contractIds)
  const costSet = new Set(filters.costElements)
  const statusSet = new Set(filters.statuses)
  return invoices.filter((inv) => {
    const fi = invoiceBudgetInfo(inv)
    if (fySet.size > 0 && (!fi || !fySet.has(fi.fy))) return false
    if (filters.quarter !== 'all' && fi?.quarter !== filters.quarter) return false
    if (vendorSet.size > 0 && !vendorSet.has(vendorOf(inv))) return false
    if (contractSet.size > 0 && (!inv.contract_id || !contractSet.has(inv.contract_id))) return false
    if (costSet.size > 0 && !(inv.cost_element && costSet.has(inv.cost_element))) return false
    if (statusSet.size > 0 && !statusSet.has(inv.status)) return false
    if (!filters.includeAccruals && isAccrualOpenInvoice(inv)) return false
    return true
  })
}

function coverSheet(filters: ReportExportFilters, count: number): Sheet {
  const template = REPORT_TEMPLATES.find((t) => t.id === filters.template)?.label ?? filters.template
  return {
    name: 'Cover',
    rows: [
      { Field: 'Company', Value: 'Pakistan Refinery Ltd' },
      { Field: 'System', Value: 'PRL-EOMS' },
      { Field: 'Report', Value: template },
      { Field: 'Fiscal years', Value: filters.fys.length ? filters.fys.join(', ') : 'All' },
      { Field: 'Quarter', Value: filters.quarter === 'all' ? 'All quarters' : filters.quarter },
      { Field: 'Vendors', Value: filters.vendors.length ? filters.vendors.join(', ') : 'All' },
      { Field: 'Cost elements', Value: filters.costElements.length ? filters.costElements.join(', ') : 'All' },
      { Field: 'Statuses', Value: filters.statuses.length ? filters.statuses.join(', ') : 'All' },
      { Field: 'Open accruals', Value: filters.includeAccruals ? 'Included' : 'Excluded' },
      { Field: 'Metric', Value: filters.metric },
      { Field: 'Invoice rows', Value: count },
      { Field: 'Generated at', Value: new Date().toISOString() },
    ],
  }
}

function ledgerSheet(rows: ReportInvoice[], contracts: ReportContract[]): Sheet {
  return {
    name: 'Invoice ledger',
    rows: rows.map((inv) => {
      const fi = invoiceBudgetInfo(inv)
      return {
        'Invoice no': inv.invoice_no ?? '',
        'Invoice date': inv.invoice_date ?? '',
        'Service to': inv.service_to ?? '',
        'Budget FY': fi?.fy ?? '',
        Quarter: fi?.quarter ?? '',
        Vendor: vendorOf(inv),
        Contract: contractNoOf(inv, contracts),
        Type: inv.t1 ?? '',
        Service: inv.t2 ?? '',
        Detail: inv.t3 ?? '',
        'Cost element': inv.cost_element ?? '',
        Status: inv.status,
        'Amount (Rs)': money(Number(inv.amount ?? 0)),
        'Approved (Rs)': money(invoiceApprovedAmount(inv)),
      }
    }),
  }
}

function monthlySheet(rows: ReportInvoice[], filters: ReportExportFilters): Sheet {
  const months = new Map<number, number>()
  for (const inv of rows) {
    const date = invoiceBudgetDate(inv)
    if (!date) continue
    const idx = fyMonthIndex(new Date(date))
    months.set(idx, (months.get(idx) ?? 0) + metricValue(inv, filters.metric))
  }
  return {
    name: 'Monthly',
    rows: FY_MONTHS.map((label, idx) => ({ Month: label, Value: money(months.get(idx) ?? 0) })),
  }
}

function quarterlySheet(rows: ReportInvoice[], filters: ReportExportFilters): Sheet {
  const maps = new Map<string, Map<FiscalQuarter, number>>()
  for (const fy of filters.fys) maps.set(fy, new Map())
  for (const inv of rows) {
    const fi = invoiceBudgetInfo(inv)
    if (!fi) continue
    const map = maps.get(fi.fy) ?? new Map()
    maps.set(fi.fy, map)
    map.set(fi.quarter, (map.get(fi.quarter) ?? 0) + metricValue(inv, filters.metric))
  }
  const fys = filters.fys.length ? filters.fys : [...maps.keys()]
  return {
    name: 'Quarterly',
    rows: fys.flatMap((fy) =>
      QUARTERS.map((q) => ({
        'Budget FY': fy,
        Quarter: q,
        Value: money(maps.get(fy)?.get(q) ?? 0),
      })),
    ),
  }
}

function mixSheet(rows: ReportInvoice[], yearBudgets: ReportBudget[], fySet: Set<string>): Sheet {
  let opex = 0
  let opexBudget = 0
  let miscBudget = 0
  for (const inv of rows) {
    if (costCategory(inv.cost_element) === 'OPEX') opex += Number(inv.amount ?? 0)
  }
  for (const b of yearBudgets) {
    if (fySet.size > 0 && !fySet.has(b.fy)) continue
    const amt = Number(b.amount ?? 0)
    if (isMiscCostElement(b.cost_element)) miscBudget += amt
    else if (costCategory(b.cost_element) === 'OPEX') opexBudget += amt
  }
  const capex = Math.max(0, opexBudget - opex)
  return {
    name: 'Expense mix',
    rows: [
      { Category: 'OPEX', 'Amount (Rs)': money(opex), Note: 'SUR / THL / SM spend' },
      { Category: 'CAPEX outlook', 'Amount (Rs)': money(capex), Note: 'Unused OPEX budget' },
      { Category: 'Misc.', 'Amount (Rs)': money(miscBudget), Note: 'Misc. cost-element budget' },
    ],
  }
}

function vendorSheet(rows: ReportInvoice[], filters: ReportExportFilters): Sheet {
  const map = new Map<string, { count: number; total: number }>()
  for (const inv of rows) {
    const name = vendorOf(inv)
    const bucket = map.get(name) ?? { count: 0, total: 0 }
    bucket.count += 1
    bucket.total += metricValue(inv, filters.metric)
    map.set(name, bucket)
  }
  return {
    name: 'Vendors',
    rows: [...map.entries()]
      .map(([vendor, v]) => ({ Vendor: vendor, Invoices: v.count, 'Amount (Rs)': money(v.total) }))
      .sort((a, b) => Number(b['Amount (Rs)']) - Number(a['Amount (Rs)'])),
  }
}

function typeSheet(rows: ReportInvoice[], filters: ReportExportFilters, field: 't1' | 't2' | 't3', name: string, label: string): Sheet {
  const map = new Map<string, { count: number; total: number }>()
  for (const inv of rows) {
    const key = (inv[field] ?? '').trim() || 'Uncoded'
    const bucket = map.get(key) ?? { count: 0, total: 0 }
    bucket.count += 1
    bucket.total += metricValue(inv, filters.metric)
    map.set(key, bucket)
  }
  return {
    name,
    rows: [...map.entries()]
      .map(([value, v]) => ({ [label]: value, Invoices: v.count, 'Amount (Rs)': money(v.total) }))
      .sort((a, b) => Number(b['Amount (Rs)']) - Number(a['Amount (Rs)'])),
  }
}

function budgetSheet(
  rows: ReportInvoice[],
  pos: ReportPo[],
  yearBudgets: ReportBudget[],
  fy: string,
): Sheet {
  const invoiceById = new Map(rows.map((i) => [i.id, i]))
  const actualByCe = new Map<string, number>()
  for (const p of pos) {
    const inv = invoiceById.get(p.invoice_id ?? p.invoices?.id ?? '') ?? (p.invoices as ReportInvoice | undefined)
    if (!inv || invoiceBudgetFy(inv) !== fy) continue
    const ce = inv.cost_element ?? 'Uncoded'
    actualByCe.set(ce, (actualByCe.get(ce) ?? 0) + poReleasedAmount(p))
  }
  const lines = yearBudgets.filter((b) => b.fy === fy)
  const out = lines.map((l) => {
    const actual = actualByCe.get(l.cost_element) ?? 0
    return {
      'Cost element': l.cost_element,
      'Budget (Rs)': money(Number(l.amount)),
      'Released (Rs)': money(actual),
      'Variance (Rs)': money(Number(l.amount) - actual),
      'Utilization %': Number(l.amount) > 0 ? money((actual / Number(l.amount)) * 100) : 0,
    }
  })
  return { name: 'Budget vs actual', rows: out }
}

function contractSheet(contracts: ReportContract[], pos: ReportPo[], invoices: ReportInvoice[]): Sheet {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const releasedByContract = new Map<string, number>()
  for (const p of pos) {
    const inv = invoiceById.get(p.invoice_id ?? p.invoices?.id ?? '')
    if (!inv?.contract_id) continue
    releasedByContract.set(inv.contract_id, (releasedByContract.get(inv.contract_id) ?? 0) + poReleasedAmount(p))
  }
  return {
    name: 'Contracts',
    rows: contracts.map((cn) => {
      const budget = Number(cn.value ?? 0)
      const actual = releasedByContract.get(cn.id) ?? 0
      return {
        Contract: cn.contract_no,
        Vendor: vendorNameOf(cn),
        'Budget (Rs)': money(budget),
        'Released (Rs)': money(actual),
        'Remaining (Rs)': money(budget - actual),
        'Utilization %': budget > 0 ? money((actual / budget) * 100) : 0,
      }
    }),
  }
}

function accrualSheet(years: ReportAccrual[]): Sheet {
  return {
    name: 'Accrual years',
    rows: years.map((y) => ({
      'Budget FY': y.fy,
      Closed: isClosedFiscalYear(y.fy) ? 'Yes' : 'No',
      'Unpaid (Rs)': money(y.unpaid),
      'Consumed (Rs)': money(y.consumed),
      'Computed (Rs)': money(y.computed),
      Override: y.override == null ? '' : money(y.override),
      'Secured (Rs)': money(y.secured),
      'Balance (Rs)': money(y.balance),
    })),
  }
}

function agingSheet(rows: ReportInvoice[]): Sheet {
  const buckets = [
    { label: '0-30 days', min: 0, max: 30 },
    { label: '31-60 days', min: 31, max: 60 },
    { label: '61-90 days', min: 61, max: 90 },
    { label: '90+ days', min: 91, max: 100000 },
  ]
  const open = rows.filter((i) => i.status === 'Pending')
  const now = Date.now()
  return {
    name: 'AP aging',
    rows: buckets.map((b) => {
      const set = open.filter((i) => {
        if (!i.invoice_date) return false
        const days = Math.floor((now - new Date(i.invoice_date).getTime()) / 86400000)
        return days >= b.min && days <= b.max
      })
      return {
        Bucket: b.label,
        Invoices: set.length,
        'Amount (Rs)': money(set.reduce((s, i) => s + Number(i.amount ?? 0), 0)),
      }
    }),
  }
}

function outlookSheet(rows: ReportInvoice[], yearBudgets: ReportBudget[], fy: string): Sheet {
  const monthsToDate = rows
    .filter((i) => invoiceBudgetFy(i) === fy)
    .reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const { elapsed, remaining } = elapsedInFiscalYear(fy)
  const rate = elapsed > 0 ? monthsToDate / elapsed : 0
  const projected = rate * 12
  const budgetForFy = yearBudgets.filter((b) => b.fy === fy).reduce((s, b) => s + Number(b.amount ?? 0), 0)
  const prevFy = shiftFiscalYear(fy, -1)
  const previous = rows.filter((i) => invoiceBudgetFy(i) === prevFy).reduce((s, i) => s + Number(i.amount ?? 0), 0)
  return {
    name: 'Outlook',
    rows: [
      { Field: 'Fiscal year', Value: fy },
      { Field: 'YTD spend (Rs)', Value: money(monthsToDate) },
      { Field: 'Months elapsed', Value: elapsed },
      { Field: 'Months remaining', Value: remaining },
      { Field: 'Run rate / month (Rs)', Value: money(rate) },
      { Field: 'Projected year (Rs)', Value: money(projected) },
      { Field: 'Yearly budget (Rs)', Value: money(budgetForFy) },
      { Field: 'Projected variance (Rs)', Value: money(projected - budgetForFy) },
      { Field: `${prevFy} spend (Rs)`, Value: money(previous) },
    ],
  }
}

function summarySheet(
  rows: ReportInvoice[],
  pos: ReportPo[],
  yearBudgets: ReportBudget[],
  fy: string,
): Sheet {
  const figures = yearlyBudgetFigures(fy, yearBudgets, pos)
  const total = rows.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const pending = rows.filter((i) => i.status === 'Pending').reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const approved = rows.filter((i) => isSignedOff(i.status)).reduce((s, i) => s + invoiceApprovedAmount(i), 0)
  return {
    name: 'Summary',
    rows: [
      { Field: 'Fiscal year', Value: fy },
      { Field: 'Invoices', Value: rows.length },
      { Field: 'Scoped spend (Rs)', Value: money(total) },
      { Field: 'Pending (Rs)', Value: money(pending) },
      { Field: 'Approved (Rs)', Value: money(approved) },
      { Field: 'Yearly budget (Rs)', Value: money(figures.yearly) },
      { Field: 'Released (Rs)', Value: money(figures.released) },
      { Field: 'Remaining (Rs)', Value: money(figures.remaining) },
    ],
  }
}

export function downloadGeneratedReport(data: ReportExportData, filters: ReportExportFilters) {
  const rows = filterInvoices(data.invoices, filters)
  const fySet = new Set(filters.fys)
  const fy = filters.fys.includes(currentFiscalYear())
    ? currentFiscalYear()
    : (filters.fys[0] ?? currentFiscalYear())
  const ids = new Set(rows.map((i) => i.id))
  const pos = data.paymentOrders.filter((p) => {
    const id = p.invoice_id ?? p.invoices?.id
    return Boolean(id && ids.has(id))
  })

  const want = (id: ReportTemplate) => filters.template === 'full' || filters.template === id
  const sheets: Sheet[] = [coverSheet(filters, rows.length)]
  if (want('overview') || want('spend')) sheets.push(summarySheet(rows, pos, data.yearBudgets, fy))
  if (want('spend') || filters.template === 'full') sheets.push(ledgerSheet(rows, data.contracts))
  if (want('overview') || want('spend')) {
    sheets.push(monthlySheet(rows, filters))
    sheets.push(quarterlySheet(rows, filters))
    sheets.push(vendorSheet(rows, filters))
    sheets.push(typeSheet(rows, filters, 't1', 'Types', 'Type'))
    sheets.push(typeSheet(rows, filters, 't2', 'Services', 'Service'))
    sheets.push(typeSheet(rows, filters, 't3', 'Details', 'Detail'))
  }
  if (want('overview')) sheets.push(mixSheet(rows, data.yearBudgets, fySet))
  if (want('budget')) {
    sheets.push(budgetSheet(rows, pos, data.yearBudgets, fy))
    sheets.push(contractSheet(data.contracts, pos, rows))
  }
  if (want('accrual')) sheets.push(accrualSheet(data.accrualYears))
  if (want('aging')) sheets.push(agingSheet(rows))
  if (want('outlook')) sheets.push(outlookSheet(data.invoices, data.yearBudgets, fy))

  const stamp = new Date().toISOString().slice(0, 10)
  const fyTag = filters.fys.length === 1 ? filters.fys[0] : 'multi-fy'
  downloadXlsx(`PRL-EOMS-${filters.template}-${fyTag}-${stamp}.xlsx`, sheets)
}
