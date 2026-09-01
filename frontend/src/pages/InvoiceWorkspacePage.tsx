import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileOutput,
  Save,
  Trash2,
  RotateCcw,
  RefreshCw,
  FolderOpen,
  Receipt,
  Landmark,
  Lock,
} from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { formatMoney, formatDateTime, formatAmountWords, timeAgo } from '../lib/format'
import { contractUtilization, validateInvoice, type ContractLite, type ServiceMatrixRow, type UtilizationInvoice } from '../lib/invoice'
import { emitAppEvent } from '../lib/notify'
import { useToast } from '../components/ui/Toast'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge, { statusTone } from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Tabs from '../components/ui/Tabs'
import EmptyState from '../components/ui/EmptyState'
import ServiceSelects from '../components/ui/ServiceSelects'
import ContractSummaryPanel from '../components/ui/ContractSummaryPanel'
import ValidationSummary from '../components/ui/ValidationSummary'
import AmountWords from '../components/ui/AmountWords'
import { Field } from '../components/ui/Field'
import { useAuth, isAdmin } from '../lib/auth'
import { useFyLock } from '../lib/FyLockProvider'
import { currentFiscalYear, isClosedDate } from '../lib/fiscal'
import { invoiceListPath } from '../lib/invoiceWindow'

interface ContractFull {
  id: string
  contract_no: string
  service: string | null
  value: number
  start_date: string | null
  end_date: string | null
  vendors: Array<{ name: string | null; email?: string | null }> | null
}

interface WorkspaceInvoice {
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
  approved_date: string | null
  contracts: ContractFull | ContractFull[] | null
}

interface PoVersionRow {
  id: string
  invoice_id: string
  serial_no: string
  generated_at: string
  generated_by: string | null
}

interface AuditEntry {
  id: string
  timestamp: string
  user_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
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

function actionTone(action: string): 'ok' | 'warn' | 'err' | 'info' {
  const a = action.toLowerCase()
  if (a === 'approve' || a === 'create' || a === 'ok') return 'ok'
  if (a === 'reject' || a === 'delete') return 'err'
  if (a === 'update' || a === 'generatepo' || a === 'import') return 'warn'
  return 'info'
}

export default function InvoiceWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const { guardWrite } = useFyLock()

