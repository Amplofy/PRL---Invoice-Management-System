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
import { invoiceApprovedAmount, poReleasedAmount, poStatusLabel } from './paymentOrder'
import { isSignedOff } from './invoice'
import { yearlyBudgetFigures } from './fyAnalysis'
import { downloadAnalysisWorkbook, type AnalysisColumn, type AnalysisSheet } from './analysisWorkbook'
import { contractNoOf, vendorEmailOf, vendorNameOf } from './relations'

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

export const REPORT_GROUP_BY = [
  { id: '', label: 'No grouping' },
  { id: 'Vendor', label: 'Vendor' },
  { id: 'Budget FY', label: 'Budget FY' },
  { id: 'Contract', label: 'Contract' },
  { id: 'Cost element', label: 'Cost element' },
  { id: 'Status', label: 'Status' },
  { id: 'Type', label: 'Type' },
  { id: 'Location', label: 'Location' },
] as const

export interface ReportInvoice {
  id: string
  serial_no?: string | null
  processing_date?: string | null
  invoice_no: string | null
  invoice_date: string | null
  service_from?: string | null
  service_to?: string | null
  contract_id: string | null
  cost_element: string | null
  amount: number
  approved_amount?: number | null
  status: string
  t1?: string | null
  t2?: string | null
  t3?: string | null
  location?: string | null
  tanker_name?: string | null
  trips?: number | null
  item_no?: string | null
  remarks?: string | null
  approved_by?: string | null
  contracts?: {
    contract_no: string | null
    vendor_id?: string | null
    vendors: Array<{ name: string | null; email?: string | null }> | null
  } | null
}

export interface ReportPo {
  id: string
  serial_no?: string | null
  invoice_id?: string | null
  status: string | null
  amount?: number | null
  released_amount?: number | null
  generated_by?: string | null
  generated_at?: string | null
  released_by?: string | null
  released_at?: string | null
  finance_approved_by?: string | null
  finance_approved_at?: string | null
  finance_remarks?: string | null
  released_via?: string | null
  release_reference?: string | null
  invoices?: {
    id?: string
    invoice_no?: string | null
    invoice_date?: string | null
    amount?: number
    approved_amount?: number | null
    cost_element?: string | null
    status?: string | null
    service_from?: string | null
    service_to?: string | null
    t1?: string | null
    t2?: string | null
    t3?: string | null
    location?: string | null
  } | null
}

export interface ReportContract {
  id: string
  contract_no: string
  value: number | null
  status?: string | null
  start_date?: string | null
  end_date?: string | null
  service?: string | null
  vendors: Array<{ name: string | null; email?: string | null }> | null
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
    service_from?: string | null
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
  groupBy: string
}

