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

export function isAwaitingFinance(status: unknown): boolean {
  return normalizePoStatus(status) === PO_STATUS.Generated
}

export type ReleasePatchInput = {
  email?: string | null
  now: string
  releasedAmount: number
  releasedVia?: string | null
  releaseReference?: string | null
  remarks?: string | null
}

export type PoVersionPatch = {
  status: PoStatus
  finance_approved_by: string | null
  finance_approved_at: string
  finance_remarks: string | null
  released_amount: number | null
  released_by: string | null
  released_at: string | null
  released_via: string | null
  release_reference: string | null
}

export function releasePatch(input: ReleasePatchInput): PoVersionPatch {
  const email = input.email ?? null
  return {
    status: PO_STATUS.Cleared,
    finance_approved_by: email,
    finance_approved_at: input.now,
    finance_remarks: input.remarks ?? null,
    released_amount: input.releasedAmount,
    released_by: email,
    released_at: input.now,
    released_via: input.releasedVia ?? null,
    release_reference: input.releaseReference ?? null,
  }
}

export type RejectPatchInput = {
  email?: string | null
  now: string
  reason: string
}

export function rejectPatch(input: RejectPatchInput): PoVersionPatch {
  return {
    status: PO_STATUS.Rejected,
    finance_approved_by: input.email ?? null,
    finance_approved_at: input.now,
    finance_remarks: input.reason,
    released_amount: null,
    released_by: null,
    released_at: null,
    released_via: null,
    release_reference: null,
  }
}

export type PoBulkOutcome = 'succeeded' | 'skipped' | 'failed'

export type PoBulkResult = {
  serial?: string | null
  outcome: PoBulkOutcome
}

export type PoBulkSummary = {
  succeeded: number
  skipped: number
  failed: number
  skippedSerials: string[]
  failedSerials: string[]
}

export function bulkSummary(results: PoBulkResult[]): PoBulkSummary {
  const summary: PoBulkSummary = { succeeded: 0, skipped: 0, failed: 0, skippedSerials: [], failedSerials: [] }
  for (const result of results) {
    if (result.outcome === 'succeeded') {
      summary.succeeded += 1
      continue
    }
    const serial = String(result.serial ?? '').trim()
    if (result.outcome === 'skipped') {
      summary.skipped += 1
      if (serial) summary.skippedSerials.push(serial)
    } else {
      summary.failed += 1
      if (serial) summary.failedSerials.push(serial)
    }
  }
  return summary
}
