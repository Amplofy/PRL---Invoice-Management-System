import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as xlsx from 'xlsx'
import { parseCsv } from '../src/services/parseCsv.js'
import { parseExcel, parseExcelGroups } from '../src/services/parseExcel.js'
import { parsePdf, parsePdfGroups } from '../src/services/parsePdf.js'
import { parseFile } from '../src/services/parse.js'
import {
  detectHeaderRowIndex,
  inferColumns,
  matrixToRecords,
  mergeGroupRows,
  pickBestGroup,
  textToMatrix,
} from '../src/services/parseTable.js'

test('parseCsv parses basic CSV with headers', () => {
  const buf = Buffer.from('name,amount\nABC,100\nXYZ,200\n')
  const rows = parseCsv(buf)
  assert.equal(rows.length, 2)
  assert.equal(rows[0]!.name, 'ABC')
  assert.equal(rows[1]!.amount, '200')
})

test('parseCsv skips empty lines', () => {
  const buf = Buffer.from('a,b\n1,2\n\n3,4\n')
  const rows = parseCsv(buf)
  assert.equal(rows.length, 2)
})

test('parseExcel parses first worksheet', () => {
  const ws = xlsx.utils.json_to_sheet([{ name: 'ABC', amount: 100 }])
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const rows = parseExcel(buf)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.name, 'ABC')
})

test('parseExcelGroups keeps every sheet so the user can pick one', () => {
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([{ a: 1 }]), 'Alpha')
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([[], []]), 'Empty')
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([{ b: 2 }, { b: 3 }]), 'Beta')
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const groups = parseExcelGroups(buf)
  assert.equal(groups.length, 3)
  assert.equal(groups[0]!.name, 'Alpha')
  assert.equal(groups[1]!.name, 'Empty')
  assert.equal(groups[1]!.rows.length, 0)
  assert.equal(groups[2]!.name, 'Beta')
  assert.equal(groups[2]!.rows.length, 2)
})

test('parseExcel finds a header row below a title banner', () => {
  const ws = xlsx.utils.aoa_to_sheet([
    ['Monthly statement', '', ''],
    ['Invoice No', 'Amount', 'Date'],
    ['INV-1', '100', '2026-01-01'],
    ['INV-2', '200', '2026-01-02'],
  ])
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const rows = parseExcel(buf)
  assert.equal(rows.length, 2)
  assert.equal(rows[0]!['Invoice No'], 'INV-1')
  assert.equal(rows[1]!.Amount, '200')
})

test('matrixToRecords and textToMatrix reconstruct uneven tables', () => {
  const matrix = textToMatrix('Rate    Description    Total\n12.5    Diesel haul    1000\n8      Water          400\n')
  assert.ok(matrix[0]!.length >= 3)
  const idx = detectHeaderRowIndex(matrix)
  assert.equal(idx, 0)
  const rows = matrixToRecords(matrix)
  assert.equal(rows.length, 2)
  assert.ok('Rate' in rows[0]!)
  assert.equal(String(rows[0]!.Rate), '12.5')
})

test('pickBestGroup prefers a real table over a raw dump', () => {
  const best = pickBestGroup([
    { name: 'cover', rows: [{ line: 'a' }, { line: 'b' }, { line: 'c' }] },
    { name: 'ledger', rows: [{ invoice: '1', amount: '10' }, { invoice: '2', amount: '20' }] },
  ])
  assert.equal(best?.name, 'ledger')
})

test('mergeGroupRows unions columns across selected pages', () => {
  const merged = mergeGroupRows([
    { rows: [{ a: 1, b: 2 }], columns: ['a', 'b'] },
    { rows: [{ a: 3, c: 4 }], columns: ['a', 'c'] },
  ])
  assert.deepEqual(merged.columns, ['a', 'b', 'c'])
  assert.equal(merged.rows.length, 2)
  assert.deepEqual(inferColumns(merged.rows).sort(), ['a', 'b', 'c'])
})

test('parsePdf extracts rows from tabular text PDF', async () => {
  const buf = Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 200>>stream
BT /F1 12 Tf 72 720 Td (invoice    amount    date) Tj
0 -20 Td (INV-001    1000      2026-01-01) Tj
0 -20 Td (INV-002    2000      2026-01-02) Tj
ET
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF
`.trim()
  )
  const rows = await parsePdf(buf)
  assert.ok(rows.length >= 2, `expected >= 2 rows, got ${rows.length}`)
  const first = Object.values(rows[0]!)
  assert.ok(
    first.some((v) => String(v).includes('INV-001')),
    `expected INV-001 in row, got ${JSON.stringify(first)}`
  )
})

test('parsePdfGroups exposes every page for user selection', async () => {
  const buf = Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 200>>stream
BT /F1 12 Tf 72 720 Td (invoice    amount    date) Tj
0 -20 Td (INV-001    1000      2026-01-01) Tj
0 -20 Td (INV-002    2000      2026-01-02) Tj
ET
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF
`.trim(),
  )
  const groups = await parsePdfGroups(buf)
  assert.ok(groups.length >= 1, 'expected at least one page group')
  assert.match(groups[0]!.name, /Page /)
})

test('parseFile dispatches by extension', async () => {
  const csv = await parseFile({ buffer: Buffer.from('a\n1\n'), originalname: 'x.csv' })
  assert.equal(csv.format, 'csv')
  const bad = parseFile({ buffer: Buffer.from('x'), originalname: 'x.txt' })
  await assert.rejects(bad, /Unsupported/)
})
