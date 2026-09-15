import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { Plus, Trash2, CheckCircle2, XCircle, FileOutput, Pencil, FileCheck2, Lock, AlertTriangle, Languages, Banknote, Clock, Layers } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { formatMoney, formatDate, formatAmountWords } from '../lib/format'
import { catalogLocations, contractUtilization, contractStatusLabel, isSelectableContract, isSignedOff, matrixForContract, nextSerialNo, validateInvoice, type ContractLite, type ServiceMatrixRow, type UtilizationInvoice, type SerialInvoiceLike } from '../lib/invoice'
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
import LockedAutoField from '../components/ui/LockedAutoField'
import ContractSummaryPanel from '../components/ui/ContractSummaryPanel'
import InvoiceVendorField from '../components/ui/InvoiceVendorField'
import ValidationSummary from '../components/ui/ValidationSummary'
import { emitAppEvent } from '../lib/notify'
import { sortRows, dateSortValue, type SortDirection } from '../lib/export'
import { downloadTableWorkbook } from '../lib/analysisWorkbook'
import { useAuth, isAdmin } from '../lib/auth'
import { useColumnVisibility } from '../lib/columns'
import { applyFilters, type FilterColumnDef, type FilterLogic, type FilterState } from '../lib/filters'
import { groupRows } from '../lib/grouping'
import AdvancedFilter from '../components/ui/AdvancedFilter'
import GroupByPicker from '../components/ui/GroupByPicker'
import SummaryCards from '../components/ui/SummaryCards'
import SortableTh from '../components/ui/SortableTh'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ColumnResizeProvider, HeaderTh } from '../components/ui/ResizableTh'
import { costCategory, currentFiscalYear, invoiceBudgetDate, invoiceBudgetFy, invoiceBudgetInfo, isClosedFiscalYear, nearbyFiscalYears } from '../lib/fiscal'
import { useFyLock } from '../lib/FyLockProvider'
import { useMasterAccess } from '../lib/masterAccess'
import { invoiceListPath } from '../lib/invoiceWindow'
import { emitCrossModule, useLiveDomain } from '../lib/store'
import { isUnpaidPriorYearInvoice } from '../lib/accrual'
import { contractNoOf as relContractNo, vendorEmailOf, vendorNameOf } from '../lib/relations'
import { invoiceApprovedAmount } from '../lib/paymentOrder'

