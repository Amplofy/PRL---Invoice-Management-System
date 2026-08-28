import type { SourceColumn } from './importParser'

export type ImportType = 'invoices' | 'contracts' | 'vendors'
export type FieldType = 'text' | 'number' | 'date'

export interface ElementDef {
  key: string
  label: string
  type: FieldType
  required: boolean
  aliases: string[]
}

export interface MappingEntry {
  columnKey: string | null
  confidence: 'high' | 'low' | 'manual'
}

export type MappingState = Record<string, MappingEntry>

export const IMPORT_SCHEMAS: Record<ImportType, ElementDef[]> = {
  invoices: [
    { key: 'invoice_no', label: 'Invoice No', type: 'text', required: true, aliases: ['invoice no', 'invoice', 'invoice number', 'bill no', 'bill number', 'bill', 'inv no', 'inv number', 'document no', 'doc no', 'voucher no'] },
    { key: 'invoice_date', label: 'Invoice Date', type: 'date', required: true, aliases: ['invoice date', 'bill date', 'date', 'dated', 'inv date'] },
    { key: 'processing_date', label: 'Processing Date', type: 'date', required: false, aliases: ['processing date', 'processed on', 'process date', 'received date', 'receipt date'] },
    { key: 'amount', label: 'Amount', type: 'number', required: true, aliases: ['amount', 'invoice amount', 'bill amount', 'net amount', 'total amount', 'value', 'net value', 'total', 'amount rs', 'gross amount'] },
    { key: 'contract_no', label: 'Contract No', type: 'text', required: true, aliases: ['contract no', 'contract', 'contract number', 'contract id', 'agreement no', 'agreement', 'lc no'] },
    { key: 't1', label: 'Service Type 1', type: 'text', required: false, aliases: ['t1', 'type1', 'service type 1', 'service type', 'activity 1', 'operation'] },
    { key: 't2', label: 'Service Type 2', type: 'text', required: false, aliases: ['t2', 'type2', 'service type 2', 'activity 2', 'service'] },
    { key: 't3', label: 'Service Type 3', type: 'text', required: false, aliases: ['t3', 'type3', 'service type 3', 'activity 3', 'description'] },
    { key: 'tanker_name', label: 'Tanker Name', type: 'text', required: false, aliases: ['tanker name', 'tanker', 'vehicle no', 'truck no', 'vehicle', 'truck'] },
  ],
  contracts: [
    { key: 'contract_no', label: 'Contract No', type: 'text', required: true, aliases: ['contract no', 'contract', 'contract number', 'contract id', 'agreement no', 'agreement'] },
    { key: 'vendor', label: 'Vendor Name', type: 'text', required: true, aliases: ['vendor', 'vendor name', 'supplier', 'supplier name', 'party', 'party name', 'contractor'] },
    { key: 'service', label: 'Service', type: 'text', required: false, aliases: ['service', 'service category', 'service type', 'category', 'scope', 'work'] },
    { key: 'start_date', label: 'Start Date', type: 'date', required: true, aliases: ['start date', 'from date', 'from', 'commencement', ' commencement date', 'effective from', 'wef'] },
    { key: 'end_date', label: 'End Date', type: 'date', required: true, aliases: ['end date', 'to date', 'to', 'expiry', 'expiry date', 'valid till', 'valid until', 'upto'] },
    { key: 'value', label: 'Contract Value', type: 'number', required: true, aliases: ['contract value', 'value', 'amount', 'contract amount', 'total value', 'total amount'] },
  ],
  vendors: [
    { key: 'name', label: 'Vendor Name', type: 'text', required: true, aliases: ['name', 'vendor name', 'vendor', 'supplier', 'supplier name', 'party', 'party name'] },
    { key: 'email', label: 'Email', type: 'text', required: false, aliases: ['email', 'e mail', 'email address', 'mail', 'contact email'] },
  ],
}

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
}

function scoreHeader(el: ElementDef, header: string, samples: unknown[]): number {
  const h = norm(header)
  if (!h) return 0
  let best = 0
  for (const alias of el.aliases) {
    const a = norm(alias)
    if (h === a) best = Math.max(best, 1)
    else if (a.length >= 4 && (h.includes(a) || a.includes(h))) best = Math.max(best, 0.85)
    else {
      const ht = tokenize(header)
      const at = tokenize(alias)
      const overlap = at.filter((t) => ht.includes(t)).length
      if (overlap > 0) best = Math.max(best, (0.45 * overlap) / at.length)
    }
  }
  if (el.type === 'number' && samples.length > 0) {
    const numeric = samples.filter((v) => typeof v === 'number' || /^[\sRs.,()-]*\d[\d,.]*$/.test(String(v))).length
    if (numeric === samples.length && best > 0) best = Math.min(1, best + 0.1)
  }
  if (el.type === 'date' && samples.length > 0) {
    const dated = samples.filter((v) => v instanceof Date || /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(String(v))).length
    if (dated >= Math.ceil(samples.length / 2) && best > 0) best = Math.min(1, best + 0.1)
  }
  return best
}

