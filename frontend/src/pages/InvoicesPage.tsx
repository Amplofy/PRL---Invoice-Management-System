import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, CheckCircle2, XCircle, FileOutput, Pencil, FileCheck2 } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { formatMoney, formatDate } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge, { statusTone } from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import EmptyState from '../components/ui/EmptyState'
import DataToolbar from '../components/ui/DataToolbar'
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
      } else {
        toast.success('Invoice approved')
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
                  <td className="font-semibold">{inv.invoice_no ?? '—'}</td>
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

function InvoiceFormModal({ open, invoice, contracts, onClose, onSaved }: InvoiceFormModalProps) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
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
  }, [open, invoice])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.invoice_no.trim()) {
      toast.error('Invoice number is required')
      return
    }
    setSaving(true)
    try {
      const body = {
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
      }
      if (invoice) {
        await apiPut(`/api/invoices/${invoice.id}`, body)
        toast.success('Invoice updated')
      } else {
        await apiPost('/api/invoices', body)
        toast.success('Invoice created')
      }
      onSaved()
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={invoice ? `Edit invoice ${invoice.invoice_no ?? ''}` : 'New invoice'}
      maxWidth="52rem"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save invoice'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Invoice No" required>
          <input className="input" value={form.invoice_no} onChange={set('invoice_no')} />
        </Field>
        <Field label="Serial No">
          <input className="input" value={form.serial_no} onChange={set('serial_no')} />
        </Field>
        <Field label="Invoice Date">
          <input type="date" className="input" value={form.invoice_date} onChange={set('invoice_date')} />
        </Field>
        <Field label="Contract">
          <select className="input" value={form.contract_id} onChange={set('contract_id')}>
            <option value="">—</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contract_no}
              </option>
            ))}
          </select>
        </Field>
        <Field label="T1">
          <input className="input" value={form.t1} onChange={set('t1')} />
        </Field>
        <Field label="T2">
          <input className="input" value={form.t2} onChange={set('t2')} />
        </Field>
        <Field label="T3">
          <input className="input" value={form.t3} onChange={set('t3')} />
        </Field>
        <Field label="Tanker Name">
          <input className="input" value={form.tanker_name} onChange={set('tanker_name')} />
        </Field>
        <Field label="Trips">
          <input type="number" className="input" value={form.trips} onChange={set('trips')} />
        </Field>
        <Field label="Item No">
          <input className="input" value={form.item_no} onChange={set('item_no')} />
        </Field>
        <Field label="Cost Element">
          <input className="input" value={form.cost_element} onChange={set('cost_element')} />
        </Field>
        <Field label="Amount (Rs)">
          <input type="number" className="input" value={form.amount} onChange={set('amount')} />
        </Field>
        <Field label="Service From">
          <input type="date" className="input" value={form.service_from} onChange={set('service_from')} />
        </Field>
        <Field label="Service To">
          <input type="date" className="input" value={form.service_to} onChange={set('service_to')} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Remarks">
            <textarea className="input min-h-20" value={form.remarks} onChange={set('remarks')} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
