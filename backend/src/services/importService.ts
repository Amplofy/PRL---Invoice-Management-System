import { getSupabase } from '../config/supabase.js'
import type { ImportBatch, ImportPreviewRow, ImportType } from '../types/index.js'

const INVOICE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Draft', 'Void', 'Paid']
const CONTRACT_STATUSES = ['Open', 'Closed', 'Expiring']

const MAX_AMOUNT_DEFAULT = 2500000

async function getSetting(key: string): Promise<string | null> {
  const supabase = getSupabase()
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  return (data as { value?: string } | null)?.value ?? null
}

function asString(v: unknown): string {
  return String(v ?? '').trim()
}

function asNumber(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

function asDate(v: unknown): string | null {
  const s = asString(v)
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return s
}

function isDateValid(d: string | null): boolean {
  if (!d) return false
  return !Number.isNaN(Date.parse(d))
}

function mapToColumn(row: Record<string, unknown>, aliases: string[]): unknown {
  let best: { alias: string; value: unknown } | null = null
  for (const key of Object.keys(row)) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    const original = key.toLowerCase()
    for (const a of aliases) {
      const an = a.toLowerCase().replace(/[^a-z0-9]/g, '')
      const exact = norm === an
      const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const boundary = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(original)
      if (exact || boundary) {
        const v = row[key]
        if (v !== '' && v != null) {
          if (!best || an.length > best.alias.length) {
            best = { alias: an, value: v }
          }
        }
      }
    }
  }
  return best?.value ?? null
}

export function validateVendorRow(row: Record<string, unknown>): string[] {
  const errors: string[] = []
  const name = asString(mapToColumn(row, ['name', 'vendorname', 'vendor_name']))
  if (!name) errors.push('Vendor name is required')
  return errors
}

export function validateContractRow(row: Record<string, unknown>): string[] {
  const errors: string[] = []
  const no = asString(mapToColumn(row, ['contractno', 'contract_no', 'contractid', 'contract']))
  const vendor = asString(mapToColumn(row, ['vendor', 'vendorname', 'vendor_name']))
  const start = asDate(mapToColumn(row, ['start', 'startdate', 'start_date']))
  const end = asDate(mapToColumn(row, ['end', 'enddate', 'end_date']))
  const value = asNumber(mapToColumn(row, ['value', 'amount', 'contractvalue']))
  if (!no) errors.push('Contract number is required')
  if (!vendor) errors.push('Vendor name is required')
  if (!start || !isDateValid(start)) errors.push('Valid start date is required')
  if (!end || !isDateValid(end)) errors.push('Valid end date is required')
  if (start && end && isDateValid(start) && isDateValid(end) && new Date(end) < new Date(start)) {
    errors.push('End date cannot be before start date')
  }
  if (Number.isNaN(value) || value < 0) errors.push('Contract value must be a positive number')
  return errors
}

export async function validateInvoiceRow(row: Record<string, unknown>): Promise<string[]> {
  const errors: string[] = []
  const invoiceNo = asString(mapToColumn(row, ['invoiceno', 'invoice_no', 'invoice']))
  const amount = asNumber(mapToColumn(row, ['amount', 'value', 'invoiceamount']))
  const invoiceDate = asDate(mapToColumn(row, ['invoicedate', 'invoice_date', 'date']))
  const processingDate = asDate(mapToColumn(row, ['processingdate', 'processing_date']))
  const contractNo = asString(mapToColumn(row, ['contractno', 'contract_no', 'contract']))

  if (!invoiceNo) errors.push('Invoice number is required')
  if (Number.isNaN(amount) || amount <= 0) errors.push('Amount must be a positive number')
  if (!invoiceDate || !isDateValid(invoiceDate)) errors.push('Valid invoice date is required')
  if (!processingDate || !isDateValid(processingDate))
    errors.push('Valid processing date is required')
  if (!contractNo) errors.push('Contract number is required')

  if (!Number.isNaN(amount)) {
    const maxRaw = await getSetting('maximum_invoice_amount')
    const max = Number(maxRaw ?? MAX_AMOUNT_DEFAULT)
    if (amount > max) errors.push(`Amount exceeds maximum allowed (${max})`)
  }

  if (contractNo) {
    const supabase = getSupabase()
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_no', invoiceNo)
      .maybeSingle()
    if (existing) errors.push('Invoice number already exists in system')
    const { data: contract } = await supabase
      .from('contracts')
      .select('id, start_date, end_date')
      .eq('contract_no', contractNo)
      .maybeSingle()
    if (!contract) {
      errors.push(`Contract ${contractNo} not found`)
    } else if (invoiceDate && isDateValid(invoiceDate)) {
      const d = new Date(invoiceDate)
      const s = new Date(contract.start_date as string)
      const e = new Date(contract.end_date as string)
      if (d < s || d > e) errors.push('Invoice date outside contract period')
    }
  }

  return errors
}

