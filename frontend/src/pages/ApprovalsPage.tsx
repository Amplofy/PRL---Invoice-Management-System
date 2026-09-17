import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, FileText, FolderOpen } from 'lucide-react'
import { apiGet, apiPost } from '../lib/api'
import { todayCalendarYmd } from '../lib/calendarDate'
import { formatMoney, formatDate, formatAmountWords } from '../lib/format'
import { emitAppEvent } from '../lib/notify'
import { emitCrossModule } from '../lib/store'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import DataToolbar from '../components/ui/DataToolbar'
import { sortRows, dateSortValue, type SortDirection } from '../lib/export'
import { downloadTableWorkbook } from '../lib/analysisWorkbook'
import { useFyLock } from '../lib/FyLockProvider'
import { invoiceBudgetDate, invoiceBudgetInfo } from '../lib/fiscal'
import { contractNoOf, vendorEmailOf, vendorNameOf } from '../lib/relations'

interface ApprovalInvoice {
  id: string
  invoice_no: string | null
  invoice_date: string | null
  service_from?: string | null
  amount: number
  remarks: string | null
  t1: string | null
  t2: string | null
  t3: string | null
  location?: string | null
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
  const { guardWrite } = useFyLock()

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
    return vendorNameOf(i)
  }
  const contractOf = (i: ApprovalInvoice) => {
    return contractNoOf(i)
  }
  const serviceOf = (i: ApprovalInvoice) => {
    const c = Array.isArray(i.contracts) ? i.contracts[0] : i.contracts
    return c?.service ?? '—'
  }

  const approve = async (inv: ApprovalInvoice) => {
    if (!(await guardWrite(invoiceBudgetDate(inv)))) return
    try {
      const res = await apiPost<{ invoice: ApprovalInvoice; po?: { id: string } | null }>(
        `/api/invoices/${inv.id}/approve`,
        {},
      )
      toast.success(
        `Invoice ${inv.invoice_no ?? ''} approved`,
        res.po ? 'Payment order generated automatically' : undefined,
      )
      emitAppEvent(
        'ok',
        'Invoice approved',
        `${inv.invoice_no ?? 'Invoice'} approved${res.po ? ' — PO generated' : ''}`,
        res.po ? '/payment-orders' : `/invoices/${inv.id}`,
      )
      load()
      emitCrossModule('invoice', 'update', inv.id)
    } catch (e) {
      toast.error('Approval failed', (e as Error).message)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return pending.filter((i) =>
      `${i.invoice_no ?? ''} ${vendorOf(i)} ${contractOf(i)} ${serviceOf(i)} ${i.t1 ?? ''} ${i.t2 ?? ''} ${i.t3 ?? ''} ${i.location ?? ''}`.toLowerCase().includes(q),
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
                : key === 't1'
                  ? String(row.t1 ?? '')
                : String(row.invoice_no ?? ''),
      ),
    [filtered, sortBy, sortDir],
  )

  const exportExcel = async () => {
    try {
      await downloadTableWorkbook({
        filename: `pending-approvals-${todayCalendarYmd()}.xlsx`,
        title: 'Pending approvals',
        subtitle: 'Full-column queue with grand total',
        groupBy: 'Vendor',
        filters: [{ label: 'Rows', value: String(sorted.length) }],
        columns: [
          { key: 'Invoice no', header: 'Invoice no', width: 16 },
          { key: 'Invoice date', header: 'Invoice date', kind: 'date', width: 14 },
          { key: 'Service from', header: 'Service from', kind: 'date', width: 14 },
          { key: 'Budget FY', header: 'Budget FY', width: 12 },
          { key: 'Vendor', header: 'Vendor', width: 28 },
          { key: 'Vendor email', header: 'Vendor email', width: 28 },
          { key: 'Contract', header: 'Contract', width: 16 },
          { key: 'Contract service', header: 'Contract service', width: 22 },
          { key: 'Type', header: 'Type', width: 16 },
          { key: 'Service', header: 'Service', width: 18 },
          { key: 'Detail', header: 'Detail', width: 18 },
          { key: 'Location', header: 'Location', width: 16 },
          { key: 'Tanker', header: 'Tanker', width: 14 },
          { key: 'Amount (Rs)', header: 'Amount (Rs)', kind: 'money', width: 16 },
          { key: 'Remarks', header: 'Remarks', width: 32 },
        ],
        rows: sorted.map((i) => {
          const fi = invoiceBudgetInfo(i)
          return {
            'Invoice no': i.invoice_no ?? '',
            'Invoice date': i.invoice_date ?? '',
            'Service from': i.service_from ?? '',
            'Budget FY': fi?.fy ?? '',
            Vendor: vendorOf(i),
            'Vendor email': vendorEmailOf(i),
            Contract: contractOf(i),
            'Contract service': serviceOf(i),
            Type: i.t1 ?? '',
            Service: i.t2 ?? '',
            Detail: i.t3 ?? '',
            Location: i.location ?? '',
            Tanker: i.tanker_name ?? '',
            'Amount (Rs)': Number(i.amount ?? 0),
            Remarks: i.remarks ?? '',
          }
        }),
      })
    } catch (e) {
      toast.error('Export failed', (e as Error).message)
    }
  }

  const submitReject = async () => {
    if (!rejecting) return
    if (!reason.trim()) {
      toast.error('A rejection reason is required')
      return
    }
    if (!(await guardWrite(invoiceBudgetDate(rejecting)))) return
    try {
      await apiPost(`/api/invoices/${rejecting.id}/reject`, { reason: reason.trim() })
      toast.success('Invoice rejected')
      emitAppEvent('err', 'Invoice rejected', `${rejecting.invoice_no ?? 'Invoice'} — ${reason.trim()}`, `/invoices/${rejecting.id}`)
      setRejecting(null)
      setReason('')
      load()
      emitCrossModule('invoice', 'update', rejecting.id)
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
              { key: 't1', label: 'Type' },
            ],
            value: sortBy,
            direction: sortDir,
            onValueChange: setSortBy,
            onDirectionChange: setSortDir,
          }}
          onExport={() => { void exportExcel() }}
          exportLabel="Export Excel"
          resultsCount={sorted.length}
        />
        {pending.map((inv) => (
          <GlassCard key={inv.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <Link
                    to={`/invoices/${inv.id}`}
                    className="text-base font-bold text-[var(--accent)] underline-offset-4 transition hover:underline"
                    title="Open invoice workspace"
                  >
                    {inv.invoice_no ?? '—'}
                  </Link>
                  <StatusBadge tone="info">Pending</StatusBadge>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--text-dim)]">
                  <span>Vendor: <b className="text-[var(--text)]">{vendorOf(inv)}</b></span>
                  <span>Contract: <b className="text-[var(--text)]">{contractOf(inv)}</b></span>
                  <span>Date: <b className="text-[var(--text)]">{formatDate(inv.invoice_date)}</b></span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
                  {serviceOf(inv) !== '—' && !inv.t2 && <span>Service: {serviceOf(inv)}</span>}
                  {inv.t1 && <span>Type: <b className="text-[var(--text)]">{inv.t1}</b></span>}
                  {inv.t2 && <span>Service: <b className="text-[var(--text)]">{inv.t2}</b></span>}
                  {inv.t3 && <span>Detail: <b className="text-[var(--text)]">{inv.t3}</b></span>}
                  {inv.location && <span>Location: <b className="text-[var(--text)]">{inv.location}</b></span>}
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
              <Link to={`/invoices/${inv.id}`} className="btn btn-ghost">
                <FolderOpen size={15} /> Open workspace
              </Link>
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
