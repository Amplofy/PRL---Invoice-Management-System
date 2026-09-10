/**
 * Shared table reconstruction: header detection, unique column names,
 * matrix to row objects. Used by Excel and PDF parsers.
 */

const HEADER_HINTS = new Set([
  'invoice', 'invoiceno', 'invoicenumber', 'inv', 'bill', 'billno', 'challan',
  'amount', 'amt', 'value', 'total', 'sum', 'price', 'cost', 'rate', 'net', 'gross',
  'date', 'dt', 'dated', 'period', 'month', 'year', 'fy',
  'contract', 'contractno', 'agreement', 'po', 'pono', 'order',
  'vendor', 'supplier', 'party', 'seller', 'customer', 'client', 'name',
  'tanker', 'vehicle', 'truck', 'carrier', 'trip', 'trips',
  'quantity', 'qty', 'count', 'units', 'pcs', 'uom', 'unit',
  'product', 'item', 'sku', 'part', 'material', 'goods', 'description', 'desc',
  'serial', 'sr', 'sno', 'no', 'code', 'id', 'ref', 'reference',
  'remarks', 'remark', 'notes', 'note', 'comment', 'status', 'type',
  'service', 'detail', 't1', 't2', 't3',
  'dip', 'volume', 'vol', 'temp', 'temperature', 'factor', 'calibration',
  'chart', 'reading', 'opening', 'closing', 'balance', 'ullage',
  'gst', 'tax', 'vat', 'freight', 'location', 'from', 'to',
  'litre', 'liter', 'ltrs', 'kg', 'mt', 'ton',
])

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function colLetter(idx: number): string {
  let s = ''
  let n = idx
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

function isNumericCell(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  return /^-?[\d,]+(\.\d+)?%?$/.test(t.replace(/^[a-z]{0,4}\s*/i, ''))
}

/** Higher = more likely a header row. */
export function scoreHeaderRow(cells: string[]): number {
  const filled = cells.map((c) => c.trim()).filter(Boolean)
  if (filled.length === 0) return 0
  if (filled.length === 1) return isNumericCell(filled[0]!) ? 0 : 2.4
  let hints = 0
  let numeric = 0
  let shortLabels = 0
  let longCells = 0
  for (const c of filled) {
    const n = normalizeHeader(c)
    if (HEADER_HINTS.has(n)) hints++
    if (isNumericCell(c)) numeric++
    if (c.length <= 32) shortLabels++
    if (c.length > 80) longCells++
  }
  const n = filled.length
  return (
    n * 1.2 +
    hints * 8 +
    (shortLabels / n) * 4 -
    (numeric / n) * 6 -
    longCells * 3
  )
}

export function detectHeaderRowIndex(matrix: string[][], maxScan = 12): number {
  const scan = Math.min(maxScan, matrix.length)
  let bestIdx = 0
  let bestScore = -1
  for (let i = 0; i < scan; i++) {
    const score = scoreHeaderRow(matrix[i] ?? [])
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx
}

export function uniqueColumnNames(header: string[]): string[] {
  const seen = new Map<string, number>()
  return header.map((raw, i) => {
    const base = raw.trim() || `Column ${colLetter(i)}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}_${n + 1}`
  })
}

function rowIsEmpty(row: string[]): boolean {
  return row.every((c) => !String(c ?? '').trim())
}

/** Convert a 2D string table into objects, detecting the header row. */
export function matrixToRecords(matrix: string[][]): Record<string, unknown>[] {
  const compact = matrix
    .map((r) => r.map((c) => String(c ?? '').trim()))
    .filter((r) => !rowIsEmpty(r))
  if (compact.length === 0) return []

  const headerIdx = detectHeaderRowIndex(compact)
  const headerScore = scoreHeaderRow(compact[headerIdx] ?? [])
  const width = compact.reduce((m, r) => Math.max(m, r.length), 0)
  const headerRow = [...(compact[headerIdx] ?? [])]
  while (headerRow.length < width) headerRow.push('')

  const useSynthetic = headerScore < 2
  const names = uniqueColumnNames(
    useSynthetic ? Array.from({ length: width }, (_, i) => `Column ${colLetter(i)}`) : headerRow,
  )
  const start = useSynthetic ? 0 : headerIdx + 1
  const rows: Record<string, unknown>[] = []
  for (let r = start; r < compact.length; r++) {
    const line = compact[r] ?? []
    if (rowIsEmpty(line)) continue
    const obj: Record<string, unknown> = {}
    names.forEach((name, i) => {
      obj[name] = line[i] ?? ''
    })
    rows.push(obj)
  }
  return rows
}

/** Split extracted PDF/OCR text into a cell matrix. */
export function textToMatrix(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/g, '')).filter((l) => l.trim())
  const matrix: string[][] = []
  for (const line of lines) {
    let cells = line.split(/\t/).map((c) => c.trim())
    if (cells.filter(Boolean).length < 2) {
      const wide = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
      if (wide.length > cells.filter(Boolean).length) cells = wide
    }
    if (cells.filter(Boolean).length === 0) continue
    matrix.push(cells)
  }
  return expandCollapsedColumns(matrix)
}

/** When a text layer collapses columns to single spaces, recover a grid. */
function expandCollapsedColumns(matrix: string[][]): string[][] {
  if (matrix.length < 2) return matrix
  if (matrix.some((r) => r.filter(Boolean).length >= 2)) return matrix
  const split = matrix.map((r) => String(r[0] ?? '').trim().split(/\s+/).filter(Boolean))
  const wide = split.filter((r) => r.length >= 2)
  if (wide.length < 2) return matrix
  return split.filter((r) => r.length > 0)
}

export function inferColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows.slice(0, 40)) {
    for (const k of Object.keys(row)) keys.add(k)
  }
  return [...keys]
}

export function scoreGroup(rows: Record<string, unknown>[], columns?: string[]): number {
  const cols = columns && columns.length > 0 ? columns : inferColumns(rows)
  if (rows.length === 0) return -1
  const lineOnly = cols.length === 1 && cols[0] === 'line'
  const hits = cols.filter((c) => HEADER_HINTS.has(normalizeHeader(c))).length
  return cols.length * 8 + Math.min(rows.length, 200) + hits * 12 - (lineOnly ? 80 : 0)
}

export function pickBestGroup<T extends { rows: Record<string, unknown>[] }>(groups: T[]): T | null {
  if (groups.length === 0) return null
  return groups.reduce((a, b) => (scoreGroup(b.rows) > scoreGroup(a.rows) ? b : a))
}

export function mergeGroupRows(
  groups: Array<{ rows: Record<string, unknown>[]; columns?: string[] }>,
): { rows: Record<string, unknown>[]; columns: string[] } {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const g of groups) {
    const cols = g.columns && g.columns.length > 0 ? g.columns : inferColumns(g.rows)
    for (const c of cols) {
      if (!seen.has(c)) {
        seen.add(c)
        columns.push(c)
      }
    }
  }
  const rows = groups.flatMap((g) => g.rows)
  return { rows, columns: columns.length > 0 ? columns : inferColumns(rows) }
}

export function uniqueGroupName(name: string, used: Map<string, number>): string {
  const n = used.get(name) ?? 0
  used.set(name, n + 1)
  return n === 0 ? name : `${name} (${n + 1})`
}
