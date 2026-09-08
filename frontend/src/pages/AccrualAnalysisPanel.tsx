import { formatDate, formatMoney } from '../lib/format'
import { invoiceBudgetDate, isClosedFiscalYear, shiftFiscalYear } from '../lib/fiscal'
import type { AccrualSortKey, CostBreakRow } from '../lib/fyAnalysis'
import type { AccrualSnapshot } from '../lib/accrual'

interface AccrualInvoiceRow {
  id: string
  invoice_no: string | null
  invoice_date: string | null
  service_to?: string | null
  status: string | null
  amount: number
}

interface AccrualYearRow extends AccrualSnapshot {
  invoices?: AccrualInvoiceRow[]
}

interface Props {
  reportFy: string
  runningFy: string
  remaining: number
  budget: number
  yearReleased: number
  accrual: AccrualYearRow | null
  priorAccrual: AccrualYearRow | null
  years: AccrualYearRow[]
  tableRows: AccrualYearRow[]
  tableFy: string
  onTableFy: (v: string) => void
  minBalance: string
  onMinBalance: (v: string) => void
  sort: AccrualSortKey
  onSort: (v: AccrualSortKey) => void
  costBreak: CostBreakRow[]
  ledgerFy: string
  ledgerRows: AccrualInvoiceRow[]
  ledgerSort: 'date' | 'amount'
  onLedgerSort: (v: 'date' | 'amount') => void
}

export default function AccrualAnalysisPanel({
  reportFy,
  runningFy,
  remaining,
  budget,
  yearReleased,
  accrual,
  priorAccrual,
  years,
  tableRows,
  tableFy,
  onTableFy,
  minBalance,
  onMinBalance,
  sort,
  onSort,
  costBreak,
  ledgerFy,
  ledgerRows,
  ledgerSort,
  onLedgerSort,
}: Props) {
  const closed = isClosedFiscalYear(reportFy)
  const priorFy = shiftFiscalYear(runningFy, -1)
  const snap = closed ? accrual : priorAccrual

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{reportFy} remaining</div>
          <div className="mt-1 text-2xl font-black text-[var(--accent-3)]">Rs {formatMoney(closed ? 0 : remaining)}</div>
          <p className="mt-1 text-xs text-[var(--text-dim)]">
            {closed
              ? 'Closed year uses Accrual Balance, not remaining budget.'
              : `Yearly budget Rs ${formatMoney(budget)} minus released Rs ${formatMoney(yearReleased)}`}
          </p>
        </div>
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {closed ? `${reportFy} Accrual Balance` : `${priorFy} Accrual Balance`}
          </div>
          <div className="mt-1 text-2xl font-black">Rs {formatMoney(snap?.balance ?? 0)}</div>
          <p className="mt-1 text-xs text-[var(--text-dim)]">Stays off running remaining</p>
        </div>
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Sundry Accrual</div>
          <div className="mt-1 text-2xl font-black">Rs {formatMoney(snap?.secured ?? 0)}</div>
          <p className="mt-1 text-xs text-[var(--text-dim)]">Secured unpaid of that closed year</p>
        </div>
      </div>

      <div className="report-card glass p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-sm font-bold">Closed-year accrual ledger</div>
            <p className="mt-1 text-xs text-[var(--text-dim)]">Filter and sort past years. Payments stay off {runningFy} remaining.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input input-fit py-1!" value={tableFy} onChange={(e) => onTableFy(e.target.value)}>
              <option value="all">All closed FYs</option>
              {years.filter((y) => isClosedFiscalYear(y.fy)).map((y) => (
                <option key={y.fy} value={y.fy}>{y.fy}</option>
              ))}
            </select>
            <input className="input input-fit-sm py-1!" type="number" min={0} placeholder="Min balance" value={minBalance} onChange={(e) => onMinBalance(e.target.value)} />
            <select className="input input-fit py-1!" value={sort} onChange={(e) => onSort(e.target.value as AccrualSortKey)}>
              <option value="fy">Sort FY</option>
              <option value="secured">Sort accrual</option>
              <option value="unpaid">Sort unpaid</option>
              <option value="consumed">Sort released</option>
              <option value="balance">Sort balance</option>
            </select>
          </div>
        </div>
        {tableRows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">No closed-year accrual matches the filter.</p>
        ) : (
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>FY</th>
                  <th className="text-right">Sundry Accrual</th>
                  <th className="text-right">Unpaid</th>
                  <th className="text-right">Released in year</th>
                  <th className="text-right">Accrual Balance</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.fy}>
                    <td className="font-semibold">{row.fy}</td>
                    <td className="text-right tabular-nums">Rs {formatMoney(row.secured)}</td>
                    <td className="text-right tabular-nums">Rs {formatMoney(row.unpaid)}</td>
                    <td className="text-right tabular-nums">Rs {formatMoney(row.consumed)}</td>
                    <td className="text-right font-semibold tabular-nums">Rs {formatMoney(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="report-card glass p-5">
        <div className="text-sm font-bold">{reportFy} cost-element breakup</div>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          {closed ? 'Unpaid by cost element on Accrual Balance.' : 'Remaining = yearly line minus released of this year.'}
        </p>
        {costBreak.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">No cost-element lines for {reportFy}.</p>
        ) : (
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cost element</th>
                  <th className="text-right">Yearly budget</th>
                  <th className="text-right">Released</th>
                  <th className="text-right">{closed ? 'Unpaid' : 'Remaining'}</th>
                </tr>
              </thead>
              <tbody>
                {costBreak.map((row) => (
                  <tr key={row.code}>
                    <td className="font-semibold">{row.code}</td>
                    <td className="text-right tabular-nums">Rs {formatMoney(row.budget)}</td>
                    <td className="text-right tabular-nums">Rs {formatMoney(row.released)}</td>
                    <td className="text-right font-semibold tabular-nums">Rs {formatMoney(closed ? row.unpaid : row.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="report-card glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold">{ledgerFy} unpaid invoices</div>
          <div className="flex gap-2">
            <button className={`btn btn-ghost btn-sm${ledgerSort === 'date' ? ' is-active' : ''}`} onClick={() => onLedgerSort('date')}>Sort date</button>
            <button className={`btn btn-ghost btn-sm${ledgerSort === 'amount' ? ' is-active' : ''}`} onClick={() => onLedgerSort('amount')}>Sort amount</button>
          </div>
        </div>
        {ledgerRows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">No unpaid invoices on {ledgerFy}.</p>
        ) : (
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Service end</th>
                  <th>Status</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-semibold">{row.invoice_no ?? row.id}</td>
                    <td>{formatDate(invoiceBudgetDate(row))}</td>
                    <td>{row.status ?? '—'}</td>
                    <td className="text-right font-semibold tabular-nums">Rs {formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
