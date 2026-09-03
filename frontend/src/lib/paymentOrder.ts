import type { BadgeTone } from '../components/ui/StatusBadge'

export const PO_STATUS = {
  Generated: 'Generated',
  Cleared: 'Cleared',
  Rejected: 'Rejected',
} as const

export type PoStatus = (typeof PO_STATUS)[keyof typeof PO_STATUS]

export function money(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function invoiceApprovedAmount(invoice: {
  amount?: unknown
  approved_amount?: unknown
} | null | undefined): number {
  if (!invoice) return 0
  if (invoice.approved_amount != null && invoice.approved_amount !== '') return money(invoice.approved_amount)
  return money(invoice.amount)
}

export function poGeneratedAmount(
  po: { amount?: unknown } | null | undefined,
  invoice?: { amount?: unknown; approved_amount?: unknown } | null,
): number {
  if (po?.amount != null && po.amount !== '') return money(po.amount)
  return invoiceApprovedAmount(invoice)
}

export function poReleasedAmount(po: {
  status?: unknown
  released_amount?: unknown
  amount?: unknown
} | null | undefined): number {
  if (!po) return 0
  if (String(po.status ?? '') !== PO_STATUS.Cleared) return 0
  if (po.released_amount != null && po.released_amount !== '') return money(po.released_amount)
  return money(po.amount)
}

export function normalizePoStatus(status: unknown): PoStatus {
  const s = String(status ?? PO_STATUS.Generated)
  if (s === PO_STATUS.Cleared || s === PO_STATUS.Rejected) return s
  return PO_STATUS.Generated
}

export function poStatusLabel(status: unknown): string {
  const s = normalizePoStatus(status)
  if (s === PO_STATUS.Generated) return 'Awaiting finance'
  if (s === PO_STATUS.Cleared) return 'Payment released'
  return 'Rejected'
}

export function poStatusTone(status: unknown): BadgeTone {
  switch (normalizePoStatus(status)) {
    case PO_STATUS.Cleared:
      return 'ok'
    case PO_STATUS.Generated:
      return 'warn'
    case PO_STATUS.Rejected:
      return 'err'
    default:
      return 'neutral'
  }
}

export function isAwaitingFinance(status: unknown): boolean {
  return normalizePoStatus(status) === PO_STATUS.Generated
}

export function poHistoryActionLabel(action: string): string {
  switch (action) {
    case 'Generated':
      return 'Generated'
    case 'FinanceApproved':
      return 'Finance approved'
    case 'PaymentReleased':
      return 'Payment released'
    case 'FinanceRejected':
      return 'Finance rejected'
    default:
      return action
  }
}

export function poHistoryTone(action: string): BadgeTone {
  if (action === 'PaymentReleased' || action === 'FinanceApproved') return 'ok'
  if (action === 'FinanceRejected') return 'err'
  if (action === 'Generated') return 'warn'
  return 'neutral'
}

export interface PoHistoryEvent {
  id?: string
  po_id?: string
  invoice_id?: string | null
  action: string
  actor?: string | null
  amount?: number | null
  remarks?: string | null
  created_at?: string | null
}
