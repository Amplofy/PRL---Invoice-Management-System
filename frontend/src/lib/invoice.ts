import { formatMoney } from './format'
import { fiscalYearLabel } from './fiscal'

export interface ServiceMatrixRow {
  id: string
  t1: string
  t2: string | null
  t3: string | null
  cost_element: string | null
  tanker_required: boolean
  trips: boolean
}

export interface ContractLite {
  id: string
  contract_no: string
  value: number
  start_date: string | null
  end_date: string | null
  vendor: string | null
  service: string | null
}

export interface Utilization {
  used: number
  remaining: number
  pct: number
  count: number
}

export interface UtilizationInvoice {
  id?: string
  invoice_no?: string | null
  amount: number
  status: string
  contract_id: string | null
}

export interface InvoiceFormLike {
  invoice_no?: string | null
  invoice_date?: string | null
  contract_id?: string | null
  t1?: string | null
  t2?: string | null
  t3?: string | null
  tanker_name?: string | null
  service_from?: string | null
  service_to?: string | null
  amount?: number | string | null
}

export interface ValidationIssue {
  field: string
  message: string
}

export interface ValidateInvoiceOptions {
  matrix: ServiceMatrixRow[]
  contracts?: ContractLite[]
  allInvoices?: UtilizationInvoice[]
  excludeInvoiceId?: string
  duplicateCheck?: boolean
  maxInvoiceAmount?: number
  futureDateAllowed?: boolean
}

/** Contract usage: operationally approved or already paid. */
export function countsTowardUtilization(status: string | null | undefined): boolean {
  const s = String(status ?? '')
  return s === 'Approved' || s === 'Accepted' || s === 'Paid'
}

/** Signed off by operations, including invoices whose payment has been released. */
export function isSignedOff(status: string | null | undefined): boolean {
  const s = String(status ?? '')
  return s === 'Approved' || s === 'Accepted' || s === 'Paid'
}

export function t1Options(matrix: ServiceMatrixRow[]): string[] {
  return Array.from(new Set(matrix.map((m) => m.t1))).sort()
}

export function t2Options(matrix: ServiceMatrixRow[], t1: string | null | undefined): string[] {
  if (!t1) return []
  return Array.from(
    new Set(matrix.filter((m) => m.t1 === t1).map((m) => m.t2 ?? '').filter(Boolean)),
  ).sort() as string[]
}

export function t3Options(
  matrix: ServiceMatrixRow[],
  t1: string | null | undefined,
  t2: string | null | undefined,
): string[] {
  if (!t1) return []
  const rows = t2
    ? matrix.filter((m) => m.t1 === t1 && (m.t2 ?? '') === t2)
    : matrix.filter((m) => m.t1 === t1)
  return Array.from(new Set(rows.map((m) => m.t3 ?? '').filter(Boolean))).sort() as string[]
}

export function matrixRowFor(
  matrix: ServiceMatrixRow[],
  t1: string | null | undefined,
  t2: string | null | undefined,
  t3: string | null | undefined,
): ServiceMatrixRow | undefined {
  if (!t1) return undefined
  return matrix.find(
    (m) => m.t1 === t1 && (m.t2 ?? '') === (t2 ?? '') && (m.t3 ?? '') === (t3 ?? ''),
  )
}

export function resolveCostElement(
  matrix: ServiceMatrixRow[],
  t1: string | null | undefined,
  t2: string | null | undefined,
  t3: string | null | undefined,
): string | null {
  return matrixRowFor(matrix, t1, t2, t3)?.cost_element ?? null
}

export function contractUtilization(
  invoices: UtilizationInvoice[],
  contract: Pick<ContractLite, 'value'> | null | undefined,
  contractId: string,
  excludeInvoiceId?: string,
): Utilization {
  const matched = invoices.filter(
    (i) => i.contract_id === contractId && i.id !== excludeInvoiceId,
  )
  const approved = matched.filter((i) => countsTowardUtilization(i.status))
  const used = approved.reduce((s, i) => s + Number(i.amount || 0), 0)
  const value = Number(contract?.value ?? 0)
  const remaining = value - used
  const pct = value > 0 ? (used / value) * 100 : 0
  return { used, remaining, pct, count: matched.length }
}

export function utilizationTone(pct: number): 'ok' | 'warn' | 'err' {
  if (pct > 90) return 'err'
  if (pct > 70) return 'warn'
  return 'ok'
}

