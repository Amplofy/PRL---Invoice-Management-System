import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, ArrowUpRight, FileSearch } from 'lucide-react'
import { formatMoney, formatDate } from '../../lib/format'
import StatusBadge, { statusTone } from './StatusBadge'

export interface DrillRow {
  id: string
  invoice_no: string
  invoice_date: string | null
  vendor: string
  contract_no: string
  amount: number
  status: string
}

interface ChartDrillDownProps {
  open: boolean
  title: string
  subtitle: string
  rows: DrillRow[]
  onClose: () => void
}

export default function ChartDrillDown({ open, title, subtitle, rows, onClose }: ChartDrillDownProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-[var(--glass-border-strong)] bg-[var(--bg-2)] shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-border)] p-5">
          <div className="flex items-start gap-3">
            <span className="kpi-icon flex h-9 w-9 shrink-0 items-center justify-center text-white" style={{ background: 'var(--gradient-primary)' }}>
              <FileSearch size={16} />
            </span>
            <div>
              <h3 className="text-base font-extrabold tracking-tight">{title}</h3>
              <p className="mt-0.5 text-xs text-[var(--text-dim)]">{subtitle}</p>
            </div>
          </div>
          <button className="btn btn-ghost !px-2 !py-1.5" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-4 border-b border-[var(--glass-border)] px-5 py-3">
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Invoices</div>
            <div className="text-xl font-extrabold tabular-nums">{rows.length}</div>
          </div>
          <div className="h-8 w-px bg-[var(--glass-border)]" />
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Value</div>
            <div className="text-xl font-extrabold tabular-nums gradient-text">Rs {formatMoney(total)}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">No invoices in this slice.</div>
          ) : (
            <div className="space-y-2.5">
              {rows.map((r) => (
                <div key={r.id} className="glass rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">{r.invoice_no || '—'}</div>
                    <StatusBadge tone={statusTone(r.status)}>{r.status}</StatusBadge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {r.vendor || 'Unknown vendor'} · {r.contract_no || 'No contract'}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[0.7rem] text-[var(--text-dim)]">{formatDate(r.invoice_date)}</span>
                    <span className="text-sm font-bold tabular-nums">{formatMoney(r.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--glass-border)] p-4">
          <Link
            to="/invoices"
            onClick={onClose}
            className="btn btn-primary w-full justify-center !py-2.5"
          >
            View all in Invoices <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
    </div>
  )
}
