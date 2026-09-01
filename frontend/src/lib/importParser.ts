import * as XLSX from 'xlsx'

export interface ParsedSheet {
  name: string
  rowCount: number
  matrix: unknown[][]
  hiddenCols: string[]
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[]
}

export interface LocalParsedGroup {
  name: string
  rowCount: number
  rows: Record<string, unknown>[]
  columns: string[]
}

export interface SourceColumn {
  key: string
  letter: string
  header: string
  hidden: boolean
  duplicate: boolean
  samples: unknown[]
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

export async function readWorkbook(file: File): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { cellDates: true, dense: false })
  const sheets: ParsedSheet[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: true,
    })
    const hidden: string[] = []
    const cols = (ws['!cols'] ?? []) as Array<{ hidden?: boolean } | undefined>
    cols.forEach((c, i) => {
      if (c?.hidden) hidden.push(colLetter(i))
    })
    sheets.push({ name, rowCount: matrix.length, matrix, hiddenCols: hidden })
  }
  return { sheets }
}

export function detectHeaderRow(matrix: unknown[][], aliasSet: Set<string>): number {
  const scan = Math.min(10, matrix.length)
  let bestIdx = 0
  let bestScore = -1
  for (let r = 0; r < scan; r++) {
    const row = matrix[r] ?? []
    let nonEmpty = 0
    let aliasHits = 0
    for (const cell of row) {
      const s = String(cell ?? '').trim()
      if (!s) continue
      nonEmpty++
      const norm = s.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (aliasSet.has(norm)) aliasHits++
    }
    const score = aliasHits * 10 + nonEmpty / Math.max(1, row.length)
    if (score > bestScore) {
      bestScore = score
      bestIdx = r
    }
  }
  return bestIdx
}

export function buildColumns(
  matrix: unknown[][],
  headerRowIdx: number,
  hiddenLetters: string[],
): SourceColumn[] {
  const headerRow = matrix[headerRowIdx] ?? []
  const width = headerRow.length
  const seen = new Map<string, number>()
  const hiddenSet = new Set(hiddenLetters)
  const out: SourceColumn[] = []
  for (let c = 0; c < width; c++) {
    let header = String(headerRow[c] ?? '').trim()
    if (!header) header = `Column ${colLetter(c)}`
    const count = seen.get(header) ?? 0
    seen.set(header, count + 1)
    const key = count === 0 ? header : `${header}_${count + 1}`
    const samples: unknown[] = []
    for (let r = headerRowIdx + 1; r < matrix.length && samples.length < 3; r++) {
      const v = matrix[r]?.[c]
      if (v !== '' && v !== undefined && v !== null) samples.push(v)
    }
    out.push({
      key,
      letter: colLetter(c),
      header,
      hidden: hiddenSet.has(colLetter(c)),
      duplicate: count > 0,
      samples,
    })
  }
  return out
}

export function dataRows(matrix: unknown[][], headerRowIdx: number): Record<string, unknown>[] {
  const cols = matrix[headerRowIdx] ?? []
  const names: string[] = []
  const seen = new Map<string, number>()
  for (let c = 0; c < cols.length; c++) {
    const base = String(cols[c] ?? '').trim() || `Column ${colLetter(c)}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    names.push(n === 0 ? base : `${base}_${n + 1}`)
  }
  return matrix.slice(headerRowIdx + 1).map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((name, c) => {
      obj[name] = row?.[c] ?? ''
    })
    return obj
  })
}

/** Browser-side CSV/XLSX/XLS parse used by demo mode (files never leave the device). */
export async function parseLocalGroups(file: File): Promise<{
  fileName: string
  format: 'csv' | 'xlsx'
  groups: LocalParsedGroup[]
}> {
  const name = file.name
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) {
    throw new Error(
      'PDF comparison needs a signed-in session (server parser). Drop CSV, XLSX or XLS to compare locally.',
    )
  }
  const wb = await readWorkbook(file)
  const groups = wb.sheets
    .map((s) => {
      const headerRowIdx = detectHeaderRow(s.matrix, new Set())
      const rows = dataRows(s.matrix, headerRowIdx)
      return {
        name: s.name,
        rowCount: rows.length,
        rows,
        columns: rows.length > 0 ? Object.keys(rows[0]!) : [],
      }
    })
    .filter((g) => g.rows.length > 0)
  if (groups.length === 0) throw new Error('No readable rows found in the file')
  return {
    fileName: name,
    format: lower.endsWith('.csv') ? 'csv' : 'xlsx',
    groups,
  }
}