export function validateInvoice(
  form: InvoiceFormLike,
  opts: ValidateInvoiceOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const amount = Number(form.amount ?? 0) || 0
  const invoiceNo = (form.invoice_no ?? '').trim()
  const contract = opts.contracts?.find((c) => c.id === form.contract_id) ?? null

  if (!invoiceNo) issues.push({ field: 'invoice_no', message: 'Invoice number is required' })

  if (!form.invoice_date) issues.push({ field: 'invoice_date', message: 'Invoice date is required' })
  else if (!opts.futureDateAllowed) {
    const today = new Date().toISOString().slice(0, 10)
    if (form.invoice_date > today)
      issues.push({ field: 'invoice_date', message: 'Future invoice dates are not allowed' })
  }

  if (!form.service_from)
    issues.push({ field: 'service_from', message: 'Service From date is required' })
  if (!form.service_to)
    issues.push({ field: 'service_to', message: 'Service To date is required' })
  if (form.service_from && form.service_to && form.service_to < form.service_from)
    issues.push({ field: 'service_to', message: 'Service To must be on or after Service From' })

  if (contract) {
    if (contract.start_date && form.service_from && form.service_from < contract.start_date)
      issues.push({
        field: 'service_from',
        message: 'Service From is before contract start',
      })
    if (contract.end_date && form.service_to && form.service_to > contract.end_date)
      issues.push({ field: 'service_to', message: 'Service To is after contract end' })
  }

  if (
    opts.duplicateCheck &&
    form.contract_id &&
    invoiceNo &&
    opts.allInvoices?.some(
      (i) =>
        i.id !== opts.excludeInvoiceId &&
        i.contract_id === form.contract_id &&
        (i.invoice_no ?? '').toLowerCase() === invoiceNo.toLowerCase(),
    )
  ) {
    issues.push({
      field: 'invoice_no',
      message: 'Duplicate invoice number for this contract',
    })
  }

  if (!form.t1) issues.push({ field: 't1', message: 'Service Type 1 is required' })
  if (!form.t2) issues.push({ field: 't2', message: 'Service Type 2 is required' })
  if (!form.t3) issues.push({ field: 't3', message: 'Service Type 3 is required' })

  const row = matrixRowFor(opts.matrix, form.t1, form.t2, form.t3)
  if (row?.tanker_required && !(form.tanker_name ?? '').trim()) {
    issues.push({
      field: 'tanker_name',
      message: 'Tanker Name is required for this service',
    })
  }

  if (amount <= 0) {
    issues.push({ field: 'amount', message: 'Amount must be greater than zero' })
  } else if (opts.maxInvoiceAmount !== undefined && amount > opts.maxInvoiceAmount) {
    issues.push({
      field: 'amount',
      message: `Amount exceeds maximum ${formatMoney(opts.maxInvoiceAmount)}`,
    })
  } else if (contract) {
    const util = contractUtilization(opts.allInvoices ?? [], contract, contract.id, opts.excludeInvoiceId)
    if (amount > util.remaining) {
      issues.push({
        field: 'amount',
        message: `Invoice amount exceeds remaining contract balance (${formatMoney(util.remaining)})`,
      })
    }
  }

  return issues
}

export interface SerialInvoiceLike {
  id?: string
  invoice_date?: string | null
  serial_no?: string | null
}

/**
 * Fiscal year tag (YY) for a date. Pakistan FY runs July-June and is labelled
 * by its starting year, e.g. 2026-08 -> 26 (FY26 = Jul 2026 - Jun 2027).
 */
export function fiscalYearTag(dateStr: string | undefined | null): string {
  const d = dateStr ? new Date(dateStr) : new Date()
  const safe = Number.isNaN(d.getTime()) ? new Date() : d
  return fiscalYearLabel(safe).replace(/^FY/i, '').padStart(2, '0')
}

/**
 * Next serial number in the "XXX - YY" format, where XXX is the running
 * invoice count for the Gregorian year of the invoice date and YY is the
 * fiscal-year tag. Picks up the highest existing ordinal so deleted rows
 * cannot cause duplicates.
 */
export function nextSerialNo(
  invoiceDate: string | undefined | null,
  invoices: SerialInvoiceLike[],
  excludeId?: string,
): string {
  const d = invoiceDate ? new Date(invoiceDate) : new Date()
  const safe = Number.isNaN(d.getTime()) ? new Date() : d
  const year = safe.getFullYear()

  let maxOrdinal = 0
  let count = 0
  for (const i of invoices) {
    if (excludeId && i.id === excludeId) continue
    const idate = i.invoice_date ? new Date(i.invoice_date) : null
    if (!idate || Number.isNaN(idate.getTime()) || idate.getFullYear() !== year) continue
    count += 1
    const m = (i.serial_no ?? '').trim().match(/^(\d+)/)
    if (m) maxOrdinal = Math.max(maxOrdinal, Number(m[1]))
  }

  const ordinal = Math.max(maxOrdinal + 1, count + 1)
  return `${String(ordinal).padStart(3, '0')} - ${fiscalYearTag(invoiceDate)}`
}