export function autoMap(columns: SourceColumn[], schema: ElementDef[]): MappingState {
  const state: MappingState = {}
  const taken = new Set<string>()
  const candidates: Array<{ el: ElementDef; col: SourceColumn; score: number }> = []
  for (const el of schema) {
    for (const col of columns) {
      const score = scoreHeader(el, col.header, col.samples)
      if (score > 0.44) candidates.push({ el, col, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  for (const { el, col, score } of candidates) {
    if (state[el.key]?.columnKey || taken.has(col.key)) continue
    state[el.key] = { columnKey: col.key, confidence: score >= 0.85 ? 'high' : 'low' }
    taken.add(col.key)
  }
  for (const el of schema) {
    if (!state[el.key]) state[el.key] = { columnKey: null, confidence: 'high' }
  }
  return state
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

function excelSerialToDate(n: number): Date {
  return new Date(EXCEL_EPOCH + Math.floor(n) * 86400000)
}

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function normalizeDate(raw: unknown): { value: string | null; warning?: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return { value: iso(raw) }
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    return { value: iso(excelSerialToDate(raw)) }
  }
  const s = String(raw).trim()
  if (!s) return { value: null }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) {
    return { value: `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` }
  }
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s)
  if (m) {
    let a = Number(m[1])
    let b = Number(m[2])
    const yearRaw = m[3]!
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)
    if (a > 12 && b <= 12) return { value: `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}` }
    if (b > 12 && a <= 12) return { value: `${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`, warning: 'month-first date detected' }
    if (a <= 12 && b <= 12) {
      return {
        value: `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`,
        warning: 'ambiguous day/month — read day-first',
      }
    }
  }
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime()) && /[a-z]/i.test(s)) return { value: iso(parsed) }
  return { value: null, warning: `unreadable date "${s}"` }
}

export function normalizeNumber(raw: unknown): { value: number | null; warning?: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null }
  if (typeof raw === 'number') return { value: raw }
  let s = String(raw).trim()
  const negative = /^\(.*\)$/.test(s)
  s = s.replace(/[()]/g, '')
  s = s.replace(/rs\.?|pkr|rupees/gi, '')
  s = s.replace(/\s/g, '')
  if (/,\d{1,2}$/.test(s) && (s.match(/\./g)?.length ?? 0) >= 1) {
    return { value: null, warning: `ambiguous decimal comma "${s}"` }
  }
  s = s.replace(/,/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return { value: null, warning: `unreadable number "${String(raw).trim()}"` }
  return { value: negative ? -n : n }
}

export function normalizeText(raw: unknown): { value: string | null } {
  if (raw === null || raw === undefined) return { value: null }
  const s = String(raw).replace(/\u00a0/g, ' ').trim()
  return { value: s === '' ? null : s }
}

export function normalizeValue(type: FieldType, raw: unknown): { value: string | number | null; warning?: string } {
  if (type === 'date') return normalizeDate(raw)
  if (type === 'number') return normalizeNumber(raw)
  return normalizeText(raw)
}

const TPL_KEY = (type: ImportType) => `prl-eoms-import-tpl-${type}`

export function signatureOf(columns: SourceColumn[]): string {
  return columns.map((c) => norm(c.header)).join('|')
}

interface StoredTemplate {
  signature: string
  mapping: MappingState
}

export function loadTemplate(type: ImportType, signature: string): MappingState | null {
  try {
    const raw = localStorage.getItem(TPL_KEY(type))
    if (!raw) return null
    const tpl = JSON.parse(raw) as StoredTemplate
    if (tpl.signature !== signature) return null
    return tpl.mapping
  } catch {
    return null
  }
}

export function saveTemplate(type: ImportType, signature: string, mapping: MappingState): void {
  try {
    localStorage.setItem(TPL_KEY(type), JSON.stringify({ signature, mapping }))
  } catch {
    /* storage unavailable — templates are best-effort */
  }
}

export function applyMapping(
  rows: Record<string, unknown>[],
  columns: SourceColumn[],
  schema: ElementDef[],
  mapping: MappingState,
): Record<string, unknown>[] {
  const colByKey = new Map(columns.map((c) => [c.key, c]))
  return rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const el of schema) {
      const entry = mapping[el.key]
      const col = entry?.columnKey ? colByKey.get(entry.columnKey) : undefined
      if (!col) {
        out[el.key] = null
        continue
      }
      const raw = row[col.key]
      const { value, warning } = normalizeValue(el.type, raw)
      if (warning) out[`${el.key}__warn`] = warning
      out[el.key] = value ?? null
    }
    return out
  })
}
