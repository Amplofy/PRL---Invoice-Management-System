import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Kanban, Clock, ArrowRight } from 'lucide-react'
import { apiGet } from '../lib/api'
import { formatMoney, timeAgo } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import { currentFiscalYear } from '../lib/fiscal'
import { invoiceListPath } from '../lib/invoiceWindow'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'

interface ServiceMatrixRow {
  id: string
  t1: string
  t2: string | null
  t3: string | null
  cost_element: string | null
  tanker_required: boolean
  trips: boolean
}

interface InvoiceLite {
  id: string
  serial_no: string | null
  invoice_no: string | null
  invoice_date: string | null
  amount: number
  status: string
  t1: string | null
  t2: string | null
  t3: string | null
  tanker_name: string | null
  contracts: { contract_no: string | null; vendors: Array<{ name: string | null }> | null } | null
}

interface ColumnDef {
  status: string
  title: string
  tone: 'warn' | 'ok' | 'err'
  hint: string
}

const COLUMNS: ColumnDef[] = [
  { status: 'Pending', title: 'Pending', tone: 'warn', hint: 'Awaiting decision' },
  { status: 'Approved', title: 'Approved', tone: 'ok', hint: 'Cleared for payment' },
  { status: 'Rejected', title: 'Rejected', tone: 'err', hint: 'Sent back to vendor' },
]

export default function WorkflowPage() {
  const [matrix, setMatrix] = useState<ServiceMatrixRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceLite[]>([])
  const [t1, setT1] = useState('')
  const [t2, setT2] = useState('')
  const [t3, setT3] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [m, i] = await Promise.all([
          apiGet<{ serviceMatrix: ServiceMatrixRow[] }>('/api/service-matrix'),
          apiGet<{ invoices: InvoiceLite[] }>(invoiceListPath({ fy: currentFiscalYear() })),
        ])
        setMatrix(m.serviceMatrix)
        setInvoices(i.invoices)
      } catch (e) {
        toast.error('Failed to load workflow data', (e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [toast])

  const t1Options = useMemo(() => Array.from(new Set(matrix.map((m) => m.t1))).sort(), [matrix])
  const t2Options = useMemo(() => {
    const rows = t1 ? matrix.filter((m) => m.t1 === t1) : matrix
    return Array.from(new Set(rows.map((m) => m.t2 ?? '').filter(Boolean))).sort()
  }, [matrix, t1])
  const t3Options = useMemo(() => {
    const rows = t1 && t2 ? matrix.filter((m) => m.t1 === t1 && (m.t2 ?? '') === t2) : t1 ? matrix.filter((m) => m.t1 === t1) : matrix
    return Array.from(new Set(rows.map((m) => m.t3 ?? '').filter(Boolean))).sort()
  }, [matrix, t1, t2])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return invoices.filter((i) => {
      if (t1 && i.t1 !== t1) return false
      if (t2 && i.t2 !== t2) return false
      if (t3 && i.t3 !== t3) return false
      if (q) {
        const hay = `${i.invoice_no ?? ''} ${i.serial_no ?? ''} ${i.contracts?.contract_no ?? ''} ${i.contracts?.vendors?.[0]?.name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [invoices, t1, t2, t3, search])

  const total = useMemo(() => filtered.reduce((s, i) => s + Number(i.amount ?? 0), 0), [filtered])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflow Board"
        description="Drag-free kanban over the invoice lifecycle — click any card to open its workspace."
        actions={
          <div className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]">
            <Kanban size={14} className="mr-1.5 inline text-[var(--accent)]" />
            {filtered.length} invoices · <span className="font-bold text-[var(--text)]">Rs {formatMoney(total)}</span>
          </div>
        }
      />

      <GlassCard className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">T1</span>
            <select className="input" value={t1} onChange={(e) => { setT1(e.target.value); setT2(''); setT3('') }}>
              <option value="">All T1</option>
              {t1Options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">T2</span>
            <select
              className="input"
              value={t2}
              onChange={(e) => { setT2(e.target.value); setT3('') }}
              disabled={!t1}
            >
              <option value="">All T2</option>
              {t2Options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">T3</span>
            <select className="input" value={t3} onChange={(e) => setT3(e.target.value)} disabled={!t1}>
              <option value="">All T3</option>
              {t3Options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Search</span>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input className="input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Vendor, invoice…" />
            </div>
          </label>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = filtered.filter((i) => i.status === col.status)
          const value = items.reduce((s, i) => s + Number(i.amount ?? 0), 0)
          return (
            <div key={col.status} className="glass flex min-h-[320px] flex-col p-4">
              <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <StatusBadge tone={col.tone}>{col.title}</StatusBadge>
                  <span className="text-xs text-[var(--text-muted)]">{col.hint}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums">{items.length}</div>
                  <div className="text-[0.65rem] text-[var(--text-muted)]">Rs {formatMoney(value)}</div>
                </div>
              </div>
              <div className="kanban-scroll flex-1 space-y-2.5 overflow-y-auto pr-0.5">
                {items.map((i) => (
                  <Link
                    key={i.id}
                    to={`/invoices/${i.id}`}
                    className={`kanban-card ${col.status.toLowerCase()}`}
                    title="Open invoice workspace"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[0.7rem] text-[var(--text-muted)]">
                        {i.serial_no ?? '—'}
                      </span>
                      <span className="flex items-center gap-1 text-[0.65rem] text-[var(--text-muted)]">
                        <Clock size={10} /> {timeAgo(i.invoice_date)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-bold">{i.invoice_no ?? '—'}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-dim)]">
                      {i.contracts?.vendors?.[0]?.name ?? '—'}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="badge badge-info !text-[0.6rem]">{i.contracts?.contract_no ?? '—'}</span>
                      <span className="text-sm font-extrabold">Rs {formatMoney(i.amount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[0.65rem] text-[var(--text-muted)]">
                      <span className="truncate">{[i.t1, i.t2, i.t3].filter(Boolean).join(' → ') || '—'}</span>
                      <ArrowRight size={11} className="shrink-0" />
                    </div>
                  </Link>
                ))}
                {items.length === 0 && (
                  <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[var(--border)]">
                    <span className="text-xs text-[var(--text-muted)]">
                      {loading ? 'Loading…' : 'No invoices here'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <GlassCard>
          <EmptyState title="No invoices match" description="Adjust the T1/T2/T3 cascade or clear the search." />
        </GlassCard>
      )}
    </div>
  )
}
