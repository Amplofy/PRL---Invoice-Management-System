import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { Mail, Send, Truck, Layers } from 'lucide-react'
import { apiGet, apiPost } from '../lib/api'
import { formatMoney, formatDate } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import DataToolbar from '../components/ui/DataToolbar'
import ColumnsButton from '../components/ui/ColumnsButton'
import AdvancedFilter from '../components/ui/AdvancedFilter'
import GroupByPicker from '../components/ui/GroupByPicker'
import SummaryCards from '../components/ui/SummaryCards'
import { downloadCSV, sortRows, dateSortValue, type SortDirection } from '../lib/export'
import { useColumnVisibility } from '../lib/columns'
import { applyFilters, type FilterColumnDef, type FilterLogic, type FilterState } from '../lib/filters'
import { groupRows } from '../lib/grouping'
import { emitCrossModule } from '../lib/store'
import { useFyLock } from '../lib/FyLockProvider'
import SortableTh from '../components/ui/SortableTh'

interface PendingFollowup {
  invoiceId: string
  invoiceNo: string
  invoiceDate: string | null
  amount: number
  contractNo: string
  vendorId: string
  vendorName: string
  email: string
}

const FOLLOWUP_COLUMN_DEFS = [
  { key: 'invoice', label: 'Invoice' },
  { key: 'date', label: 'Date' },
  { key: 'days_pending', label: 'Days Pending' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'contract', label: 'Contract' },
  { key: 'email', label: 'Email' },
  { key: 'amount', label: 'Amount' },
]

const FOLLOWUP_DEFAULT_COLUMNS = ['invoice', 'date', 'vendor', 'contract', 'email', 'amount']

const FOLLOWUP_FILTER_COLUMNS: FilterColumnDef[] = [
  { key: 'invoiceNo', label: 'Invoice', type: 'text' },
  { key: 'vendorName', label: 'Vendor', type: 'text' },
  { key: 'contractNo', label: 'Contract', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'invoiceDate', label: 'Date', type: 'date' },
  { key: 'amount', label: 'Amount', type: 'number' },
]

function daysPending(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}