export interface ReportExportData {
  invoices: ReportInvoice[]
  contracts: ReportContract[]
  yearBudgets: ReportBudget[]
  paymentOrders: ReportPo[]
  accrualYears: ReportAccrual[]
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

function vendorOf(inv: ReportInvoice) {
  return vendorNameOf(inv)
}

function contractLabel(inv: ReportInvoice, contracts: ReportContract[]) {
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

const LEDGER_COLS: AnalysisColumn[] = [
  { key: 'Serial', header: 'Serial', width: 14 },
  { key: 'Invoice no', header: 'Invoice no', width: 16 },
  { key: 'Invoice date', header: 'Invoice date', kind: 'date', width: 14 },
  { key: 'Processing date', header: 'Processing date', kind: 'date', width: 16 },
  { key: 'Service from', header: 'Service from', kind: 'date', width: 14 },
  { key: 'Service to', header: 'Service to', kind: 'date', width: 14 },
  { key: 'Budget FY', header: 'Budget FY', width: 12 },
  { key: 'Quarter', header: 'Quarter', width: 10 },
  { key: 'Vendor', header: 'Vendor', width: 28 },
  { key: 'Vendor email', header: 'Vendor email', width: 28 },
  { key: 'Contract', header: 'Contract', width: 16 },
  { key: 'Type', header: 'Type', width: 16 },
  { key: 'Service', header: 'Service', width: 18 },
  { key: 'Detail', header: 'Detail', width: 18 },
  { key: 'Location', header: 'Location', width: 16 },
  { key: 'Item', header: 'Item', width: 12 },
  { key: 'Tanker', header: 'Tanker', width: 14 },
  { key: 'Trips', header: 'Trips', kind: 'int', width: 10 },
  { key: 'Cost element', header: 'Cost element', width: 14 },
  { key: 'Category', header: 'Category', width: 14 },
  { key: 'Status', header: 'Status', width: 12 },
  { key: 'Amount (Rs)', header: 'Amount (Rs)', kind: 'money', width: 16 },
  { key: 'Approved (Rs)', header: 'Approved (Rs)', kind: 'money', width: 16 },
  { key: 'Released (Rs)', header: 'Released (Rs)', kind: 'money', width: 16 },
  { key: 'PO status', header: 'PO status', width: 18 },
  { key: 'Accrual open', header: 'Accrual open', width: 14 },
  { key: 'Remarks', header: 'Remarks', width: 32 },
  { key: 'Approved by', header: 'Approved by', width: 16 },
]

function ledgerRows(
  rows: ReportInvoice[],
  contracts: ReportContract[],
  pos: ReportPo[],
): Array<Record<string, unknown>> {
  const released = new Map<string, { amount: number; status: string }>()
  for (const p of pos) {
    const id = p.invoice_id ?? p.invoices?.id
    if (!id) continue
    const prev = released.get(id) ?? { amount: 0, status: '' }
    prev.amount += poReleasedAmount(p)
    prev.status = poStatusLabel(p.status)
    released.set(id, prev)
  }
  return rows.map((inv) => {
    const fi = invoiceBudgetInfo(inv)
    const pay = released.get(inv.id)
    return {
      Serial: inv.serial_no ?? '',
      'Invoice no': inv.invoice_no ?? '',
      'Invoice date': inv.invoice_date ?? '',
      'Processing date': inv.processing_date ?? '',
      'Service from': inv.service_from ?? '',
      'Service to': inv.service_to ?? '',
      'Budget FY': fi?.fy ?? '',
      Quarter: fi?.quarter ?? '',
      Vendor: vendorOf(inv),
      'Vendor email': vendorEmailOf(inv),
      Contract: contractLabel(inv, contracts),
      Type: inv.t1 ?? '',
      Service: inv.t2 ?? '',
      Detail: inv.t3 ?? '',
      Location: inv.location ?? '',
      Item: inv.item_no ?? '',
      Tanker: inv.tanker_name ?? '',
      Trips: Number(inv.trips ?? 0),
      'Cost element': inv.cost_element ?? '',
      Category: costCategory(inv.cost_element),
      Status: inv.status,
      'Amount (Rs)': money(Number(inv.amount ?? 0)),
      'Approved (Rs)': money(invoiceApprovedAmount(inv)),
      'Released (Rs)': money(pay?.amount ?? 0),
      'PO status': pay?.status ?? '',
      'Accrual open': isAccrualOpenInvoice(inv) ? 'Yes' : 'No',
      Remarks: inv.remarks ?? '',
      'Approved by': inv.approved_by ?? '',
    }
  })
}

function moneyCol(key: string, width = 16): AnalysisColumn {
  return { key, header: key, kind: 'money', width }
}

function textCol(key: string, width = 18): AnalysisColumn {
  return { key, header: key, width }
}

function intCol(key: string, width = 12): AnalysisColumn {
  return { key, header: key, kind: 'int', width }
}

function pctCol(key: string, width = 14): AnalysisColumn {
  return { key, header: key, kind: 'pct', width }
}

function rankedSheet(
  name: string,
  title: string,
  label: string,
  rows: ReportInvoice[],
  filters: ReportExportFilters,
  pick: (inv: ReportInvoice) => string,
): AnalysisSheet {
  const map = new Map<string, { count: number; amount: number; approved: number; pending: number; released: number }>()
  for (const inv of rows) {
    const key = pick(inv).trim() || 'Uncoded'
    const bucket = map.get(key) ?? { count: 0, amount: 0, approved: 0, pending: 0, released: 0 }
    bucket.count += 1
    bucket.amount += metricValue(inv, filters.metric)
    if (isSignedOff(inv.status)) bucket.approved += invoiceApprovedAmount(inv)
    if (inv.status === 'Pending') bucket.pending += Number(inv.amount ?? 0)
    map.set(key, bucket)
  }
  const total = [...map.values()].reduce((s, v) => s + v.amount, 0)
  const out = [...map.entries()]
    .map(([value, v]) => ({
      [label]: value,
      Invoices: v.count,
      'Amount (Rs)': money(v.amount),
      'Approved (Rs)': money(v.approved),
      'Pending (Rs)': money(v.pending),
      'Share %': total > 0 ? money((v.amount / total) * 100) : 0,
    }))
    .sort((a, b) => Number(b['Amount (Rs)']) - Number(a['Amount (Rs)']))
  return {
    name,
    title,
    subtitle: 'Ranked by amount with share of scoped total',
    columns: [textCol(label, 28), intCol('Invoices'), moneyCol('Amount (Rs)'), moneyCol('Approved (Rs)'), moneyCol('Pending (Rs)'), pctCol('Share %')],
    rows: out,
    grandTotal: true,
    tabColor: 'FF1D4E89',
  }
}

function monthlySheet(rows: ReportInvoice[], filters: ReportExportFilters): AnalysisSheet {
  const months = new Map<number, { amount: number; count: number; approved: number }>()
  for (const inv of rows) {
    const date = invoiceBudgetDate(inv)
    if (!date) continue
    const idx = fyMonthIndex(new Date(date))
    const cur = months.get(idx) ?? { amount: 0, count: 0, approved: 0 }
    cur.amount += metricValue(inv, filters.metric)
    cur.count += 1
    if (isSignedOff(inv.status)) cur.approved += invoiceApprovedAmount(inv)
    months.set(idx, cur)
  }
  return {
    name: 'Monthly',
    title: 'Monthly burn',
    columns: [textCol('Month', 12), intCol('Invoices'), moneyCol('Amount (Rs)'), moneyCol('Approved (Rs)')],
    rows: FY_MONTHS.map((label, idx) => ({
      Month: label,
      Invoices: months.get(idx)?.count ?? 0,
      'Amount (Rs)': money(months.get(idx)?.amount ?? 0),
      'Approved (Rs)': money(months.get(idx)?.approved ?? 0),
    })),
    grandTotal: true,
  }
}

function quarterlySheet(rows: ReportInvoice[], filters: ReportExportFilters): AnalysisSheet {
  const maps = new Map<string, Map<FiscalQuarter, { amount: number; count: number }>>()
  for (const inv of rows) {
    const fi = invoiceBudgetInfo(inv)
    if (!fi) continue
    const map = maps.get(fi.fy) ?? new Map()
    maps.set(fi.fy, map)
    const cur = map.get(fi.quarter) ?? { amount: 0, count: 0 }
    cur.amount += metricValue(inv, filters.metric)
    cur.count += 1
    map.set(fi.quarter, cur)
  }
  const fys = filters.fys.length ? filters.fys : [...maps.keys()]
  return {
    name: 'Quarterly',
    title: 'Quarterly spend',
    columns: [textCol('Budget FY', 12), textCol('Quarter', 10), intCol('Invoices'), moneyCol('Amount (Rs)')],
    rows: fys.flatMap((fy) =>
      QUARTERS.map((q) => ({
        'Budget FY': fy,
        Quarter: q,
        Invoices: maps.get(fy)?.get(q)?.count ?? 0,
        'Amount (Rs)': money(maps.get(fy)?.get(q)?.amount ?? 0),
      })),
    ),
    groupBy: 'Budget FY',
    grandTotal: true,
  }
}

function vendorQuarterSheet(rows: ReportInvoice[], filters: ReportExportFilters): AnalysisSheet {
  const vendors = new Map<string, Record<string, number>>()
  for (const inv of rows) {
    const fi = invoiceBudgetInfo(inv)
    if (!fi) continue
    const name = vendorOf(inv)
    const rec = vendors.get(name) ?? { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }
    rec[fi.quarter] = (rec[fi.quarter] ?? 0) + metricValue(inv, filters.metric)
    vendors.set(name, rec)
  }
  const out = [...vendors.entries()].map(([vendor, rec]) => {
    const total = QUARTERS.reduce((s, q) => s + (rec[q] ?? 0), 0)
    return {
      Vendor: vendor,
      Q1: money(rec.Q1 ?? 0),
      Q2: money(rec.Q2 ?? 0),
      Q3: money(rec.Q3 ?? 0),
      Q4: money(rec.Q4 ?? 0),
      'Total (Rs)': money(total),
    }
  }).sort((a, b) => Number(b['Total (Rs)']) - Number(a['Total (Rs)']))
  return {
    name: 'Vendor x Quarter',
    title: 'Vendor by quarter',
    subtitle: 'Pivot of scoped metric',
    columns: [textCol('Vendor', 28), moneyCol('Q1'), moneyCol('Q2'), moneyCol('Q3'), moneyCol('Q4'), moneyCol('Total (Rs)')],
    rows: out,
    grandTotal: true,
    tabColor: 'FF0B6E4F',
  }
}

function mixSheet(rows: ReportInvoice[], yearBudgets: ReportBudget[], fySet: Set<string>): AnalysisSheet {
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
  const total = opex + capex + miscBudget
  return {
    name: 'Expense mix',
    title: 'Expense mix',
    columns: [textCol('Category', 18), moneyCol('Amount (Rs)'), pctCol('Share %'), textCol('Note', 36)],
    rows: [
      { Category: 'OPEX', 'Amount (Rs)': money(opex), 'Share %': total ? money((opex / total) * 100) : 0, Note: 'SUR / THL / SM spend' },
      { Category: 'CAPEX outlook', 'Amount (Rs)': money(capex), 'Share %': total ? money((capex / total) * 100) : 0, Note: 'Unused OPEX budget' },
      { Category: 'Misc.', 'Amount (Rs)': money(miscBudget), 'Share %': total ? money((miscBudget / total) * 100) : 0, Note: 'Misc. cost-element budget' },
    ],
    grandTotal: true,
  }
}

function budgetSheet(rows: ReportInvoice[], pos: ReportPo[], yearBudgets: ReportBudget[], fy: string): AnalysisSheet {
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
    const budget = Number(l.amount)
    return {
      'Cost element': l.cost_element,
      Category: costCategory(l.cost_element),
      'Budget (Rs)': money(budget),
      'Released (Rs)': money(actual),
      'Variance (Rs)': money(budget - actual),
      'Utilization %': budget > 0 ? money((actual / budget) * 100) : 0,
    }
  })
  return {
    name: 'Budget vs actual',
    title: `Budget vs actual · ${fy}`,
    columns: [textCol('Cost element', 16), textCol('Category', 16), moneyCol('Budget (Rs)'), moneyCol('Released (Rs)'), moneyCol('Variance (Rs)'), pctCol('Utilization %')],
    rows: out,
    groupBy: 'Category',
    grandTotal: true,
  }
}

