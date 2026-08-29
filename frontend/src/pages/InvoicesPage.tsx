import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { Plus, Trash2, CheckCircle2, XCircle, FileOutput, Pencil, FileCheck2, Lock, AlertTriangle, Wand2, Languages, Banknote, Clock, Layers } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { formatMoney, formatDate, formatAmountWords } from '../lib/format'
import { contractUtilization, validateInvoice, nextSerialNo, type ContractLite, type ServiceMatrixRow, type UtilizationInvoice, type SerialInvoiceLike } from '../lib/invoice'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge, { statusTone } from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import EmptyState from '../components/ui/EmptyState'
import DataToolbar from '../components/ui/DataToolbar'
import ColumnsButton from '../components/ui/ColumnsButton'
import ServiceSelects from '../components/ui/ServiceSelects'
import ContractSummaryPanel from '../components/ui/ContractSummaryPanel'
import ValidationSummary from '../components/ui/ValidationSummary'
import { emitAppEvent } from '../lib/notify'
import { downloadCSV, sortRows, dateSortValue, type SortDirection } from '../lib/export'
import { useAuth, isAdmin } from '../lib/auth'
import { useColumnVisibility } from '../lib/columns'
import { applyFilters, type FilterColumnDef, type FilterState } from '../lib/filters'
import { groupRows } from '../lib/grouping'
import AdvancedFilter from '../components/ui/AdvancedFilter'
import GroupByPicker from '../components/ui/GroupByPicker'
import SummaryCards from '../components/ui/SummaryCards'
import { Link } from 'react-router-dom'

interface VendorRef {
  name: string | null
}
interface ContractRef {
  contract_no: string | null
  service: string | null
  vendors: VendorRef[] | null
}
interface Invoice {
  id: string
  serial_no: string | null
  processing_date: string | null
  invoice_no: string | null
  invoice_date: string | null
  contract_id: string | null
  t1: string | null
  t2: string | null
  t3: string | null
  tanker_name: string | null
  trips: number | null
  item_no: string | null
  cost_element: string | null
  service_from: string | null
  service_to: string | null
  amount: number
  status: string
  remarks: string | null
  approved_by: string | null
  contracts: ContractRef | ContractRef[] | null
}
interface Contract {
  id: string
  contract_no: string
  service: string
  vendors: VendorRef[] | null
}

const STATUSES = ['all', 'Pending', 'Approved', 'Rejected', 'Submitted']

