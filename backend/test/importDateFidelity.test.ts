import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import { readWorkbook } from '../../frontend/src/lib/importParser.ts'
import { normalizeDate } from '../../frontend/src/lib/importMapping.ts'
import { parseImportDate, dateToCalendarYmd } from '../src/services/calendarDate.js'
import { parseExcel } from '../src/services/parseExcel.js'

// A duck-typed File is enough for readWorkbook: it only needs name, type and arrayBuffer.
function fakeFile(buffer: Buffer, name = 'book.xlsx'): File {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return { name, type: '', arrayBuffer: async () => ab } as unknown as File
}

/**
 * Workbook with two date cells written the way Excel stores them (a serial plus a
 * date number format) so SheetJS converts them back to Date objects on read.
 * 46204 = 2026-07-01, 46174 = 2026-06-01.
 */
function workbookWithDateCells(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Invoice', 'Invoice Date', 'Services Month', 'Amount', 'Contract ID', 'Approval'],
    ['AT-523', '', '', 28750, 'C-1', 'Approved'],
  ])
  ws['B2'] = { t: 'n', v: 46204, z: 'dd/mm/yyyy' }
  ws['C2'] = { t: 'n', v: 46174, z: 'mmmm-yy' }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

const DATE_TEXT_CASES: Array<[unknown, string, string | undefined]> = [
  ['2026-08-01', '2026-08-01', undefined],
  ['2026-08-01T00:00:00.000Z', '2026-08-01', undefined],
  ['2026/06/01', '2026-06-01', undefined],
  ['01-Aug-2026', '2026-08-01', undefined],
  ['1 Aug 26', '2026-08-01', undefined],
  ['01/Aug/2026', '2026-08-01', undefined],
  ['Aug 01, 2026', '2026-08-01', undefined],
  ['2026-Aug-01', '2026-08-01', undefined],
  ['15/01/2026', '2026-01-15', undefined],
  ['15-01-2026', '2026-01-15', undefined],
  ['01.08.2026', '2026-08-01', 'ambiguous day/month — read day-first'],
  ['1-8-26', '2026-08-01', 'ambiguous day/month — read day-first'],
  ['08/15/2026', '2026-08-15', 'month-first date detected'],
  ['Aug-2026', '2026-08-01', 'no day in "Aug-2026" — read as the 1st'],
  ['2026-06', '2026-06-01', 'no day in "2026-06" — read as the 1st'],
  ['45908', '2025-09-08', undefined],
  [45908, '2025-09-08', undefined],
  [46204.7915, '2026-07-01', undefined],
]

describe('imported dates are never altered', () => {
  describe('browser normalizeDate', () => {
    for (const [input, expected, warning] of DATE_TEXT_CASES) {
      it(`reads ${JSON.stringify(input)} as ${expected}`, () => {
        const out = normalizeDate(input)
        assert.equal(out.value, expected)
        assert.equal(out.warning, warning)
      })
    }

    it('keeps the cell day for SheetJS local-midnight Date objects', () => {
      assert.equal(normalizeDate(new Date('2025-09-07T18:59:48.000Z')).value, '2025-09-08')
      assert.equal(normalizeDate(new Date('2026-06-30T18:59:48.000Z')).value, '2026-07-01')
    })

    it('rejects unreadable text instead of guessing', () => {
      const out = normalizeDate('not a date')
      assert.equal(out.value, null)
      assert.match(out.warning ?? '', /unreadable date/)
    })
  })

  describe('server parseImportDate', () => {
    for (const [input, expected] of DATE_TEXT_CASES) {
      it(`reads ${JSON.stringify(input)} as ${expected}`, () => {
        assert.equal(parseImportDate(input), expected)
      })
    }

    it('keeps the cell day for SheetJS local-midnight Date objects', () => {
      assert.equal(parseImportDate(new Date('2025-09-07T18:59:48.000Z')), '2025-09-08')
    })

    it('returns null for unreadable text', () => {
      assert.equal(parseImportDate('not a date'), null)
      assert.equal(parseImportDate(''), null)
      assert.equal(parseImportDate(null), null)
    })
  })

  describe('server Excel reader', () => {
    it('emits date cells the importer resolves to the written day', () => {
      const rows = parseExcel(workbookWithDateCells())
      assert.equal(rows.length, 1)
      assert.equal(parseImportDate(rows[0]?.['Invoice Date']), '2026-07-01')
      assert.equal(parseImportDate(rows[0]?.['Services Month']), '2026-06-01')
    })
  })

  describe('browser Excel reader', () => {
    it('keeps the written day for date cells', async () => {
      const parsed = await readWorkbook(fakeFile(workbookWithDateCells()))
      const matrix = parsed.sheets[0]!.matrix
      const header = matrix[0] as unknown[]
      const dateCol = header.indexOf('Invoice Date')
      const serviceCol = header.indexOf('Services Month')
      assert.equal(normalizeDate(matrix[1]![dateCol]).value, '2026-07-01')
      assert.equal(normalizeDate(matrix[1]![serviceCol]).value, '2026-06-01')
    })
  })

  describe('Excel serial conversion', () => {
    it('maps serials through the UTC calendar', () => {
      assert.equal(dateToCalendarYmd(new Date('2026-06-01T00:00:00.000Z')), '2026-06-01')
      assert.equal(dateToCalendarYmd(new Date('2026-06-01T04:00:00.000Z')), '2026-06-01')
      assert.equal(dateToCalendarYmd(new Date('2026-05-31T18:59:48.000Z')), '2026-06-01')
    })
  })
})