function contractSheet(contracts: ReportContract[], pos: ReportPo[], invoices: ReportInvoice[]): AnalysisSheet {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const releasedByContract = new Map<string, number>()
  for (const p of pos) {
    const inv = invoiceById.get(p.invoice_id ?? p.invoices?.id ?? '')
    if (!inv?.contract_id) continue
    releasedByContract.set(inv.contract_id, (releasedByContract.get(inv.contract_id) ?? 0) + poReleasedAmount(p))
  }
  return {
    name: 'Contracts',
    title: 'Contract burn-down',
    columns: [
      textCol('Contract', 16),
      textCol('Vendor', 24),
      textCol('Vendor email', 26),
      textCol('Status', 12),
      { key: 'Start', header: 'Start', kind: 'date', width: 12 },
      { key: 'End', header: 'End', kind: 'date', width: 12 },
      moneyCol('Budget (Rs)'),
      moneyCol('Released (Rs)'),
      moneyCol('Remaining (Rs)'),
      pctCol('Utilization %'),
    ],
    rows: contracts.map((cn) => {
      const budget = Number(cn.value ?? 0)
      const actual = releasedByContract.get(cn.id) ?? 0
      return {
        Contract: cn.contract_no,
        Vendor: vendorNameOf(cn),
        'Vendor email': vendorEmailOf(cn),
        Status: cn.status ?? '',
        Start: cn.start_date ?? '',
        End: cn.end_date ?? '',
        'Budget (Rs)': money(budget),
        'Released (Rs)': money(actual),
        'Remaining (Rs)': money(budget - actual),
        'Utilization %': budget > 0 ? money((actual / budget) * 100) : 0,
      }
    }),
    groupBy: 'Vendor',
    grandTotal: true,
  }
}

