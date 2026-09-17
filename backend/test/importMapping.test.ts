import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildColumns, dataRows, detectHeaderRow } from '../../frontend/src/lib/importParser.ts'
import { IMPORT_SCHEMAS, applyMapping, autoMap, norm } from '../../frontend/src/lib/importMapping.ts'
import { invoiceApprovedAmount } from '../src/services/poFinance.js'
import { invoiceBudgetFy } from '../src/services/fyLock.js'

const schema = IMPORT_SCHEMAS.invoices
const aliasSet = new Set(schema.flatMap((el) => el.aliases.map(norm)))

function pipeline(matrix: unknown[][]) {
  const headerRowIdx = detectHeaderRow(matrix, aliasSet)
  const columns = buildColumns(matrix, headerRowIdx, [])
  const mapping = autoMap(columns, schema)
  const rows = applyMapping(dataRows(matrix, headerRowIdx), columns, schema, mapping)
  return { columns, mapping, rows }
}

function columnHeaderFor(mapping: Record<string, { columnKey: string | null }>, key: string, columns: Array<{ key: string; header: string }>) {
  const entry = mapping[key]
  if (!entry?.columnKey) return null
  return columns.find((c) => c.key === entry.columnKey)?.header ?? null
}

describe('invoice import mapping', () => {
  it('maps the approval column and ignores a foreign "status" column', () => {
    const matrix = [
      ['Invoice', 'Invoice Date', 'Amount', 'Contract ID', 'Invoice Status', 'Approval'],
      ['AT-523', '2026-07-01', 28750, 'C-1', 'Accepted', 'Approved'],
      ['AT-524', '2026-07-01', 13924, 'C-1', 'Accepted', 'Pending'],
    ]
    const { columns, mapping, rows } = pipeline(matrix)
    assert.equal(columnHeaderFor(mapping, 'status', columns), 'Approval')
    assert.equal(rows[0]?.status, 'Approved')
    assert.equal(rows[1]?.status, 'Pending')
    assert.equal(rows[0]?.status__warn, undefined)
  })

  it('still accepts a plain Status column whose values match', () => {
    const matrix = [
      ['Invoice', 'Invoice Date', 'Amount', 'Contract ID', 'Status'],
      ['AT-1', '2026-07-01', 100, 'C-1', 'Rejected'],
    ]
    const { columns, mapping, rows } = pipeline(matrix)
    assert.equal(columnHeaderFor(mapping, 'status', columns), 'Status')
    assert.equal(rows[0]?.status, 'Rejected')
  })

  it('captures the service month so budget FY follows the service period', () => {
    // 01-Jun-2026 service billed on 01-Jul-2026: SheetJS hands both dates back a
    // few seconds before a local midnight, which previously shifted the day.
    const matrix = [
      ['Invoice', 'Invoice Date', 'Services Month', 'Amount', 'Contract ID', 'Approval'],
      ['AT-523', new Date('2026-06-30T18:59:48.000Z'), new Date('2026-05-31T18:59:48.000Z'), 28750, 'C-1', 'Approved'],
    ]
    const { columns, mapping, rows } = pipeline(matrix)
    const row = rows[0]!
    assert.equal(columnHeaderFor(mapping, 'service_from', columns), 'Services Month')
    assert.equal(row.invoice_date, '2026-07-01')
    assert.equal(row.service_from, '2026-06-01')
    assert.equal(
      invoiceBudgetFy({ service_from: row.service_from as string, invoice_date: row.invoice_date as string }),
      'FY25',
    )
  })

  it('maps the approved snapshot so the real approved amount is captured', () => {
    const matrix = [
      ['Invoice', 'Invoice Date', 'Amount', 'Contract ID', 'Approval', 'Approved_Snapshot'],
      ['AT-1', '2026-07-01', 31050, 'C-1', 'Approved', 31050],
      ['AT-2', '2026-07-01', 26220, 'C-1', 'Approved', 0],
    ]
    const { columns, mapping, rows } = pipeline(matrix)
    assert.equal(columnHeaderFor(mapping, 'approved_amount', columns), 'Approved_Snapshot')
    assert.equal(rows[0]?.approved_amount, 31050)
    assert.equal(rows[1]?.approved_amount, 0)
  })

  it('treats a zero approved amount as unset so the invoice amount drives the PO', () => {
    assert.equal(invoiceApprovedAmount({ amount: 26220, approved_amount: 0 }), 26220)
    assert.equal(invoiceApprovedAmount({ amount: 26220, approved_amount: 31050 }), 31050)
    assert.equal(invoiceApprovedAmount({ amount: 26220, approved_amount: null }), 26220)
    assert.equal(invoiceApprovedAmount({ amount: 26220 }), 26220)
  })
})
