import { invoiceBudgetFy, isClosedFiscalYear } from './fiscal'
import { poReleasedAmount } from './paymentOrder'

export const RELEASED_VIA = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'rtgs', label: 'RTGS' },
  { value: 'other', label: 'Other' },
] as const

export type ReleasedVia = (typeof RELEASED_VIA)[number]['value']

export function releasedViaLabel(value: string | null | undefined): string {
  if (!value) return ''
  return RELEASED_VIA.find((o) => o.value === value)?.label ?? value
}

export function parseReleasedVia(raw: unknown): ReleasedVia | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  return RELEASED_VIA.some((o) => o.value === s) ? (s as ReleasedVia) : null
}

export function isUnpaidPriorYearInvoice(
  invoice: { invoice_date?: string | null; service_to?: string | null; status?: string | null },
  asOf = new Date(),
): boolean {
  const fy = invoiceBudgetFy(invoice)
  if (!fy || !isClosedFiscalYear(fy, asOf)) return false
  return String(invoice.status ?? '') !== 'Paid'
}

export function invoiceAccrualAmount(inv: { amount?: unknown; approved_amount?: unknown }): number {
  if (inv.approved_amount != null && inv.approved_amount !== '') return Number(inv.approved_amount) || 0
  return Number(inv.amount ?? 0) || 0
}

export interface AccrualInvoice {
  id?: string
  invoice_date?: string | null
  service_to?: string | null
  status?: string | null
  amount?: unknown
  approved_amount?: unknown
}

export interface AccrualPo {
  status?: unknown
  released_amount?: unknown
  amount?: unknown
  invoices?: { invoice_date?: string | null; service_to?: string | null } | null
}

export interface AccrualSnapshot {
  fy: string
  unpaid: number
  consumed: number
  computed: number
  override: number | null
  secured: number
  balance: number
}

export function accrualForFy(
  fy: string,
  invoices: AccrualInvoice[],
  paymentOrders: AccrualPo[],
  override: number | null,
): AccrualSnapshot {
  const ofFy = invoices.filter((i) => invoiceBudgetFy(i) === fy)
  const unpaid = ofFy
    .filter((i) => String(i.status ?? '') !== 'Paid')
    .reduce((s, i) => s + invoiceAccrualAmount(i), 0)
  const consumed = paymentOrders.reduce((s, p) => {
    if (invoiceBudgetFy(p.invoices ?? {}) !== fy) return s
    return s + poReleasedAmount(p)
  }, 0)
  const computed = unpaid + consumed
  const secured = override != null && Number.isFinite(override) ? Number(override) : computed
  return { fy, unpaid, consumed, computed, override, secured, balance: secured - consumed }
}

export function isBudgetIncrease(previous: number | undefined, next: number): boolean {
  const prev = Number(previous ?? 0) || 0
  return prev > 0 && next > prev
}
