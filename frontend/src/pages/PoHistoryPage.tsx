import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useLiveDomain } from '../lib/store'
import {
  invoiceApprovedAmount,
  poGeneratedAmount,
  poHistoryActionLabel,
  poHistoryTone,
  poReleasedAmount,
  poStatusLabel,
  poStatusTone,
  type PoHistoryEvent,
} from '../lib/paymentOrder'

interface HistoryOrder {
  id: string
  serial_no: string | null
  generated_by: string | null
  generated_at: string | null
  status: string | null
  amount?: number | null
  approved_amount?: number | null
  released_amount?: number | null
  released_by?: string | null
  released_at?: string | null
  finance_approved_by?: string | null
  finance_approved_at?: string | null
  finance_remarks?: string | null
  history?: PoHistoryEvent[]
  invoices: {
    invoice_no: string | null
    invoice_date: string | null
    amount: number
    approved_amount?: number | null
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

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ paymentOrders: HistoryOrder[] }>('/api/payment-orders')
      setOrders(d.paymentOrders)
    } catch (e) {
      toast.error('Failed to load PO history', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const [, liveVersion] = useLiveDomain(['paymentOrders'])
  useEffect(() => {
    if (liveVersion === 0) return
    void load()
  }, [liveVersion, load])

  const vendorOf = (o: HistoryOrder) => o.invoices?.contracts?.vendors?.[0]?.name ?? '—'
  const contractOf = (o: HistoryOrder) => o.invoices?.contracts?.contract_no ?? '—'

  const events = useMemo(() => {
    const rows: Array<{ order: HistoryOrder; event: PoHistoryEvent; at: string }> = []
    for (const o of orders) {
      const hist = o.history?.length
        ? o.history
        : [{ action: 'Generated', actor: o.generated_by, amount: poGeneratedAmount(o, o.invoices), remarks: null, created_at: o.generated_at }]
      for (const event of hist) {
        rows.push({ order: o, event, at: event.created_at ?? o.generated_at ?? '' })
      }
    }
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return events
    return events.filter(({ order: o, event }) =>
      `${o.serial_no ?? ''} ${o.invoices?.invoice_no ?? ''} ${vendorOf(o)} ${contractOf(o)} ${event.action} ${event.actor ?? ''} ${event.remarks ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [events, search])

  const releasedValue = useMemo(
    () => orders.reduce((s, o) => s + poReleasedAmount(o), 0),
    [orders],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="PO History"
        description="Versioned record of every pay order: generation, finance clearance, payment release to the surveyor, and rejections."
        actions={
          <>
            <span className="badge badge-info">
              <History size={13} /> {filtered.length} events
            </span>
            <span className="badge badge-ok">Rs {formatMoney(releasedValue)} released</span>
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
            title={search ? 'No matching history' : 'No payment orders yet'}
            description={
              search
                ? 'Try a different search.'
                : 'Approve an invoice to generate a PO. Finance clearance and payment release are recorded here.'
            }
            icon={<History size={28} />}
          />
        ) : (
          <div className="timeline">
            {filtered.map(({ order: o, event, at }) => (
              <div key={`${o.id}-${event.id ?? event.action}-${at}`} className={`timeline-item ${event.action === 'FinanceRejected' ? 'err' : event.action === 'Generated' ? 'warn' : 'ok'}`}>
                <button
                  className="glass flex w-full flex-wrap items-center justify-between gap-3 p-3.5 text-left transition hover:bg-[var(--surface-hover)]"
                  onClick={() => setViewing(o)}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{o.serial_no ?? '—'}</span>
                      <StatusBadge tone={poHistoryTone(event.action)}>{poHistoryActionLabel(event.action)}</StatusBadge>
                      <span className="text-[0.65rem] text-[var(--text-muted)]">
                        {timeAgo(at)} · by {event.actor ?? o.generated_by ?? 'system'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-dim)]">
                      Invoice <b className="text-[var(--text)]">{o.invoices?.invoice_no ?? '—'}</b> ·{' '}
                      {vendorOf(o)} · contract {contractOf(o)} · {formatDate(o.invoices?.invoice_date)}
                      {event.remarks ? ` · ${event.remarks}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-extrabold">Rs {formatMoney(Number(event.amount ?? poGeneratedAmount(o, o.invoices)))}</div>
                      <div className="text-[0.65rem] text-[var(--text-muted)]">{formatDateTime(at)}</div>
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
              <StatusBadge tone={poStatusTone(viewing.status)}>{poStatusLabel(viewing.status)}</StatusBadge>
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
              <span className="text-[var(--text-muted)]">Invoice approved</span>
              <b>Rs {formatMoney(invoiceApprovedAmount({ amount: viewing.invoices?.amount, approved_amount: viewing.approved_amount ?? viewing.invoices?.approved_amount }), 2)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">PO generated</span>
              <b>Rs {formatMoney(poGeneratedAmount(viewing, viewing.invoices), 2)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Payment released</span>
              <b>Rs {formatMoney(poReleasedAmount(viewing), 2)}</b>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs italic text-[var(--text-dim)]">
              {formatAmountWords(poReleasedAmount(viewing) || poGeneratedAmount(viewing, viewing.invoices))}
            </div>
            {viewing.history && viewing.history.length > 0 && (
              <div className="border-t border-[var(--border)] pt-3 space-y-2">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Clearance trail</div>
                {viewing.history.map((h) => (
                  <div key={h.id ?? `${h.action}-${h.created_at}`} className="flex items-start justify-between gap-3 text-xs">
                    <div>
                      <StatusBadge tone={poHistoryTone(h.action)}>{poHistoryActionLabel(h.action)}</StatusBadge>
                      <div className="mt-1 text-[var(--text-dim)]">{h.actor ?? '—'} · {formatDateTime(h.created_at)}</div>
                      {h.remarks ? <div className="mt-0.5 italic">{h.remarks}</div> : null}
                    </div>
                    <b>Rs {formatMoney(Number(h.amount ?? 0))}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
