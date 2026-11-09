import { profileFile, parseNumberLoose, parseDateLoose, type ColumnMeta, type FileProfile, type ValueKind } from './deltaEngine'
import type { FilterColumnDef } from './filters'

export type AggFn = 'sum' | 'avg' | 'count' | 'min' | 'max'
export type ChartKind = 'bar' | 'line' | 'doughnut' | 'pie' | 'hbar'

export interface PowerGroup {
  name: string
  rowCount: number
  rows: Record<string, unknown>[]
  columns: string[]
  warnings?: string[]
}

export type PowerOrigin = 'official' | 'session'

export interface PowerSource {
  id: string
  fileName: string
  format: string
  origin: PowerOrigin
  groups: PowerGroup[]
  selectedGroups: string[]
}

export interface PowerChart {
  id: string
  title: string
  type: ChartKind
  categoryCol: string
  valueCol: string | null
  agg: AggFn
  topN: number
}

export interface SeriesPoint {
  label: string
  value: number
}

export const POWER_ROW_CAP = 20_000
export const POWER_TABLE_CAP = 500
export const FILE_COL = '_file'
export const SHEET_COL = '_sheet'
export const OFFICIAL_SOURCE_ID = 'official-records'

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function inferColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows.slice(0, 80)) {
    for (const k of Object.keys(row)) keys.add(k)
  }
  return [...keys]
}

export function capRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.length > POWER_ROW_CAP ? rows.slice(0, POWER_ROW_CAP) : rows
}

export function workingSet(sources: PowerSource[]): { rows: Record<string, unknown>[]; columns: string[] } {
  const columns: string[] = [FILE_COL, SHEET_COL]
  const seen = new Set(columns)
  const rows: Record<string, unknown>[] = []
  for (const source of sources) {
    const selected = new Set(source.selectedGroups)
    for (const g of source.groups) {
      if (!selected.has(g.name) || g.rows.length === 0) continue
      const cols = g.columns.length ? g.columns : inferColumns(g.rows)
      for (const c of cols) {
        if (!seen.has(c)) {
          seen.add(c)
          columns.push(c)
        }
      }
      for (const row of capRows(g.rows)) {
        rows.push({ ...row, [FILE_COL]: source.fileName, [SHEET_COL]: g.name })
        if (rows.length >= POWER_ROW_CAP) return { rows, columns }
      }
    }
  }
  return { rows, columns }
}

export function profileWorking(rows: Record<string, unknown>[], columns: string[]): FileProfile {
  return profileFile(rows, columns.filter((c) => c !== FILE_COL && c !== SHEET_COL))
}

export function kindOf(profile: FileProfile | null, col: string): ValueKind {
  if (col === FILE_COL || col === SHEET_COL) return 'text'
  return profile?.columns.find((c) => c.name === col)?.kind ?? 'text'
}

export function moneyLike(name: string): boolean {
  return /(amount|amt|value|total|sum|price|cost|rs|pkr|budget|spend|fee|tax)/i.test(name)
}

export function filterColumnsFor(profile: FileProfile | null, columns: string[], rows: Record<string, unknown>[]): FilterColumnDef[] {
  return columns.map((key) => {
    const kind = kindOf(profile, key)
    const type = kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'
    const label = key === FILE_COL ? 'File' : key === SHEET_COL ? 'Sheet' : key
    if (type !== 'text') return { key, label, type }
    const opts = new Set<string>()
    for (const row of rows.slice(0, 400)) {
      const v = String(row[key] ?? '').trim()
      if (v) opts.add(v)
      if (opts.size > 40) break
    }
    if (opts.size > 0 && opts.size <= 24) {
      return {
        key,
        label,
        type: 'select' as const,
        options: [...opts].sort().map((v) => ({ value: v, label: v })),
      }
    }
    return { key, label, type: 'text' as const }
  })
}

function categoryKey(raw: unknown, kind: ValueKind): string {
  if (raw == null || String(raw).trim() === '') return '(blank)'
  if (kind === 'date') {
    const s = String(raw).trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const ms = parseDateLoose(raw)
    if (ms != null) return new Date(ms).toISOString().slice(0, 10)
  }
  return String(raw)
}

