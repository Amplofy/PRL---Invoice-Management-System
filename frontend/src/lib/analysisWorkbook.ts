import ExcelJS from 'exceljs'

export type CellKind = 'text' | 'money' | 'int' | 'pct' | 'date' | 'n'

export interface AnalysisColumn {
  key: string
  header: string
  kind?: CellKind
  width?: number
}

export interface AnalysisSheet {
  name: string
  title?: string
  subtitle?: string
  columns: AnalysisColumn[]
  rows: Array<Record<string, unknown>>
  groupBy?: string | null
  subtotalKeys?: string[]
  grandTotal?: boolean
  tabColor?: string
}

export interface AnalysisMeta {
  title: string
  subtitle?: string
  filters?: Array<{ label: string; value: string }>
}

const NAVY = 'FF0F2744'
const GREEN = 'FF0B6E4F'
const SUB = 'FFE8EEF4'
const ZEBRA = 'FFF4F7FA'
const WHITE = 'FFFFFFFF'
const MUTED = 'FF5B6B7A'

function colLetter(index0: number): string {
  let n = index0 + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function asText(v: unknown): string {
  if (v == null) return ''
  return String(v)
}

function kindOf(col: AnalysisColumn): CellKind {
  return col.kind ?? 'text'
}

function numFmt(kind: CellKind): string | undefined {
  if (kind === 'money') return '#,##0.00'
  if (kind === 'int') return '#,##0'
  if (kind === 'pct') return '0.0'
  if (kind === 'n') return '0.00'
  return undefined
}

function thinBorder(): ExcelJS.Borders {
  const edge: ExcelJS.Border = { style: 'thin', color: { argb: 'FFD5DEE7' } }
  return { top: edge, left: edge, bottom: edge, right: edge, diagonal: { up: false, down: false, style: 'thin', color: { argb: 'FFD5DEE7' } } }
}

function applyKind(cell: ExcelJS.Cell, kind: CellKind, value: unknown) {
  if (kind === 'money' || kind === 'int' || kind === 'pct' || kind === 'n') {
    cell.value = asNumber(value)
    const fmt = numFmt(kind)
    if (fmt) cell.numFmt = fmt
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    return
  }
  if (kind === 'date') {
    cell.value = asText(value)
    cell.alignment = { vertical: 'middle' }
    return
  }
  cell.value = asText(value)
  cell.alignment = { vertical: 'middle', wrapText: kind === 'text' }
}

function groupBuckets(rows: Array<Record<string, unknown>>, key: string, sumKeys: string[]) {
  const buckets = new Map<string, { key: string; rows: Array<Record<string, unknown>>; sums: Record<string, number> }>()
  for (const row of rows) {
    const raw = row[key]
    const label = raw == null || String(raw).trim() === '' ? '—' : String(raw)
    let bucket = buckets.get(label)
    if (!bucket) {
      bucket = { key: label, rows: [], sums: Object.fromEntries(sumKeys.map((k) => [k, 0])) }
      buckets.set(label, bucket)
    }
    bucket.rows.push(row)
    for (const k of sumKeys) bucket.sums[k] = (bucket.sums[k] ?? 0) + asNumber(row[k])
  }
  const lead = sumKeys[0]
  return [...buckets.values()].sort((a, b) => (lead ? (b.sums[lead] ?? 0) - (a.sums[lead] ?? 0) : b.rows.length - a.rows.length))
}

function paintHeader(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  cell.alignment = { vertical: 'middle', wrapText: true }
  cell.border = thinBorder()
}

function paintSubtotal(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: NAVY } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUB } }
  cell.border = thinBorder()
}

function paintGrand(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }
  cell.border = thinBorder()
}

