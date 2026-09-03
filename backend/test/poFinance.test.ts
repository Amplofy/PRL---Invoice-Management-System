import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  invoiceApprovedAmount,
  isFinanceRole,
  normalizePoStatus,
  poGeneratedAmount,
  poReleasedAmount,
} from '../src/services/poFinance.js'

describe('poFinance', () => {
  it('uses approved_amount when present', () => {
    assert.equal(invoiceApprovedAmount({ amount: 100, approved_amount: 80 }), 80)
    assert.equal(invoiceApprovedAmount({ amount: 100, approved_amount: null }), 100)
  })

  it('falls back to invoice approved amount for generated PO amount', () => {
    assert.equal(poGeneratedAmount({ amount: 50 }, { amount: 100, approved_amount: 90 }), 50)
    assert.equal(poGeneratedAmount({ amount: null }, { amount: 100, approved_amount: 90 }), 90)
  })

  it('counts released amount only when cleared', () => {
    assert.equal(poReleasedAmount({ status: 'Generated', amount: 90, released_amount: 90 }), 0)
    assert.equal(poReleasedAmount({ status: 'Cleared', amount: 90, released_amount: 88 }), 88)
    assert.equal(poReleasedAmount({ status: 'Cleared', amount: 90, released_amount: null }), 90)
  })

  it('recognises finance officials', () => {
    assert.equal(isFinanceRole('finance'), true)
    assert.equal(isFinanceRole('admin'), true)
    assert.equal(isFinanceRole('approver'), false)
  })

  it('normalises unknown PO status to Generated', () => {
    assert.equal(normalizePoStatus(null), 'Generated')
    assert.equal(normalizePoStatus('Cleared'), 'Cleared')
  })
})
