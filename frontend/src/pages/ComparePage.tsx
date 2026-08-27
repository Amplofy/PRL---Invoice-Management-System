import { useMemo, useRef, useState } from 'react'
import { Upload, GitCompareArrows, ArrowLeftRight, Send, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { apiUpload, apiGet, apiPost } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'

interface UploadedFile {
  fileId: string
  fileName: string
}

interface CompareResult {
  comparisonId: string
  baseFileName: string
  compareFileName: string
  mismatches: Array<{ keyValue: string; column: string; baseValue: string; compareValue: string }>
  missingInCompare: Array<{ keyValue: string }>
  missingInBase: Array<{ keyValue: string }>
  summary: { totalRows: number; matchedRows: number }
}

const COMMON_COLUMNS = ['amount', 'quantity', 'qty', 'unit_price', 'price', 'trips', 'total', 'value', 'rate', 'weight']

export default function ComparePage() {
  const [base, setBase] = useState<UploadedFile | null>(null)
  const [compare, setCompare] = useState<UploadedFile | null>(null)
  const [joinKey, setJoinKey] = useState('invoice_no')
  const [columns, setColumns] = useState('amount')
  const [tolerance, setTolerance] = useState('0')
  const [comparing, setComparing] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([])
  const [vendorId, setVendorId] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const baseRef = useRef<HTMLInputElement>(null)
  const compareRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const uploadFile = async (file: File, which: 'base' | 'compare') => {
    const form = new FormData()
    form.append('file', file)
    try {
      const d = await apiUpload<UploadedFile>('/api/uploads', form)
      if (which === 'base') setBase(d)
      else setCompare(d)
      toast.success('File uploaded', d.fileName)
    } catch (e) {
      toast.error('Upload failed', (e as Error).message)
    }
  }

  const columnList = useMemo(
    () =>
      columns
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [columns],
  )

  const runCompare = async () => {
    if (!base || !compare) {
      toast.error('Upload both files first')
      return
    }
    if (!joinKey.trim() || columnList.length === 0) {
      toast.error('Join key and at least one column are required')
      return
    }
    setComparing(true)
    try {
      const d = await apiPost<CompareResult>('/api/compare', {
        baseFileId: base.fileId,
        compareFileId: compare.fileId,
        joinKey: joinKey.trim(),
        columns: columnList,
        tolerance: Number(tolerance) || 0,
      })
      setResult(d)
      toast.info('Comparison complete', `${d.mismatches.length} mismatches, ${d.missingInCompare.length} missing in compare, ${d.missingInBase.length} missing in base`)
    } catch (e) {
      toast.error('Compare failed', (e as Error).message)
    } finally {
      setComparing(false)
    }
  }

  const openSend = async () => {
    setSendOpen(true)
    setNotes('')
    try {
      const v = await apiGet<{ vendors: Array<{ id: string; name: string }> }>('/api/vendors')
      setVendors(v.vendors)
    } catch {
      setVendors([])
    }
  }

  const sendDiscrepancy = async () => {
    if (!result || !vendorId) {
      toast.error('Select a vendor with an email')
      return
    }
    setSending(true)
    try {
      await apiPost(`/api/compare/${result.comparisonId}/send-discrepancy`, { vendorId, notes })
      toast.success('Discrepancy email sent')
      setSendOpen(false)
    } catch (e) {
      toast.error('Email failed', (e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const totalIssues =
    (result?.mismatches.length ?? 0) + (result?.missingInCompare.length ?? 0) + (result?.missingInBase.length ?? 0)

  const swap = () => {
    setBase(compare)
    setCompare(base)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compare Files"
        description="Upload two files, map the join key and columns, and diff the results."
        actions={
          result ? (
            <Button variant="primary" onClick={openSend}>
              <Send size={15} /> Email discrepancy report
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FileDropCard
          title="Compare FROM (base)"
          hint={base?.fileName}
          onPick={() => baseRef.current?.click()}
          icon={<FileText size={20} className="text-[var(--accent)]" />}
        />
        <FileDropCard
          title="Compare TO (candidate)"
          hint={compare?.fileName}
          onPick={() => compareRef.current?.click()}
          icon={<FileText size={20} className="text-[var(--accent-2)]" />}
        />
        <input
          ref={baseRef}
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], 'base')}
        />
        <input
          ref={compareRef}
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], 'compare')}
        />
      </div>

      <GlassCard className="p-5">
        <div className="section-title">Mapping</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Join key column" required hint="Row identity, e.g. invoice_no">
            <input className="input" value={joinKey} onChange={(e) => setJoinKey(e.target.value)} placeholder="invoice_no" />
          </Field>
          <Field label="Columns to compare" required hint="Comma-separated: amount, quantity">
            <input className="input" value={columns} onChange={(e) => setColumns(e.target.value)} placeholder="amount, quantity" list="compare-cols" />
            <datalist id="compare-cols">
              {COMMON_COLUMNS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Tolerance (±)" hint="Numeric tolerance for differences">
            <input type="number" className="input" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button variant="ghost" onClick={swap} disabled={!base && !compare}>
            <ArrowLeftRight size={15} /> Swap files
          </Button>
          <Button variant="primary" onClick={runCompare} disabled={comparing || !base || !compare}>
            <GitCompareArrows size={15} /> {comparing ? 'Comparing…' : 'Run comparison'}
          </Button>
        </div>
      </GlassCard>

      {result && (
        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <div className="text-sm font-bold">Results</div>
              <div className="text-xs text-[var(--text-muted)]">
                {result.baseFileName} vs {result.compareFileName} · join key “{joinKey}”
              </div>
            </div>
            <div className="flex gap-2">
              <span className="badge badge-err">{result.mismatches.length} mismatches</span>
              <span className="badge badge-warn">{result.missingInCompare.length} missing in TO</span>
              <span className="badge badge-info">{result.missingInBase.length} missing in FROM</span>
            </div>
          </div>

          {totalIssues === 0 ? (
            <EmptyState
              title="No discrepancies"
              description="The files match within the configured tolerance."
              icon={<CheckCircle2 size={28} className="text-[var(--accent-3)]" />}
            />
          ) : (
            <div className="space-y-4 p-5">
              {result.mismatches.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Column</th>
                        <th>Base value</th>
                        <th>Compare value</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.mismatches.slice(0, 100).map((m, i) => (
                        <tr key={i}>
                          <td className="font-semibold">{m.keyValue}</td>
                          <td><span className="badge badge-purple">{m.column}</span></td>
                          <td className="text-[var(--danger)]">{m.baseValue}</td>
                          <td className="text-[var(--accent-3)]">{m.compareValue}</td>
                          <td><StatusBadge tone="err">Mismatch</StatusBadge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.mismatches.length > 100 && (
                    <div className="px-4 py-2 text-xs text-[var(--text-muted)]">
                      Showing first 100 of {result.mismatches.length}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {result.missingInCompare.length > 0 && (
                  <div className="rounded-xl border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)] p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--warn)]">
                      <AlertTriangle size={15} /> Missing in Compare TO ({result.missingInCompare.length})
                    </div>
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-[var(--text-dim)]">
                      {result.missingInCompare.slice(0, 100).map((m) => (
                        <div key={m.keyValue}>· {m.keyValue}</div>
                      ))}
                    </div>
                  </div>
                )}
                {result.missingInBase.length > 0 && (
                  <div className="rounded-xl border border-[rgba(96,165,250,0.3)] bg-[rgba(96,165,250,0.05)] p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--accent)]">
                      <AlertTriangle size={15} /> Missing in Base FROM ({result.missingInBase.length})
                    </div>
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-[var(--text-dim)]">
                      {result.missingInBase.slice(0, 100).map((m) => (
                        <div key={m.keyValue}>· {m.keyValue}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </GlassCard>
      )}

      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title="Send discrepancy email"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button variant="success" onClick={sendDiscrepancy} disabled={sending}>
              <Send size={15} /> {sending ? 'Sending…' : 'Send email'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Surveyor / vendor" required hint="Vendors without an email are excluded">
            <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Additional notes">
            <textarea className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for the recipient…" />
          </Field>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-dim)]">
            The email uses the discrepancy template from Admin settings and includes up to 20 mismatches and missing
            rows.
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FileDropCard({ title, hint, onPick, icon }: { title: string; hint?: string; onPick: () => void; icon: React.ReactNode }) {
  return (
    <GlassCard
      className={`flex flex-col items-center justify-center gap-2 p-8 transition hover:bg-[var(--surface-hover)] ${hint ? '' : 'border-dashed'}`}
    >
      <div onClick={onPick} className="flex cursor-pointer flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {icon}
        </div>
        <div className="text-sm font-bold">{title}</div>
        {hint ? (
          <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <CheckCircle2 size={13} /> {hint}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Upload size={13} /> Click to upload
          </div>
        )}
      </div>
    </GlassCard>
  )
}