function writeCover(wb: ExcelJS.Workbook, meta: AnalysisMeta, sheetCount: number) {
  const ws = wb.addWorksheet('Cover', { properties: { tabColor: { argb: NAVY } } })
  ws.columns = [{ width: 28 }, { width: 72 }]
  ws.mergeCells('A1:B1')
  ws.getCell('A1').value = 'PRL-EOMS'
  ws.getCell('A1').font = { name: 'Calibri', size: 22, bold: true, color: { argb: NAVY } }
  ws.mergeCells('A2:B2')
  ws.getCell('A2').value = meta.title
  ws.getCell('A2').font = { name: 'Calibri', size: 16, bold: true, color: { argb: NAVY } }
  if (meta.subtitle) {
    ws.mergeCells('A3:B3')
    ws.getCell('A3').value = meta.subtitle
    ws.getCell('A3').font = { name: 'Calibri', size: 11, color: { argb: MUTED } }
  }
  const facts = [
    { label: 'Company', value: 'Pakistan Refinery Ltd' },
    { label: 'Workbook', value: 'Advanced analysis' },
    { label: 'Sheets', value: sheetCount },
    { label: 'Generated', value: new Date().toISOString() },
    ...(meta.filters ?? []),
  ]
  let r = 5
  ws.getCell(`A${r}`).value = 'Field'
  ws.getCell(`B${r}`).value = 'Value'
  paintHeader(ws.getCell(`A${r}`))
  paintHeader(ws.getCell(`B${r}`))
  r += 1
  for (const fact of facts) {
    ws.getCell(`A${r}`).value = fact.label
    ws.getCell(`B${r}`).value = fact.value
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } }
    ws.getCell(`A${r}`).border = thinBorder()
    ws.getCell(`B${r}`).border = thinBorder()
    if ((r - 6) % 2 === 1) {
      ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      ws.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    }
    r += 1
  }
  ws.getCell('A1').note = 'Fiscal year uses service start (service_from), else invoice date.'
}

