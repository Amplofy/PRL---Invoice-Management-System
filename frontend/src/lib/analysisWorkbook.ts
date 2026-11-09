import ExcelJS from 'exceljs'

export type CellKind = 'text' | 'money' | 'int' | 'pct' | 'date' | 'n'

export interface AnalysisColumn {
  key: string
  header: string
  kind?: CellKind
  width?: number
}

export interface AnalysisChart {
  type: 'bar' | 'pie' | 'line' | 'col'
  title: string
  categoryKey: string
  valueKey: string
  sheetName?: string
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
  chart?: AnalysisChart
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
  return { headerRow, detailStart, lastData, excelRow }
}

interface SheetLayout {
  headerRow: number
  detailStart: number
  lastData: number
  excelRow: number
}

function colIndex(cols: AnalysisColumn[], key: string): number {
  return cols.findIndex((c) => c.key === key)
}

type ChartSpec = { type: 'bar' | 'pie' | 'line' | 'col'; title: string; cats: string; vals: string; row: number }

function writeDashboard(wb: ExcelJS.Workbook, sheets: AnalysisSheet[], layouts: SheetLayout[]): ChartSpec[] {
  const ws = wb.addWorksheet('Dashboard', { properties: { tabColor: { argb: GREEN } } })
  ws.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }]
  ws.mergeCells('A1:F1')
  ws.getCell('A1').value = 'Financial dashboard'
  ws.getCell('A1').font = { name: 'Calibri', size: 20, bold: true, color: { argb: NAVY } }
  ws.mergeCells('A2:F2')
  ws.getCell('A2').value = 'Native Excel charts from scoped analysis sheets. Click a chart to filter the source table.'
  ws.getCell('A2').font = { name: 'Calibri', size: 10, color: { argb: MUTED } }

  let r = 4
  const chartSpecs: ChartSpec[] = []
  for (let i = 0; i < sheets.length; i++) {
    const spec = sheets[i]
    const layout = layouts[i]
    const chart = spec.chart
    if (!chart || !layout || spec.rows.length === 0) continue
    const sheetName = spec.name.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet'
    const catIdx = colIndex(spec.columns, chart.categoryKey)
    const valIdx = colIndex(spec.columns, chart.valueKey)
    if (catIdx < 0 || valIdx < 0 || layout.lastData < layout.detailStart) continue
    const catCol = colLetter(catIdx)
    const valCol = colLetter(valIdx)
    const cats = `'${sheetName}'!$${catCol}$${layout.detailStart}:$${catCol}$${layout.lastData}`
    const vals = `'${sheetName}'!$${valCol}$${layout.detailStart}:$${valCol}$${layout.lastData}`
    ws.getCell(`A${r}`).value = chart.title
    ws.getCell(`A${r}`).font = { name: 'Calibri', size: 13, bold: true, color: { argb: NAVY } }
    ws.getCell(`A${r + 1}`).value = { formula: `COUNTA(${cats})` }
    ws.getCell(`B${r + 1}`).value = { formula: `SUM(${vals})` }
    ws.getCell(`B${r + 1}`).numFmt = '#,##0.00'
    chartSpecs.push({ type: chart.type, title: chart.title, cats, vals, row: r + 1 })
    r += 16
  }
  if (chartSpecs.length === 0) {
    ws.getCell('A4').value = 'No chartable sheets in this workbook'
    ws.getCell('A4').font = { italic: true, color: { argb: MUTED } }
  }
  return chartSpecs
}

function chartXml(_id: number, spec: { type: 'bar' | 'pie' | 'line' | 'col'; title: string; cats: string; vals: string }): string {
  const ser = `<c:ser>
      <c:idx val="0"/><c:order val="0"/>
      <c:tx><c:v>${escapeXml(spec.title)}</c:v></c:tx>
      <c:cat><c:strRef><c:f>${escapeXml(spec.cats)}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${escapeXml(spec.vals)}</c:f></c:numRef></c:val>
    </c:ser>`
  const plot = spec.type === 'pie'
    ? `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>`
    : spec.type === 'line'
      ? `<c:lineChart><c:grouping val="standard"/>${ser}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>`
      : `<c:barChart><c:barDir val="${spec.type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/>${ser}<c:axId val="1"/><c:axId val="2"/></c:barChart>`
  const axes = spec.type === 'pie' ? '' : `<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="2"/></c:catAx>
    <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:tickLblPos val="nextTo"/><c:crossAx val="1"/></c:valAx>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:t>${escapeXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx></c:title>
    <c:plotArea><c:layout/>${plot}${axes}</c:plotArea>
    <c:legend><c:legendPos val="b"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`
}