export function aggregateSeries(
  rows: Record<string, unknown>[],
  categoryCol: string,
  valueCol: string | null,
  agg: AggFn,
  topN: number,
  categoryKind: ValueKind = 'text',
): SeriesPoint[] {
  const buckets = new Map<string, { sum: number; count: number; min: number; max: number }>()
  for (const row of rows) {
    const label = categoryKey(row[categoryCol], categoryKind)
    let n = 1
    if (valueCol) {
      const parsed = parseNumberLoose(row[valueCol])
      if (parsed == null) {
        if (agg === 'count') n = 1
        else continue
      } else {
        n = parsed
      }
    }
    const cur = buckets.get(label) ?? { sum: 0, count: 0, min: n, max: n }
    cur.sum += agg === 'count' && valueCol ? 1 : n
    cur.count += 1
    cur.min = Math.min(cur.min, n)
    cur.max = Math.max(cur.max, n)
    if (agg === 'count' && valueCol) {
      cur.sum = cur.count
    }
    if (agg === 'count' && !valueCol) {
      cur.sum = cur.count
    }
    buckets.set(label, cur)
  }

  const points: SeriesPoint[] = [...buckets.entries()].map(([label, b]) => {
    let value = b.sum
    if (agg === 'avg') value = b.count ? b.sum / b.count : 0
    if (agg === 'min') value = b.min
    if (agg === 'max') value = b.max
    if (agg === 'count') value = b.count
    return { label, value }
  })

  if (categoryKind === 'date') {
    points.sort((a, b) => a.label.localeCompare(b.label))
    return topN > 0 ? points.slice(-topN) : points
  }

  points.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  if (topN <= 0 || points.length <= topN) return points
  const head = points.slice(0, topN)
  const rest = points.slice(topN).reduce((s, p) => s + p.value, 0)
  if (rest !== 0 && agg !== 'min' && agg !== 'max' && agg !== 'avg') {
    head.push({ label: 'Other', value: rest })
  }
  return head
}

const PREFERRED_CATEGORY = /^(vendor|status|cost_element|contract_no|t1|t2)$/i

export function suggestCharts(profile: FileProfile, columns: string[]): Omit<PowerChart, 'id'>[] {
  const textCols = profile.columns.filter((c) => c.kind === 'text' && columns.includes(c.name))
  const numCols = profile.columns.filter((c) => c.kind === 'number' && columns.includes(c.name))
  const dateCols = profile.columns.filter((c) => c.kind === 'date' && columns.includes(c.name))
  const preferred = textCols.find((c) => PREFERRED_CATEGORY.test(c.name))
  const category =
    preferred?.name ??
    textCols.sort((a, b) => b.fillRate - a.fillRate)[0]?.name ??
    dateCols[0]?.name ??
    columns.find((c) => c !== FILE_COL && c !== SHEET_COL) ??
    columns[0]
  const value =
    numCols.find((c) => moneyLike(c.name))?.name ??
    numCols.sort((a, b) => b.fillRate - a.fillRate)[0]?.name ??
    null
  if (!category) return []
  const out: Omit<PowerChart, 'id'>[] = [
    {
      title: value ? `${value} by ${category}` : `Count by ${category}`,
      type: 'bar',
      categoryCol: category,
      valueCol: value,
      agg: value ? 'sum' : 'count',
      topN: 12,
    },
  ]
  if (dateCols[0] && value) {
    out.push({
      title: `${value} over ${dateCols[0].name}`,
      type: 'line',
      categoryCol: dateCols[0].name,
      valueCol: value,
      agg: 'sum',
      topN: 24,
    })
  } else if (textCols[0] && (value || textCols.length > 0)) {
    out.push({
      title: value ? `Mix of ${value}` : `Share of ${category}`,
      type: 'doughnut',
      categoryCol: category,
      valueCol: value,
      agg: value ? 'sum' : 'count',
      topN: 8,
    })
  }
  return out
}

export function displayCell(raw: unknown, kind: ValueKind, col: string): string {
  if (raw == null || String(raw).trim() === '') return '—'
  if (kind === 'number') {
    const n = parseNumberLoose(raw)
    if (n == null) return String(raw)
    const digits = moneyLike(col) || Math.abs(n) >= 1000 ? 0 : 2
    return new Intl.NumberFormat('en-PK', { maximumFractionDigits: digits }).format(n)
  }
  return String(raw)
}

export function cellKind(meta: ColumnMeta | undefined, col: string): 'text' | 'money' | 'n' | 'date' {
  if (!meta) return 'text'
  if (meta.kind === 'date') return 'date'
  if (meta.kind === 'number') return moneyLike(col) ? 'money' : 'n'
  return 'text'
}

export function parseJsonGroups(text: string, fileName: string): PowerGroup[] {
  const data = JSON.parse(text) as unknown
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as { rows?: unknown; data?: unknown }).rows ??
          (data as { data?: unknown }).data ??
          [data])
      : []
  const arr = Array.isArray(list) ? list : []
  if (arr.length === 0) throw new Error('JSON has no rows')
  if (Array.isArray(arr[0])) {
    const matrix = arr as unknown[][]
    const header = (matrix[0] ?? []).map((h, i) => String(h ?? '').trim() || `col_${i + 1}`)
    const rows = matrix.slice(1).map((row) => {
      const obj: Record<string, unknown> = {}
      header.forEach((h, i) => {
        obj[h] = row?.[i] ?? ''
      })
      return obj
    })
    return [{ name: fileName, rowCount: rows.length, rows: capRows(rows), columns: header }]
  }
  const rows = arr
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => r as Record<string, unknown>)
  if (rows.length === 0) throw new Error('JSON has no object rows')
  const columns = inferColumns(rows)
  return [{ name: fileName, rowCount: rows.length, rows: capRows(rows), columns }]
}

