import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, AlertTriangle, Banknote, Truck, Layers, Lock } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { formatMoney, formatDate } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import EmptyState from '../components/ui/EmptyState'
import DataToolbar from '../components/ui/DataToolbar'
import ColumnsButton from '../components/ui/ColumnsButton'
import AdvancedFilter from '../components/ui/AdvancedFilter'
import GroupByPicker from '../components/ui/GroupByPicker'
import SummaryCards from '../components/ui/SummaryCards'
import { downloadCSV, sortRows, dateSortValue, type SortDirection } from '../lib/export'
import { useAuth, isAdmin } from '../lib/auth'
import { useColumnVisibility } from '../lib/columns'
import { applyFilters, type FilterColumnDef, type FilterLogic, type FilterState } from '../lib/filters'
import { groupRows } from '../lib/grouping'
import { useFyLock } from '../lib/FyLockProvider'
import { isClosedDate } from '../lib/fiscal'
import SortableTh from '../components/ui/SortableTh'
import { t1Options, t2Options, t3Options, type ServiceMatrixRow } from '../lib/invoice'

interface Vendor {
  id: string
  name: string
  email: string | null
}
interface Contract {
  id: string
  contract_no: string
  vendor_id: string | null
  service: string | null
  start_date: string | null
  end_date: string | null
  value: number | null
  status: string | null
  vendors: Vendor[] | null
  services?: Array<{ id?: string; t1: string; t2: string | null; t3: string | null }>
}

const CONTRACT_COLUMN_DEFS = [
  { key: 'contract_no', label: 'Contract No' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'service', label: 'Service' },
  { key: 'start_date', label: 'Start' },
  { key: 'end_date', label: 'End' },
  { key: 'period_days', label: 'Period (days)' },
  { key: 'value', label: 'Value' },
  { key: 'status', label: 'Status' },
]

const CONTRACT_DEFAULT_COLUMNS = ['contract_no', 'vendor', 'service', 'start_date', 'end_date', 'value', 'status']

function contractPeriodDays(c: Contract): number | null {
  if (!c.start_date || !c.end_date) return null
  const ms = new Date(c.end_date).getTime() - new Date(c.start_date).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  return Math.round(ms / 86400000)
}

function serviceTriple(s: { t1: string; t2?: string | null; t3?: string | null }): string {
  return [s.t1, s.t2, s.t3].filter(Boolean).join(' / ')
}

function serviceKey(s: { t1: string; t2?: string | null; t3?: string | null }): string {
  return `${s.t1}|${s.t2 ?? ''}|${s.t3 ?? ''}`
}

function emptyServiceRow(): { t1: string; t2: string; t3: string } {
  return { t1: '', t2: '', t3: '' }
}

function contractServicesLabel(c: Contract): string {
  if (c.services?.length) return c.services.map(serviceTriple).join('; ')
  return c.service ?? ''
}