function drawingXml(charts: Array<{ id: number; rel: string; row: number }>): string {
  const anchors = charts.map((ch) => {
    const fromRow = ch.row
    return `<xdr:twoCellAnchor>
      <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
      <xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow + 14}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
      <xdr:graphicFrame>
        <xdr:nvGraphicFramePr><xdr:cNvPr id="${ch.id}" name="Chart ${ch.id}"/><xdr:cNvGraphicFramePr/>
          <xdr:nvPr/></xdr:nvGraphicFramePr>
        <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${ch.rel}"/>
        </a:graphicData></a:graphic>
      </xdr:graphicFrame>
      <xdr:clientData/>
    </xdr:twoCellAnchor>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  ${anchors}
</xdr:wsDr>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function drawingRels(charts: Array<{ id: number; rel: string }>): string {
  const rels = charts.map((ch) =>
    `<Relationship Id="${ch.rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${ch.id}.xml"/>`,
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
}

function sheetPathFor(wbXml: string, relsXml: string, name: string): string | null {
  const sheetTag = [...wbXml.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`name="${name}"`))
  if (!sheetTag) return null
  const rid = sheetTag.match(/r:id="([^"]+)"/)?.[1]
  if (!rid) return null
  const rel = [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`Id="${rid}"`))
  const target = rel?.match(/Target="([^"]+)"/)?.[1]
  if (!target) return null
  if (target.startsWith('/xl/')) return target.slice(1)
  if (target.startsWith('xl/')) return target
  return `xl/${target.replace(/^\//, '')}`
}

async function injectCharts(buffer: ArrayBuffer, specs: ChartSpec[]): Promise<ArrayBuffer> {
  if (specs.length === 0) return buffer
  try {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(buffer)
    const wbXml = await zip.file('xl/workbook.xml')?.async('string')
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
    if (!wbXml || !relsXml) return buffer
    const target = sheetPathFor(wbXml, relsXml, 'Dashboard')
    if (!target) return buffer
    const sheetXml = await zip.file(target)?.async('string')
    if (!sheetXml) return buffer
    const charts = specs.map((s, i) => ({ id: i + 1, rel: `rId${i + 1}`, row: s.row, spec: s }))
    zip.file('xl/drawings/drawing1.xml', drawingXml(charts))
    zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRels(charts))
    for (const ch of charts) zip.file(`xl/charts/chart${ch.id}.xml`, chartXml(ch.id, ch.spec))
    const withDraw = sheetXml.includes('<drawing ')
      ? sheetXml
      : sheetXml.replace('</worksheet>', '<drawing r:id="rIdChartDraw"/></worksheet>')
    zip.file(target, withDraw)
    const relsPath = `${target.replace('xl/worksheets/', 'xl/worksheets/_rels/')}.rels`
    const existingRels = (await zip.file(relsPath)?.async('string')) ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
    const relsPatched = existingRels.includes('rIdChartDraw')
      ? existingRels
      : existingRels.replace('</Relationships>', `<Relationship Id="rIdChartDraw" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`)
    zip.file(relsPath, relsPatched)
    const ct = await zip.file('[Content_Types].xml')?.async('string')
    if (ct && !ct.includes('/charts/chart')) {
      const extras = charts.map((ch) => `<Override PartName="/xl/charts/chart${ch.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')
      const draw = ct.includes('/drawings/drawing1.xml') ? '' : '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
      zip.file('[Content_Types].xml', ct.replace('</Types>', `${draw}${extras}</Types>`))
    }
    return await zip.generateAsync({ type: 'arraybuffer' })
  } catch {
    return buffer
  }
}

export async function downloadAnalysisWorkbook(filename: string, sheets: AnalysisSheet[], meta?: AnalysisMeta) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PRL-EOMS'
  wb.created = new Date()
  wb.modified = new Date()
  wb.company = 'Pakistan Refinery Ltd'
  wb.calcProperties.fullCalcOnLoad = true

  if (meta) writeCover(wb, meta, sheets.length + 1)
  const layouts: SheetLayout[] = []
  for (const sheet of sheets) layouts.push(writeDataSheet(wb, sheet))
  const specs = writeDashboard(wb, sheets, layouts)

  let buffer: ArrayBuffer = await wb.xlsx.writeBuffer() as ArrayBuffer
  if (specs.length > 0) buffer = await injectCharts(buffer, specs)
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
        chart: (() => {
          const cat = opts.columns.find((c) => c.kind !== 'money')
          const val = opts.columns.find((c) => c.kind === 'money')
          return cat && val ? { type: 'col' as const, title: opts.title, categoryKey: cat.key, valueKey: val.key } : undefined
        })(),
      },
    ],
    {
      title: opts.title,
      subtitle: opts.subtitle ?? 'Full-column register with subtotals and grand total',
      filters: opts.filters,
    },
  )
}
