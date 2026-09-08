import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { accrualForFy, isBudgetIncrease, parseReleasedVia } from '../src/services/accrual.js'

describe('accrualForFy', () => {
  it('sums unpaid invoices and consumed cleared POs', () => {
    const snap = accrualForFy(
      'FY25',
      [
        { invoice_date: '2026-05-12', status: 'Paid', amount: 410000 },
        { invoice_date: '2026-06-25', status: 'Approved', amount: 300000 },
        { invoice_date: '2026-07-22', status: 'Approved', amount: 980000 },
      ],
      [
        { status: 'Cleared', released_amount: 410000, amount: 410000, invoices: { invoice_date: '2026-05-12' } },
        { status: 'Generated', amount: 300000, invoices: { invoice_date: '2026-06-25' } },
      ],
      null,
    )
    assert.equal(snap.unpaid, 300000)
    assert.equal(snap.consumed, 410000)
    assert.equal(snap.computed, 710000)
    assert.equal(snap.secured, 710000)
    assert.equal(snap.balance, 300000)
  })

  it('uses override as secured accrual', () => {
    const snap = accrualForFy(
      'FY25',
      [{ invoice_date: '2026-06-25', status: 'Approved', amount: 300000 }],
      [{ status: 'Cleared', released_amount: 100000, amount: 100000, invoices: { invoice_date: '2026-06-01' } }],
      500000,
    )
    assert.equal(snap.secured, 500000)
    assert.equal(snap.balance, 400000)
  })
})

describe('isBudgetIncrease', () => {
  it('treats first entry from zero as not an increase', () => {
    assert.equal(isBudgetIncrease(undefined, 100), false)
    assert.equal(isBudgetIncrease(0, 100), false)
  })

  it('detects a raise of an existing line', () => {
    assert.equal(isBudgetIncrease(100, 150), true)
    assert.equal(isBudgetIncrease(100, 80), false)
  })
})

describe('parseReleasedVia', () => {
  it('accepts known channels and empty as null', () => {
    assert.equal(parseReleasedVia('cheque'), 'cheque')
    assert.equal(parseReleasedVia(''), null)
    assert.equal(parseReleasedVia('wire'), null)
  })
})
