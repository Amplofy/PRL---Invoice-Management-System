import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, FileText, AlertTriangle, CheckCircle2, ArrowLeft, ArrowRight,
  Table2, Wand2, EyeOff, Copy, History, Clock, ShieldCheck, XCircle,
} from 'lucide-react'
import { apiPost, apiGet } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import MappingTable from '../components/ui/MappingTable'
import { useAuth, isAdmin } from '../lib/auth'
import {
  readWorkbook, detectHeaderRow, buildColumns, dataRows, type ParsedWorkbook, type SourceColumn,
} from '../lib/importParser'
import {
  IMPORT_SCHEMAS, autoMap, applyMapping, loadTemplate, saveTemplate, norm,
  signatureOf, type ImportType, type MappingState,
} from '../lib/importMapping'

type Step = 1 | 2 | 3 | 4 | 5

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Sheets' },
  { id: 3, label: 'Map' },
  { id: 4, label: 'Review' },
  { id: 5, label: 'Confirm' },
]

const TYPES: Array<{ id: ImportType; label: string; hint: string }> = [
  { id: 'invoices', label: 'Invoices', hint: 'Invoice numbers, dates, amounts, contract refs' },
  { id: 'contracts', label: 'Contracts', hint: 'Contract numbers, vendors, values, windows' },
  { id: 'vendors', label: 'Vendors', hint: 'Vendor names and emails' },
]

const ACCEPT = '.csv,.xlsx,.xls'

interface CanonicalRow {
  index: number
  data: Record<string, string | number | null>
  errors: string[]
}

interface DemoInvoice { id: string; invoice_no: string | null }
interface DemoContract { id: string; contract_no: string }

