import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  civilDayDiff,
  dateToCalendarYmd,
  excelSerialToYmd,
  parseImportDate,
  todayCivilYmd,
} from '../src/services/calendarDate.js'

// Regression: Date.parse silently rolls impossible days forward (31/02 -> 03/03),
// so a typo in the workbook used to be accepted and written as a different date.

test('parseImportDate rejects impossible calendar days', () => {
  assert.equal(parseImportDate('2026-02-30'), null)
  assert.equal(parseImportDate('2026-04-31'), null)
  assert.equal(parseImportDate('2025-02-29'), null)
  assert.equal(parseImportDate('2026-06-31'), null)
  assert.equal(parseImportDate('2026-13-01'), null)
  assert.equal(parseImportDate('2026-00-10'), null)
  assert.equal(parseImportDate('2026-01-00'), null)
  assert.equal(parseImportDate('2026-01-32'), null)
})

test('parseImportDate accepts real days including leap days', () => {
  assert.equal(parseImportDate('2026-02-28'), '2026-02-28')
  assert.equal(parseImportDate('2024-02-29'), '2024-02-29')
  assert.equal(parseImportDate('2028-02-29'), '2028-02-29')
  assert.equal(parseImportDate('2100-02-28'), '2100-02-28')
  assert.equal(parseImportDate('2026-12-31'), '2026-12-31')
})

test('parseImportDate reads ISO instants and month-only cells', () => {
  assert.equal(parseImportDate('2026-06-01T00:00:00.000Z'), '2026-06-01')
  assert.equal(parseImportDate('2026-06'), '2026-06-01')
  assert.equal(parseImportDate('2026-06-01'), '2026-06-01')
})

test('parseImportDate keeps the documented day-first numeric convention', () => {
  assert.equal(parseImportDate('01/08/2026'), '2026-08-01')
  assert.equal(parseImportDate('1-8-26'), '2026-08-01')
  assert.equal(parseImportDate('15/08/2026'), '2026-08-15')
})

test('Excel serial values are converted from the raw number', () => {
  assert.equal(excelSerialToYmd(45908), '2025-09-08')
  assert.equal(excelSerialToYmd(45870), '2025-08-01')
  assert.equal(excelSerialToYmd(46258), '2026-08-24')
  assert.equal(parseImportDate(45908), '2025-09-08')
})

test('out-of-range serials and blanks are never guessed', () => {
  assert.equal(parseImportDate(60), null)
  assert.equal(parseImportDate(0), null)
  assert.equal(parseImportDate(''), null)
  assert.equal(parseImportDate('   '), null)
  assert.equal(parseImportDate(null), null)
  assert.equal(parseImportDate(undefined), null)
  assert.equal(parseImportDate('not a date'), null)
})

test('dateToCalendarYmd answers UTC-midnight instants exactly', () => {
  assert.equal(dateToCalendarYmd(new Date('2026-08-24T00:00:00.000Z')), '2026-08-24')
  assert.equal(dateToCalendarYmd(new Date('2025-09-08T00:00:00.000Z')), '2025-09-08')
  // Near-midnight instants produced by local-time Date construction round back.
  assert.equal(dateToCalendarYmd(new Date('2026-08-23T18:59:48.000Z')), '2026-08-24')
})

test('civilDayDiff is a whole-day difference and tolerates bad input', () => {
  assert.equal(civilDayDiff('2026-06-01', '2026-06-30'), 29)
  assert.equal(civilDayDiff('2026-06-30', '2026-06-01'), -29)
  assert.equal(civilDayDiff('2025-12-31', '2026-01-01'), 1)
  assert.equal(civilDayDiff('2024-02-28', '2024-03-01'), 2)
  assert.equal(civilDayDiff('2026-06-01', '2026-06-01'), 0)
  assert.equal(civilDayDiff('2026-02-30', '2026-03-01'), null)
  assert.equal(civilDayDiff('nope', '2026-03-01'), null)
})

test('todayCivilYmd answers the process-local civil day, not the UTC day', () => {
  const local = new Date(2026, 5, 1, 0, 30, 0)
  assert.equal(todayCivilYmd(local), '2026-06-01')
})
