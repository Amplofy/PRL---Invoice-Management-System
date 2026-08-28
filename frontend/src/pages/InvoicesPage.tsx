import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, CheckCircle2, XCircle, FileOutput, Pencil, FileCheck2, Lock, AlertTriangle, Wand2 } from 'lucide-react'
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
import ServiceSelects from '../components/ui/ServiceSelects'
import ContractSummaryPanel from '../components/ui/ContractSummaryPanel'
import ValidationSummary from '../components/ui/ValidationSummary'
import AmountWords from '../components/ui/AmountWords'
import { emitAppEvent } from '../lib/notify'
import { downloadCSV, sortRows, dateSortValue, type SortDirection } from '../lib/export'
import { useAuth, isAdmin } from '../lib/auth'
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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [contract, setContract] = useState('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [creating, setCreating] = useState(false)
  const [rejecting, setRejecting] = useState<Invoice | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [generatingPo, setGeneratingPo] = useState<Invoice | null>(null)
  const [sortBy, setSortBy] = useState('invoice_date')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [poReady, setPoReady] = useState<Record<string, boolean>>({})
  const toast = useToast()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      if (contract !== 'all') params.set('contract', contract)
      if (search) params.set('search', search)
      const qs = params.toString()
      const d = await apiGet<{ invoices: Invoice[] }>(`/api/invoices${qs ? `?${qs}` : ''}`)
      setInvoices(d.invoices)
      const c = await apiGet<{ contracts: Contract[] }>('/api/contracts')
      setContracts(c.contracts)
    } catch (e) {
      toast.error('Failed to load invoices', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [status, contract, search, toast])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

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

  const totalShown = useMemo(() => invoices.reduce((s, i) => s + Number(i.amount ?? 0), 0), [invoices])

  const sorted = useMemo(
    () =>
      sortRows(
        invoices,
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
    [invoices, sortBy, sortDir],
  )

  const exportCSV = () =>
    downloadCSV(
      `invoices-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map((i) => ({
        invoice_no: i.invoice_no ?? '',
        serial_no: i.serial_no ?? '',
        invoice_date: i.invoice_date ?? '',
        vendor: vendorOf(i),
        contract: contractNoOf(i),
        item_no: i.item_no ?? '',
        cost_element: i.cost_element ?? '',
        amount: i.amount,
        status: i.status,
        remarks: i.remarks ?? '',
      })),
    )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        description="Browse, approve, reject and generate payment orders for vendor invoices."
        actions={
          <>
            <span className="badge badge-info">
              Shown: <span className="font-bold">Rs {formatMoney(totalShown)}</span>
            </span>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New Invoice
            </Button>
          </>
        }
      />

      <DataToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search invoice or serial no…' }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: STATUSES.map((s) => ({ value: s, label: s === 'all' ? 'All statuses' : s })),
          },
          {
            key: 'contract',
            label: 'Contract',
            value: contract,
            onChange: setContract,
            options: [
              { value: 'all', label: 'All contracts' },
              ...contracts.map((c) => ({ value: c.id, label: c.contract_no })),
            ],
          },
        ]}
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
      />

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Serial</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Contract</th>
                <th>Item</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-semibold">
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="text-[var(--accent)] underline-offset-4 transition hover:underline"
                      title="Open invoice workspace"
                    >
                      {inv.invoice_no ?? '—'}
                    </Link>
                  </td>
                  <td className="text-xs text-[var(--text-muted)]">{inv.serial_no ?? '—'}</td>
                  <td>{formatDate(inv.invoice_date)}</td>
                  <td>{vendorOf(inv)}</td>
                  <td className="text-xs">{contractNoOf(inv)}</td>
                  <td className="text-xs">{inv.item_no ?? '—'}</td>
                  <td className="text-right font-semibold">{formatMoney(inv.amount)}</td>
                  <td>
                    <StatusBadge tone={statusTone(inv.status)}>{inv.status}</StatusBadge>
                  </td>
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
              ))}
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

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={`Reject invoice ${rejecting?.invoice_no ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitReject}>
              <XCircle size={15} /> Reject invoice
            </Button>
          </>
        }
      >
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
        {/* Main column — clean 2-column field rhythm */}
        <div className="space-y-4 lg:col-span-3">
          <div className="glass p-5">
            <div className="section-title">Invoice Details</div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <Field label="Invoice No" required error={showErrors ? issueMap.invoice_no : undefined}>
                <input
                  className={`input ${showErrors && issueMap.invoice_no ? 'invalid' : ''}`}
                  value={form.invoice_no}
                  onChange={set('invoice_no')}
                  placeholder="e.g. INV-2026-014"
                />
              </Field>
              <Field label="Invoice Date" required error={showErrors ? issueMap.invoice_date : undefined}>
                <input
                  type="date"
                  className={`input ${showErrors && issueMap.invoice_date ? 'invalid' : ''}`}
                  value={form.invoice_date}
                  onChange={set('invoice_date')}
                />
              </Field>
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
              <Field label="Item No">
                <input className="input" value={form.item_no} onChange={set('item_no')} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Contract" hint="Live utilization preview on the right">
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
              <div className="sm:col-span-2">
                <Field label="Remarks">
                  <textarea className="input min-h-14" rows={2} value={form.remarks} onChange={set('remarks')} />
                </Field>
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
          </div>
        </div>

        {/* Side column — serial banner, live contract math, validation */}
        <div className="space-y-4 lg:col-span-2">
          <div className="glass relative overflow-hidden p-5">
            <div
              className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full opacity-20 blur-2xl"
              style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="section-title !mb-0">Serial Number</div>
                <span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--accent)]"
                  style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
                >
                  <Wand2 size={10} /> auto
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="font-mono text-[1.7rem] font-extrabold leading-none tracking-wider gradient-text">
                  {generatedSerial || '···· - ··'}
                </span>
                <Lock size={13} className="shrink-0 text-[var(--text-muted)]" />
              </div>
              <div className="mt-2.5 text-[0.68rem] leading-relaxed text-[var(--text-muted)]">
                <b className="text-[var(--text-dim)]">XXX</b> = running count of invoices in{' '}
                {form.invoice_date ? form.invoice_date.slice(0, 4) : new Date().getFullYear()} ·{' '}
                <b className="text-[var(--text-dim)]">YY</b> = fiscal year (Jul–Jun). Regenerates as the
                invoice date changes.
              </div>
            </div>
          </div>

          <ContractSummaryPanel
            contract={selectedContract ? toContractLite(selectedContract) : null}
            utilization={utilization}
            draftAmount={draftAmount}
          />
          {draftAmount > 0 && <AmountWords amount={draftAmount} />}
          <ValidationSummary issues={issues} idle={!showErrors} />
        </div>
      </div>
    </Modal>
  )
}
