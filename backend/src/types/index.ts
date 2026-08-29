import type { Request } from 'express'

export type AuthUser = {
  id: string
  role: string
  email?: string
  fullName?: string
}

export type AuthedRequest = Request & {
  user: AuthUser
}

export type PreviewRow = {
  index: number
  data: Record<string, unknown>
  errors: string[]
  valid: boolean
}

/** Alias kept for import-service naming consistency. */
export type ImportPreviewRow = PreviewRow

export type ImportIssue = {
  row: number
  message: string
}

export type ImportType = 'invoices' | 'contracts' | 'vendors'

export type ImportParseResult = {
  type: ImportType
  preview: PreviewRow[]
  issues: ImportIssue[]
  totalRows: number
  validRows: number
}

export type ImportConfirmBody = {
  type: ImportType
  rows: Record<string, unknown>[]
  fileName?: string
  /** 'append' skips duplicates; 'overwrite' updates existing rows (admin only). */
  mode?: 'append' | 'overwrite'
  /** Client-side duplicate descriptions; the server re-detects anyway. */
  conflicts?: string[]
}

export type ImportConfirmResult = {
  status: 'approved' | 'pending'
  imported: number
  skipped: number
  updated: number
  batchId?: string
  duplicates: number
}

export type ImportBatch = {
  id: string
  import_type: ImportType
  file_name: string
  total_rows: number
  duplicate_rows: number
  status: 'pending' | 'approved' | 'rejected'
  mode?: 'append' | 'overwrite' | null
  rows: Record<string, unknown>[]
  conflicts: string[]
  submitted_by: string
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

export type Mismatch = {
  keyValue: string
  column: string
  baseValue: string | null
  compareValue: string | null
}

export type CompareOptions = {
  joinKey: string
  columns: string[]
  tolerance?: number
}

export type CompareResult = {
  mismatches: Mismatch[]
  missingInCompare: { keyValue: string; row: Record<string, unknown> }[]
  missingInBase: { keyValue: string; row: Record<string, unknown> }[]
  summary: {
    baseRows: number
    compareRows: number
    matched: number
    mismatchCount: number
    missingInCompare: number
    missingInBase: number
  }
}

export type EmailResult = {
  id?: string
  error?: string
}

export type PendingFollowup = {
  invoiceId: string
  invoiceNo: string
  amount: number
  invoiceDate: string
  contractNo: string
  vendorId: string
  vendorName: string
  email: string
}
