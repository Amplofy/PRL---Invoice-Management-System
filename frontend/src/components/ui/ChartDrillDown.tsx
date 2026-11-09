import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X, ArrowUpRight, FileSearch, Download, Search } from 'lucide-react'
import { formatMoney, formatDate } from '../../lib/format'
import { downloadTableWorkbook } from '../../lib/analysisWorkbook'
import { invoicesListPath, type InvoiceListQuery } from '../../lib/invoiceListQuery'
import StatusBadge, { statusTone } from './StatusBadge'
import SelectMenu from './SelectMenu'

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
  listQuery?: InvoiceListQuery
  onClose: () => void
}

export default function ChartDrillDown({ open, title, subtitle, rows, listQuery, onClose }: ChartDrillDownProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    if (!open) return
    setQuery('')
    setStatus('all')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  const statuses = [...new Set(rows.map((r) => r.status).filter(Boolean))]
  const visible = rows.filter((r) => {
    if (status !== 'all' && r.status !== status) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return `${r.invoice_no} ${r.vendor} ${r.contract_no} ${r.status}`.toLowerCase().includes(q)
  })
  const total = visible.reduce((s, r) => s + Number(r.amount ?? 0), 0)

  const exportRows = async () => {
    await downloadTableWorkbook({
      filename: `PRL-EOMS-${title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 40)}.xlsx`,
      title,
      subtitle,
      columns: [
        { key: 'invoice_no', header: 'Invoice no', width: 16 },
        { key: 'invoice_date', header: 'Invoice date', kind: 'date', width: 14 },
        { key: 'vendor', header: 'Vendor', width: 24 },
        { key: 'contract_no', header: 'Contract', width: 16 },
        { key: 'status', header: 'Status', width: 12 },
        { key: 'amount', header: 'Amount (Rs)', kind: 'money', width: 16 },
      ],
      rows: visible.map((r) => ({ ...r })),
      grandTotal: true,
    })
  }

  const invoicesHref = invoicesListPath({
    ...listQuery,
    q: query.trim() || listQuery?.q,
    status: status !== 'all' ? status : listQuery?.status,
  })

  return createPortal(
    <div className={`drill-overlay ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="drill-overlay-dim" onClick={onClose} />
      <aside
        className="drill-overlay-panel"
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
          <button className="btn btn-ghost px-2! py-1.5!" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-4 border-b border-[var(--glass-border)] px-5 py-3">
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Invoices</div>
            <div className="text-xl font-extrabold tabular-nums">{visible.length}</div>
          </div>
          <div className="h-8 w-px bg-[var(--glass-border)]" />
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Value</div>
            <div className="text-xl font-extrabold tabular-nums gradient-text">Rs {formatMoney(total)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-[var(--glass-border)] px-5 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="input pl-8!"
              placeholder="Filter invoices, vendors…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {statuses.length > 1 && (
            <SelectMenu
              value={status}
              onChange={setStatus}
              placeholder="All statuses"
              options={[{ value: 'all', label: 'All statuses' }, ...statuses.map((s) => ({ value: s, label: s }))]}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">No invoices in this slice.</div>
          ) : (
            <div className="space-y-2.5">
              {visible.map((r) => (
                <Link
                  key={r.id}
                  to={`/invoices/${r.id}`}
                  onClick={onClose}
                  className="glass drill-row block rounded-xl p-3.5"
                >
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
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--glass-border)] p-4">
          <button type="button" className="btn btn-ghost flex-1 justify-center py-2.5!" onClick={() => void exportRows()} disabled={visible.length === 0}>
            <Download size={15} /> Excel
          </button>
          <Link
            to={invoicesHref}
            onClick={onClose}
            className="btn btn-primary flex-1 justify-center py-2.5!"
          >
            Invoices <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