function poSheet(pos: ReportPo[], invoices: ReportInvoice[], contracts: ReportContract[]): AnalysisSheet {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  return {
    name: 'PO register',
    title: 'Payment order register',
    columns: [
      textCol('PO serial', 16),
      { key: 'Generated at', header: 'Generated at', width: 20 },
      textCol('Generated by', 16),
      textCol('Invoice no', 16),
      { key: 'Invoice date', header: 'Invoice date', kind: 'date', width: 14 },
      textCol('Vendor', 24),
      textCol('Contract', 16),
      textCol('Type', 14),
      textCol('Service', 16),
      textCol('Detail', 16),
      textCol('Location', 16),
      textCol('Cost element', 14),
      textCol('Budget FY', 12),
      moneyCol('Invoice approved (Rs)', 20),
      moneyCol('PO amount (Rs)'),
      moneyCol('Released (Rs)'),
      textCol('Released via', 16),
      textCol('Release reference', 18),
      textCol('Status', 18),
      textCol('Finance remarks', 24),
    ],
    rows: pos.map((p) => {
      const inv = invoiceById.get(p.invoice_id ?? p.invoices?.id ?? '') ?? (p.invoices as ReportInvoice | undefined)
      return {
        'PO serial': p.serial_no ?? '',
        'Generated at': p.generated_at ?? '',
        'Generated by': p.generated_by ?? '',
        'Invoice no': inv?.invoice_no ?? p.invoices?.invoice_no ?? '',
        'Invoice date': inv?.invoice_date ?? p.invoices?.invoice_date ?? '',
        Vendor: inv ? vendorOf(inv) : vendorNameOf(p),
        Contract: inv ? contractLabel(inv, contracts) : contractNoOf(p),
        Type: inv?.t1 ?? p.invoices?.t1 ?? '',
        Service: inv?.t2 ?? p.invoices?.t2 ?? '',
        Detail: inv?.t3 ?? p.invoices?.t3 ?? '',
        Location: inv?.location ?? p.invoices?.location ?? '',
        'Cost element': inv?.cost_element ?? p.invoices?.cost_element ?? '',
        'Budget FY': inv ? invoiceBudgetFy(inv) ?? '' : '',
        'Invoice approved (Rs)': money(invoiceApprovedAmount(inv)),
        'PO amount (Rs)': money(Number(p.amount ?? 0)),
        'Released (Rs)': money(poReleasedAmount(p)),
        'Released via': p.released_via ?? '',
        'Release reference': p.release_reference ?? '',
        Status: poStatusLabel(p.status),
        'Finance remarks': p.finance_remarks ?? '',
      }
    }),
    groupBy: 'Vendor',
    grandTotal: true,
  }
}