export async function validateRows(
  type: ImportType,
  rows: Record<string, unknown>[],
): Promise<ImportPreviewRow[]> {
  const preview: ImportPreviewRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    let errors: string[] = []
    if (type === 'vendors') errors = validateVendorRow(row)
    else if (type === 'contracts') errors = validateContractRow(row)
    else errors = await validateInvoiceRow(row)
    preview.push({ index: i + 1, data: row, errors, valid: errors.length === 0 })
  }
  return preview
}

function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function num(row: Record<string, unknown>, key: string): number | null {
  const v = row[key]
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function statusOf(row: Record<string, unknown>, allowed: string[], fallback: string): string {
  const s = str(row, 'status')
  if (!s) return fallback
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase())
  return hit ?? fallback
}

/** Insert canonical rows into the real tables. With overwrite=true, rows whose
 * unique key already exists are updated with the imported values instead of skipped. */
export async function applyImportRows(
  type: ImportType,
  rows: Record<string, unknown>[],
  userId?: string,
  overwrite = false,
): Promise<{ imported: number; skipped: number; updated: number }> {
  const supabase = getSupabase()
  let imported = 0
  let skipped = 0
  let updated = 0

  if (type === 'vendors') {
    for (const row of rows) {
      const name = str(row, 'name')
      if (!name) {
        skipped++
        continue
      }
      const email = str(row, 'email')
      const { data: existing } = await supabase.from('vendors').select('id').eq('name', name).maybeSingle()
      if (existing && overwrite) {
        const { error } = await supabase
          .from('vendors')
          .update(email ? { name, email } : { name })
          .eq('id', existing.id)
        if (error) skipped++
        else updated++
      } else if (existing) {
        skipped++
      } else {
        const { error } = await supabase
          .from('vendors')
          .insert(email ? { name, email } : { name })
        if (error) skipped++
        else imported++
      }
    }
    return { imported, skipped, updated }
  }

  if (type === 'contracts') {
    for (const row of rows) {
      const no = str(row, 'contract_no')
      const vendorName = str(row, 'vendor')
      const start = str(row, 'start_date')
      const end = str(row, 'end_date')
      if (!no || !vendorName || !start || !end) {
        skipped++
        continue
      }
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id')
        .eq('name', vendorName)
        .maybeSingle()
      let vendorId: string | null = vendor?.id ?? null
      if (!vendorId) {
        const { data: nv, error: nvErr } = await supabase
          .from('vendors')
          .insert({ name: vendorName })
          .select('id')
          .single()
        if (!nvErr && nv) vendorId = nv.id
      }
      if (!vendorId) {
        skipped++
        continue
      }
      const payload = {
        contract_no: no,
        vendor_id: vendorId,
        service: str(row, 'service') ?? 'General',
        start_date: start,
        end_date: end,
        value: num(row, 'value') ?? 0,
        status: statusOf(row, CONTRACT_STATUSES, 'Open'),
      }
      const { data: existing } = await supabase.from('contracts').select('id').eq('contract_no', no).maybeSingle()
      if (existing && overwrite) {
        const { error } = await supabase.from('contracts').update(payload).eq('id', existing.id)
        if (error) skipped++
        else updated++
      } else if (existing) {
        skipped++
      } else {
        const { error } = await supabase.from('contracts').insert(payload)
        if (error) skipped++
        else imported++
      }
    }
    return { imported, skipped, updated }
  }

  // invoices
  for (const row of rows) {
    const invoiceNo = str(row, 'invoice_no')
    const amount = num(row, 'amount')
    const invoiceDate = str(row, 'invoice_date')
    const contractNo = str(row, 'contract_no')
    if (!invoiceNo || amount === null || amount <= 0 || !invoiceDate || !contractNo) {
      skipped++
      continue
    }
    const { data: contract } = await supabase
      .from('contracts')
      .select('id')
      .eq('contract_no', contractNo)
      .maybeSingle()
    if (!contract) {
      skipped++
      continue
    }
    const approvedDate = str(row, 'approved_date')
    const payload = {
      serial_no: str(row, 'serial_no'),
      processing_date: str(row, 'processing_date') ?? invoiceDate,
      contract_id: contract.id,
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
      t1: str(row, 't1'),
      t2: str(row, 't2'),
      t3: str(row, 't3'),
      tanker_name: str(row, 'tanker_name'),
      trips: num(row, 'trips') === null ? null : Math.trunc(num(row, 'trips')!),
      item_no: str(row, 'item_no'),
      cost_element: str(row, 'cost_element'),
      service_from: str(row, 'service_from'),
      service_to: str(row, 'service_to'),
      amount,
      status: statusOf(row, INVOICE_STATUSES, 'Pending'),
      approved_by: str(row, 'approved_by'),
      approved_date: approvedDate,
      approved_amount: num(row, 'approved_amount'),
      remarks: str(row, 'remarks'),
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    }
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_no', invoiceNo)
      .maybeSingle()
    if (existing && overwrite) {
      const { error } = await supabase.from('invoices').update(payload).eq('id', existing.id)
      if (error) skipped++
      else updated++
    } else if (existing) {
      skipped++
    } else {
      const { error } = await supabase.from('invoices').insert({ ...payload, created_by: userId })
      if (error) skipped++
      else imported++
    }
  }
  return { imported, skipped, updated }
}