function writeDataSheet(wb: ExcelJS.Workbook, spec: AnalysisSheet) {
  const name = spec.name.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet'
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 4, topLeftCell: 'A5', activeCell: 'A5' }],
    properties: spec.tabColor ? { tabColor: { argb: spec.tabColor } } : {},
  })
  const cols = spec.columns
  const lastCol = colLetter(Math.max(0, cols.length - 1))
  ws.columns = cols.map((c) => ({
    key: c.key,
    width: c.width ?? Math.min(42, Math.max(12, c.header.length + 4)),
  }))

  ws.mergeCells(`A1:${lastCol}1`)
  ws.getCell('A1').value = spec.title ?? spec.name
  ws.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: NAVY } }
  ws.getRow(1).height = 24

  ws.mergeCells(`A2:${lastCol}2`)
  ws.getCell('A2').value = spec.subtitle ?? ''
  ws.getCell('A2').font = { name: 'Calibri', size: 10, color: { argb: MUTED } }

  const headerRow = 4
  cols.forEach((col, i) => {
    const cell = ws.getCell(headerRow, i + 1)
    cell.value = col.header
    paintHeader(cell)
  })
  ws.getRow(headerRow).height = 22

  const sumKeys =
    spec.subtotalKeys && spec.subtotalKeys.length > 0
      ? spec.subtotalKeys.filter((k) => cols.some((c) => c.key === k))
      : cols.filter((c) => kindOf(c) === 'money' || kindOf(c) === 'int').map((c) => c.key)

  const groupKey = spec.groupBy && cols.some((c) => c.key === spec.groupBy) ? spec.groupBy : null
  const blocks = groupKey ? groupBuckets(spec.rows, groupKey, sumKeys) : [{ key: '', rows: spec.rows, sums: {} }]

  let excelRow = headerRow + 1
  const detailStart = excelRow

  const writeRecord = (row: Record<string, unknown>, tone: 'detail' | 'sub' | 'grand', zebra: boolean) => {
    cols.forEach((col, i) => {
      const cell = ws.getCell(excelRow, i + 1)
      applyKind(cell, kindOf(col), row[col.key])
      cell.border = thinBorder()
      if (tone === 'sub') paintSubtotal(cell)
      else if (tone === 'grand') paintGrand(cell)
      else if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    if (tone === 'detail') {
      ws.getRow(excelRow).outlineLevel = groupKey ? 1 : 0
    }
    excelRow += 1
  }

  let zebra = false
  for (const block of blocks) {
    const blockStart = excelRow
    for (const row of block.rows) {
      writeRecord(row, 'detail', zebra)
      zebra = !zebra
    }
    if (groupKey && block.rows.length > 0 && sumKeys.length > 0) {
      const blockEnd = excelRow - 1
      const sub: Record<string, unknown> = {}
      const labelKey = groupKey
      sub[labelKey] = `Subtotal · ${block.key}`
      cols.forEach((col, i) => {
        const cell = ws.getCell(excelRow, i + 1)
        paintSubtotal(cell)
        if (col.key === labelKey) {
          cell.value = sub[labelKey] as string
          cell.alignment = { vertical: 'middle' }
        } else if (sumKeys.includes(col.key) && blockEnd >= blockStart) {
          const letter = colLetter(i)
          cell.value = { formula: `SUBTOTAL(9,${letter}${blockStart}:${letter}${blockEnd})`, result: block.sums[col.key] ?? 0 }
          cell.numFmt = numFmt(kindOf(col)) ?? '#,##0.00'
          cell.alignment = { horizontal: 'right', vertical: 'middle' }
        } else {
          cell.value = ''
        }
      })
      excelRow += 1
    }
  }

  const lastData = excelRow - 1
  if (spec.grandTotal !== false && cols.length > 0 && spec.rows.length > 0) {
    const labelKey = groupKey ?? cols[0].key
    cols.forEach((col, i) => {
      const cell = ws.getCell(excelRow, i + 1)
      paintGrand(cell)
      if (col.key === labelKey) {
        cell.value = 'Grand total'
        cell.alignment = { vertical: 'middle' }
      } else if (sumKeys.includes(col.key) && lastData >= detailStart) {
        const letter = colLetter(i)
        const result = spec.rows.reduce((s, row) => s + asNumber(row[col.key]), 0)
        cell.value = { formula: `SUBTOTAL(9,${letter}${detailStart}:${letter}${lastData})`, result }
        cell.numFmt = numFmt(kindOf(col)) ?? '#,##0.00'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        cell.value = ''
      }
    })
    excelRow += 1
  }

  if (spec.rows.length === 0) {
    ws.mergeCells(`A5:${lastCol}5`)
    ws.getCell('A5').value = 'No rows for this sheet'
    ws.getCell('A5').font = { italic: true, color: { argb: MUTED } }
  } else {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastData, column: cols.length } }
  }

  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    printTitlesRow: '4:4',
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  }
  ws.headerFooter = {
    oddHeader: '&LPRL-EOMS analysis&C&A&R&D',
    oddFooter: '&LConfidential&CPage &P of &N',
  }
  ws.properties.outlineLevelRow = groupKey ? 1 : 0
}

export async function downloadAnalysisWorkbook(filename: string, sheets: AnalysisSheet[], meta?: AnalysisMeta) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PRL-EOMS'
  wb.created = new Date()
  wb.modified = new Date()
  wb.company = 'Pakistan Refinery Ltd'
  wb.calcProperties.fullCalcOnLoad = true

  if (meta) writeCover(wb, meta, sheets.length)
  for (const sheet of sheets) writeDataSheet(wb, sheet)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadTableWorkbook(opts: {
  filename: string
  title: string
  subtitle?: string
  columns: AnalysisColumn[]
  rows: Array<Record<string, unknown>>
  groupBy?: string | null
  grandTotal?: boolean
  filters?: Array<{ label: string; value: string }>
}) {
  await downloadAnalysisWorkbook(
    opts.filename,
    [
      {
        name: opts.title.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Data',
        title: opts.title,
        subtitle: opts.subtitle,
        columns: opts.columns,
        rows: opts.rows,
        groupBy: opts.groupBy,
        grandTotal: opts.grandTotal !== false,
      },
    ],
    {
      title: opts.title,
      subtitle: opts.subtitle ?? 'Full-column register with subtotals and grand total',
      filters: opts.filters,
    },
  )
}
