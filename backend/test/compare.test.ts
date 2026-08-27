import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareFiles } from '../src/services/compareService.js'

const BASE = [
  { code: 'A1', qty: '100', price: '10' },
  { code: 'A2', qty: '200', price: '20' },
  { code: 'A3', qty: '300', price: '30' },
]

test('compareFiles returns no mismatches for identical data', () => {
  const result = compareFiles(BASE, [...BASE], { joinKey: 'code', columns: ['qty', 'price'] })
  assert.equal(result.summary.mismatchCount, 0)
  assert.equal(result.summary.missingInCompare, 0)
  assert.equal(result.summary.missingInBase, 0)
})

test('compareFiles flags value mismatch', () => {
  const compare = [
    { code: 'A1', qty: '150', price: '10' },
    { code: 'A2', qty: '200', price: '20' },
    { code: 'A3', qty: '300', price: '30' },
  ]
  const result = compareFiles(BASE, compare, { joinKey: 'code', columns: ['qty', 'price'] })
  assert.equal(result.summary.mismatchCount, 1)
  assert.equal(result.mismatches[0]!.keyValue, 'a1')
  assert.equal(result.mismatches[0]!.column, 'qty')
  assert.equal(result.mismatches[0]!.baseValue, '100')
  assert.equal(result.mismatches[0]!.compareValue, '150')
})

test('compareFiles flags row missing in compare', () => {
  const compare = [
    { code: 'A1', qty: '100', price: '10' },
    { code: 'A2', qty: '200', price: '20' },
  ]
  const result = compareFiles(BASE, compare, { joinKey: 'code', columns: ['qty'] })
  assert.equal(result.summary.missingInCompare, 1)
  assert.equal(result.missingInCompare[0]!.keyValue, 'a3')
})

test('compareFiles flags row missing in base', () => {
  const compare = [
    { code: 'A1', qty: '100', price: '10' },
    { code: 'A2', qty: '200', price: '20' },
    { code: 'A3', qty: '300', price: '30' },
    { code: 'A4', qty: '400', price: '40' },
  ]
  const result = compareFiles(BASE, compare, { joinKey: 'code', columns: ['qty'] })
  assert.equal(result.summary.missingInBase, 1)
  assert.equal(result.missingInBase[0]!.keyValue, 'a4')
})

test('compareFiles honors numeric tolerance', () => {
  const compare = [
    { code: 'A1', qty: '100.005', price: '10' },
    { code: 'A2', qty: '200', price: '20' },
    { code: 'A3', qty: '300', price: '30' },
  ]
  const strict = compareFiles(BASE, compare, { joinKey: 'code', columns: ['qty'] })
  assert.equal(strict.summary.mismatchCount, 1)
  const loose = compareFiles(BASE, compare, { joinKey: 'code', columns: ['qty'], tolerance: 0.01 })
  assert.equal(loose.summary.mismatchCount, 0)
})

test('compareFiles handles missing join key gracefully', () => {
  const result = compareFiles(BASE, BASE, { joinKey: 'nonexistent', columns: ['qty'] })
  assert.equal(result.summary.mismatchCount, 0)
})