function accrualSheet(years: ReportAccrual[]): AnalysisSheet {
  return {
    name: 'Accrual years',
    title: 'Sundry accrual by year',
    columns: [
      textCol('Budget FY', 12),
      textCol('Closed', 10),
      moneyCol('Unpaid (Rs)'),
      moneyCol('Consumed (Rs)'),
      moneyCol('Computed (Rs)'),
      moneyCol('Override (Rs)'),
      moneyCol('Secured (Rs)'),
      moneyCol('Balance (Rs)'),
    ],
    rows: years.map((y) => ({
      'Budget FY': y.fy,
      Closed: isClosedFiscalYear(y.fy) ? 'Yes' : 'No',
      'Unpaid (Rs)': money(y.unpaid),
      'Consumed (Rs)': money(y.consumed),
      'Computed (Rs)': money(y.computed),
      'Override (Rs)': y.override == null ? 0 : money(y.override),
      'Secured (Rs)': money(y.secured),
      'Balance (Rs)': money(y.balance),
    })),
    grandTotal: true,
  }
}

function accrualDetailSheet(years: ReportAccrual[]): AnalysisSheet {
  return {
    name: 'Accrual invoices',
    title: 'Unpaid invoices in closed years',
    columns: [
      textCol('Budget FY', 12),
      textCol('Invoice no', 16),
      { key: 'Invoice date', header: 'Invoice date', kind: 'date', width: 14 },
      { key: 'Service from', header: 'Service from', kind: 'date', width: 14 },
      { key: 'Service to', header: 'Service to', kind: 'date', width: 14 },
      textCol('Status', 12),
      moneyCol('Amount (Rs)'),
    ],
    rows: years.flatMap((y) =>
      (y.invoices ?? []).map((inv) => ({
        'Budget FY': y.fy,
        'Invoice no': inv.invoice_no ?? '',
        'Invoice date': inv.invoice_date ?? '',
        'Service from': inv.service_from ?? '',
        'Service to': inv.service_to ?? '',
        Status: inv.status ?? '',
        'Amount (Rs)': money(Number(inv.amount ?? 0)),
      })),
    ),
    groupBy: 'Budget FY',
    grandTotal: true,
  }
}

