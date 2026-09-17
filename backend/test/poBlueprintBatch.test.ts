import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  paymentOrderBatchHtml,
  paymentOrderBlueprintHtml,
  type PoPrintBatchItem,
} from '../../frontend/src/lib/poBlueprint.js'

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function item(serial: string, invoiceNo: string, amount: number): PoPrintBatchItem {
  return {
    order: {
      serial_no: serial,
      generated_at: '2026-07-30',
      released_via: 'cheque',
      release_reference: 'CHQ-1',
      invoices: {
        invoice_no: invoiceNo,
        invoice_date: '2026-07-27',
        processing_date: '2026-07-30',
        service_from: '2026-07-01',
        service_to: '2026-07-31',
        amount,
        cost_element: '51201',
      },
    },
    extras: {
      vendor: 'M/s Karachi Surveyors',
      amount,
      logoUrl: 'https://example.test/logo.png',
      costCenter: '11369',
    },
  }
}

describe('poBlueprint batch print', () => {
  it('renders one batch item and one sheet per selected order', () => {
    const html = paymentOrderBatchHtml([
      item('PO-1', 'INV-1', 100),
      item('PO-2', 'INV-2', 200),
      item('PO-3', 'INV-3', 300),
    ])
    assert.equal(count(html, 'class="batch-item"'), 3)
    assert.equal(count(html, 'class="sheet"'), 3)
  })

  it('breaks pages between sheets and not after the last one', () => {
    const html = paymentOrderBatchHtml([item('PO-1', 'INV-1', 100), item('PO-2', 'INV-2', 200)])
    assert.match(html, /break-after: page/)
    assert.match(html, /\.batch-item:last-child \{ break-after: auto; \}/)
  })

  it('calls the print dialog exactly once for the whole batch', () => {
    const html = paymentOrderBatchHtml([item('PO-1', 'INV-1', 100), item('PO-2', 'INV-2', 200)])
    assert.equal(count(html, 'window.print()'), 1)
  })

  it('keeps the single-order document to one sheet and one print call', () => {
    const { order, extras } = item('PO-1', 'INV-1', 100)
    const html = paymentOrderBlueprintHtml(order, extras)
    assert.equal(count(html, 'class="sheet"'), 1)
    assert.equal(count(html, 'window.print()'), 1)
  })
})