export default function ImportPage() {
  const [type, setType] = useState<ImportType>('invoices')
  const [step, setStep] = useState<Step>(1)
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [wb, setWb] = useState<ParsedWorkbook | null>(null)
  const [fileName, setFileName] = useState('')
  const [sheetIdx, setSheetIdx] = useState(0)
  const [headerRowIdx, setHeaderRowIdx] = useState(0)
  const [columns, setColumns] = useState<SourceColumn[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<MappingState>({})
  const [templateNote, setTemplateNote] = useState<string | null>(null)
  const [canonical, setCanonical] = useState<CanonicalRow[]>([])
  const [showInvalidOnly, setShowInvalidOnly] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [importResult, setImportResult] = useState<{
    status: 'approved' | 'pending'
    imported: number
    skipped: number
    updated: number
    duplicates: number
  } | null>(null)
  const [demoInvoices, setDemoInvoices] = useState<DemoInvoice[]>([])
  const [demoContracts, setDemoContracts] = useState<DemoContract[]>([])
  const [batches, setBatches] = useState<ImportBatchRow[]>([])
  const [decidingId, setDecidingId] = useState<string | null>(null)

  interface ImportBatchRow {
    id: string
    import_type: string
    file_name: string
    total_rows: number
    duplicate_rows: number
    status: 'pending' | 'approved' | 'rejected'
    conflicts: string[]
    submitted_by: string
    created_at: string
  }

  const loadBatches = () => {
    if (!admin) return
    apiGet<{ batches: ImportBatchRow[] }>('/api/import/batches')
      .then((d) => setBatches(d.batches))
      .catch(() => undefined)
  }

  const decideBatch = async (id: string, decision: 'approve' | 'reject', overwrite = false) => {
    setDecidingId(id)
    try {
      await apiPost(`/api/import/batches/${id}/decide`, { decision, overwrite })
      toast.success(
        decision === 'approve'
          ? overwrite
            ? 'Import approved (overwrite mode)'
            : 'Import approved'
          : 'Import rejected',
      )
      loadBatches()
    } catch (e) {
      toast.error('Decision failed', (e as Error).message)
    } finally {
      setDecidingId(null)
    }
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const schema = IMPORT_SCHEMAS[type]

  useEffect(() => {
    apiGet<{ invoices: DemoInvoice[] }>('/api/invoices')
      .then((d) => setDemoInvoices(d.invoices))
      .catch(() => undefined)
    apiGet<{ contracts: DemoContract[] }>('/api/contracts')
      .then((d) => setDemoContracts(d.contracts))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    loadBatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  const aliasSet = useMemo(() => {
    const s = new Set<string>()
    for (const el of schema) for (const a of el.aliases) s.add(norm(a))
    return s
  }, [schema])

  const initMapping = (wbk: ParsedWorkbook, idx: number) => {
    const sheet = wbk.sheets[idx]
    if (!sheet || sheet.matrix.length === 0) {
      toast.error('Empty sheet', 'No readable rows found in the selected sheet.')
      return
    }
    const hr = detectHeaderRow(sheet.matrix, aliasSet)
    const cols = buildColumns(sheet.matrix, hr, sheet.hiddenCols)
    setSheetIdx(idx)
    setHeaderRowIdx(hr)
    setColumns(cols)
    setRows(dataRows(sheet.matrix, hr))
    const sig = signatureOf(cols)
    const tpl = loadTemplate(type, sig)
    if (tpl) {
      setMapping(tpl)
      setTemplateNote(`Applied your saved mapping template for this layout.`)
    } else {
      setMapping(autoMap(cols, schema))
      setTemplateNote(null)
    }
    setStep(3)
  }

  const upload = async (file: File) => {
    setParsing(true)
    setImportResult(null)
    setWb(null)
    setFileName(file.name)
    try {
      const parsed = await readWorkbook(file)
      setWb(parsed)
      const usable = parsed.sheets.filter((s) => s.matrix.length > 0)
      if (usable.length === 0) {
        toast.error('Nothing to import', 'The workbook contains no readable rows.')
        return
      }
      if (parsed.sheets.length > 1) {
        setStep(2)
      } else {
        initMapping(parsed, 0)
      }
    } catch (e) {
      toast.error('Could not read file', (e as Error).message)
    } finally {
      setParsing(false)
    }
  }

  const onFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) upload(f)
  }

  const changeHeaderRow = (newIdx: number) => {
    if (!wb) return
    const sheet = wb.sheets[sheetIdx]
    const cols = buildColumns(sheet.matrix, newIdx, sheet.hiddenCols)
    setHeaderRowIdx(newIdx)
    setColumns(cols)
    setRows(dataRows(sheet.matrix, newIdx))
    setMapping(autoMap(cols, schema))
    setTemplateNote(null)
  }

  const requiredMissing = schema.filter((el) => el.required && !mapping[el.key]?.columnKey)

  const buildCanonical = () => {
    const mapped = applyMapping(rows, columns, schema, mapping)
    const seenInvoice = new Set<string>()
    const invoiceNos = new Set(demoInvoices.map((i) => i.invoice_no ?? '').filter(Boolean))
    const contractNos = new Set(demoContracts.map((c) => c.contract_no))
    const out: CanonicalRow[] = mapped.map((r, i) => {
      const errors: string[] = []
      for (const el of schema) {
        const v = r[el.key]
        if (el.required && (v === null || v === '')) errors.push(`${el.label} is missing`)
        if (v !== null && r[`${el.key}__warn`]) errors.push(String(r[`${el.key}__warn`]))
        if (el.type === 'number' && v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
          errors.push(`${el.label} is not a valid number`)
        }
      }
      if (type === 'invoices') {
        const no = String(r.invoice_no ?? '').trim()
        if (no) {
          if (invoiceNos.has(no)) errors.push(`Invoice ${no} already exists in the system`)
          if (seenInvoice.has(no)) errors.push(`Duplicate invoice ${no} inside this file`)
          seenInvoice.add(no)
        }
        const cn = String(r.contract_no ?? '').trim()
        if (cn && contractNos.size > 0 && !contractNos.has(cn)) errors.push(`Contract ${cn} not found`)
        const amount = r.amount
        if (typeof amount === 'number' && amount <= 0) errors.push('Amount must be positive')
      }
      if (type === 'contracts') {
        const start = r.start_date
        const end = r.end_date
        if (typeof start === 'string' && typeof end === 'string' && start > end) {
          errors.push('End date is before start date')
        }
      }
      const clean: Record<string, string | number | null> = {}
      for (const el of schema) clean[el.key] = (r[el.key] ?? null) as string | number | null
      return { index: i + 1, data: clean, errors }
    })
    return out
  }

  const continueFromMap = () => {
    const built = buildCanonical()
    setCanonical(built)
    saveTemplate(type, signatureOf(columns), mapping)
    setStep(4)
  }

  const confirm = async (mode: 'append' | 'overwrite') => {
    const validRows = canonical.filter((r) => r.errors.length === 0).map((r) => r.data)
    if (validRows.length === 0) return
    setConfirming(true)
    try {
      const d = await apiPost<{
        status: 'approved' | 'pending'
        imported: number
        skipped: number
        updated: number
        duplicates: number
      }>('/api/import/confirm', {
        type,
        rows: validRows,
        fileName,
        mode,
      })
      setImportResult({ status: d.status, imported: d.imported, skipped: d.skipped, updated: d.updated, duplicates: d.duplicates })
      if (d.status === 'approved') {
        toast.success(
          mode === 'overwrite' ? 'Import committed (overwrite)' : 'Import committed',
          `${d.imported} imported · ${d.updated} updated · ${d.skipped} skipped`,
        )
      } else {
        toast.info(
          'Sent for admin approval',
          `${d.duplicates} duplicate row(s) detected — an admin will make the final call.`,
        )
        loadBatches()
      }
      setStep(5)
    } catch (e) {
      toast.error('Confirm failed', (e as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  const reset = () => {
    setStep(1)
    setWb(null)
    setFileName('')
    setColumns([])
    setRows([])
    setMapping({})
    setCanonical([])
    setImportResult(null)
    setTemplateNote(null)
    setShowInvalidOnly(false)
  }

  const validCount = canonical.filter((r) => r.errors.length === 0).length
  const dupeCount = canonical.filter(
    (r) => r.errors.some((e) => e.includes('already exists')) && r.errors.every((e) => e.includes('already exists') || e.includes('inside this file')),
  ).length
  const cleanCount = canonical.filter((r) => r.errors.length === 0).length
  const shown = showInvalidOnly ? canonical.filter((r) => r.errors.length > 0) : canonical
  const hiddenCols = columns.filter((c) => c.hidden)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Import"
        description="Upload your spreadsheet, map its columns to EOMS fields, review and commit."
        actions={
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="h-px w-4 bg-[var(--border)]" />}
                <span
                  className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold"
                  style={{
                    background: step >= s.id ? 'var(--gradient-primary)' : 'var(--surface)',
                    color: step >= s.id ? '#fff' : 'var(--text-muted)',
                    border: step >= s.id ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {s.id}
                  <span className="hidden lg:inline">{s.label}</span>
                </span>
              </span>
            ))}
          </div>
        }
      />

      {step === 1 && (
        <div className="space-y-5">
          {admin && batches.length > 0 && (
            <GlassCard className="p-5">
              <div className="section-title">
                <Clock size={15} className="mr-1.5 inline text-[var(--warn)]" />
                Imports awaiting approval · {batches.filter((b) => b.status === 'pending').length} pending
              </div>
              <div className="mt-3 space-y-2.5">
                {batches.slice(0, 8).map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {b.file_name || 'Untitled file'}
                        <span className="badge">{b.import_type}</span>
                        {b.status === 'pending' && <span className="badge" style={{ color: 'var(--warn)' }}>pending</span>}
                        {b.status === 'approved' && <span className="badge badge-ok">approved</span>}
                        {b.status === 'rejected' && <span className="badge badge-err">rejected</span>}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        {b.total_rows} rows · {b.duplicate_rows} duplicate(s) · by {b.submitted_by || 'unknown'} ·{' '}
                        {new Date(b.created_at).toLocaleString()}
                        {b.conflicts.length > 0 && (
                          <span className="mt-1 block truncate text-[var(--warn)]" title={b.conflicts.join('; ')}>
                            {b.conflicts.slice(0, 2).join(' · ')}
                            {b.conflicts.length > 2 ? ` · +${b.conflicts.length - 2} more` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    {b.status === 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={decidingId === b.id}
                          onClick={() => decideBatch(b.id, 'reject')}
                        >
                          <XCircle size={14} /> Reject
                        </Button>
                        {b.duplicate_rows > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={decidingId === b.id}
                            onClick={() => decideBatch(b.id, 'approve', true)}
                          >
                            <Wand2 size={14} /> Overwrite & import
                          </Button>
                        )}
                        <Button
                          variant="success"
                          size="sm"
                          disabled={decidingId === b.id}
                          onClick={() => decideBatch(b.id, 'approve')}
                        >
                          <CheckCircle2 size={14} /> {b.duplicate_rows > 0 ? 'Approve (skip dupes)' : 'Approve & import'}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-5">
            <div className="section-title">1 · Choose import type</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    type === t.id
                      ? 'border-[var(--accent)] bg-[var(--surface-hover)]'
                      : 'border-[var(--border)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <div className="text-sm font-bold">{t.label}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{t.hint}</div>
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="section-title">2 · Upload file</div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                onFiles(e.dataTransfer.files)
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 transition ${
                dragOver ? 'border-[var(--accent)] bg-[var(--surface-hover)]' : 'border-[var(--border)]'
              }`}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                <Upload size={26} className="text-[var(--accent)]" />
              </div>
              <div className="text-sm font-semibold">
                {parsing ? 'Reading workbook…' : 'Drag & drop your file here'}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                or click to browse · CSV, XLSX, XLS · any column layout, we map it
              </div>
              <Button variant="ghost" size="sm">
                <FileSpreadsheet size={15} /> Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
            </div>
          </GlassCard>
        </div>
      )}

      {step === 2 && wb && (
        <GlassCard className="p-5">
          <div className="section-title">
            <Table2 size={15} className="mr-1.5 inline text-[var(--accent)]" />
            Select worksheet · {fileName}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wb.sheets.map((s, i) => (
              <button
                key={s.name}
                disabled={s.matrix.length === 0}
                onClick={() => initMapping(wb, i)}
                className="rounded-xl border border-[var(--border)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="text-sm font-bold">{s.name}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  {s.matrix.length} rows{s.hiddenCols.length > 0 ? ` · ${s.hiddenCols.length} hidden cols` : ''}
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {step === 3 && (
        <GlassCard className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="section-title">
              <Wand2 size={15} className="mr-1.5 inline text-[var(--accent)]" />
              Map columns · {fileName}
            </div>
            <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)]">
              <span>{rows.length} data rows</span>
              <span>·</span>
              <label className="flex items-center gap-1.5">
                Header row
                <select
                  className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-xs"
                  value={headerRowIdx}
                  onChange={(e) => changeHeaderRow(Number(e.target.value))}
                >
                  {Array.from({ length: Math.min(10, (wb?.sheets[sheetIdx].matrix.length ?? 1)) }, (_, i) => (
                    <option key={i} value={i}>
                      Row {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {templateNote && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-[rgba(124,58,237,0.3)] bg-[rgba(124,58,237,0.08)] px-4 py-2.5 text-xs font-semibold text-[var(--text)]">
              <History size={14} className="text-[var(--accent)]" /> {templateNote} Adjust below if needed — continuing will
              update the template.
            </div>
          )}

          {hiddenCols.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
              <EyeOff size={13} /> Hidden columns detected:{' '}
              {hiddenCols.map((c) => (
                <span key={c.key} className="rounded-md bg-[var(--bg)] px-1.5 py-0.5 font-semibold">
                  {c.header} ({c.letter})
                </span>
              ))}
            </div>
          )}

          <MappingTable
            schema={schema}
            columns={columns}
            mapping={mapping}
            detectedRow={headerRowIdx}
            onChange={(elKey, colKey) =>
              setMapping((prev) => ({ ...prev, [elKey]: { columnKey: colKey, confidence: 'manual' } }))
            }
          />

          {requiredMissing.length > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-4 py-2.5 text-xs font-semibold text-[var(--err)]">
              <AlertTriangle size={14} /> Map these required fields to continue:{' '}
              {requiredMissing.map((el) => el.label).join(', ')}
            </div>
          )}

          <div className="mt-5 flex gap-2.5">
            <Button variant="ghost" onClick={() => setStep(wb && wb.sheets.length > 1 ? 2 : 1)}>
              <ArrowLeft size={15} /> Back
            </Button>
            <Button variant="primary" onClick={continueFromMap} disabled={requiredMissing.length > 0}>
              Continue <ArrowRight size={15} />
            </Button>
          </div>
        </GlassCard>
      )}

      {step === 4 && (
        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-[var(--accent)]" />
              <div>
                <div className="text-sm font-bold">{fileName}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {canonical.length} rows · {validCount} valid · {canonical.length - validCount} with issues
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                <ArrowLeft size={15} /> Mapping
              </Button>
              <Button
                variant={showInvalidOnly ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setShowInvalidOnly((v) => !v)}
              >
                <AlertTriangle size={15} /> Issues only
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto" style={{ maxHeight: '26rem', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  {schema.map((el) => (
                    <th key={el.key}>{el.label}</th>
                  ))}
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.index} className={row.errors.length > 0 ? 'bg-[rgba(239,68,68,0.04)]' : ''}>
                    <td className="text-xs text-[var(--text-muted)]">{row.index}</td>
                    {schema.map((el) => (
                      <td key={el.key} className="text-xs">
                        {row.data[el.key] === null || row.data[el.key] === '' ? '—' : String(row.data[el.key])}
                      </td>
                    ))}
                    <td>
                      {row.errors.length === 0 ? (
                        <span className="badge badge-ok"><CheckCircle2 size={12} /> Valid</span>
                      ) : (
                        <span className="badge badge-err cell-wrap" title={row.errors.join('; ')}>
                          <AlertTriangle size={12} /> {row.errors[0]}
                          {row.errors.length > 1 && ` +${row.errors.length - 1}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              {dupeCount > 0 ? (
                <AlertTriangle size={15} className="text-[var(--warn)]" />
              ) : admin ? (
                <CheckCircle2 size={15} className="text-[var(--accent-3)]" />
              ) : (
                <ShieldCheck size={15} className="text-[var(--accent)]" />
              )}
              {dupeCount > 0
                ? admin
                  ? `${dupeCount} row(s) already exist — overwrite them with the imported values, or send the batch for review.`
                  : `${dupeCount} row(s) already exist in the system — continuing sends this import to an admin for final approval.`
                : admin
                  ? `${cleanCount} valid rows will be committed to the ${type} table.`
                  : `${cleanCount} valid rows will be sent to an admin for approval before import.`}
            </div>
            {dupeCount > 0 && admin ? (
              <div className="flex flex-wrap gap-2.5">
                <Button variant="ghost" onClick={() => confirm('append')} disabled={confirming || validCount === 0}>
                  <Clock size={15} /> {confirming ? 'Submitting…' : 'Send for approval'}
                </Button>
                <Button variant="primary" onClick={() => confirm('overwrite')} disabled={confirming || validCount === 0}>
                  <Wand2 size={15} /> {confirming ? 'Overwriting…' : `Overwrite & import ${validCount} rows`}
                </Button>
              </div>
            ) : dupeCount > 0 ? (
              <Button variant="primary" onClick={() => confirm('append')} disabled={confirming || validCount === 0}>
                <Clock size={15} /> {confirming ? 'Submitting…' : `Continue anyway — send ${validCount} rows for approval`}
              </Button>
            ) : admin ? (
              <Button variant="success" onClick={() => confirm('append')} disabled={confirming || validCount === 0}>
                <CheckCircle2 size={15} /> {confirming ? 'Committing…' : `Confirm & commit ${validCount} rows`}
              </Button>
            ) : (
              <Button variant="success" onClick={() => confirm('append')} disabled={confirming || validCount === 0}>
                <ShieldCheck size={15} /> {confirming ? 'Submitting…' : `Submit ${validCount} rows for admin approval`}
              </Button>
            )}
          </div>
        </GlassCard>
      )}

      {step === 5 && importResult && importResult.status === 'pending' && (
        <GlassCard className="p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(245,158,11,0.12)]">
            <Clock size={30} className="text-[var(--warn)]" />
          </div>
          <div className="mt-4 text-lg font-bold">Sent for admin approval</div>
          <div className="mx-auto mt-2 max-w-md text-sm text-[var(--text-dim)]">
            <b>{importResult.duplicates}</b> row(s) in this file already exist in the system. The import
            was saved as a pending batch — an admin will review it and make the final call. Nothing has
            been imported yet.
          </div>
          <div className="mt-5 flex justify-center gap-2.5">
            <Button variant="primary" onClick={reset}>
              Back to upload
            </Button>
          </div>
        </GlassCard>
      )}

      {step === 5 && importResult && importResult.status === 'approved' && (
        <GlassCard className="p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(16,185,129,0.12)]">
            <CheckCircle2 size={30} className="text-[var(--accent-3)]" />
          </div>
          <div className="mt-4 text-lg font-bold">Import complete</div>
          <div className="mt-1 text-sm text-[var(--text-dim)]">
            <b>{importResult.imported}</b> rows imported · <b>{importResult.updated}</b> updated ·{' '}
            <b>{importResult.skipped}</b> skipped
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Copy size={11} /> Mapping saved as template for this layout.
          </div>
          <div className="mt-5 flex justify-center gap-2.5">
            <Button variant="primary" onClick={reset}>
              Import another file
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
