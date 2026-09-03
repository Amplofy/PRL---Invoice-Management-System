export const PO_STATUS = {
  Generated: 'Generated',
  Cleared: 'Cleared',
  Rejected: 'Rejected',
} as const

export type PoStatus = (typeof PO_STATUS)[keyof typeof PO_STATUS]

export function isFinanceRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'superadmin' || role === 'finance'
}

export function money(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function invoiceApprovedAmount(invoice: {
  amount?: unknown
  approved_amount?: unknown
} | null | undefined): number {
  if (!invoice) return 0
  const approved = invoice.approved_amount
  if (approved != null && approved !== '') return money(approved)
  return money(invoice.amount)
}

export function poGeneratedAmount(po: { amount?: unknown } | null | undefined, invoice?: {
  amount?: unknown
  approved_amount?: unknown
} | null): number {
  if (po?.amount != null && po.amount !== '') return money(po.amount)
  return invoiceApprovedAmount(invoice)
}

export function poReleasedAmount(po: { status?: unknown; released_amount?: unknown; amount?: unknown } | null | undefined): number {
  if (!po) return 0
  if (String(po.status ?? '') !== PO_STATUS.Cleared) return 0
  if (po.released_amount != null && po.released_amount !== '') return money(po.released_amount)
  return money(po.amount)
}

export type NestedInvoice = {
  id?: string
  invoice_no?: string | null
  invoice_date?: string | null
  amount?: unknown
  approved_amount?: unknown
  status?: string | null
  cost_element?: string | null
  contracts?: unknown
}

export type PoHistoryRow = {
  id: string
  po_id: string
  invoice_id: string | null
  action: string
  actor: string | null
  amount: number | null
  remarks: string | null
  created_at: string
}

export function normalizePoStatus(status: unknown): PoStatus {
  const s = String(status ?? PO_STATUS.Generated)
  if (s === PO_STATUS.Cleared || s === PO_STATUS.Rejected) return s
  return PO_STATUS.Generated
}
