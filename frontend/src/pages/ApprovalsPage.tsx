import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, FileText } from 'lucide-react'
import { apiGet, apiPost } from '../lib/api'
import { formatMoney, formatDate, formatAmountWords } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import DataToolbar from '../components/ui/DataToolbar'
import { downloadCSV, sortRows, dateSortValue, type SortDirection } from '../lib/export'

interface ApprovalInvoice {
  id: string
  invoice_no: string | null
  invoice_date: string | null
  amount: number
  remarks: string | null
  t1: string | null
  t2: string | null
  t3: string | null
  tanker_name: string | null
  contracts: { contract_no: string | null; service: string | null; vendors: Array<{ name: string | null; email: string | null }> | null } | null
}

export default function ApprovalsPage() {
  const [pending, setPending] = useState<ApprovalInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState<ApprovalInvoice | null>(null)
  const [reason, setReason] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('invoice_date')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiGet<{ invoices: ApprovalInvoice[] }>('/api/invoices?status=Pending')
      setPending(d.invoices)
    } catch (e) {
      toast.error('Failed to load pending approvals', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const vendorOf = (i: ApprovalInvoice) => {
    const c = Array.isArray(i.contracts) ? i.contracts[0] : i.contracts
    return c?.vendors?.[0]?.name ?? '—'
  }
  const contractOf = (i: ApprovalInvoice) => {
    const c = Array.isArray(i.contracts) ? i.contracts[0] : i.contracts
    return c?.contract_no ?? '—'
  }
  const serviceOf = (i: ApprovalInvoice) => {
    const c = Array.isArray(i.contracts) ? i.contracts[0] : i.contracts
    return c?.service ?? '—'
  }

  const approve = async (inv: ApprovalInvoice) => {
    try {
      const res = await apiPost<{ invoice: ApprovalInvoice; po?: { id: string } | null }>(
        `/api/invoices/${inv.id}/approve`,
        {},
      )
      toast.success(
        `Invoice ${inv.invoice_no ?? ''} approved`,
        res.po ? 'Payment order generated automatically' : undefined,
      )
      load()
    } catch (e) {
      toast.error('Approval failed', (e as Error).message)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return pending.filter((i) =>
      `${i.invoice_no ?? ''} ${vendorOf(i)} ${contractOf(i)} ${serviceOf(i)}`.toLowerCase().includes(q),
    )
  }, [pending, search])

  const sorted = useMemo(
    () =>
      sortRows(
        filtered,
        sortBy || null,
        sortDir,
        (row, key) =>
          key === 'invoice_date'
            ? dateSortValue(row.invoice_date)
            : key === 'amount'
              ? Number(row.amount ?? 0)
              : key === 'vendor'
                ? String(vendorOf(row))
                : String(row.invoice_no ?? ''),
      ),
    [filtered, sortBy, sortDir],
  )

  const exportCSV = () =>
    downloadCSV(
      `pending-approvals-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map((i) => ({
        invoice_no: i.invoice_no ?? '',
        invoice_date: i.invoice_date ?? '',
        vendor: vendorOf(i),
        contract: contractOf(i),
        service: serviceOf(i),
        amount: i.amount,
        remarks: i.remarks ?? '',
      })),
    )

  const submitReject = async () => {
    if (!rejecting) return
    if (!reason.trim()) {
      toast.error('A rejection reason is required')
      return
    }
    try {
      await apiPost(`/api/invoices/${rejecting.id}/reject`, { reason: reason.trim() })
      toast.success('Invoice rejected')
      setRejecting(null)
      setReason('')
      load()
    } catch (e) {
      toast.error('Reject failed', (e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        description="Review and decide on pending invoices."
        actions={
          <span className="badge badge-warn">
            <FileText size={13} /> {pending.length} awaiting decision
          </span>
        }
      />

      <div className="space-y-4">
        <DataToolbar
          search={{ value: search, onChange: setSearch, placeholder: 'Search invoice, vendor, contract…' }}
          sort={{
            columns: [
              { key: 'invoice_date', label: 'Date' },
              { key: 'amount', label: 'Amount' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'invoice_no', label: 'Invoice #' },
            ],
            value: sortBy,
            direction: sortDir,
            onValueChange: setSortBy,
            onDirectionChange: setSortDir,
          }}
          onExport={exportCSV}
          resultsCount={sorted.length}
        />
        {pending.map((inv) => (
          <GlassCard key={inv.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-bold">{inv.invoice_no ?? '—'}</span>
                  <StatusBadge tone="info">Pending</StatusBadge>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--text-dim)]">
                  <span>Vendor: <b className="text-[var(--text)]">{vendorOf(inv)}</b></span>
                  <span>Contract: <b className="text-[var(--text)]">{contractOf(inv)}</b></span>
                  <span>Date: <b className="text-[var(--text)]">{formatDate(inv.invoice_date)}</b></span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
                  {serviceOf(inv) !== '—' && <span>Service: {serviceOf(inv)}</span>}
                  {inv.t1 && <span>T1: {inv.t1}{inv.t2 ? ` → ${inv.t2}` : ''}{inv.t3 ? ` → ${inv.t3}` : ''}</span>}
                  {inv.tanker_name && <span>Tanker: {inv.tanker_name}</span>}
                </div>
                {inv.remarks && <div className="mt-2 text-sm text-[var(--text-dim)]">Note: {inv.remarks}</div>}
              </div>
              <div className="text-right">
                <div className="text-xl font-extrabold">Rs {formatMoney(inv.amount)}</div>
                <div className="mt-1 max-w-[240px] text-[0.7rem] text-[var(--text-muted)]">
                  {formatAmountWords(inv.amount)}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2.5 border-t border-[var(--border)] pt-4">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setRejecting(inv)
                  setReason('')
                }}
              >
                <XCircle size={15} /> Reject
              </Button>
              <Button variant="success" size="sm" onClick={() => approve(inv)}>
                <CheckCircle2 size={15} /> Approve
              </Button>
            </div>
          </GlassCard>
        ))}
        {!loading && pending.length === 0 && (
          <GlassCard>
            <EmptyState
              title="Nothing waiting for approval"
              description="All caught up. Pending invoices will appear here."
              icon={<CheckCircle2 size={28} className="text-[var(--accent-3)]" />}
            />
          </GlassCard>
        )}
      </div>

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.invoice_no ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" onClick={submitReject}><XCircle size={15} /> Reject invoice</Button>
          </>
        }
      >
        <Field label="Rejection reason" required>
          <textarea
            className="input min-h-24"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required — the vendor will see this reason…"
          />
        </Field>
      </Modal>
    </div>
  )
}
