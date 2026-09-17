import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bulkSummary,
  invoiceApprovedAmount,
  isAwaitingFinance,
  isFinanceRole,
  normalizePoStatus,
  poGeneratedAmount,
  poReleasedAmount,
  rejectPatch,
  releasePatch,
} from '../src/services/poFinance.js'

describe('poFinance', () => {
  it('uses approved_amount when present', () => {
    assert.equal(invoiceApprovedAmount({ amount: 100, approved_amount: 80 }), 80)
    assert.equal(invoiceApprovedAmount({ amount: 100, approved_amount: null }), 100)
  })

  it('treats a zero approved_amount as unset so it cannot mask the invoice amount', () => {
    assert.equal(invoiceApprovedAmount({ amount: 100, approved_amount: 0 }), 100)
    assert.equal(invoiceApprovedAmount({ amount: 100, approved_amount: '0.00' }), 100)
    assert.equal(invoiceApprovedAmount({ amount: 100, approved_amount: '' }), 100)
    assert.equal(invoiceApprovedAmount({ amount: 0, approved_amount: 0 }), 0)
  })

  it('falls back to invoice approved amount for generated PO amount', () => {
    assert.equal(poGeneratedAmount({ amount: 50 }, { amount: 100, approved_amount: 90 }), 50)
    assert.equal(poGeneratedAmount({ amount: null }, { amount: 100, approved_amount: 90 }), 90)
  })

  it('recovers a legacy zero PO amount from the invoice', () => {
    assert.equal(poGeneratedAmount({ amount: 0 }, { amount: 100, approved_amount: null }), 100)
    assert.equal(poGeneratedAmount({ amount: '0' }, { amount: 100, approved_amount: 90 }), 90)
    assert.equal(poGeneratedAmount({ amount: 0 }, { amount: 0, approved_amount: 0 }), 0)
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

  it('treats only Generated as awaiting finance', () => {
    assert.equal(isAwaitingFinance('Generated'), true)
    assert.equal(isAwaitingFinance(null), true)
    assert.equal(isAwaitingFinance('Bogus'), true)
    assert.equal(isAwaitingFinance('Cleared'), false)
    assert.equal(isAwaitingFinance('Rejected'), false)
  })

  it('builds a release patch that settles the PO with one shared channel', () => {
    const patch = releasePatch({
      email: 'finance@example.com',
      now: '2026-09-17T00:00:00.000Z',
      releasedAmount: 432,
      releasedVia: 'bank_transfer',
      releaseReference: 'REF-9',
      remarks: 'Bulk release',
    })
    assert.deepEqual(patch, {
      status: 'Cleared',
      finance_approved_by: 'finance@example.com',
      finance_approved_at: '2026-09-17T00:00:00.000Z',
      finance_remarks: 'Bulk release',
      released_amount: 432,
      released_by: 'finance@example.com',
      released_at: '2026-09-17T00:00:00.000Z',
      released_via: 'bank_transfer',
      release_reference: 'REF-9',
    })
  })

  it('defaults optional release patch fields to null', () => {
    const patch = releasePatch({ now: '2026-09-17T00:00:00.000Z', releasedAmount: 0 })
    assert.equal(patch.finance_approved_by, null)
    assert.equal(patch.finance_remarks, null)
    assert.equal(patch.released_via, null)
    assert.equal(patch.release_reference, null)
    assert.equal(patch.released_amount, 0)
  })

  it('builds a reject patch that clears every release column', () => {
    const patch = rejectPatch({ email: 'finance@example.com', now: '2026-09-17T00:00:00.000Z', reason: 'Wrong surveyor' })
    assert.equal(patch.status, 'Rejected')
    assert.equal(patch.finance_approved_by, 'finance@example.com')
    assert.equal(patch.finance_remarks, 'Wrong surveyor')
    assert.equal(patch.released_amount, null)
    assert.equal(patch.released_by, null)
    assert.equal(patch.released_at, null)
    assert.equal(patch.released_via, null)
    assert.equal(patch.release_reference, null)
  })

  it('summarises a mixed bulk outcome with serial lists', () => {
    const summary = bulkSummary([
      { serial: 'PO-1', outcome: 'succeeded' },
      { serial: 'PO-2', outcome: 'skipped' },
      { serial: 'PO-3', outcome: 'failed' },
      { serial: 'PO-4', outcome: 'succeeded' },
      { serial: 'PO-5', outcome: 'skipped' },
    ])
    assert.deepEqual(summary, {
      succeeded: 2,
      skipped: 2,
      failed: 1,
      skippedSerials: ['PO-2', 'PO-5'],
      failedSerials: ['PO-3'],
    })
  })

  it('drops blank serials from the bulk summary lists', () => {
    const summary = bulkSummary([
      { serial: null, outcome: 'skipped' },
      { serial: '   ', outcome: 'failed' },
      { serial: 'PO-7', outcome: 'failed' },
    ])
    assert.equal(summary.skipped, 1)
    assert.equal(summary.failed, 2)
    assert.deepEqual(summary.skippedSerials, [])
    assert.deepEqual(summary.failedSerials, ['PO-7'])
  })
})
