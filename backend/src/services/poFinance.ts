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
  // A zero approved_amount means "not set" and must not mask the invoice
  // amount, otherwise POs, accruals and reports read 0.
  const approved = money(invoice.approved_amount)
  if (approved > 0) return approved
  return money(invoice.amount)
}

export function poGeneratedAmount(po: { amount?: unknown } | null | undefined, invoice?: {
  amount?: unknown
  approved_amount?: unknown
} | null): number {
  // A stored zero is a legacy/default value; fall back to the invoice so the
  // PO never reports a blank amount.
  const stored = money(po?.amount)
  if (stored > 0) return stored
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
  service_from?: string | null
  service_to?: string | null
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
