import { formatMoney, formatDate } from '../../lib/format'
import { utilizationTone, type ContractLite, type Utilization } from '../../lib/invoice'

interface ContractSummaryPanelProps {
  contract: ContractLite | null
  utilization: Utilization | null
  draftAmount?: number
  invoiceCountNote?: string
}

export default function ContractSummaryPanel({
  contract,
  utilization,
  draftAmount = 0,
  invoiceCountNote,
}: ContractSummaryPanelProps) {
  if (!contract || !utilization) {
    return (
      <div className="glass p-5">
        <div className="section-title">Contract Summary</div>
        <div className="py-6 text-center text-sm text-[var(--text-muted)]">
          Select a contract to see live utilization
        </div>
      </div>
    )
  }

  const stampedUsed = utilization.used + draftAmount
  const stampedRemaining = contract.value - stampedUsed
  const stampedPct = contract.value > 0 ? (stampedUsed / contract.value) * 100 : 0
  const tone = utilizationTone(stampedPct)
  const remainingTone = utilizationTone(utilization.pct)

  return (
    <div className="glass p-5">
      <div className="section-title">Contract Summary</div>
      <div className="space-y-3">
        <div>
          <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Contract ID
          </div>
          <div className="text-sm font-bold">{contract.contract_no}</div>
        </div>
        {contract.vendor && (
          <div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Vendor
            </div>
            <div className="text-sm">{contract.vendor}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Start</div>
            <div className="text-xs">{formatDate(contract.start_date)}</div>
          </div>
          <div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">End</div>
            <div className="text-xs">{formatDate(contract.end_date)}</div>
          </div>
        </div>

        <div className="border-t border-[var(--border)]" />

        <div>
          <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Contract Value
          </div>
          <div className="text-lg font-bold">Rs {formatMoney(contract.value)}</div>
        </div>
        <div>
          <div className="flex justify-between text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <span>Used (Approved)</span>
            <span>Rs {formatMoney(utilization.used)}</span>
          </div>
          {draftAmount > 0 && (
            <div className="mt-1 flex justify-between text-[0.68rem] font-semibold uppercase tracking-wider">
              <span className="text-[var(--accent)]">+ This invoice</span>
              <span className="text-[var(--accent)]">Rs {formatMoney(draftAmount)}</span>
            </div>
          )}
        </div>
        <div>
          <div
            className="flex justify-between text-[0.68rem] font-semibold uppercase tracking-wider"
            style={{ color: stampedRemaining < 0 ? 'var(--danger)' : 'var(--accent-3)' }}
          >
            <span>{draftAmount > 0 ? 'Remaining (with this invoice)' : 'Remaining'}</span>
            <span>Rs {formatMoney(stampedRemaining)}</span>
          </div>
          <div className={`util-bar mt-1.5 ${tone}`}>
            <span style={{ width: `${Math.min(100, stampedPct)}%` }} />
          </div>
          <div className="mt-1 text-[0.68rem] text-[var(--text-muted)]">
            {stampedPct.toFixed(1)}% utilized · {invoiceCountNote ?? `${utilization.count} invoice(s)`}
          </div>
        </div>

        {draftAmount > 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[0.68rem] text-[var(--text-dim)]">
            <span className="font-semibold text-[var(--text)]">Stamp preview:</span> this invoice will be
            recorded against {contract.contract_no} at Rs {formatMoney(draftAmount)} —{' '}
            {stampedRemaining < 0 ? (
              <span className="font-semibold text-[var(--danger)]">
                over contract limit by Rs {formatMoney(Math.abs(stampedRemaining))}
              </span>
            ) : (
              <span className="font-semibold text-[var(--accent-3)]">
                Rs {formatMoney(stampedRemaining)} would remain
              </span>
            )}
            {' · '}
            <span className="text-[var(--text-muted)]">
              approved-only usage now Rs {formatMoney(utilization.used)} ({remainingTone})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
