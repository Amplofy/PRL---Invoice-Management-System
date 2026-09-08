import { invoiceBudgetFy } from './fyLock.js'
import { money, poReleasedAmount } from './poFinance.js'

export const RELEASED_VIA = ['cheque', 'bank_transfer', 'rtgs', 'other'] as const
export type ReleasedVia = (typeof RELEASED_VIA)[number]

export function parseReleasedVia(raw: unknown): ReleasedVia | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  return (RELEASED_VIA as readonly string[]).includes(s) ? (s as ReleasedVia) : null
}

export function invoiceAccrualAmount(inv: { amount?: unknown; approved_amount?: unknown }): number {
  if (inv.approved_amount != null && inv.approved_amount !== '') return money(inv.approved_amount)
  return money(inv.amount)
}

export function isBudgetIncrease(previous: number | undefined, next: number): boolean {
  const prev = money(previous)
  return prev > 0 && next > prev
}

export interface AccrualInvoice {
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