const INVOICE_COLUMN_DEFS = [
  { key: 'invoice_no', label: 'Invoice No' },
  { key: 'serial', label: 'Serial' },
  { key: 'date', label: 'Date' },
  { key: 'processing_date', label: 'Processing Date' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'contract', label: 'Contract' },
  { key: 'item', label: 'Item' },
  { key: 'service', label: 'Service' },
  { key: 'tanker', label: 'Tanker' },
  { key: 'trips', label: 'Trips' },
  { key: 'cost_element', label: 'Cost Element' },
  { key: 'service_period', label: 'Service Period' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
  { key: 'remarks', label: 'Remarks' },
]

const INVOICE_DEFAULT_COLUMNS = ['invoice_no', 'serial', 'date', 'vendor', 'contract', 'item', 'amount', 'status']

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const col = useColumnVisibility(
    'prl-eoms-cols-invoices',
    INVOICE_COLUMN_DEFS.map((c) => c.key),
    INVOICE_DEFAULT_COLUMNS,
  )
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState[]>([])
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [creating, setCreating] = useState(false)
  const [rejecting, setRejecting] = useState<Invoice | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [generatingPo, setGeneratingPo] = useState<Invoice | null>(null)
  const [sortBy, setSortBy] = useState('invoice_date')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [poReady, setPoReady] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastClickIdx, setLastClickIdx] = useState<number | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkRejecting, setBulkRejecting] = useState(false)
  const toast = useToast()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiGet<{ invoices: Invoice[] }>('/api/invoices')
      setInvoices(d.invoices)
      const c = await apiGet<{ contracts: Contract[] }>('/api/contracts')
      setContracts(c.contracts)
    } catch (e) {
      toast.error('Failed to load invoices', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(() => load(), [load])

  const deleteInvoice = async (inv: Invoice) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_no ?? ''}?`)) return
    try {
      await apiDelete(`/api/invoices/${inv.id}`)
      toast.success('Invoice deleted')
      emitAppEvent('warn', 'Invoice deleted', `${inv.invoice_no ?? 'Invoice'} was removed`)
      reload()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  const approve = async (inv: Invoice) => {
    try {
      const res = await apiPost<{ invoice: Invoice; po?: { id: string } | null }>(`/api/invoices/${inv.id}/approve`, {})
      if (res.po) {
        setPoReady((m) => ({ ...m, [inv.id]: true }))
        toast.success('Invoice approved', 'Payment order generated automatically')
        emitAppEvent(
          'ok',
          'Invoice approved + PO generated',
          `${inv.invoice_no ?? 'Invoice'} approved — payment order ready`,
          '/payment-orders',
        )
      } else {
        toast.success('Invoice approved')
        emitAppEvent('ok', 'Invoice approved', `${inv.invoice_no ?? 'Invoice'} approved`, `/invoices/${inv.id}`)
      }
      reload()
    } catch (e) {
      toast.error('Approval failed', (e as Error).message)
    }
  }

  const submitReject = async () => {
    if (!rejecting) return
    if (!rejectReason.trim()) {
      toast.error('Rejection reason is required')
      return
    }
    try {
      await apiPost(`/api/invoices/${rejecting.id}/reject`, { reason: rejectReason })
      toast.success('Invoice rejected')
      emitAppEvent('err', 'Invoice rejected', `${rejecting.invoice_no ?? 'Invoice'} — ${rejectReason}`, `/invoices/${rejecting.id}`)
      setRejecting(null)
      setRejectReason('')
      reload()
    } catch (e) {
      toast.error('Reject failed', (e as Error).message)
    }
  }

  const generatePo = async () => {
    if (!generatingPo) return
    try {
      await apiPost(`/api/invoices/${generatingPo.id}/po`, {})
      setPoReady((m) => ({ ...m, [generatingPo.id]: true }))
      toast.success('Payment order generated')
      emitAppEvent(
        'ok',
        'Payment order generated',
        `PO created for ${generatingPo.invoice_no ?? 'invoice'}`,
        '/payment-orders',
      )
      setGeneratingPo(null)
    } catch (e) {
      toast.error('PO generation failed', (e as Error).message)
    }
  }

  const vendorOf = (inv: Invoice) => {
    const rel = inv.contracts
    const c = Array.isArray(rel) ? rel[0] : rel
    return c?.vendors?.[0]?.name ?? '—'
  }
  const contractNoOf = (inv: Invoice) => {
    const rel = inv.contracts
    const c = Array.isArray(rel) ? rel[0] : rel
    return c?.contract_no ?? '—'
  }

  const filterColumns = useMemo<FilterColumnDef[]>(
    () => [
      { key: 'status', label: 'Status', type: 'select', options: STATUSES.filter((s) => s !== 'all').map((s) => ({ value: s, label: s })) },
      { key: 'contract_id', label: 'Contract', type: 'select', options: contracts.map((c) => ({ value: c.id, label: c.contract_no })) },
      { key: 'vendor', label: 'Vendor', type: 'text' },
      { key: 'invoice_no', label: 'Invoice No', type: 'text' },
      { key: 'serial_no', label: 'Serial', type: 'text' },
      { key: 'invoice_date', label: 'Date', type: 'date' },
      { key: 'processing_date', label: 'Processing Date', type: 'date' },
      { key: 'item_no', label: 'Item', type: 'text' },
      { key: 'tanker_name', label: 'Tanker', type: 'text' },
      { key: 'cost_element', label: 'Cost Element', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'text' },
    ],
    [contracts],
  )

  const invoiceFilterValue = (inv: Invoice, key: string): string | number | null => {
    switch (key) {
      case 'vendor':
        return vendorOf(inv)
      case 'contract_id':
        return inv.contract_id
      default:
        return (inv as unknown as Record<string, string | number | null>)[key] ?? null
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const searched = q
      ? invoices.filter((i) =>
          `${i.invoice_no ?? ''} ${i.serial_no ?? ''} ${vendorOf(i)} ${contractNoOf(i)} ${i.item_no ?? ''}`
            .toLowerCase()
            .includes(q),
        )
      : invoices
    return applyFilters(searched, filters, filterColumns, invoiceFilterValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, search, filters, filterColumns])

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
              : key === 'status'
                ? String(row.status ?? '')
                : key === 'vendor'
                  ? String(vendorOf(row))
                  : (row as unknown as Record<string, unknown>)[key] as string | null,
      ),
    [filtered, sortBy, sortDir],
  )

  const totalShown = useMemo(() => filtered.reduce((s, i) => s + Number(i.amount ?? 0), 0), [filtered])

  const pendingSorted = useMemo(() => sorted.filter((i) => i.status === 'Pending'), [sorted])
  const selectedList = useMemo(() => invoices.filter((i) => selected.has(i.id)), [invoices, selected])
  const selectedTotal = useMemo(() => selectedList.reduce((s, i) => s + Number(i.amount ?? 0), 0), [selectedList])
  const allPendingSelected = pendingSorted.length > 0 && pendingSorted.every((i) => selected.has(i.id))
  const somePendingSelected = pendingSorted.some((i) => selected.has(i.id))

  const toggleSelect = (inv: Invoice, idx: number, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickIdx !== null) {
        const [a, b] = [Math.min(lastClickIdx, idx), Math.max(lastClickIdx, idx)]
        const add = !prev.has(inv.id)
        for (let k = a; k <= b; k++) {
          const row = pendingSorted[k]
          if (row) {
            if (add) next.add(row.id)
            else next.delete(row.id)
          }
        }
      } else if (next.has(inv.id)) {
        next.delete(inv.id)
      } else {
        next.add(inv.id)
      }
      return next
    })
    setLastClickIdx(idx)
  }

  const toggleAllPending = () => {
    setSelected((prev) => {
      if (pendingSorted.length > 0 && pendingSorted.every((i) => prev.has(i.id))) {
        const next = new Set(prev)
        for (const i of pendingSorted) next.delete(i.id)
        return next
      }
      return new Set([...prev, ...pendingSorted.map((i) => i.id)])
    })
  }

  const clearSelection = () => {
    setSelected(new Set())
    setLastClickIdx(null)
  }

  const bulkApprove = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      const d = await apiPost<{ approved: number; poCreated: number; failed: string[] }>(
        '/api/invoices/bulk-approve',
        { ids },
      )
      toast.success(
        `${d.approved} invoices approved`,
        d.poCreated > 0 ? `${d.poCreated} payment order(s) generated automatically` : undefined,
      )
      emitAppEvent('ok', 'Bulk approval', `${d.approved} invoices approved in one go`, '/payment-orders')
      clearSelection()
      reload()
    } catch (e) {
      toast.error('Bulk approval failed', (e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkRejectSubmit = async () => {
    if (!rejectReason.trim()) {
      toast.error('Rejection reason is required')
      return
    }
    setBulkBusy(true)
    try {
      const d = await apiPost<{ rejected: number }>('/api/invoices/bulk-reject', {
        ids: [...selected],
        reason: rejectReason,
      })
      toast.success(`${d.rejected} invoices rejected`)
      emitAppEvent('err', 'Bulk rejection', `${d.rejected} invoices rejected — ${rejectReason}`, '/invoices')
      setBulkRejecting(false)
      setRejectReason('')
      clearSelection()
      reload()
    } catch (e) {
      toast.error('Bulk rejection failed', (e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  const GROUP_BY_INVOICE = [
    { key: 'vendor', label: 'Vendor' },
    { key: 'contract', label: 'Contract' },
    { key: 'status', label: 'Status' },
    { key: 'item_no', label: 'Item' },
    { key: 'cost_element', label: 'Cost Element' },
    { key: 'month', label: 'Month' },
  ]

  const invoiceGroupValue = (inv: Invoice, key: string): string | number | null => {
    if (key === 'vendor') return vendorOf(inv)
    if (key === 'contract') return contractNoOf(inv)
    if (key === 'month') return inv.invoice_date ? inv.invoice_date.slice(0, 7) : null
    return (inv as unknown as Record<string, string | number | null>)[key] ?? null
  }

  const grouped = useMemo(
    () => groupRows(sorted, groupKey, invoiceGroupValue, (i) => Number(i.amount ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, groupKey],
  )

  const visibleColCount = INVOICE_COLUMN_DEFS.filter((c) => col.show(c.key)).length + 2

  const pendingCount = useMemo(() => filtered.filter((i) => i.status === 'Pending').length, [filtered])
  const approvedCount = useMemo(
    () => filtered.filter((i) => i.status === 'Approved' || i.status === 'Submitted').length,
    [filtered],
  )
  const rejectedCount = useMemo(() => filtered.filter((i) => i.status === 'Rejected').length, [filtered])

  const exportCSV = () =>
    downloadCSV(
      `invoices-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map((i) => ({
        ...(col.show('invoice_no') ? { invoice_no: i.invoice_no ?? '' } : {}),
        ...(col.show('serial') ? { serial_no: i.serial_no ?? '' } : {}),
        ...(col.show('date') ? { invoice_date: i.invoice_date ?? '' } : {}),
        ...(col.show('vendor') ? { vendor: vendorOf(i) } : {}),
        ...(col.show('contract') ? { contract: contractNoOf(i) } : {}),
        ...(col.show('item') ? { item_no: i.item_no ?? '' } : {}),
        ...(col.show('cost_element') ? { cost_element: i.cost_element ?? '' } : {}),
        ...(col.show('amount') ? { amount: i.amount } : {}),
        ...(col.show('status') ? { status: i.status } : {}),
        ...(col.show('remarks') ? { remarks: i.remarks ?? '' } : {}),
      })),
    )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        description="Browse, approve, reject and generate payment orders for vendor invoices."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New Invoice
          </Button>
        }
      />

      <SummaryCards
        items={[
          {
            label: 'Total Shown',
            value: `Rs ${formatMoney(totalShown)}`,
            sub: `${sorted.length} invoice${sorted.length === 1 ? '' : 's'}`,
            icon: <Banknote size={16} />,
            tone: 'primary',
          },
          {
            label: 'Pending',
            value: String(pendingCount),
            sub: 'awaiting approval',
            icon: <Clock size={16} />,
            tone: 'warn',
          },
          {
            label: 'Approved / Submitted',
            value: String(approvedCount),
            sub: 'cleared for PO',
            icon: <CheckCircle2 size={16} />,
            tone: 'ok',
          },
          {
            label: 'Rejected',
            value: String(rejectedCount),
            sub: 'need rework',
            icon: <XCircle size={16} />,
            tone: 'err',
          },
        ]}
      />

      <DataToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search invoice or serial no…' }}
        filterBar={
          <AdvancedFilter columns={filterColumns} filters={filters} onChange={setFilters} />
        }
        sort={{
          columns: [
            { key: 'invoice_date', label: 'Date' },
            { key: 'invoice_no', label: 'Invoice no' },
            { key: 'vendor', label: 'Vendor' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
          ],
          value: sortBy,
          direction: sortDir,
          onValueChange: setSortBy,
          onDirectionChange: setSortDir,
        }}
        onExport={exportCSV}
        exportLabel="Export CSV"
        resultsCount={sorted.length}
      >
        <ColumnsButton
          columns={INVOICE_COLUMN_DEFS}
          isVisible={col.show}
          onToggle={col.toggle}
          onReset={col.reset}
          hiddenCount={col.hiddenCount}
        />
        <GroupByPicker options={GROUP_BY_INVOICE} value={groupKey} onChange={setGroupKey} />
      </DataToolbar>

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-9 pr-0">
                  <input
                    type="checkbox"
                    className="cursor-pointer accent-[var(--accent)]"
                    checked={allPendingSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePendingSelected && !allPendingSelected
                    }}
                    onChange={toggleAllPending}
                    disabled={pendingSorted.length === 0}
                    title="Select all pending invoices"
                  />
                </th>
                {col.show('invoice_no') && <th>Invoice No</th>}
                {col.show('serial') && <th>Serial</th>}
                {col.show('date') && <th>Date</th>}
                {col.show('processing_date') && <th>Processing</th>}
                {col.show('vendor') && <th>Vendor</th>}
                {col.show('contract') && <th>Contract</th>}
                {col.show('item') && <th>Item</th>}
                {col.show('service') && <th>Service</th>}
                {col.show('tanker') && <th>Tanker</th>}
                {col.show('trips') && <th className="text-right">Trips</th>}
                {col.show('cost_element') && <th>Cost Element</th>}
                {col.show('service_period') && <th>Service Period</th>}
                {col.show('amount') && <th className="text-right">Amount</th>}
                {col.show('status') && <th>Status</th>}
                {col.show('remarks') && <th>Remarks</th>}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const renderRow = (inv: Invoice) => {
                  const pendingIdx = pendingSorted.findIndex((p) => p.id === inv.id)
                  return (
                <tr key={inv.id} className={selected.has(inv.id) ? 'bg-[rgba(124,58,237,0.07)]' : undefined}>
                  <td className="pr-0 text-center">
                    {inv.status === 'Pending' && pendingIdx >= 0 ? (
                      <input
                        type="checkbox"
                        className="cursor-pointer accent-[var(--accent)]"
                        checked={selected.has(inv.id)}
                        onClick={(e) => toggleSelect(inv, pendingIdx, e.shiftKey)}
                        onChange={() => undefined}
                      />
                    ) : (
                      <span className="text-xs text-[var(--text-dim)]">—</span>
                    )}
                  </td>
                  {col.show('invoice_no') && (
                    <td className="font-semibold">
                      <Link
                        to={`/invoices/${inv.id}`}
                        className="text-[var(--accent)] underline-offset-4 transition hover:underline"
                        title="Open invoice workspace"
                      >
                        {inv.invoice_no ?? '—'}
                      </Link>
                    </td>
                  )}
                  {col.show('serial') && <td className="text-xs text-[var(--text-muted)]">{inv.serial_no ?? '—'}</td>}
                  {col.show('date') && <td>{formatDate(inv.invoice_date)}</td>}
                  {col.show('processing_date') && (
                    <td className="text-xs text-[var(--text-muted)]">{formatDate(inv.processing_date)}</td>
                  )}
                  {col.show('vendor') && <td>{vendorOf(inv)}</td>}
                  {col.show('contract') && <td className="text-xs">{contractNoOf(inv)}</td>}
                  {col.show('item') && <td className="text-xs">{inv.item_no ?? '—'}</td>}
                  {col.show('service') && (
                    <td className="max-w-[11rem] truncate text-xs" title={[inv.t1, inv.t2, inv.t3].filter(Boolean).join(' → ')}>
                      {[inv.t1, inv.t2, inv.t3].filter(Boolean).join(' → ') || '—'}
                    </td>
                  )}
                  {col.show('tanker') && <td className="text-xs">{inv.tanker_name ?? '—'}</td>}
                  {col.show('trips') && <td className="text-right text-xs">{inv.trips ?? '—'}</td>}
                  {col.show('cost_element') && <td className="text-xs">{inv.cost_element ?? '—'}</td>}
                  {col.show('service_period') && (
                    <td className="text-xs">
                      {inv.service_from || inv.service_to
                        ? `${formatDate(inv.service_from)} – ${formatDate(inv.service_to)}`
                        : '—'}
                    </td>
                  )}
                  {col.show('amount') && <td className="text-right font-semibold">{formatMoney(inv.amount)}</td>}
                  {col.show('status') && (
                    <td>
                      <StatusBadge tone={statusTone(inv.status)}>{inv.status}</StatusBadge>
                    </td>
                  )}
                  {col.show('remarks') && (
                    <td className="max-w-[10rem] truncate text-xs text-[var(--text-muted)]" title={inv.remarks ?? undefined}>
                      {inv.remarks ?? '—'}
                    </td>
                  )}
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <button className="btn btn-ghost !px-2.5 !py-1.5" title="Edit" onClick={() => setEditing(inv)}>
                        <Pencil size={14} />
                      </button>
                      {inv.status === 'Pending' && (
                        <>
                          <button className="btn btn-ghost !px-2.5 !py-1.5" title="Approve" onClick={() => approve(inv)}>
                            <CheckCircle2 size={14} className="text-[var(--accent-3)]" />
                          </button>
                          <button
                            className="btn btn-ghost !px-2.5 !py-1.5"
                            title="Reject"
                            onClick={() => {
                              setRejecting(inv)
                              setRejectReason('')
                            }}
                          >
                            <XCircle size={14} className="text-[var(--danger)]" />
                          </button>
                        </>
                      )}
                      {inv.status === 'Approved' &&
                        (poReady[inv.id] ? (
                          <Link
                            to="/payment-orders"
                            className="btn btn-ghost !px-2.5 !py-1.5"
                            title="Payment order generated — view"
                          >
                            <FileCheck2 size={14} className="text-[var(--accent-3)]" />
                          </Link>
                        ) : (
                          <button
                            className="btn btn-ghost !px-2.5 !py-1.5"
                            title="Generate PO"
                            onClick={() => setGeneratingPo(inv)}
                          >
                            <FileOutput size={14} className="text-[var(--accent-2)]" />
                          </button>
                        ))}
                      {admin && (
                        <button
                          className="btn btn-ghost !px-2.5 !py-1.5"
                          title="Delete"
                          onClick={() => deleteInvoice(inv)}
                        >
                          <Trash2 size={14} className="text-[var(--danger)]" />
                        </button>
                      )}
                     </div>
                   </td>
                 </tr>
                )
                }

                const rows = grouped
                  ? grouped.map((g) => (
                      <Fragment key={`grp-${g.key}`}>
                        <tr className="subtotal-row">
                          <td colSpan={visibleColCount}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2 font-semibold">
                                <Layers size={13} className="text-[var(--accent)]" />
                                {groupKey === 'month' && /^\d{4}-\d{2}$/.test(g.key)
                                  ? new Date(`${g.key}-01`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
                                  : g.key}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {g.count} invoice{g.count === 1 ? '' : 's'} ·{' '}
                                <b className="text-[var(--text)]">Rs {formatMoney(g.sum)}</b>
                              </span>
                            </div>
                          </td>
                        </tr>
                        {g.rows.map(renderRow)}
                      </Fragment>
                    ))
                  : sorted.map(renderRow)

                return (
                  <>
                    {rows}
                    {sorted.length > 0 && (
                      <tr className="grand-total-row">
                        <td colSpan={visibleColCount}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold uppercase tracking-wider">Grand Total</span>
                            <span className="text-xs">
                              {sorted.length} invoice{sorted.length === 1 ? '' : 's'} ·{' '}
                              <b>Rs {formatMoney(totalShown)}</b>
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
        {!loading && invoices.length === 0 && (
          <EmptyState
            title="No invoices found"
            description="Adjust filters or import invoice data."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} /> Create invoice
              </Button>
            }
          />
        )}
      </GlassCard>

      {(creating || editing) && (
        <InvoiceFormModal
          open
          invoice={editing}
          contracts={contracts}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            reload()
          }}
        />
      )}

      {selected.size > 0 && (
        <div
          className="glass-strong fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] px-5 py-3 shadow-2xl"
          style={{ animation: 'toast-in 220ms ease-out' }}
        >
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-extrabold text-white" style={{ background: 'var(--gradient-primary)' }}>
              {selected.size}
            </span>
            selected
            <span className="hidden text-[var(--text-muted)] sm:inline">·</span>
            <span className="hidden text-xs font-semibold text-[var(--accent-3)] sm:inline">
              Rs {formatMoney(selectedTotal)} total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection} disabled={bulkBusy}>
              Clear
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setBulkRejecting(true)} disabled={bulkBusy}>
              <XCircle size={14} /> Reject all
            </Button>
            <Button variant="success" size="sm" onClick={bulkApprove} disabled={bulkBusy}>
              <CheckCircle2 size={14} /> {bulkBusy ? 'Working…' : `Approve all${selectedList.some((i) => i.status === 'Pending') ? ' + generate POs' : ''}`}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={!!rejecting || bulkRejecting}
        onClose={() => {
          setRejecting(null)
          setBulkRejecting(false)
        }}
        title={rejecting ? `Reject invoice ${rejecting.invoice_no ?? ''}` : `Reject ${selected.size} invoices`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRejecting(null)
                setBulkRejecting(false)
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={rejecting ? submitReject : bulkRejectSubmit}>
              <XCircle size={15} /> {rejecting ? 'Reject invoice' : `Reject ${selected.size} invoices`}
            </Button>
          </>
        }
      >
        {bulkRejecting && !rejecting && (
          <div className="mb-3 rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-3 py-2 text-xs font-semibold text-[var(--err)]">
            The same reason will be applied to all {selected.size} selected invoices.
          </div>
        )}
        <Field label="Reason" required>
          <textarea
            className="input min-h-24"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain why this invoice is being rejected…"
          />
        </Field>
      </Modal>

      <Modal
        open={!!generatingPo}
        onClose={() => setGeneratingPo(null)}
        title={`Generate payment order for ${generatingPo?.invoice_no ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setGeneratingPo(null)}>
              Cancel
            </Button>
            <Button variant="success" onClick={generatePo}>
              <FileOutput size={15} /> Generate PO
            </Button>
          </>
        }
      >
        <div className="text-sm text-[var(--text-dim)]">
          A new payment order version will be created for this approved invoice. It will appear under{' '}
          <span className="font-semibold text-[var(--text)]">Payment Orders</span>.
        </div>
      </Modal>
    </div>
  )
}

interface InvoiceFormModalProps {
  open: boolean
  invoice: Invoice | null
  contracts: Contract[]
  onClose: () => void
  onSaved: () => void
}

interface ContractFull {
  id: string
  contract_no: string
  service: string | null
  value: number
  start_date: string | null
  end_date: string | null
  vendors: VendorRef[] | null
}

function toContractLite(c: ContractFull): ContractLite {
  return {
    id: c.id,
    contract_no: c.contract_no,
    value: Number(c.value ?? 0),
    start_date: c.start_date,
    end_date: c.end_date,
    vendor: c.vendors?.[0]?.name ?? null,
    service: c.service ?? null,
  }
}

function InvoiceFormModal({ open, invoice, contracts, onClose, onSaved }: InvoiceFormModalProps) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  /** Errors stay hidden until the user attempts to save; they then clear per-field as fixed. */
  const [showErrors, setShowErrors] = useState(false)
  /** Processing date is stamped at entry time and never edited by hand. */
  const [entryDate, setEntryDate] = useState('')
  const [matrix, setMatrix] = useState<ServiceMatrixRow[]>([])
  const [allInvoices, setAllInvoices] = useState<UtilizationInvoice[]>([])
  const [fullContracts, setFullContracts] = useState<ContractFull[]>([])
  const [duplicateCheck, setDuplicateCheck] = useState(true)
  const [maxInvoiceAmount, setMaxInvoiceAmount] = useState<number | undefined>()
  const [futureDateAllowed, setFutureDateAllowed] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setShowErrors(false)
    setEntryDate(new Date().toISOString().slice(0, 10))
    setForm({
      serial_no: invoice?.serial_no ?? '',
      invoice_no: invoice?.invoice_no ?? '',
      invoice_date: (invoice?.invoice_date ?? '').slice(0, 10),
      contract_id: invoice?.contract_id ?? '',
      t1: invoice?.t1 ?? '',
      t2: invoice?.t2 ?? '',
      t3: invoice?.t3 ?? '',
      tanker_name: invoice?.tanker_name ?? '',
      trips: invoice?.trips?.toString() ?? '',
      item_no: invoice?.item_no ?? '',
      cost_element: invoice?.cost_element ?? '',
      service_from: (invoice?.service_from ?? '').slice(0, 10),
      service_to: (invoice?.service_to ?? '').slice(0, 10),
      amount: invoice?.amount?.toString() ?? '',
      remarks: invoice?.remarks ?? '',
    })
    Promise.all([
      apiGet<{ serviceMatrix: ServiceMatrixRow[] }>('/api/service-matrix'),
      apiGet<{ invoices: UtilizationInvoice[] }>('/api/invoices'),
      apiGet<{ contracts: ContractFull[] }>('/api/contracts'),
      apiGet<{ settings: Array<{ key: string; value: string }> }>('/api/settings'),
    ])
      .then(([m, i, c, s]) => {
        setMatrix(m.serviceMatrix)
        setAllInvoices(i.invoices)
        setFullContracts(c.contracts)
        for (const { key, value } of s.settings) {
          if (key === 'duplicate_check') setDuplicateCheck(value === 'true')
          if (key === 'maximum_invoice_amount') setMaxInvoiceAmount(Number(value) || undefined)
          if (key === 'future_date_allowed') setFutureDateAllowed(value === 'true')
        }
      })
      .catch(() => {
        // supporting data is optional — core form still works
      })
  }, [open, invoice])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const selectedContract = useMemo(
    () => fullContracts.find((c) => c.id === form.contract_id) ?? null,
    [fullContracts, form.contract_id],
  )
  const utilization = useMemo(
    () =>
      selectedContract
        ? contractUtilization(allInvoices, toContractLite(selectedContract), selectedContract.id, invoice?.id)
        : null,
    [allInvoices, selectedContract, invoice?.id],
  )
  const draftAmount = Number(form.amount) || 0
  const issues = useMemo(
    () =>
      validateInvoice(form, {
        matrix,
        contracts: fullContracts.map(toContractLite),
        allInvoices,
        excludeInvoiceId: invoice?.id,
        duplicateCheck,
        maxInvoiceAmount,
        futureDateAllowed,
      }),
    [form, matrix, fullContracts, allInvoices, invoice?.id, duplicateCheck, maxInvoiceAmount, futureDateAllowed],
  )
  const issueMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const i of issues) if (!map[i.field]) map[i.field] = i.message
    return map
  }, [issues])

  // Serial number is auto-generated: "XXX - YY" — running count for the Gregorian
  // year of the invoice date + fiscal-year tag. Edit mode keeps the stored serial.
  const generatedSerial = useMemo(
    () =>
      invoice?.serial_no ||
      nextSerialNo(form.invoice_date || undefined, allInvoices as SerialInvoiceLike[], invoice?.id),
    [invoice?.serial_no, form.invoice_date, allInvoices, invoice?.id],
  )
  const processingDate = invoice?.processing_date?.slice(0, 10) || entryDate

  const focusFirstIssue = () => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('#invoice-form .invalid')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        el.focus({ preventScroll: true })
      }
    })
  }

  const submit = async () => {
    setShowErrors(true)
    if (issues.length > 0) {
      toast.error(
        `Save blocked — ${issues.length} issue${issues.length > 1 ? 's' : ''} to fix`,
        'Highlighted fields below need attention',
      )
      focusFirstIssue()
      return
    }
    setSaving(true)
    try {
      const body = {
        serial_no: generatedSerial || null,
        processing_date: processingDate || null,
        invoice_no: form.invoice_no.trim(),
        invoice_date: form.invoice_date || null,
        contract_id: form.contract_id || null,
        t1: form.t1 || null,
        t2: form.t2 || null,
        t3: form.t3 || null,
        tanker_name: form.tanker_name || null,
        trips: form.trips ? Number(form.trips) : null,
        item_no: form.item_no || null,
        cost_element: form.cost_element || null,
        service_from: form.service_from || null,
        service_to: form.service_to || null,
        amount: Number(form.amount) || 0,
        remarks: form.remarks || null,
      }
      if (invoice) {
        await apiPut(`/api/invoices/${invoice.id}`, body)
        toast.success('Invoice updated')
        emitAppEvent('info', 'Invoice updated', `${form.invoice_no} was saved`)
      } else {
        await apiPost('/api/invoices', body)
        toast.success('Invoice created')
        emitAppEvent('ok', 'Invoice created', `${form.invoice_no} entered for processing`, '/invoices')
      }
      onSaved()
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const serviceValue = {
    t1: form.t1 ?? '',
    t2: form.t2 ?? '',
    t3: form.t3 ?? '',
    tanker_name: form.tanker_name ?? '',
    trips: form.trips ?? '',
    cost_element: form.cost_element ?? '',
    service_from: form.service_from ?? '',
    service_to: form.service_to ?? '',
  }
  const patchService = (patch: Partial<typeof serviceValue>) =>
    setForm((f) => {
      const next = { ...f, ...patch }
      const row = matrix.find(
        (m) => m.t1 === next.t1 && (m.t2 ?? '') === next.t2 && (m.t3 ?? '') === next.t3,
      )
      if (row) next.cost_element = row.cost_element ?? ''
      return next
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={invoice ? `Edit invoice ${invoice.invoice_no ?? ''}` : 'New invoice'}
      maxWidth="64rem"
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
            {showErrors ? (
              issues.length > 0 ? (
                <>
                  <AlertTriangle size={13} className="text-[var(--danger)]" />
                  <span className="text-[var(--danger)]">
                    {issues.length} issue{issues.length > 1 ? 's' : ''} blocking save
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} className="text-[var(--accent-3)]" />
                  <span className="text-[var(--accent-3)]">All checks passed</span>
                </>
              )
            ) : (
              <>
                <Lock size={12} /> Checks run when you save
              </>
            )}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save invoice'}
          </Button>
        </>
      }
    >
      <div id="invoice-form" className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Main column — fields follow the order they are filled in */}
        <div className="space-y-4 lg:col-span-3">
          <div className="glass p-5">
            <div className="section-title">Invoice Details</div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              {/* 1 — system-generated identifiers */}
              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-dim)]">
                  Serial No
                  <span
                    className="flex items-center gap-0.5 rounded-full px-1.5 py-px text-[0.55rem] font-bold uppercase tracking-wide text-[var(--accent)]"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
                  >
                    <Wand2 size={8} /> auto
                  </span>
                </span>
                <div
                  className="input flex cursor-default items-center justify-between !bg-[var(--surface)] font-mono text-sm font-bold tracking-wide"
                  title="Auto-generated: running count for the Gregorian year + fiscal-year tag (Jul–Jun)"
                >
                  {generatedSerial || '···· - ··'}
                  <Lock size={11} className="shrink-0 text-[var(--text-muted)]" />
                </div>
              </div>
              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-dim)]">
                  Processing Date
                  <span
                    className="flex items-center gap-0.5 rounded-full px-1.5 py-px text-[0.55rem] font-bold uppercase tracking-wide text-[var(--accent)]"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
                  >
                    <Wand2 size={8} /> auto
                  </span>
                </span>
                <div
                  className="input flex cursor-default items-center justify-between !bg-[var(--surface)] text-sm font-semibold"
                  title="Stamped with the date of entry"
                >
                  {processingDate || '—'}
                  <Lock size={11} className="shrink-0 text-[var(--text-muted)]" />
                </div>
              </div>

              {/* 2 — contract sets the context for everything below */}
              <div className="sm:col-span-2">
                <Field label="Contract" required hint="Live utilization preview on the right">
                  <select className="input" value={form.contract_id} onChange={set('contract_id')}>
                    <option value="">Select contract…</option>
                    {(fullContracts.length > 0
                      ? fullContracts
                      : contracts.map((c) => ({ ...c, value: 0, start_date: null, end_date: null, vendors: c.vendors }))
                    ).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_no}
                        {c.vendors?.[0]?.name ? ` — ${c.vendors[0].name}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* 3 — invoice identity, copied from the paper invoice */}
              <Field label="Invoice No" required error={showErrors ? issueMap.invoice_no : undefined}>
                <input
                  className={`input ${showErrors && issueMap.invoice_no ? 'invalid' : ''}`}
                  value={form.invoice_no}
                  onChange={set('invoice_no')}
                  placeholder="e.g. INV-2026-014"
                />
              </Field>
              <Field
                label="Invoice Date"
                required
                error={showErrors ? issueMap.invoice_date : undefined}
                hint="Drives the serial number"
              >
                <input
                  type="date"
                  className={`input ${showErrors && issueMap.invoice_date ? 'invalid' : ''}`}
                  value={form.invoice_date}
                  onChange={set('invoice_date')}
                />
              </Field>

              {/* 4 — item reference + outcome preview */}
              <Field label="Item No">
                <input className="input" value={form.item_no} onChange={set('item_no')} />
              </Field>
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Status on Save</span>
                <div className="input flex cursor-default items-center gap-2 !bg-[var(--surface)] text-sm">
                  <StatusBadge tone="warn">Pending</StatusBadge>
                  <span className="text-[0.65rem] text-[var(--text-muted)]">routes to approvals</span>
                </div>
              </div>
            </div>
          </div>

          <div className="glass p-5">
            <div className="section-title">Service Details</div>
            <ServiceSelects
              matrix={matrix}
              value={serviceValue}
              onChange={patchService}
              issues={showErrors ? issueMap : {}}
            />

            <div className="my-4 border-t border-dashed border-[var(--border)]" />

            {/* 4 — amount, once the service scope is known */}
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Amount (Rs)"
                  required
                  error={showErrors ? issueMap.amount : undefined}
                  hint={draftAmount > 0 ? formatAmountWords(draftAmount) : undefined}
                >
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={`input ${showErrors && issueMap.amount ? 'invalid' : ''}`}
                    value={form.amount}
                    onChange={set('amount')}
                    placeholder="0.00"
                  />
                </Field>
              </div>

              {/* 5 — optional remarks last */}
              <div className="sm:col-span-2">
                <Field label="Remarks">
                  <textarea className="input min-h-14" rows={2} value={form.remarks} onChange={set('remarks')} />
                </Field>
              </div>
            </div>
          </div>
        </div>

        {/* Side column — live contract math and validation */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ContractSummaryPanel
            contract={selectedContract ? toContractLite(selectedContract) : null}
            utilization={utilization}
            draftAmount={draftAmount}
          />
          <ValidationSummary issues={issues} idle={!showErrors} />

          <div className="glass p-5">
            <div className="section-title">Enforced Rules</div>
            <ul className="space-y-2.5 text-xs leading-relaxed">
              <li className="flex items-start gap-2 text-[var(--text-dim)]">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--accent-3)]" />
                Duplicate invoice numbers are rejected per contract
              </li>
              <li className="flex items-start gap-2 text-[var(--text-dim)]">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--accent-3)]" />
                {maxInvoiceAmount !== undefined
                  ? `Amounts above Rs ${formatMoney(maxInvoiceAmount)} are rejected`
                  : 'No maximum amount limit configured'}
              </li>
              <li className="flex items-start gap-2 text-[var(--text-dim)]">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--accent-3)]" />
                {futureDateAllowed ? 'Future invoice dates are allowed' : 'Future invoice dates are rejected'}
              </li>
              <li className="flex items-start gap-2 text-[var(--text-dim)]">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--accent-3)]" />
                Amounts cannot exceed the remaining contract balance
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Amount in words — full-width strip closing off the bottom of the form */}
      {draftAmount > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Languages size={14} />
          </span>
          <span className="min-w-0">
            <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Amount in words · Rs {formatMoney(draftAmount, 2)}
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold italic text-[var(--text-dim)]">
              {formatAmountWords(draftAmount)}
            </span>
          </span>
        </div>
      )}
    </Modal>
  )
}