  const [invoice, setInvoice] = useState<WorkspaceInvoice | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [matrix, setMatrix] = useState<ServiceMatrixRow[]>([])
  const [allInvoices, setAllInvoices] = useState<UtilizationInvoice[]>([])
  const [contracts, setContracts] = useState<ContractFull[]>([])
  const [poVersions, setPoVersions] = useState<PoVersionRow[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [duplicateCheck, setDuplicateCheck] = useState(true)
  const [maxInvoiceAmount, setMaxInvoiceAmount] = useState<number | undefined>()
  const [futureDateAllowed, setFutureDateAllowed] = useState(false)
  const [tab, setTab] = useState('details')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [viewPo, setViewPo] = useState<PoVersionRow | null>(null)
  const [notFound, setNotFound] = useState(false)

  const loadAll = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const invRes = await apiGet<{ invoice: WorkspaceInvoice }>(`/api/invoices/${id}`)
      const inv = invRes.invoice
      setInvoice(inv)
      setForm({
        serial_no: inv.serial_no ?? '',
        invoice_no: inv.invoice_no ?? '',
        invoice_date: (inv.invoice_date ?? '').slice(0, 10),
        contract_id: inv.contract_id ?? '',
        t1: inv.t1 ?? '',
        t2: inv.t2 ?? '',
        t3: inv.t3 ?? '',
        tanker_name: inv.tanker_name ?? '',
        trips: inv.trips?.toString() ?? '',
        item_no: inv.item_no ?? '',
        cost_element: inv.cost_element ?? '',
        service_from: (inv.service_from ?? '').slice(0, 10),
        service_to: (inv.service_to ?? '').slice(0, 10),
        amount: inv.amount?.toString() ?? '',
        remarks: inv.remarks ?? '',
      })
      const [po, auditRes, matrixRes, invList, contractRes, settingsRes] = await Promise.all([
        apiGet<{ poVersions: PoVersionRow[] }>(`/api/invoices/${id}/po`),
        apiGet<{ auditLog: AuditEntry[] }>('/api/audit-log'),
        apiGet<{ serviceMatrix: ServiceMatrixRow[] }>('/api/service-matrix'),
        apiGet<{ invoices: UtilizationInvoice[] }>(
          inv.contract_id ? invoiceListPath({ contract: inv.contract_id }) : invoiceListPath({ fy: currentFiscalYear() }),
        ),
        apiGet<{ contracts: ContractFull[] }>('/api/contracts'),
        apiGet<{ settings: Array<{ key: string; value: string }> }>('/api/settings'),
      ])
      setPoVersions(po.poVersions)
      setAudit(auditRes.auditLog)
      setMatrix(matrixRes.serviceMatrix)
      setAllInvoices(invList.invoices)
      setContracts(contractRes.contracts)
      for (const { key, value } of settingsRes.settings) {
        if (key === 'duplicate_check') setDuplicateCheck(value === 'true')
        if (key === 'maximum_invoice_amount') setMaxInvoiceAmount(Number(value) || undefined)
        if (key === 'future_date_allowed') setFutureDateAllowed(value === 'true')
      }
      setNotFound(false)
    } catch (e) {
      setNotFound(true)
      toast.error('Failed to load invoice', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === form.contract_id) ?? null,
    [contracts, form.contract_id],
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
        contracts: contracts.map(toContractLite),
        allInvoices,
        excludeInvoiceId: invoice?.id,
        duplicateCheck,
        maxInvoiceAmount,
        futureDateAllowed,
      }),
    [form, matrix, contracts, allInvoices, invoice?.id, duplicateCheck, maxInvoiceAmount, futureDateAllowed],
  )
  const issueMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const i of issues) if (!map[i.field]) map[i.field] = i.message
    return map
  }, [issues])

  const history = useMemo(
    () => audit.filter((a) => a.entity_id === id),
    [audit, id],
  )

  const clearForm = () => {
    if (!invoice) return
    setForm({
      serial_no: invoice.serial_no ?? '',
      invoice_no: invoice.invoice_no ?? '',
      invoice_date: (invoice.invoice_date ?? '').slice(0, 10),
      contract_id: invoice.contract_id ?? '',
      t1: invoice.t1 ?? '',
      t2: invoice.t2 ?? '',
      t3: invoice.t3 ?? '',
      tanker_name: invoice.tanker_name ?? '',
      trips: invoice.trips?.toString() ?? '',
      item_no: invoice.item_no ?? '',
      cost_element: invoice.cost_element ?? '',
      service_from: (invoice.service_from ?? '').slice(0, 10),
      service_to: (invoice.service_to ?? '').slice(0, 10),
      amount: invoice.amount?.toString() ?? '',
      remarks: invoice.remarks ?? '',
    })
    toast.info('Form reset to saved values')
  }

  const save = async () => {
    if (!invoice) return
    if (issues.length > 0) {
      toast.error(`Resolve ${issues.length} validation issue${issues.length > 1 ? 's' : ''} first`)
      return
    }
    if (!(await guardWrite(invoice.invoice_date, form.invoice_date))) return
    setSaving(true)
    try {
      await apiPut(`/api/invoices/${invoice.id}`, {
        serial_no: form.serial_no || null,
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
      })
      toast.success('Invoice saved')
      emitAppEvent('info', 'Invoice updated', `${form.invoice_no} was saved`, `/invoices/${invoice.id}`)
      loadAll()
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const approve = async () => {
    if (!invoice) return
    if (!(await guardWrite(invoice.invoice_date))) return
    try {
      const res = await apiPost<{ po?: { id: string } | null }>(`/api/invoices/${invoice.id}/approve`, {})
      toast.success('Invoice approved', res.po ? 'Payment order generated automatically' : undefined)
      emitAppEvent(
        'ok',
        'Invoice approved',
        `${invoice.invoice_no ?? 'Invoice'} approved${res.po ? ' — PO generated' : ''}`,
        res.po ? '/payment-orders' : `/invoices/${invoice.id}`,
      )
      loadAll()
    } catch (e) {
      toast.error('Approval failed', (e as Error).message)
    }
  }

  const submitReject = async () => {
    if (!invoice) return
    if (!rejectReason.trim()) {
      toast.error('A rejection reason is required')
      return
    }
    if (!(await guardWrite(invoice.invoice_date))) return
    try {
      await apiPost(`/api/invoices/${invoice.id}/reject`, { reason: rejectReason.trim() })
      toast.success('Invoice rejected')
      emitAppEvent('err', 'Invoice rejected', `${invoice.invoice_no ?? 'Invoice'} — ${rejectReason.trim()}`, `/invoices/${invoice.id}`)
      setRejecting(false)
      setRejectReason('')
      loadAll()
    } catch (e) {
      toast.error('Reject failed', (e as Error).message)
    }
  }

  const generatePo = async () => {
    if (!invoice) return
    if (!(await guardWrite(invoice.invoice_date))) return
    try {
      await apiPost(`/api/invoices/${invoice.id}/po`, {})
      toast.success('Payment order generated')
      emitAppEvent('ok', 'Payment order generated', `PO created for ${invoice.invoice_no ?? 'invoice'}`, '/payment-orders')
      loadAll()
    } catch (e) {
      toast.error('PO generation failed', (e as Error).message)
    }
  }

  const doDelete = async () => {
    if (!invoice) return
    if (!(await guardWrite(invoice.invoice_date))) return
    try {
      await apiDelete(`/api/invoices/${invoice.id}`)
      toast.success('Invoice deleted')
      emitAppEvent('warn', 'Invoice deleted', `${invoice.invoice_no ?? 'Invoice'} was removed`)
      navigate('/invoices')
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
      setDeleting(false)
    }
  }

  if (loading && !invoice) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
        Loading invoice workspace…
      </div>
    )
  }

  if (notFound || !invoice) {
    return (
      <GlassCard>
        <EmptyState
          title="Invoice not found"
          description="It may have been deleted or the link is stale."
          icon={<Receipt size={28} />}
          action={
            <Button variant="primary" onClick={() => navigate('/invoices')}>
              <ArrowLeft size={15} /> Back to invoices
            </Button>
          }
        />
      </GlassCard>
    )
  }

  const status = invoice.status
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
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button className="btn btn-ghost" onClick={() => navigate(-1)} title="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Invoice Workspace
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-lg font-extrabold tracking-tight gradient-text">
                {invoice.serial_no ? `${invoice.serial_no} · ` : ''}
                {invoice.invoice_no ?? '—'}
              </h1>
              <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
              {isClosedDate(invoice.invoice_date) && (
                <span className="badge badge-warn">
                  <Lock size={12} /> Closed FY
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost" onClick={clearForm} title="Reset form to saved values">
            <RotateCcw size={15} /> Clear
          </button>
          <button className="btn btn-ghost" onClick={loadAll} title="Reload from server">
            <RefreshCw size={15} /> Refresh
          </button>
          {admin && status !== 'Approved' && poVersions.length === 0 && (
            <button className="btn btn-danger" onClick={() => setDeleting(true)}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          {admin && status !== 'Approved' && poVersions.length > 0 && (
            <span className="badge badge-neutral" title="Invoices with payment orders cannot be deleted">
              <Landmark size={12} /> Locked (PO exists)
            </span>
          )}
          {admin && status === 'Pending' && (
            <>
              <button className="btn btn-success" onClick={approve}>
                <CheckCircle2 size={15} /> Approve
              </button>
              <button
                className="btn btn-warn"
                onClick={() => {
                  setRejecting(true)
                  setRejectReason('')
                }}
              >
                <XCircle size={15} /> Reject
              </button>
            </>
          )}
          {admin && status === 'Approved' && (
            <button className="btn btn-primary" onClick={generatePo}>
              <FileOutput size={15} /> Generate PO
            </button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={saving || issues.length > 0} title={issues.length > 0 ? `${issues.length} validation issue(s)` : 'Save changes'}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'history', label: `History${history.length ? ` (${history.length})` : ''}` },
          { id: 'po', label: `PO Versions${poVersions.length ? ` (${poVersions.length})` : ''}` },
        ]}
      />

      {tab === 'details' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <GlassCard className="p-5">
              <div className="section-title">Invoice Information</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Invoice No" required error={issueMap.invoice_no}>
                  <input className={`input ${issueMap.invoice_no ? 'invalid' : ''}`} value={form.invoice_no} onChange={set('invoice_no')} />
                </Field>
                <Field label="Serial No">
                  <input className="input" value={form.serial_no} onChange={set('serial_no')} />
                </Field>
                <Field label="Invoice Date" error={issueMap.invoice_date}>
                  <input type="date" className={`input ${issueMap.invoice_date ? 'invalid' : ''}`} value={form.invoice_date} onChange={set('invoice_date')} />
                </Field>
                <Field label="Contract">
                  <select className="input" value={form.contract_id} onChange={set('contract_id')}>
                    <option value="">Select contract…</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_no}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Vendor">
                  <input className="input" value={selectedContract?.vendors?.[0]?.name ?? '—'} readOnly disabled />
                </Field>
                <Field label="Item No">
                  <input className="input" value={form.item_no} onChange={set('item_no')} />
                </Field>
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="section-title">Service Details</div>
              <ServiceSelects matrix={matrix} value={serviceValue} onChange={patchService} issues={issueMap} />
            </GlassCard>

            <GlassCard className="p-5">
              <div className="section-title">Financial Information</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Cost Element (auto)">
                  <input className="input" value={form.cost_element || ''} readOnly disabled placeholder="Resolved from service matrix" />
                </Field>
                <Field label="Amount (Rs)" required error={issueMap.amount}>
                  <input type="number" min={0} className={`input ${issueMap.amount ? 'invalid' : ''}`} value={form.amount} onChange={set('amount')} />
                </Field>
                <Field label="Remarks">
                  <input className="input" value={form.remarks} onChange={set('remarks')} placeholder={invoice.remarks ?? ''} />
                </Field>
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="section-title">ERP Status</div>
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                  <span className="text-xs text-[var(--text-muted)]">Validation</span>
                  <span className={`badge ${issues.length ? 'badge-err' : 'badge-ok'}`}>
                    {issues.length ? `${issues.length} issue(s)` : 'Valid'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                  <span className="text-xs text-[var(--text-muted)]">Invoice Status</span>
                  <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                  <span className="text-xs text-[var(--text-muted)]">Approval</span>
                  <span className="text-xs font-semibold">{invoice.approved_by ?? 'Not approved'}</span>
                </div>
              </div>
              {invoice.remarks && (
                <div className="rounded-lg border border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[color-mix(in_srgb,#f59e0b_10%,transparent)] p-3 text-xs text-[var(--warn)]">
                  <b>Remarks:</b> {invoice.remarks}
                </div>
              )}
            </GlassCard>
          </div>

          <div className="space-y-4">
            <ContractSummaryPanel
              contract={selectedContract ? toContractLite(selectedContract) : null}
              utilization={utilization}
              draftAmount={draftAmount}
            />
            <ValidationSummary issues={issues} />
            <AmountWords amount={form.amount} />
          </div>
        </div>
      )}

      {tab === 'history' && (
        <GlassCard className="p-5">
          <div className="section-title">Invoice Timeline</div>
          {history.length === 0 ? (
            <EmptyState
              title="No history yet"
              description="Actions will appear here as you work on this invoice."
            />
          ) : (
            <div className="timeline">
              {history.map((e) => (
                <div key={e.id} className={`timeline-item ${actionTone(e.action)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`badge badge-${actionTone(e.action) === 'ok' ? 'ok' : actionTone(e.action) === 'err' ? 'err' : actionTone(e.action) === 'warn' ? 'warn' : 'info'}`}>
                        {e.action}
                      </span>
                      <span className="text-xs text-[var(--text-dim)]">{e.summary}</span>
                    </div>
                    <span className="shrink-0 text-[0.65rem] text-[var(--text-muted)]" title={formatDateTime(e.timestamp)}>
                      {timeAgo(e.timestamp)}
                    </span>
                  </div>
                  <div className="mt-1 text-[0.65rem] text-[var(--text-muted)]">
                    by {e.user_email ?? 'system'} · {formatDateTime(e.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {tab === 'po' && (
        <GlassCard className="overflow-hidden">
          {poVersions.length === 0 ? (
            <EmptyState
              title="No payment orders yet"
              description={
                status === 'Approved'
                  ? 'Generate a payment order from the action bar above.'
                  : 'Payment orders become available once the invoice is approved.'
              }
              icon={<FileOutput size={28} />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PO Serial</th>
                    <th>Generated By</th>
                    <th>Generated At</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {poVersions.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold">{p.serial_no}</td>
                      <td className="text-xs">{p.generated_by ?? '—'}</td>
                      <td className="text-xs">{formatDateTime(p.generated_at)}</td>
                      <td>
                        <StatusBadge tone="ok">Generated</StatusBadge>
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <button className="btn btn-ghost !px-2.5 !py-1.5" title="View PO" onClick={() => setViewPo(p)}>
                            <FolderOpen size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Reject invoice ${invoice.invoice_no ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
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
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete invoice ${invoice.invoice_no ?? ''}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete}>
              <Trash2 size={15} /> Delete permanently
            </Button>
          </>
        }
      >
        <div className="text-sm text-[var(--text-dim)]">
          This removes the invoice and cannot be undone. Deletion is blocked once payment orders exist.
        </div>
      </Modal>

      <Modal
        open={!!viewPo}
        onClose={() => setViewPo(null)}
        title={`Payment order ${viewPo?.serial_no ?? ''}`}
      >
        {viewPo && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">PO Serial</span>
              <b>{viewPo.serial_no}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Generated By</span>
              <b>{viewPo.generated_by ?? '—'}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Generated At</span>
              <b>{formatDateTime(viewPo.generated_at)}</b>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-3">
              <span className="text-[var(--text-muted)]">Invoice Amount</span>
              <b>Rs {formatMoney(draftAmount || invoice.amount, 2)}</b>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs italic text-[var(--text-dim)]">
              {formatAmountWords(Number(form.amount) || invoice.amount)}
            </div>
            <div className="text-right">
              <Link to="/payment-orders" className="btn btn-ghost">
                Open Payment Orders
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
