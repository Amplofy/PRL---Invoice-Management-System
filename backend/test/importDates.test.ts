import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dateToCalendarYmd, excelSerialToYmd } from '../../frontend/src/lib/calendarDate.ts'
import { formatDate } from '../../frontend/src/lib/format.ts'
import { normalizeDate } from '../../frontend/src/lib/importMapping.ts'
import { parseCsvMatrix } from '../../frontend/src/lib/importParser.ts'
import { fiscalYearOfDate, invoiceBudgetFy } from '../src/services/fyLock.js'

describe('CSV / calendar dates', () => {
  it('keeps CSV date cells as original strings', () => {
    const matrix = parseCsvMatrix(
      'invoice_no,service_from\nINV-1,2026-06-01\nINV-2,01-06-2026\nINV-3,01-Jun-2026\n',
    )
    assert.equal(matrix[1]?.[1], '2026-06-01')
    assert.equal(matrix[2]?.[1], '01-06-2026')
    assert.equal(matrix[3]?.[1], '01-Jun-2026')
  })

  it('does not shift UTC-midnight Date objects back a day', () => {
    const utc = new Date('2026-06-01T00:00:00.000Z')
    assert.equal(dateToCalendarYmd(utc), '2026-06-01')
    assert.equal(normalizeDate(utc).value, '2026-06-01')
  })

  // SheetJS (xlsx 0.18.5) with cellDates:true builds a date-only cell as
  // 2025-09-07T18:59:48Z in Asia/Karachi, i.e. 23:59:48 local on the day before
  // the cell value. Trusting the local parts moved every imported date one day.
  it('keeps the cell day for SheetJS local-midnight dates', () => {
    const sheetjsShifted = new Date('2025-09-07T18:59:48.000Z')
    assert.equal(dateToCalendarYmd(sheetjsShifted), '2025-09-08')
    assert.equal(normalizeDate(sheetjsShifted).value, '2025-09-08')
  })

  it('keeps the intended day for instants a few seconds before midnight', () => {
    assert.equal(dateToCalendarYmd(new Date('2025-09-07T18:59:48.000Z')), '2025-09-08')
    assert.equal(dateToCalendarYmd(new Date('2026-06-29T18:59:48.000Z')), '2026-06-30')
  })

  it('reads ISO and day-first strings as the civil date', () => {
    assert.equal(normalizeDate('2026-06-01').value, '2026-06-01')
    assert.equal(normalizeDate('01-06-2026').value, '2026-06-01')
    assert.equal(normalizeDate('15/06/2026').value, '2026-06-15')
  })

  it('converts Excel serials on the UTC calendar', () => {
    assert.equal(excelSerialToYmd(46174), '2026-06-01')
    assert.equal(normalizeDate(46174).value, '2026-06-01')
  })

  it('formats YYYY-MM-DD without timezone shift', () => {
    assert.equal(formatDate('2026-06-01'), '01-Jun-2026')
    assert.equal(formatDate('2026-06-01T00:00:00.000Z'), '01-Jun-2026')
  })

  it('assigns Pakistan FY from the civil service start', () => {
    assert.equal(fiscalYearOfDate('2026-07-01'), 'FY26')
    assert.equal(fiscalYearOfDate('2026-06-30'), 'FY25')
    assert.equal(
      invoiceBudgetFy({ service_from: '2026-06-01', invoice_date: '2026-07-10' }),
      'FY25',
    )
  })
})
