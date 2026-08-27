import { getSupabase } from '../config/supabase.js'
import type { ImportConfirmResult, ImportType, PreviewRow } from '../types/index.js'

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
  // Accept YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY
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
      // word-boundary match on original key (underscores count as boundaries)
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
  const vendor = asString(mapToColumn(row, ['vendor', 'vendorname', 'vendor_name']))

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

  if (!vendor && !contractNo) {
    // vendor optional if contract maps
  }
  return errors
}

export async function validateRows(
  type: ImportType,
  rows: Record<string, unknown>[]
): Promise<PreviewRow[]> {
  const preview: PreviewRow[] = []
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

function extractField(row: Record<string, unknown>, aliases: string[]): string | null {
  const v = mapToColumn(row, aliases)
  return v == null ? null : asString(v)
}

export async function confirmImport(
  type: ImportType,
  rows: Record<string, unknown>[],
  userId?: string
): Promise<ImportConfirmResult> {
  const supabase = getSupabase()
  let imported = 0
  let skipped = 0

  if (type === 'vendors') {
    for (const row of rows) {
      const name = extractField(row, ['name', 'vendorname', 'vendor_name'])
      if (!name) {
        skipped++
        continue
      }
      const { error } = await supabase
        .from('vendors')
        .upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
      if (error) skipped++
      else imported++
    }
  } else if (type === 'contracts') {
    for (const row of rows) {
      const no = extractField(row, ['contractno', 'contract_no', 'contractid', 'contract'])
      const vendorName = extractField(row, ['vendor', 'vendorname', 'vendor_name'])
      const start = asDate(mapToColumn(row, ['start', 'startdate', 'start_date']))
      const end = asDate(mapToColumn(row, ['end', 'enddate', 'end_date']))
      const value = asNumber(mapToColumn(row, ['value', 'amount', 'contractvalue']))
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
      const { error } = await supabase.from('contracts').upsert(
        {
          contract_no: no,
          vendor_id: vendorId,
          service: extractField(row, ['service', 'servicecategory', 'service_category']) || 'General',
          start_date: start,
          end_date: end,
          value: Number.isNaN(value) ? 0 : value,
        },
        { onConflict: 'contract_no', ignoreDuplicates: true }
      )
      if (error) skipped++
      else imported++
    }
  } else if (type === 'invoices') {
    for (const row of rows) {
      const invoiceNo = extractField(row, ['invoiceno', 'invoice_no', 'invoice'])
      const amount = asNumber(mapToColumn(row, ['amount', 'value', 'invoiceamount']))
      const invoiceDate = asDate(mapToColumn(row, ['invoicedate', 'invoice_date', 'date']))
      const processingDate = asDate(mapToColumn(row, ['processingdate', 'processing_date']))
      const contractNo = extractField(row, ['contractno', 'contract_no', 'contract'])
      if (!invoiceNo || Number.isNaN(amount) || !invoiceDate || !contractNo) {
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
      const { data: dup } = await supabase
        .from('invoices')
        .select('id')
        .eq('invoice_no', invoiceNo)
        .maybeSingle()
      if (dup) {
        skipped++
        continue
      }
      const { error } = await supabase.from('invoices').insert({
        invoice_no: invoiceNo,
        contract_id: contract.id,
        invoice_date: invoiceDate,
        processing_date: processingDate ?? invoiceDate,
        amount: Number.isNaN(amount) ? 0 : amount,
        t1: extractField(row, ['t1', 'type1', 'service_type_1']),
        t2: extractField(row, ['t2', 'type2', 'service_type_2']),
        t3: extractField(row, ['t3', 'type3', 'service_type_3']),
        tanker_name: extractField(row, ['tankername', 'tanker_name', 'tanker']),
        status: 'Pending',
        created_by: userId,
      })
      if (error) skipped++
      else imported++
    }
  }

  return { imported, skipped }
}
