import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { invoiceBudgetDate, invoiceBudgetFy } from '../src/services/fyLock.js'

describe('invoiceBudgetDate', () => {
  it('prefers service start over invoice date', () => {
    assert.equal(
      invoiceBudgetDate({ service_from: '2026-06-01', invoice_date: '2026-07-10' }),
      '2026-06-01',
    )
  })

  it('falls back to invoice date when service start is missing', () => {
    assert.equal(invoiceBudgetDate({ invoice_date: '2026-07-10' }), '2026-07-10')
  })

  it('assigns Pakistan FY from service start', () => {
    assert.equal(invoiceBudgetFy({ service_from: '2026-06-01', invoice_date: '2026-07-10' }), 'FY25')
    assert.equal(invoiceBudgetFy({ invoice_date: '2026-07-10' }), 'FY26')
  })

  it('keeps 1 July on FY26 even when the string is date-only ISO', () => {
    assert.equal(invoiceBudgetFy({ invoice_date: '2026-07-01' }), 'FY26')
    assert.equal(invoiceBudgetFy({ service_from: '2026-07-01T00:00:00.000Z' }), 'FY26')
  })
})