export function scoreGroup(g: PowerGroup): number {
  const cols = g.columns.length ? g.columns : inferColumns(g.rows)
  if (g.rows.length === 0) return -1
  const lineOnly = cols.length === 1 && cols[0] === 'line'
  const hits = cols.filter((c) => /invoice|amount|date|qty|quantity|vendor|contract|rate|total|price|desc/i.test(c)).length
  return cols.length * 8 + Math.min(g.rowCount || g.rows.length, 200) + hits * 12 - (lineOnly ? 80 : 0)
}

export function pickBestGroup(groups: PowerGroup[]): PowerGroup | null {
  const usable = groups.filter((g) => g.rows.length > 0)
  if (usable.length === 0) return null
  return usable.reduce((a, b) => (scoreGroup(b) > scoreGroup(a) ? b : a))
}

export function formatHint(demo: boolean): string {
  return demo ? 'CSV, XLSX, XLS, TXT, TSV or JSON' : 'CSV, XLSX, XLS, TXT, TSV, JSON or PDF'
}

export function acceptList(demo: boolean): string {
  return demo ? '.csv,.xlsx,.xls,.txt,.tsv,.json' : '.csv,.xlsx,.xls,.txt,.tsv,.json,.pdf'
}

export function parseTsvGroups(text: string, name: string): PowerGroup[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const lines = src.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('TSV has no rows')
  const header = lines[0]!.split('\t').map((h, i) => h.trim() || `col_${i + 1}`)
  const rows = lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const obj: Record<string, unknown> = {}
    header.forEach((h, i) => {
      obj[h] = cells[i] ?? ''
    })
    return obj
  })
  return [{ name, rowCount: rows.length, rows: capRows(rows), columns: header }]
}

function asText(v: unknown): string {
  if (v == null) return ''
  return String(v)
}

function flattenInvoice(inv: Record<string, unknown>): Record<string, unknown> {
  const contracts = inv.contracts as Record<string, unknown> | Record<string, unknown>[] | null
  const c = Array.isArray(contracts) ? contracts[0] : contracts
  const vendors = c?.vendors as Record<string, unknown> | Record<string, unknown>[] | null
  const v = Array.isArray(vendors) ? vendors[0] : vendors
  return {
    serial_no: asText(inv.serial_no),
    invoice_no: asText(inv.invoice_no),
    invoice_date: asText(inv.invoice_date),
    processing_date: asText(inv.processing_date),
    vendor: asText(v?.name),
    contract_no: asText(c?.contract_no),
    t1: asText(inv.t1),
    t2: asText(inv.t2),
    t3: asText(inv.t3),
    location: asText(inv.location),
    cost_element: asText(inv.cost_element),
    amount: inv.amount ?? '',
    approved_amount: inv.approved_amount ?? '',
    status: asText(inv.status),
    service_from: asText(inv.service_from),
    service_to: asText(inv.service_to),
    remarks: asText(inv.remarks),
  }
}

function flattenContract(c: Record<string, unknown>): Record<string, unknown> {
  const vendors = c.vendors as Record<string, unknown> | Record<string, unknown>[] | null
  const v = Array.isArray(vendors) ? vendors[0] : vendors
  return {
    contract_no: asText(c.contract_no),
    vendor: asText(v?.name),
    service: asText(c.service),
    start_date: asText(c.start_date),
    end_date: asText(c.end_date),
    value: c.value ?? '',
    status: asText(c.status),
  }
}

export const OFFICIAL_INVOICE_COLUMNS = [
  'serial_no', 'invoice_no', 'invoice_date', 'processing_date', 'vendor', 'contract_no',
  't1', 't2', 't3', 'location', 'cost_element', 'amount', 'approved_amount', 'status',
  'service_from', 'service_to', 'remarks',
]

export const OFFICIAL_INVOICE_VISIBLE = [
  'invoice_no', 'invoice_date', 'vendor', 'contract_no', 'cost_element', 'amount', 'status', 'remarks',
]

export const OFFICIAL_CONTRACT_COLUMNS = [
  'contract_no', 'vendor', 'service', 'start_date', 'end_date', 'value', 'status',
]

export function officialRecordsSource(
  invoices: Record<string, unknown>[],
  contracts: Record<string, unknown>[],
): PowerSource {
  const invoiceRows = capRows(invoices.map(flattenInvoice))
  const contractRows = capRows(contracts.map(flattenContract))
  const groups: PowerGroup[] = [
    { name: 'Invoices', rowCount: invoiceRows.length, rows: invoiceRows, columns: OFFICIAL_INVOICE_COLUMNS },
    { name: 'Contracts', rowCount: contractRows.length, rows: contractRows, columns: OFFICIAL_CONTRACT_COLUMNS },
  ]
  return {
    id: OFFICIAL_SOURCE_ID,
    fileName: 'Official records',
    format: 'live',
    origin: 'official',
    groups,
    selectedGroups: invoiceRows.length ? ['Invoices'] : contractRows.length ? ['Contracts'] : ['Invoices'],
  }
}