function agingSheets(rows: ReportInvoice[]): AnalysisSheet[] {
  const buckets = [
    { label: '0-30 days', min: 0, max: 30 },
    { label: '31-60 days', min: 31, max: 60 },
    { label: '61-90 days', min: 61, max: 90 },
    { label: '90+ days', min: 91, max: 100000 },
  ]
  const open = rows.filter((i) => i.status === 'Pending')
  const now = Date.now()
  const withDays = open.map((i) => {
    const days = i.invoice_date ? Math.floor((now - new Date(i.invoice_date).getTime()) / 86400000) : 0
    const bucket = buckets.find((b) => days >= b.min && days <= b.max)?.label ?? '90+ days'
    return { inv: i, days, bucket }
  })
  const summary: AnalysisSheet = {
    name: 'AP aging',
    title: 'AP aging summary',
    columns: [textCol('Bucket', 14), intCol('Invoices'), moneyCol('Amount (Rs)')],
    rows: buckets.map((b) => {
      const set = withDays.filter((x) => x.bucket === b.label)
      return {
        Bucket: b.label,
        Invoices: set.length,
        'Amount (Rs)': money(set.reduce((s, x) => s + Number(x.inv.amount ?? 0), 0)),
      }
    }),
    grandTotal: true,
  }
  const detail: AnalysisSheet = {
    name: 'Aging detail',
    title: 'Open invoices by age',
    columns: [
      textCol('Bucket', 14),
      intCol('Days'),
      textCol('Invoice no', 16),
      { key: 'Invoice date', header: 'Invoice date', kind: 'date', width: 14 },
      textCol('Vendor', 24),
      textCol('Contract', 16),
      textCol('Type', 14),
      textCol('Cost element', 14),
      moneyCol('Amount (Rs)'),
    ],
    rows: withDays
      .sort((a, b) => b.days - a.days)
      .map((x) => ({
        Bucket: x.bucket,
        Days: x.days,
        'Invoice no': x.inv.invoice_no ?? '',
        'Invoice date': x.inv.invoice_date ?? '',
        Vendor: vendorOf(x.inv),
        Contract: contractNoOf(x.inv),
        Type: x.inv.t1 ?? '',
        'Cost element': x.inv.cost_element ?? '',
        'Amount (Rs)': money(Number(x.inv.amount ?? 0)),
      })),
    groupBy: 'Bucket',
    grandTotal: true,
  }
  return [summary, detail]
}

function outlookSheet(rows: ReportInvoice[], yearBudgets: ReportBudget[], fy: string): AnalysisSheet {
  const monthsToDate = rows.filter((i) => invoiceBudgetFy(i) === fy).reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const { elapsed, remaining } = elapsedInFiscalYear(fy)
  const rate = elapsed > 0 ? monthsToDate / elapsed : 0
  const projected = rate * 12
  const budgetForFy = yearBudgets.filter((b) => b.fy === fy).reduce((s, b) => s + Number(b.amount ?? 0), 0)
  const prevFy = shiftFiscalYear(fy, -1)
  const previous = rows.filter((i) => invoiceBudgetFy(i) === prevFy).reduce((s, i) => s + Number(i.amount ?? 0), 0)
  return {
    name: 'Outlook',
    title: `Foresight · ${fy}`,
    columns: [textCol('Field', 28), { key: 'Value', header: 'Value', kind: 'n', width: 22 }],
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
    grandTotal: false,
  }
}

function summarySheet(rows: ReportInvoice[], pos: ReportPo[], yearBudgets: ReportBudget[], fy: string): AnalysisSheet {
  const figures = yearlyBudgetFigures(fy, yearBudgets, pos)
  const total = rows.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const pending = rows.filter((i) => i.status === 'Pending').reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const approved = rows.filter((i) => isSignedOff(i.status)).reduce((s, i) => s + invoiceApprovedAmount(i), 0)
  return {
    name: 'Summary',
    title: `Executive summary · ${fy}`,
    columns: [textCol('Field', 28), { key: 'Value', header: 'Value', kind: 'n', width: 22 }],
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
    grandTotal: false,
  }
}