interface VendorRef {
  name: string | null
  email?: string | null
}
interface ContractRef {
  contract_no: string | null
  service: string | null
  vendor_id?: string | null
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
  location?: string | null
  tanker_name: string | null
  trips: number | null
  item_no: string | null
  cost_element: string | null
  service_from: string | null
  service_to: string | null
  amount: number
  approved_amount?: number | null
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

const STATUSES = ['all', 'Pending', 'Approved', 'Paid', 'Rejected']

const INVOICE_COLUMN_DEFS = [
  { key: 'invoice_no', label: 'Invoice No' },
  { key: 'serial', label: 'Serial' },
  { key: 'date', label: 'Date' },
  { key: 'processing_date', label: 'Processing Date' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'contract', label: 'Contract' },
  { key: 'item', label: 'Item' },
  { key: 't1', label: 'Type' },
  { key: 't2', label: 'Service' },
  { key: 't3', label: 'Detail' },
  { key: 'location', label: 'Location' },
  { key: 'tanker', label: 'Tanker' },
  { key: 'trips', label: 'Trips' },
  { key: 'cost_element', label: 'Cost Element' },
  { key: 'budget_fy', label: 'Budget FY' },
  { key: 'service_period', label: 'Service Period' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
  { key: 'remarks', label: 'Remarks' },
]

const INVOICE_DEFAULT_COLUMNS = ['invoice_no', 'serial', 'date', 'vendor', 'contract', 't1', 't2', 't3', 'location', 'amount', 'status']

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const col = useColumnVisibility(
    'prl-eoms-cols-invoices-v4',
    INVOICE_COLUMN_DEFS.map((c) => c.key),
    INVOICE_DEFAULT_COLUMNS,
  )
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState[]>([])
  const [filterLogic, setFilterLogic] = useState<FilterLogic>('and')
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [creating, setCreating] = useState(false)
  const [rejecting, setRejecting] = useState<Invoice | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [generatingPo, setGeneratingPo] = useState<Invoice | null>(null)
  const [sortBy, setSortBy] = useState('invoice_date')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const onSort = (key: string, dir: SortDirection) => {
    setSortBy(key)
    setSortDir(dir)
  }
  const [poReady, setPoReady] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastClickIdx, setLastClickIdx] = useState<number | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkRejecting, setBulkRejecting] = useState(false)
  const toast = useToast()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)

  const location = useLocation()
  const navigate = useNavigate()
  const [fyScope, setFyScope] = useState(currentFiscalYear)
  const { guardWrite } = useFyLock()
  const fyChoices = useMemo(() => nearbyFiscalYears(undefined, 2, 1), [])
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiGet<{ invoices: Invoice[] }>(invoiceListPath({ fy: fyScope }))
      setInvoices(d.invoices)
      const c = await apiGet<{ contracts: Contract[] }>('/api/contracts')
      setContracts(c.contracts)
    } catch (e) {
      toast.error('Failed to load invoices', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toast, fyScope])

  useEffect(() => {
    load()
  }, [load])

  const [, liveVersion] = useLiveDomain(['invoices', 'paymentOrders'])
  useEffect(() => {
    if (liveVersion === 0) return
    void load()
  }, [liveVersion, load])

  useEffect(() => {
    const st = location.state as { newInvoice?: boolean } | null
    if (!st?.newInvoice) return
    setCreating(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    document.body.classList.toggle('qa-lift', selected.size > 0)
    return () => document.body.classList.remove('qa-lift')
  }, [selected.size])

  const reload = useCallback(() => load(), [load])

  const deleteInvoice = async (inv: Invoice) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_no ?? ''}?`)) return
    if (!(await guardWrite(invoiceBudgetDate(inv)))) return
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
    if (!(await guardWrite(invoiceBudgetDate(inv)))) return
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
    if (!(await guardWrite(invoiceBudgetDate(rejecting)))) return
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
    if (!isUnpaidPriorYearInvoice(generatingPo) && !(await guardWrite(invoiceBudgetDate(generatingPo)))) return
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
    const named = vendorNameOf(inv)
    if (named !== '—') return named
    return vendorNameOf(contracts.find((c) => c.id === inv.contract_id) ?? null)
  }
  const contractNoOf = (inv: Invoice) => {
    const named = relContractNo(inv)
    if (named !== '—') return named
    return contracts.find((c) => c.id === inv.contract_id)?.contract_no ?? '—'
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
      { key: 't1', label: 'Type', type: 'select', options: [...new Set(invoices.map((i) => i.t1).filter(Boolean) as string[])].sort().map((v) => ({ value: v, label: v })) },
      { key: 't2', label: 'Service', type: 'select', options: [...new Set(invoices.map((i) => i.t2).filter(Boolean) as string[])].sort().map((v) => ({ value: v, label: v })) },
      { key: 't3', label: 'Detail', type: 'select', options: [...new Set(invoices.map((i) => i.t3).filter(Boolean) as string[])].sort().map((v) => ({ value: v, label: v })) },
      { key: 'location', label: 'Location', type: 'select', options: [...new Set(invoices.map((i) => i.location).filter(Boolean) as string[])].sort().map((v) => ({ value: v, label: v })) },
      { key: 'budget_fy', label: 'Budget FY', type: 'select', options: fyChoices.map((y) => ({ value: y, label: y })) },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'text' },
    ],
    [contracts, fyChoices, invoices],
  )

  const invoiceFilterValue = (inv: Invoice, key: string): string | number | null => {
    switch (key) {
      case 'vendor':
        return vendorOf(inv)
      case 'contract_id':
        return inv.contract_id
      case 'budget_fy':
        return invoiceBudgetFy(inv)
      default:
        return (inv as unknown as Record<string, string | number | null>)[key] ?? null
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const searched = q
      ? invoices.filter((i) =>
          `${i.invoice_no ?? ''} ${i.serial_no ?? ''} ${vendorOf(i)} ${contractNoOf(i)} ${i.item_no ?? ''} ${i.t1 ?? ''} ${i.t2 ?? ''} ${i.t3 ?? ''} ${i.location ?? ''}`
            .toLowerCase()
            .includes(q),
        )
      : invoices
    return applyFilters(searched, filters, filterColumns, invoiceFilterValue, filterLogic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, search, filters, filterColumns, filterLogic])

  const sorted = useMemo(
    () =>
      sortRows(
        filtered,
        sortBy || null,
        sortDir,
        (row, key) =>
          key === 'invoice_date'
            ? dateSortValue(row.invoice_date)
            : key === 'processing_date'
              ? dateSortValue(row.processing_date)
            : key === 'amount'
              ? Number(row.amount ?? 0)
              : key === 'trips'
                ? Number(row.trips ?? 0)
              : key === 'status'
                ? String(row.status ?? '')
                : key === 'vendor'
                  ? String(vendorOf(row))
                  : key === 'contract'
                    ? String(contractNoOf(row))
                    : key === 'budget_fy'
                      ? String(invoiceBudgetFy(row) ?? '')
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
    const rows = invoices.filter((i) => selected.has(i.id))
    if (!(await guardWrite(...rows.map((i) => invoiceBudgetDate(i))))) return
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
    const rows = invoices.filter((i) => selected.has(i.id))
    if (!(await guardWrite(...rows.map((i) => invoiceBudgetDate(i))))) return
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
    { key: 't1', label: 'Type' },
    { key: 't2', label: 'Service' },
    { key: 't3', label: 'Detail' },
    { key: 'location', label: 'Location' },
    { key: 'item_no', label: 'Item' },
    { key: 'cost_element', label: 'Cost Element' },
    { key: 'budget_fy', label: 'Budget FY' },
    { key: 'month', label: 'Month' },
  ]

  const invoiceGroupValue = (inv: Invoice, key: string): string | number | null => {
    if (key === 'vendor') return vendorOf(inv)
    if (key === 'contract') return contractNoOf(inv)
    if (key === 'month') return inv.invoice_date ? inv.invoice_date.slice(0, 7) : null
    if (key === 'budget_fy') return invoiceBudgetFy(inv)
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
    () => filtered.filter((i) => isSignedOff(i.status)).length,
    [filtered],
  )
  const rejectedCount = useMemo(() => filtered.filter((i) => i.status === 'Rejected').length, [filtered])

  const exportExcel = async () => {
    const groupMap: Record<string, string> = {
      vendor: 'Vendor',
      contract: 'Contract',
      status: 'Status',
      t1: 'Type',
      t2: 'Service',
      t3: 'Detail',
      location: 'Location',
      item_no: 'Item',
      cost_element: 'Cost element',
      budget_fy: 'Budget FY',
      month: 'Month',
    }
    try {
      await downloadTableWorkbook({
        filename: `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`,
        title: 'Invoice register',
        subtitle: 'All invoice columns with group subtotals and grand total',
        groupBy: groupKey ? groupMap[groupKey] ?? null : null,
        filters: [
          { label: 'Budget FY', value: fyScope === 'all' ? 'All years' : fyScope },
          { label: 'Rows', value: String(sorted.length) },
          { label: 'Grouping', value: groupKey ? groupMap[groupKey] ?? groupKey : 'None' },
        ],
        columns: [
          { key: 'Serial', header: 'Serial', width: 14 },
          { key: 'Invoice no', header: 'Invoice no', width: 16 },
          { key: 'Invoice date', header: 'Invoice date', kind: 'date', width: 14 },
          { key: 'Processing date', header: 'Processing date', kind: 'date', width: 16 },
          { key: 'Service from', header: 'Service from', kind: 'date', width: 14 },
          { key: 'Service to', header: 'Service to', kind: 'date', width: 14 },
          { key: 'Month', header: 'Month', width: 12 },
          { key: 'Budget FY', header: 'Budget FY', width: 12 },
          { key: 'Quarter', header: 'Quarter', width: 10 },
          { key: 'Vendor', header: 'Vendor', width: 28 },
          { key: 'Vendor email', header: 'Vendor email', width: 28 },
          { key: 'Contract', header: 'Contract', width: 16 },
          { key: 'Type', header: 'Type', width: 16 },
          { key: 'Service', header: 'Service', width: 18 },
          { key: 'Detail', header: 'Detail', width: 18 },
          { key: 'Location', header: 'Location', width: 16 },
          { key: 'Item', header: 'Item', width: 12 },
          { key: 'Tanker', header: 'Tanker', width: 14 },
          { key: 'Trips', header: 'Trips', kind: 'int', width: 10 },
          { key: 'Cost element', header: 'Cost element', width: 14 },
          { key: 'Category', header: 'Category', width: 14 },
          { key: 'Status', header: 'Status', width: 12 },
          { key: 'Amount (Rs)', header: 'Amount (Rs)', kind: 'money', width: 16 },
          { key: 'Approved (Rs)', header: 'Approved (Rs)', kind: 'money', width: 16 },
          { key: 'Remarks', header: 'Remarks', width: 32 },
          { key: 'Approved by', header: 'Approved by', width: 16 },
        ],
        rows: sorted.map((i) => {
          const fi = invoiceBudgetInfo(i)
          return {
            Serial: i.serial_no ?? '',
            'Invoice no': i.invoice_no ?? '',
            'Invoice date': i.invoice_date ?? '',
            'Processing date': i.processing_date ?? '',
            'Service from': i.service_from ?? '',
            'Service to': i.service_to ?? '',
            Month: i.invoice_date ? i.invoice_date.slice(0, 7) : '',
            'Budget FY': fi?.fy ?? '',
            Quarter: fi?.quarter ?? '',
            Vendor: vendorOf(i),
            'Vendor email': vendorEmailOf(i),
            Contract: contractNoOf(i),
            Type: i.t1 ?? '',
            Service: i.t2 ?? '',
            Detail: i.t3 ?? '',
            Location: i.location ?? '',
            Item: i.item_no ?? '',
            Tanker: i.tanker_name ?? '',
            Trips: Number(i.trips ?? 0),
            'Cost element': i.cost_element ?? '',
            Category: costCategory(i.cost_element),
            Status: i.status,
            'Amount (Rs)': Number(i.amount ?? 0),
            'Approved (Rs)': invoiceApprovedAmount(i),
            Remarks: i.remarks ?? '',
            'Approved by': i.approved_by ?? '',
          }
        }),
      })
    } catch (e) {
      toast.error('Export failed', (e as Error).message)
    }
  }

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

      <div className="flex flex-wrap items-center gap-1.5">
        {fyChoices.map((fy) => (
          <button
            key={fy}
            type="button"
            className={`chip ${fyScope === fy ? 'active' : ''}`}
            onClick={() => setFyScope(fy)}
            aria-pressed={fyScope === fy}
          >
            {isClosedFiscalYear(fy) ? <Lock size={11} /> : null}
            {fy}
            {fy === currentFiscalYear() ? ' · now' : ''}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${fyScope === 'all' ? 'active' : ''}`}
          onClick={() => setFyScope('all')}
          aria-pressed={fyScope === 'all'}
        >
          All years
        </button>
      </div>

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
            label: 'Signed off / Paid',
            value: String(approvedCount),
            sub: 'signed off or paid',
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
          <AdvancedFilter columns={filterColumns} filters={filters} onChange={setFilters} logic={filterLogic} onLogicChange={setFilterLogic} />
        }
        sort={{
          columns: [
            { key: 'invoice_date', label: 'Date' },
            { key: 'invoice_no', label: 'Invoice no' },
            { key: 'vendor', label: 'Vendor' },
            { key: 't1', label: 'Type' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'budget_fy', label: 'Budget FY' },
          ],
          value: sortBy,
          direction: sortDir,
          onValueChange: setSortBy,
          onDirectionChange: setSortDir,
        }}
        onExport={() => { void exportExcel() }}
        exportLabel="Export Excel"
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
        <ColumnResizeProvider storageKey="prl-eoms-colw-invoices">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <HeaderTh columnKey="select" className="w-9 pr-0" resizable={false}>
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
                </HeaderTh>
                {col.show('invoice_no') && <SortableTh label="Invoice No" columnKey="invoice_no" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('serial') && <SortableTh label="Serial" columnKey="serial_no" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('date') && <SortableTh label="Date" columnKey="invoice_date" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc />}
                {col.show('processing_date') && <SortableTh label="Processing" columnKey="processing_date" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc />}
                {col.show('vendor') && <SortableTh label="Vendor" columnKey="vendor" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('contract') && <SortableTh label="Contract" columnKey="contract" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('item') && <SortableTh label="Item" columnKey="item_no" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('t1') && <SortableTh label="Type" columnKey="t1" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('t2') && <SortableTh label="Service" columnKey="t2" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('t3') && <SortableTh label="Detail" columnKey="t3" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('location') && <SortableTh label="Location" columnKey="location" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('tanker') && <HeaderTh columnKey="tanker">Tanker</HeaderTh>}
                {col.show('trips') && <SortableTh label="Trips" columnKey="trips" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc align="right" />}
                {col.show('cost_element') && <SortableTh label="Cost Element" columnKey="cost_element" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('budget_fy') && <SortableTh label="Budget FY" columnKey="budget_fy" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('service_period') && <HeaderTh columnKey="service_period">Service Period</HeaderTh>}
                {col.show('amount') && <SortableTh label="Amount" columnKey="amount" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc align="right" />}
                {col.show('status') && <SortableTh label="Status" columnKey="status" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('remarks') && <HeaderTh columnKey="remarks">Remarks</HeaderTh>}
                <HeaderTh columnKey="actions" align="right">Actions</HeaderTh>
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
                      {isClosedFiscalYear(invoiceBudgetFy(inv) ?? '') && (
                        <Lock size={12} className="ml-1.5 inline text-[var(--text-muted)]" aria-label="Closed fiscal year" />
                      )}
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
                  {col.show('t1') && <td className="text-xs">{inv.t1 ?? '—'}</td>}
                  {col.show('t2') && <td className="text-xs">{inv.t2 ?? '—'}</td>}
                  {col.show('t3') && <td className="text-xs">{inv.t3 ?? '—'}</td>}
                  {col.show('location') && <td className="text-xs">{inv.location ?? '—'}</td>}
                  {col.show('tanker') && <td className="text-xs">{inv.tanker_name ?? '—'}</td>}
                  {col.show('trips') && <td className="text-right text-xs">{inv.trips ?? '—'}</td>}
                  {col.show('cost_element') && <td className="text-xs">{inv.cost_element ?? '—'}</td>}
                  {col.show('budget_fy') && <td className="text-xs">{invoiceBudgetFy(inv) ?? '—'}</td>}
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
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge tone={statusTone(inv.status)}>{inv.status}</StatusBadge>
                        {isUnpaidPriorYearInvoice(inv) && <span className="badge badge-warn">Closed FY</span>}
                      </div>
                    </td>
                  )}
                  {col.show('remarks') && (
                    <td className="text-xs text-[var(--text-muted)]" title={inv.remarks ?? undefined}>
                      {inv.remarks ?? '—'}
                    </td>
                  )}
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEditing(inv)}>
                        <Pencil size={14} />
                      </button>
                      {inv.status === 'Pending' && (
                        <>
                          <button className="btn btn-ghost btn-sm" title="Approve" onClick={() => approve(inv)}>
                            <CheckCircle2 size={14} className="text-[var(--accent-3)]" />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
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
                      {(inv.status === 'Approved' || inv.status === 'Paid') &&
                        (poReady[inv.id] || inv.status === 'Paid' ? (
                          <Link
                            to="/payment-orders"
                            className="btn btn-ghost btn-sm"
                            title={inv.status === 'Paid' ? 'Payment released — view PO' : 'Payment order generated — view'}
                          >
                            <FileCheck2 size={14} className="text-[var(--accent-3)]" />
                          </Link>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Generate PO"
                            onClick={() => setGeneratingPo(inv)}
                          >
                            <FileOutput size={14} className="text-[var(--accent-2)]" />
                          </button>
                        ))}
                      {admin && inv.status !== 'Paid' && (
                        <button
                          className="btn btn-ghost btn-sm"
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
        </ColumnResizeProvider>
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
  status?: string | null
  services?: Array<{ id?: string; t1: string; t2: string | null; t3: string | null }>
  vendors: VendorRef[] | null
  vendor_id?: string | null
}

function toContractLite(c: ContractFull): ContractLite {
  return {
    id: c.id,
    contract_no: c.contract_no,
    value: Number(c.value ?? 0),
    start_date: c.start_date,
    end_date: c.end_date,
    vendor: vendorNameOf(c, '') || null,
    service: c.service ?? null,
    status: c.status ?? null,
    services: c.services,
  }
}

function InvoiceFormModal({ open, invoice, contracts, onClose, onSaved }: InvoiceFormModalProps) {
  const [form, setForm] = useState<Record<string, string>>(() => ({
    serial_no: '',
    invoice_no: '',
    invoice_date: '',
    contract_id: '',
    t1: '',
    t2: '',
    t3: '',
    location: '',
    tanker_name: '',
    trips: '',
    item_no: '',
    cost_element: '',
    service_from: '',
    service_to: '',
    amount: '',
    remarks: '',
    vendor_id: '',
  }))
  const [saving, setSaving] = useState(false)
  const { guardWrite } = useFyLock()
  const { unlocked: masterOn } = useMasterAccess()
  const [serialOverride, setSerialOverride] = useState<string | null>(null)
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
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (!open) return
    setShowErrors(false)
    setEntryDate(new Date().toISOString().slice(0, 10))
    setSerialOverride(invoice?.serial_no ?? null)
    setForm({
      serial_no: invoice?.serial_no ?? '',
      invoice_no: invoice?.invoice_no ?? '',
      invoice_date: (invoice?.invoice_date ?? '').slice(0, 10),
      contract_id: invoice?.contract_id ?? '',
      t1: invoice?.t1 ?? '',
      t2: invoice?.t2 ?? '',
      t3: invoice?.t3 ?? '',
      location: invoice?.location ?? '',
      tanker_name: invoice?.tanker_name ?? '',
      trips: invoice?.trips?.toString() ?? '',
      item_no: invoice?.item_no ?? '',
      cost_element: invoice?.cost_element ?? '',
      service_from: (invoice?.service_from ?? '').slice(0, 10),
      service_to: (invoice?.service_to ?? '').slice(0, 10),
      amount: invoice?.amount?.toString() ?? '',
      remarks: invoice?.remarks ?? '',
      vendor_id: '',
    })
    Promise.all([
      apiGet<{ serviceMatrix: ServiceMatrixRow[] }>('/api/service-matrix'),
      apiGet<{ invoices: UtilizationInvoice[] }>(
        invoice?.contract_id
          ? invoiceListPath({ contract: invoice.contract_id })
          : invoiceListPath({ fy: currentFiscalYear() }),
      ),
      apiGet<{ contracts: ContractFull[] }>('/api/contracts'),
      apiGet<{ settings: Array<{ key: string; value: string }> }>('/api/settings'),
      apiGet<{ vendors: Array<{ id: string; name: string }> }>('/api/vendors'),
    ])
      .then(([m, i, c, s, v]) => {
        setMatrix(m.serviceMatrix)
        setAllInvoices(i.invoices)
        setFullContracts(c.contracts)
        setVendors(v.vendors)
        const contractVendorId =
          c.contracts.find((row) => row.id === (invoice?.contract_id ?? ''))?.vendor_id ?? ''
        setForm((f) => ({ ...f, vendor_id: f.vendor_id || contractVendorId }))
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
        relaxContractWindow: masterOn,
      }),
    [form, matrix, fullContracts, allInvoices, invoice?.id, duplicateCheck, maxInvoiceAmount, futureDateAllowed, masterOn],
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
      serialOverride ||
      nextSerialNo(form.invoice_date || undefined, allInvoices as SerialInvoiceLike[], invoice?.id),
    [serialOverride, form.invoice_date, allInvoices, invoice?.id],
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
    if (!masterOn && !(await guardWrite(invoiceBudgetDate(invoice ?? {}), invoiceBudgetDate(form)))) return
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
        location: form.location || null,
        tanker_name: form.tanker_name || null,
        trips: form.trips ? Number(form.trips) : null,
        item_no: form.item_no || null,
        cost_element: form.cost_element || null,
        service_from: form.service_from || null,
        service_to: form.service_to || null,
        amount: Number(form.amount) || 0,
        remarks: form.remarks || null,
        ...(masterOn ? { masterAccess: true } : {}),
        ...(masterOn && form.vendor_id && form.vendor_id !== (selectedContract?.vendor_id ?? '')
          ? { vendor_id: form.vendor_id }
          : {}),
      }
      if (invoice) {
        await apiPut(`/api/invoices/${invoice.id}`, body)
        toast.success('Invoice updated')
        emitAppEvent('info', 'Invoice updated', `${form.invoice_no} was saved`)
        emitCrossModule('invoice', 'update', invoice.id)
        if (masterOn && form.vendor_id && form.vendor_id !== (selectedContract?.vendor_id ?? '')) {
          emitCrossModule('contract', 'update', form.contract_id)
        }
      } else {
        await apiPost('/api/invoices', body)
        toast.success('Invoice created')
        emitAppEvent('ok', 'Invoice created', `${form.invoice_no} entered for processing`, '/invoices')
        emitCrossModule('invoice', 'create')
        if (masterOn && form.vendor_id && form.vendor_id !== (selectedContract?.vendor_id ?? '')) {
          emitCrossModule('contract', 'update', form.contract_id)
        }
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
    location: form.location ?? '',
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
      const locs = catalogLocations(row)
      if (!locs.some((l) => l.toLowerCase() === (next.location ?? '').trim().toLowerCase())) {
        next.location = locs.length === 1 ? locs[0]! : ''
      }
      return next
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={invoice ? `Edit invoice ${invoice.invoice_no ?? ''}` : 'New invoice'}
      maxWidth="70rem"
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
              <LockedAutoField
                label="Serial No"
                value={generatedSerial}
                placeholder="···· - ··"
                hint="Auto-generated: running count for the Gregorian year + fiscal-year tag (Jul–Jun)"
                onCommit={setSerialOverride}
              />
              <LockedAutoField
                label="Processing Date"
                value={processingDate}
                type="date"
                hint="Stamped with the date of entry"
                onCommit={setEntryDate}
              />

              <div className="sm:col-span-2">
                <Field
                  label="Contract"
                  required
                  hint={masterOn ? 'Master Access: closed and invalid contracts allowed' : 'Live utilization preview on the right'}
                >
                  <select
                    className="input"
                    value={form.contract_id}
                    onChange={(e) => {
                      const contract_id = e.target.value
                      const next = fullContracts.find((c) => c.id === contract_id)
                      setForm((f) => ({
                        ...f,
                        contract_id,
                        t1: '',
                        t2: '',
                        t3: '',
                        location: '',
                        tanker_name: '',
                        trips: '',
                        cost_element: '',
                        vendor_id: next?.vendor_id ?? '',
                      }))
                    }}
                  >
                    <option value="">Select contract...</option>
                    {(fullContracts.length > 0
                      ? fullContracts
                      : contracts.map((c) => ({ ...c, value: 0, start_date: null, end_date: null, vendors: c.vendors }))
                    )
                      .filter((c) => masterOn || isSelectableContract(c))
                      .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_no}
                        {vendorNameOf(c, '') ? ` — ${vendorNameOf(c, '')}` : ''}
                        {contractStatusLabel(c) ? ` (${contractStatusLabel(c)})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {masterOn && (
                <div className="sm:col-span-2">
                  <InvoiceVendorField
                    vendorId={form.vendor_id ?? ''}
                    vendors={vendors}
                    displayName={vendorNameOf(selectedContract, '')}
                    masterOn={masterOn}
                    onChange={(vendor_id) => setForm((f) => ({ ...f, vendor_id }))}
                  />
                </div>
              )}

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

              <Field label="Item No">
                <input className="input" value={form.item_no} onChange={set('item_no')} />
              </Field>
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Status on Save</span>
                <div className="input flex cursor-default items-center gap-2 bg-[var(--surface)]! text-sm">
                  <StatusBadge tone={statusTone(invoice?.status ?? 'Pending')}>{invoice?.status ?? 'Pending'}</StatusBadge>
                  <span className="text-[0.65rem] text-[var(--text-muted)]">routes to approvals</span>
                </div>
              </div>
            </div>
          </div>

          <div className="glass p-5">
            <div className="section-title">Service Details</div>
            <ServiceSelects
              matrix={matrixForContract(matrix, selectedContract)}
              contractId={form.contract_id}
              value={serviceValue}
              onChange={patchService}
              issues={showErrors ? issueMap : {}}
            />

            <div className="my-4 border-t border-dashed border-[var(--border)]" />

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
