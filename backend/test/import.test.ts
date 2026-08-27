import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateVendorRow, validateContractRow } from '../src/services/importService.js'

test('validateVendorRow accepts valid vendor', () => {
  assert.deepEqual(validateVendorRow({ name: 'ABC Co' }), [])
})

test('validateVendorRow rejects missing name', () => {
  const errors = validateVendorRow({ vendor: '' })
  assert.ok(errors.length > 0)
})

test('validateContractRow accepts valid contract', () => {
  const errors = validateContractRow({
    contract_no: 'BH-LD-26',
    vendor_name: 'ABC',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    value: '5000000',
  })
  assert.deepEqual(errors, [])
})

test('validateContractRow rejects end before start', () => {
  const errors = validateContractRow({
    contract_no: 'X',
    vendor_name: 'ABC',
    start_date: '2026-12-31',
    end_date: '2026-01-01',
    value: '100',
  })
  assert.ok(errors.some((e) => e.includes('End date')))
})

test('validateContractRow rejects negative value', () => {
  const errors = validateContractRow({
    contract_no: 'X',
    vendor_name: 'ABC',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    value: '-5',
  })
  assert.ok(errors.some((e) => e.includes('positive')))
})
