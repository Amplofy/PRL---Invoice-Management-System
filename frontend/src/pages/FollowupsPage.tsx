import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mail, Send } from 'lucide-react'
import { apiGet, apiPost } from '../lib/api'
import { formatMoney, formatDate } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import DataToolbar from '../components/ui/DataToolbar'
import { downloadCSV, sortRows, dateSortValue, type SortDirection } from '../lib/export'

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
  const toast = useToast()

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
    return pending.filter((p) =>
      `${p.invoiceNo} ${p.vendorName} ${p.contractNo} ${p.email}`.toLowerCase().includes(q),
    )
  }, [pending, search])

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
                  : String(row.invoiceNo ?? ''),
      ),
    [filtered, sortBy, sortDir],
  )

  const exportCSV = () =>
    downloadCSV(
      `followups-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map((p) => ({
        invoice_no: p.invoiceNo,
        invoice_date: p.invoiceDate ?? '',
        vendor: p.vendorName,
        contract: p.contractNo,
        email: p.email,
        amount: p.amount,
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

  const send = async () => {
    setSending(true)
    try {
      const d = await apiPost<{ sent: string[]; failed: Array<{ invoiceId: string; reason: string }> }>(
        '/api/followups/send',
        { invoiceIds: Array.from(selected) },
      )
      setResult(d)
      if (d.failed.length) toast.warning('Some emails failed', `${d.failed.length} failed`)
      else toast.success('Follow-up emails sent', `${d.sent.length} sent`)
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

      <DataToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search vendor, invoice, email…' }}
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
      </DataToolbar>

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
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
                <th>Invoice</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Contract</th>
                <th>Email</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
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
                  <td className="font-semibold">{p.invoiceNo}</td>
                  <td>{formatDate(p.invoiceDate)}</td>
                  <td>{p.vendorName}</td>
                  <td className="text-xs">{p.contractNo}</td>
                  <td className="text-xs text-[var(--accent)]">{p.email}</td>
                  <td className="text-right font-semibold">{formatMoney(p.amount)}</td>
                </tr>
              ))}
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