export default function FollowupsPage() {
  const [pending, setPending] = useState<PendingFollowup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: string[]; failed: Array<{ invoiceId: string; reason: string }> } | null>(null)
  const [sortBy, setSortBy] = useState('invoiceDate')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const onSort = (key: string, dir: SortDirection) => {
    setSortBy(key)
    setSortDir(dir)
  }
  const [filters, setFilters] = useState<FilterState[]>([])
  const [filterLogic, setFilterLogic] = useState<FilterLogic>('and')
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const col = useColumnVisibility(
    'prl-eoms-cols-followups',
    FOLLOWUP_COLUMN_DEFS.map((c) => c.key),
    FOLLOWUP_DEFAULT_COLUMNS,
  )
  const toast = useToast()
  const { guardWrite } = useFyLock()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiGet<{ pending: PendingFollowup[] }>('/api/followups/pending')
      setPending(d.pending)
    } catch (e) {
      toast.error('Failed to load follow-ups', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const searched = q
      ? pending.filter((p) =>
          `${p.invoiceNo} ${p.vendorName} ${p.contractNo} ${p.email}`.toLowerCase().includes(q),
        )
      : pending
    return applyFilters(searched, filters, FOLLOWUP_FILTER_COLUMNS, (p, key) =>
      (p as unknown as Record<string, string | number | null>)[key] ?? null,
    filterLogic)
  }, [pending, search, filters, filterLogic])

  const sorted = useMemo(
    () =>
      sortRows(
        filtered,
        sortBy || null,
        sortDir,
        (row, key) =>
          key === 'invoiceDate'
            ? dateSortValue(row.invoiceDate)
            : key === 'amount'
              ? Number(row.amount ?? 0)
              : key === 'vendorName'
                ? String(row.vendorName ?? '')
              : key === 'contractNo'
                ? String(row.contractNo ?? '')
                  : key === 'days_pending'
                    ? Number(daysPending(row.invoiceDate) ?? 0)
                    : key === 'email'
                      ? String(row.email ?? '')
                      : String(row.invoiceNo ?? ''),
      ),
    [filtered, sortBy, sortDir],
  )

  const GROUP_BY_FOLLOWUP = [
    { key: 'vendorName', label: 'Vendor' },
    { key: 'contractNo', label: 'Contract' },
    { key: 'month', label: 'Month' },
  ]

  const followupGroupValue = (p: PendingFollowup, key: string): string | number | null => {
    if (key === 'month') return p.invoiceDate ? p.invoiceDate.slice(0, 7) : null
    return (p as unknown as Record<string, string | number | null>)[key] ?? null
  }

  const grouped = useMemo(
    () => groupRows(sorted, groupKey, followupGroupValue, (p) => Number(p.amount ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, groupKey],
  )

  const visibleColCount = FOLLOWUP_COLUMN_DEFS.filter((c) => col.show(c.key)).length + 1

  const exportCSV = () =>
    downloadCSV(
      `followups-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map((p) => ({
        ...(col.show('invoice') ? { invoice_no: p.invoiceNo } : {}),
        ...(col.show('date') ? { invoice_date: p.invoiceDate ?? '' } : {}),
        ...(col.show('days_pending') ? { days_pending: daysPending(p.invoiceDate) ?? '' } : {}),
        ...(col.show('vendor') ? { vendor: p.vendorName } : {}),
        ...(col.show('contract') ? { contract: p.contractNo } : {}),
        ...(col.show('email') ? { email: p.email } : {}),
        ...(col.show('amount') ? { amount: p.amount } : {}),
      })),
    )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      const ids = filtered.map((p) => p.invoiceId)
      const allSelected = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.invoiceId))

  const totalSelected = useMemo(() => {
    const byId = new Map(pending.map((p) => [p.invoiceId, p]))
    let sum = 0
    selected.forEach((id) => {
      sum += byId.get(id)?.amount ?? 0
    })
    return sum
  }, [pending, selected])

  const totalPending = useMemo(() => filtered.reduce((s, p) => s + Number(p.amount ?? 0), 0), [filtered])
  const vendorCount = useMemo(() => new Set(filtered.map((p) => p.vendorId)).size, [filtered])

  const send = async () => {
    const rows = pending.filter((p) => selected.has(p.invoiceId))
    if (!(await guardWrite(...rows.map((p) => p.invoiceDate)))) return
    setSending(true)
    try {
      const d = await apiPost<{ sent: string[]; failed: Array<{ invoiceId: string; reason: string }> }>(
        '/api/followups/send',
        { invoiceIds: Array.from(selected) },
      )
      setResult(d)
      if (d.failed.length) toast.warning('Some emails failed', `${d.failed.length} failed`)
      else toast.success('Follow-up emails sent', `${d.sent.length} sent`)
      emitCrossModule('followup', 'bulk')
    } catch (e) {
      toast.error('Send failed', (e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const closeConfirm = () => {
    setConfirmOpen(false)
    setResult(null)
    if (result && result.failed.length === 0) {
      setSelected(new Set())
      load()
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Surveyor Follow-ups"
        description="Send one-click pending-invoice reminders to surveyor email addresses."
        actions={
          <Button
            variant="primary"
            disabled={selected.size === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Send size={15} /> Send follow-ups ({selected.size})
          </Button>
        }
      />

      <SummaryCards
        items={[
          {
            label: 'Pending Amount',
            value: `Rs ${formatMoney(totalPending)}`,
            sub: `${filtered.length} invoice${filtered.length === 1 ? '' : 's'}`,
            icon: <Mail size={16} />,
            tone: 'primary',
          },
          {
            label: 'Vendors',
            value: String(vendorCount),
            sub: 'awaiting follow-up',
            icon: <Truck size={16} />,
            tone: 'purple',
          },
          {
            label: 'Selected',
            value: String(selected.size),
            sub: `Rs ${formatMoney(totalSelected)}`,
            icon: <Send size={16} />,
            tone: 'ok',
          },
        ]}
      />

      <DataToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search vendor, invoice, email…' }}
        filterBar={<AdvancedFilter columns={FOLLOWUP_FILTER_COLUMNS} filters={filters} onChange={setFilters} logic={filterLogic} onLogicChange={setFilterLogic} />}
        sort={{
          columns: [
            { key: 'invoiceDate', label: 'Date' },
            { key: 'invoiceNo', label: 'Invoice' },
            { key: 'vendorName', label: 'Vendor' },
            { key: 'contractNo', label: 'Contract' },
            { key: 'amount', label: 'Amount' },
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
        <div className="text-sm text-[var(--text-dim)]">
          {selected.size} selected · <b className="text-[var(--text)]">Rs {formatMoney(totalSelected)}</b>
        </div>
        <ColumnsButton
          columns={FOLLOWUP_COLUMN_DEFS}
          isVisible={col.show}
          onToggle={col.toggle}
          onReset={col.reset}
          hiddenCount={col.hiddenCount}
        />
        <GroupByPicker options={GROUP_BY_FOLLOWUP} value={groupKey} onChange={setGroupKey} />
      </DataToolbar>

      <GlassCard className="overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                </th>
                {col.show('invoice') && <SortableTh label="Invoice" columnKey="invoiceNo" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('date') && <SortableTh label="Date" columnKey="invoiceDate" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc />}
                {col.show('days_pending') && <SortableTh label="Days Pending" columnKey="days_pending" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc align="right" />}
                {col.show('vendor') && <SortableTh label="Vendor" columnKey="vendorName" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('contract') && <SortableTh label="Contract" columnKey="contractNo" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('email') && <SortableTh label="Email" columnKey="email" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                {col.show('amount') && <SortableTh label="Amount" columnKey="amount" sortKey={sortBy} direction={sortDir} onSort={onSort} preferDesc align="right" />}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const renderRow = (p: PendingFollowup) => (
                  <tr key={p.invoiceId} className={selected.has(p.invoiceId) ? 'bg-[rgba(96,165,250,0.05)]' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.invoiceNo}`}
                        checked={selected.has(p.invoiceId)}
                        onChange={() => toggle(p.invoiceId)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                    </td>
                    {col.show('invoice') && <td className="font-semibold">{p.invoiceNo}</td>}
                    {col.show('date') && <td>{formatDate(p.invoiceDate)}</td>}
                    {col.show('days_pending') && (
                      <td className="text-right text-xs">{daysPending(p.invoiceDate) ?? '—'}</td>
                    )}
                    {col.show('vendor') && <td>{p.vendorName}</td>}
                    {col.show('contract') && <td className="text-xs">{p.contractNo}</td>}
                    {col.show('email') && <td className="text-xs text-[var(--accent)]">{p.email}</td>}
                    {col.show('amount') && <td className="text-right font-semibold">{formatMoney(p.amount)}</td>}
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
                              <b>Rs {formatMoney(totalPending)}</b>
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
        {!loading && filtered.length === 0 && (
          <EmptyState
            title={search ? 'No matching follow-ups' : 'No pending follow-ups'}
            description={
              search
                ? 'Try a different search.'
                : 'Pending invoices with surveyor emails will appear here.'
            }
            icon={<Mail size={28} />}
          />
        )}
      </GlassCard>

      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title="Send follow-up emails"
        maxWidth="34rem"
        footer={
          result ? (
            <>
              <Button variant="ghost" onClick={closeConfirm}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={sending}>Cancel</Button>
              <Button variant="success" onClick={send} disabled={sending}>
                <Send size={15} /> {sending ? 'Sending…' : `Send to ${selected.size} vendors`}
              </Button>
            </>
          )
        }
      >
        {!result ? (
          <div className="space-y-4">
            <div className="text-sm text-[var(--text-dim)]">
              A pending-invoice reminder will be sent to each selected vendor using the follow-up template from
              Admin settings.
            </div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
              {pending
                .filter((p) => selected.has(p.invoiceId))
                .map((p) => (
                  <div key={p.invoiceId} className="flex items-center justify-between text-sm">
                    <span>
                      <b>{p.vendorName}</b> — {p.invoiceNo}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{p.email}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.08)] p-4 text-sm">
              <b className="text-[var(--accent-3)]">{result.sent.length}</b> email(s) sent successfully
            </div>
            {result.failed.length > 0 && (
              <div className="rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] p-4 text-sm">
                <b className="text-[var(--danger)]">{result.failed.length}</b> failed:
                <ul className="mt-1.5 list-inside list-disc text-xs text-[var(--text-dim)]">
                  {result.failed.map((f) => (
                    <li key={f.invoiceId}>{f.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