export async function downloadGeneratedReport(data: ReportExportData, filters: ReportExportFilters) {
  const rows = filterInvoices(data.invoices, filters)
  const fySet = new Set(filters.fys)
  const fy = filters.fys.includes(currentFiscalYear()) ? currentFiscalYear() : (filters.fys[0] ?? currentFiscalYear())
  const ids = new Set(rows.map((i) => i.id))
  const pos = data.paymentOrders.filter((p) => {
    const id = p.invoice_id ?? p.invoices?.id
    return Boolean(id && ids.has(id))
  })

  const want = (id: ReportTemplate) => filters.template === 'full' || filters.template === id
  const sheets: AnalysisSheet[] = []
  if (want('overview') || want('spend')) sheets.push(summarySheet(rows, pos, data.yearBudgets, fy))
  if (want('spend') || filters.template === 'full') {
    sheets.push({
      name: 'Invoice ledger',
      title: 'Invoice ledger',
      subtitle: 'All invoice fields in scope, with payment release and accrual flags',
      columns: LEDGER_COLS,
      rows: ledgerRows(rows, data.contracts, pos),
      groupBy: filters.groupBy || undefined,
      grandTotal: true,
      tabColor: 'FF0F2744',
    })
    sheets.push(poSheet(pos, rows, data.contracts))
  }
  if (want('overview') || want('spend')) {
    sheets.push(monthlySheet(rows, filters))
    sheets.push(quarterlySheet(rows, filters))
    sheets.push(rankedSheet('Vendors', 'Vendor ranking', 'Vendor', rows, filters, vendorOf))
    sheets.push(rankedSheet('Types', 'Type ranking', 'Type', rows, filters, (i) => i.t1 ?? ''))
    sheets.push(rankedSheet('Services', 'Service ranking', 'Service', rows, filters, (i) => i.t2 ?? ''))
    sheets.push(rankedSheet('Details', 'Detail ranking', 'Detail', rows, filters, (i) => i.t3 ?? ''))
    sheets.push(rankedSheet('Locations', 'Location ranking', 'Location', rows, filters, (i) => i.location ?? ''))
    sheets.push(vendorQuarterSheet(rows, filters))
  }
  if (want('overview')) sheets.push(mixSheet(rows, data.yearBudgets, fySet))
  if (want('budget')) {
    sheets.push(budgetSheet(rows, pos, data.yearBudgets, fy))
    sheets.push(contractSheet(data.contracts, pos, rows))
  }
  if (want('accrual')) {
    sheets.push(accrualSheet(data.accrualYears))
    sheets.push(accrualDetailSheet(data.accrualYears))
  }
  if (want('aging')) sheets.push(...agingSheets(rows))
  if (want('outlook')) sheets.push(outlookSheet(data.invoices, data.yearBudgets, fy))

  const stamp = new Date().toISOString().slice(0, 10)
  const fyTag = filters.fys.length === 1 ? filters.fys[0] : 'multi-fy'
  const template = REPORT_TEMPLATES.find((t) => t.id === filters.template)?.label ?? filters.template
  await downloadAnalysisWorkbook(`PRL-EOMS-${filters.template}-${fyTag}-${stamp}.xlsx`, sheets, {
    title: template,
    subtitle: 'Advanced analysis workbook with full columns, subtotals and grand totals',
    filters: [
      { label: 'Fiscal years', value: filters.fys.length ? filters.fys.join(', ') : 'All' },
      { label: 'Quarter', value: filters.quarter === 'all' ? 'All quarters' : filters.quarter },
      { label: 'Vendors', value: filters.vendors.length ? filters.vendors.join(', ') : 'All' },
      { label: 'Contracts', value: filters.contractIds.length ? String(filters.contractIds.length) : 'All' },
      { label: 'Cost elements', value: filters.costElements.length ? filters.costElements.join(', ') : 'All' },
      { label: 'Statuses', value: filters.statuses.length ? filters.statuses.join(', ') : 'All' },
      { label: 'Open accruals', value: filters.includeAccruals ? 'Included' : 'Excluded' },
      { label: 'Metric', value: filters.metric },
      { label: 'Ledger grouping', value: filters.groupBy || 'None' },
      { label: 'Invoice rows', value: String(rows.length) },
    ],
  })
}
