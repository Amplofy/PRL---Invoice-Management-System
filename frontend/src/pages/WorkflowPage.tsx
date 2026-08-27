import { useEffect, useMemo, useState } from 'react'
import { GitBranch, Search } from 'lucide-react'
import { apiGet } from '../lib/api'
import { formatMoney, formatDate } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge, { statusTone } from '../components/ui/StatusBadge'
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

export default function WorkflowPage() {
  const [matrix, setMatrix] = useState<ServiceMatrixRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceLite[]>([])
  const [t1, setT1] = useState('')
  const [t2, setT2] = useState('')
  const [t3, setT3] = useState('')
  const [search, setSearch] = useState('')
  const toast = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [m, i] = await Promise.all([
          apiGet<{ serviceMatrix: ServiceMatrixRow[] }>('/api/service-matrix'),
          apiGet<{ invoices: InvoiceLite[] }>('/api/invoices'),
        ])
        setMatrix(m.serviceMatrix)
        setInvoices(i.invoices)
      } catch (e) {
        toast.error('Failed to load workflow data', (e as Error).message)
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
        const hay = `${i.invoice_no ?? ''} ${i.contracts?.contract_no ?? ''} ${i.contracts?.vendors?.[0]?.name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [invoices, t1, t2, t3, search])

  const total = useMemo(() => filtered.reduce((s, i) => s + Number(i.amount ?? 0), 0), [filtered])
  const tankerInvoices = useMemo(
    () => filtered.filter((i) => i.tanker_name && i.tanker_name.trim() !== ''),
    [filtered],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoice Workspace"
        description="Drill into invoices through the T1 → T2 → T3 service hierarchy."
        actions={
          <div className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]">
            <GitBranch size={14} className="mr-1.5 inline text-[var(--accent)]" />
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">Matched invoices</div>
          <div className="mt-1 text-2xl font-bold">{filtered.length}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">Matched value</div>
          <div className="mt-1 text-2xl font-bold">Rs {formatMoney(total)}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">Tanker-linked</div>
          <div className="mt-1 text-2xl font-bold">{tankerInvoices.length}</div>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>T1</th>
                <th>T2</th>
                <th>T3</th>
                <th>Tanker</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td className="font-semibold">{i.invoice_no ?? '—'}</td>
                  <td>{formatDate(i.invoice_date)}</td>
                  <td><span className="badge badge-info">{i.t1 ?? '—'}</span></td>
                  <td>{i.t2 ?? '—'}</td>
                  <td>{i.t3 ?? '—'}</td>
                  <td>{i.tanker_name ?? '—'}</td>
                  <td className="text-right font-semibold">{formatMoney(i.amount)}</td>
                  <td><StatusBadge tone={statusTone(i.status)}>{i.status}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState title="No invoices match" description="Adjust the T1/T2/T3 cascade or clear the search." />
        )}
      </GlassCard>
    </div>
  )
}