const DUP_KEY: Record<ImportType, { column: string; label: string }> = {
  invoices: { column: 'invoice_no', label: 'invoice no' },
  contracts: { column: 'contract_no', label: 'contract no' },
  vendors: { column: 'name', label: 'vendor name' },
}

const DUP_TABLE: Record<ImportType, string> = {
  invoices: 'invoices',
  contracts: 'contracts',
  vendors: 'vendors',
}

/** Detect rows whose unique key already exists in the system. */
export async function detectConflicts(
  type: ImportType,
  rows: Record<string, unknown>[],
): Promise<string[]> {
  const supabase = getSupabase()
  const { column, label } = DUP_KEY[type]
  const table = DUP_TABLE[type]
  const conflicts: string[] = []
  for (const row of rows) {
    const key = str(row, column)
    if (!key) continue
    const { data } = await supabase.from(table).select(column).eq(column, key).maybeSingle()
    if (data) conflicts.push(`${label} "${key}" already exists in system`)
  }
  return conflicts
}

export async function listBatches(): Promise<ImportBatch[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .order('status', { ascending: true }) // pending first
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`Failed to load import batches: ${error.message}`)
  return (data ?? []) as unknown as ImportBatch[]
}

export async function decideBatch(
  id: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  overwrite = false,
): Promise<ImportBatch | null> {
  const supabase = getSupabase()
  const { data: batch } = await supabase
    .from('import_batches')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!batch) return null
  if ((batch as ImportBatch).status !== 'pending') {
    throw new Error(`Batch already ${String((batch as ImportBatch).status)}`)
  }
  if (decision === 'approved') {
    const rows = ((batch as ImportBatch).rows ?? []) as Record<string, unknown>[]
    await applyImportRows((batch as ImportBatch).import_type, rows, decidedBy, overwrite)
  }
  const { data: updated, error } = await supabase
    .from('import_batches')
    .update({ status: decision, decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`Failed to update batch: ${error.message}`)
  return updated as unknown as ImportBatch
}

export async function createBatch(
  type: ImportType,
  rows: Record<string, unknown>[],
  conflicts: string[],
  fileName: string,
  submittedBy: string,
  mode: 'append' | 'overwrite' = 'append',
): Promise<ImportBatch> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      import_type: type,
      file_name: fileName,
      total_rows: rows.length,
      duplicate_rows: conflicts.length,
      status: 'pending',
      mode,
      rows,
      conflicts,
      submitted_by: submittedBy,
    })
    .select()
    .single()
  if (error) throw new Error(`Failed to save import batch: ${error.message}`)
  return data as unknown as ImportBatch
}
