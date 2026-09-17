import assert from 'node:assert/strict'
import { test } from 'node:test'
import { optionalNumber } from '../src/services/importService.js'

// Regression: the frontend import wizard sends every schema key, using null for
// unmapped columns. A missing approved_amount used to be coerced to 0, which
// then blanked out the PO amount and the invoice approved amount everywhere.

test('optionalNumber keeps blank cells as null', () => {
  assert.equal(optionalNumber({ approved_amount: null }, 'approved_amount'), null)
  assert.equal(optionalNumber({ approved_amount: '' }, 'approved_amount'), null)
  assert.equal(optionalNumber({ approved_amount: '   ' }, 'approved_amount'), null)
  assert.equal(optionalNumber({}, 'approved_amount'), null)
  assert.equal(optionalNumber({ approved_amount: undefined }, 'approved_amount'), null)
})

test('optionalNumber still parses real values', () => {
  assert.equal(optionalNumber({ amount: 13800 }, 'amount'), 13800)
  assert.equal(optionalNumber({ amount: '13,800' }, 'amount'), 13800)
  assert.equal(optionalNumber({ amount: '22080.50' }, 'amount'), 22080.5)
  assert.equal(optionalNumber({ amount: '0' }, 'amount'), 0)
})

test('optionalNumber rejects unreadable values', () => {
  assert.equal(optionalNumber({ amount: 'N/A' }, 'amount'), null)
  assert.equal(optionalNumber({ amount: '-' }, 'amount'), null)
  assert.equal(optionalNumber({ amount: NaN }, 'amount'), null)
})

test('a workbook row with no approved column imports a null approved_amount', () => {
  const canonicalRow: Record<string, unknown> = {
    serial_no: '182-25',
    processing_date: '2025-09-17',
    contract_no: 'AL-TNS-25',
    invoice_no: 'AT-76',
    invoice_date: '2025-09-08',
    amount: 22080,
    approved_amount: null,
    service_from: null,
    service_to: null,
    status: 'Approved',
  }
  assert.equal(optionalNumber(canonicalRow, 'approved_amount'), null)
  assert.equal(optionalNumber(canonicalRow, 'amount'), 22080)
})
