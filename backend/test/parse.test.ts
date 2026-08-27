import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as xlsx from 'xlsx'
import { parseCsv } from '../src/services/parseCsv.js'
import { parseExcel } from '../src/services/parseExcel.js'
import { parsePdf } from '../src/services/parsePdf.js'
import { parseFile } from '../src/services/parse.js'

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

test('parseFile dispatches by extension', async () => {
  const csv = await parseFile({ buffer: Buffer.from('a\n1\n'), originalname: 'x.csv' })
  assert.equal(csv.format, 'csv')
  const bad = parseFile({ buffer: Buffer.from('x'), originalname: 'x.txt' })
  await assert.rejects(bad, /Unsupported/)
})
