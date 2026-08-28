import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { History, FolderOpen } from 'lucide-react'
import { apiGet } from '../lib/api'
import { formatMoney, formatDate, formatDateTime, formatAmountWords, timeAgo } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import DataToolbar from '../components/ui/DataToolbar'
import Modal from '../components/ui/Modal'

interface HistoryOrder {
  id: string
  serial_no: string | null
  generated_by: string | null
  generated_at: string | null
  status: string | null
  invoices: {
    invoice_no: string | null
    invoice_date: string | null
    amount: number
    status: string | null
    contracts: { contract_no: string | null; vendors: Array<{ name: string | null }> | null } | null
  } | null
}

export default function PoHistoryPage() {
  const [orders, setOrders] = useState<HistoryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<HistoryOrder | null>(null)
  const toast = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const d = await apiGet<{ paymentOrders: HistoryOrder[] }>('/api/payment-orders')
        setOrders(d.paymentOrders)
      } catch (e) {
        toast.error('Failed to load PO history', (e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [toast])

  const vendorOf = (o: HistoryOrder) => o.invoices?.contracts?.vendors?.[0]?.name ?? '—'
  const contractOf = (o: HistoryOrder) => o.invoices?.contracts?.contract_no ?? '—'

  const sorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) => new Date(b.generated_at ?? 0).getTime() - new Date(a.generated_at ?? 0).getTime(),
      ),
    [orders],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return sorted
    return sorted.filter((o) =>
      `${o.serial_no ?? ''} ${o.invoices?.invoice_no ?? ''} ${vendorOf(o)} ${contractOf(o)} ${o.generated_by ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [sorted, search])

  const totalValue = useMemo(() => filtered.reduce((s, o) => s + Number(o.invoices?.amount ?? 0), 0), [filtered])

  return (
    <div className="space-y-5">
      <PageHeader
        title="PO History"
        description="Every payment order version ever generated — the versioned record behind the operational list."
        actions={
          <>
            <span className="badge badge-info">
              <History size={13} /> {filtered.length} versions
            </span>
            <span className="badge badge-ok">Rs {formatMoney(totalValue)} total</span>
          </>
        }
      />

      <DataToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search PO, invoice, vendor, generator…' }}
        resultsCount={filtered.length}
      />

      <GlassCard className="p-5">
        <div className="section-title">Generation Timeline</div>
        {!loading && filtered.length === 0 ? (
          <EmptyState
            title={search ? 'No matching PO versions' : 'No payment orders yet'}
            description={
              search
                ? 'Try a different search.'
                : 'Approve an invoice and generate a payment order — every version will be recorded here.'
            }
            icon={<History size={28} />}
          />
        ) : (
          <div className="timeline">
            {filtered.map((o) => (
              <div key={o.id} className="timeline-item ok">
                <button
                  className="glass flex w-full flex-wrap items-center justify-between gap-3 p-3.5 text-left transition hover:bg-[var(--surface-hover)]"
                  onClick={() => setViewing(o)}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{o.serial_no ?? '—'}</span>
                      <StatusBadge tone="ok">{o.status ?? 'Generated'}</StatusBadge>
                      <span className="text-[0.65rem] text-[var(--text-muted)]">
                        {timeAgo(o.generated_at)} · by {o.generated_by ?? 'system'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-dim)]">
                      Invoice <b className="text-[var(--text)]">{o.invoices?.invoice_no ?? '—'}</b> ·{' '}
                      {vendorOf(o)} · contract {contractOf(o)} · {formatDate(o.invoices?.invoice_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-extrabold">Rs {formatMoney(o.invoices?.amount ?? 0)}</div>
                      <div className="text-[0.65rem] text-[var(--text-muted)]">{formatDateTime(o.generated_at)}</div>
                    </div>
                    <FolderOpen size={15} className="text-[var(--text-muted)]" />
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={`Payment order ${viewing?.serial_no ?? ''}`}
        footer={
          <Link to="/payment-orders" className="btn btn-ghost" onClick={() => setViewing(null)}>
            Open operational list
          </Link>
        }
      >
        {viewing && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">PO Serial</span>
              <b>{viewing.serial_no ?? '—'}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Status</span>
              <StatusBadge tone="ok">{viewing.status ?? 'Generated'}</StatusBadge>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Generated By</span>
              <b>{viewing.generated_by ?? '—'}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Generated At</span>
              <b>{formatDateTime(viewing.generated_at)}</b>
            </div>
            <div className="border-t border-[var(--border)] pt-3" />
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Linked Invoice</span>
              <b>{viewing.invoices?.invoice_no ?? '—'}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Invoice Date</span>
              <b>{formatDate(viewing.invoices?.invoice_date)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Vendor</span>
              <b>{vendorOf(viewing)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Contract</span>
              <b>{contractOf(viewing)}</b>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-3">
              <span className="text-[var(--text-muted)]">Amount</span>
              <b>Rs {formatMoney(viewing.invoices?.amount ?? 0, 2)}</b>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs italic text-[var(--text-dim)]">
              {formatAmountWords(viewing.invoices?.amount ?? 0)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