const CONTRACT_FILTER_COLUMNS: FilterColumnDef[] = [
  { key: 'contract_no', label: 'Contract No', type: 'text' },
  { key: 'vendor', label: 'Vendor', type: 'text' },
  { key: 'service', label: 'Service', type: 'text' },
  { key: 'status', label: 'Status', type: 'select' },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'start_date', label: 'Start Date', type: 'date' },
  { key: 'end_date', label: 'End Date', type: 'date' },
]

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('end_date')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const onSort = (key: string, dir: SortDirection) => {
    setSortBy(key)
    setSortDir(dir)
  }
  const [filters, setFilters] = useState<FilterState[]>([])
  const [filterLogic, setFilterLogic] = useState<FilterLogic>('and')
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const col = useColumnVisibility(
    'prl-eoms-cols-contracts',
    CONTRACT_COLUMN_DEFS.map((c) => c.key),
    CONTRACT_DEFAULT_COLUMNS,
  )
  const toast = useToast()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const { guardWrite } = useFyLock()
  const navigate = useNavigate()
  const location = useLocation()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, v] = await Promise.all([
        apiGet<{ contracts: Contract[] }>('/api/contracts'),
        apiGet<{ vendors: Vendor[] }>('/api/vendors'),
      ])
      setContracts(c.contracts)
      setVendors(v.vendors)
    } catch (e) {
      toast.error('Failed to load contracts', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const st = location.state as { newContract?: boolean } | null
    if (!st?.newContract) return
    if (admin) setCreating(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate, admin])

  const vendorName = (c: Contract) => c.vendors?.[0]?.name ?? '—'

  const daysLeft = (c: Contract): number | null => {
    if (!c.end_date) return null
    return Math.round((new Date(c.end_date).getTime() - Date.now()) / 86400000)
  }

  const expiryBadge = (c: Contract) => {
    const d = daysLeft(c)
    if (d === null) return <StatusBadge tone="neutral">{c.status ?? 'Open'}</StatusBadge>
    if (d < 0) return <StatusBadge tone="err">Expired</StatusBadge>
    if (d <= 60) return <StatusBadge tone="warn">{d}d left</StatusBadge>
    return <StatusBadge tone="ok">{d}d left</StatusBadge>
  }

  const remove = async (c: Contract) => {
    if (!window.confirm(`Delete contract ${c.contract_no}?`)) return
    if (!(await guardWrite(c.start_date))) return
    try {
      await apiDelete(`/api/contracts/${c.id}`)
      toast.success('Contract deleted')
      load()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  const expiringSoon = contracts.filter((c) => {
    const d = daysLeft(c)
    return d !== null && d >= 0 && d <= 60
  }).length

  const filterColumns = useMemo<FilterColumnDef[]>(
    () =>
      CONTRACT_FILTER_COLUMNS.map((c) =>
        c.key === 'status'
          ? {
              ...c,
              options: Array.from(new Set(contracts.map((x) => x.status ?? '').filter(Boolean))).map((s) => ({
                value: s,
                label: s,
              })),
            }
          : c,
      ),
    [contracts],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const searched = q
      ? contracts.filter((c) =>
          `${c.contract_no} ${vendorName(c)} ${contractServicesLabel(c)} ${c.status ?? ''}`.toLowerCase().includes(q),
        )
      : contracts
    return applyFilters(searched, filters, filterColumns, (c, key) => {
      if (key === 'vendor') return vendorName(c)
      if (key === 'service') return contractServicesLabel(c)
      return (c as unknown as Record<string, string | number | null>)[key] ?? null
    }, filterLogic)
  }, [contracts, search, filters, filterColumns, filterLogic])

  const totalValue = useMemo(() => filtered.reduce((s, c) => s + Number(c.value ?? 0), 0), [filtered])
  const vendorCount = useMemo(() => new Set(filtered.map((c) => vendorName(c))).size, [filtered])

  const GROUP_BY_CONTRACT = [
    { key: 'vendor', label: 'Vendor' },
    { key: 'service', label: 'Service' },
    { key: 'status', label: 'Status' },
  ]

  const contractGroupValue = (c: Contract, key: string): string | number | null => {
    if (key === 'vendor') return vendorName(c)
    if (key === 'service') return contractServicesLabel(c)
    return (c as unknown as Record<string, string | number | null>)[key] ?? null
  }

  const sorted = useMemo(
    () =>
      sortRows(
        filtered,
        sortBy || null,
        sortDir,
        (row, key) =>
          key === 'start_date'
            ? dateSortValue(row.start_date)
            : key === 'end_date'
              ? dateSortValue(row.end_date)
              : key === 'value'
                ? Number(row.value ?? 0)
              : key === 'vendor'
                ? String(vendorName(row))
                  : key === 'period_days'
                    ? Number(contractPeriodDays(row) ?? 0)
                    : String((row as unknown as Record<string, unknown>)[key] ?? ''),
      ),
    [filtered, sortBy, sortDir],
  )

  const grouped = useMemo(
    () => groupRows(sorted, groupKey, contractGroupValue, (c) => Number(c.value ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, groupKey],
  )

  const visibleColCount = CONTRACT_COLUMN_DEFS.filter((c) => col.show(c.key)).length + (admin ? 1 : 0)

  const exportCSV = () =>
    downloadCSV(
      `contracts-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map((c) => ({
        ...(col.show('contract_no') ? { contract_no: c.contract_no } : {}),
        ...(col.show('vendor') ? { vendor: vendorName(c) } : {}),
                ...(col.show('service') ? { service: contractServicesLabel(c) } : {}),
        ...(col.show('start_date') ? { start_date: c.start_date ?? '' } : {}),
        ...(col.show('end_date') ? { end_date: c.end_date ?? '' } : {}),
        ...(col.show('period_days') ? { period_days: contractPeriodDays(c) ?? '' } : {}),
        ...(col.show('value') ? { value: c.value ?? 0 } : {}),
        ...(col.show('status') ? { status: c.status ?? '' } : {}),
      })),
    )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contracts"
        description="Master service contracts with vendors."
        actions={
          <>
            {expiringSoon > 0 && (
              <span className="badge badge-warn">
                <AlertTriangle size={13} /> {expiringSoon} expiring soon
              </span>
            )}
            {admin && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} /> New Contract
              </Button>
            )}
          </>
        }
      />

      <SummaryCards
        items={[
          {
            label: 'Total Value',
            value: `Rs ${formatMoney(totalValue)}`,
            sub: `${filtered.length} contract${filtered.length === 1 ? '' : 's'} shown`,
            icon: <Banknote size={16} />,
            tone: 'primary',
          },
          {
            label: 'Vendors',
            value: String(vendorCount),
            sub: 'distinct vendors',
            icon: <Truck size={16} />,
            tone: 'purple',
          },
          {
            label: 'Expiring Soon',
            value: String(expiringSoon),
            sub: 'within 60 days',
            icon: <AlertTriangle size={16} />,
            tone: 'warn',
          },
        ]}
      />

      <DataToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search contract, vendor, service…' }}
        filterBar={<AdvancedFilter columns={CONTRACT_FILTER_COLUMNS} filters={filters} onChange={setFilters} logic={filterLogic} onLogicChange={setFilterLogic} />}
        sort={{
          columns: [
            { key: 'contract_no', label: 'Contract no' },
            { key: 'vendor', label: 'Vendor' },
            { key: 'start_date', label: 'Start date' },
            { key: 'end_date', label: 'End date' },
            { key: 'value', label: 'Value' },
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
          columns={CONTRACT_COLUMN_DEFS}
          isVisible={col.show}
          onToggle={col.toggle}
          onReset={col.reset}
          hiddenCount={col.hiddenCount}
        />
        <GroupByPicker options={GROUP_BY_CONTRACT} value={groupKey} onChange={setGroupKey} />
      </DataToolbar>

      <GlassCard className="overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {col.show('contract_no') && <SortableTh label="Contract No" columnKey="contract_no" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('vendor') && <SortableTh label="Vendor" columnKey="vendor" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('service') && <SortableTh label="Service" columnKey="service" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('start_date') && <SortableTh label="Start" columnKey="start_date" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc />}
                {col.show('end_date') && <SortableTh label="End" columnKey="end_date" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc />}
                {col.show('period_days') && <SortableTh label="Period (days)" columnKey="period_days" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc align="right" />}
                {col.show('value') && <SortableTh label="Value" columnKey="value" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc align="right" />}
                {col.show('status') && <SortableTh label="Status" columnKey="status" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {admin && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const renderRow = (c: Contract) => (
                  <tr key={c.id}>
                    {col.show('contract_no') && (
                      <td className="font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          {c.contract_no}
                          {isClosedDate(c.start_date) && (
                            <Lock size={12} className="text-[var(--warn)]" aria-label="Closed fiscal year" />
                          )}
                        </span>
                      </td>
                    )}
                    {col.show('vendor') && <td>{vendorName(c)}</td>}
                    {col.show('service') && <td className="text-xs">{contractServicesLabel(c) || '—'}</td>}
                    {col.show('start_date') && <td>{formatDate(c.start_date)}</td>}
                    {col.show('end_date') && <td>{formatDate(c.end_date)}</td>}
                    {col.show('period_days') && (
                      <td className="text-right text-xs">{contractPeriodDays(c) ?? '—'}</td>
                    )}
                    {col.show('value') && <td className="text-right font-semibold">{formatMoney(c.value)}</td>}
                    {col.show('status') && <td>{expiryBadge(c)}</td>}
                    {admin && (
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEditing(c)}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => remove(c)}>
                            <Trash2 size={14} className="text-[var(--danger)]" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )

                const rows = grouped
                  ? grouped.map((g) => (
                      <Fragment key={`grp-${g.key}`}>
                        <tr className="subtotal-row">
                          <td colSpan={visibleColCount}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2 font-semibold">
                                <Layers size={13} className="text-[var(--accent)]" />
                                {g.key}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {g.count} contract{g.count === 1 ? '' : 's'} ·{' '}
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
                              {sorted.length} contract{sorted.length === 1 ? '' : 's'} ·{' '}
                              <b>Rs {formatMoney(totalValue)}</b>
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
        {!loading && sorted.length === 0 && (
          <EmptyState
            title={search ? 'No matching contracts' : 'No contracts yet'}
            description={search ? 'Try a different search.' : 'Import or create contracts to get started.'}
            action={
              admin ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus size={16} /> Create contract
                </Button>
              ) : undefined
            }
          />
        )}
      </GlassCard>

      {(creating || editing) && (
        <ContractFormModal
          open
          contract={editing}
          vendors={vendors}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

interface ContractFormModalProps {
  open: boolean
  contract: Contract | null
  vendors: Vendor[]
  onClose: () => void
  onSaved: () => void
}

function ContractFormModal({ open, contract, vendors, onClose, onSaved }: ContractFormModalProps) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [matrix, setMatrix] = useState<ServiceMatrixRow[]>([])
  const [selected, setSelected] = useState<Array<{ t1: string; t2: string; t3: string }>>([emptyServiceRow()])
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const { guardWrite } = useFyLock()

  useEffect(() => {
    if (!open) return
    setForm({
      contract_no: contract?.contract_no ?? '',
      vendor_id: contract?.vendor_id ?? '',
      start_date: (contract?.start_date ?? '').slice(0, 10),
      end_date: (contract?.end_date ?? '').slice(0, 10),
      value: contract?.value?.toString() ?? '',
      status: contract?.status ?? 'Open',
    })
    const existing = (contract?.services ?? []).map((s) => ({
      t1: s.t1,
      t2: s.t2 ?? '',
      t3: s.t3 ?? '',
    }))
    setSelected(existing.length ? existing : [emptyServiceRow()])
    void apiGet<{ serviceMatrix: ServiceMatrixRow[] }>('/api/service-matrix')
      .then((r) => setMatrix(r.serviceMatrix ?? []))
      .catch((e) => toast.error('Failed to load service catalog', (e as Error).message))
  }, [open, contract, toast])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const setService = (idx: number, patch: Partial<{ t1: string; t2: string; t3: string }>) => {
    setSelected((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const submit = async () => {
    if (!form.contract_no.trim() || !form.vendor_id) {
      toast.error('Contract number and vendor are required')
      return
    }
    const cleaned = selected
      .map((s) => ({ t1: s.t1.trim(), t2: s.t2.trim() || null, t3: s.t3.trim() || null }))
      .filter((s) => s.t1)
    if (!cleaned.length) {
      toast.error('Add at least one service')
      return
    }
    for (const row of cleaned) {
      if (!row.t2) {
        toast.error('Each service needs Type 2')
        return
      }
      const t3s = t3Options(matrix, row.t1, row.t2)
      if (t3s.length && !row.t3) {
        toast.error('Each service needs Type 3')
        return
      }
    }
    const seen = new Set<string>()
    const unique = cleaned.filter((s) => {
      const key = serviceKey(s)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (!(await guardWrite(contract?.start_date, form.start_date))) return
    setSaving(true)
    try {
      const service = Array.from(new Set(unique.map((s) => s.t2 || s.t1).filter(Boolean))).join(', ')
      const body = {
        contract_no: form.contract_no.trim(),
        vendor_id: form.vendor_id,
        service: service || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        value: form.value ? Number(form.value) : null,
        status: form.status || 'Open',
        services: unique,
      }
      if (contract) {
        await apiPut(`/api/contracts/${contract.id}`, body)
        toast.success('Contract updated')
      } else {
        await apiPost('/api/contracts', body)
        toast.success('Contract created')
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
      title={contract ? `Edit contract ${contract.contract_no}` : 'New contract'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save contract'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Contract No" required>
          <input className="input" value={form.contract_no} onChange={set('contract_no')} />
        </Field>
        <Field label="Vendor" required>
          <select className="input" value={form.vendor_id} onChange={set('vendor_id')}>
            <option value="">—</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Start Date">
          <input type="date" className="input" value={form.start_date} onChange={set('start_date')} />
        </Field>
        <Field label="End Date">
          <input type="date" className="input" value={form.end_date} onChange={set('end_date')} />
        </Field>
        <Field label="Value (Rs)">
          <input type="number" className="input" value={form.value} onChange={set('value')} />
        </Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={set('status')}>
            {['Open', 'Closed', 'Expired'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
            Services<span className="ml-0.5 text-[var(--danger)]">*</span>
          </span>
          <div className="space-y-2">
            {selected.map((row, idx) => {
              const t2s = t2Options(matrix, row.t1)
              const t3s = t3Options(matrix, row.t1, row.t2)
              return (
                <div key={`svc-${idx}`} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <select
                    className="input"
                    value={row.t1}
                    onChange={(e) => setService(idx, { t1: e.target.value, t2: '', t3: '' })}
                  >
                    <option value="">Type 1…</option>
                    {t1Options(matrix).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={row.t2}
                    disabled={!row.t1}
                    onChange={(e) => setService(idx, { t2: e.target.value, t3: '' })}
                  >
                    <option value="">{row.t1 ? 'Type 2…' : 'Select type 1 first'}</option>
                    {t2s.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={row.t3}
                    disabled={!row.t2}
                    onChange={(e) => setService(idx, { t3: e.target.value })}
                  >
                    <option value="">{row.t2 ? (t3s.length ? 'Type 3…' : '—') : 'Select type 2 first'}</option>
                    {t3s.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Remove service"
                    disabled={selected.length === 1}
                    onClick={() => setSelected((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={14} className="text-[var(--danger)]" />
                  </button>
                </div>
              )
            })}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setSelected((prev) => [...prev, emptyServiceRow()])}
          >
            <Plus size={14} /> Add service
          </Button>
          {matrix.length === 0 && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">No catalog rows yet. Add them under Administration → Service catalog.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
