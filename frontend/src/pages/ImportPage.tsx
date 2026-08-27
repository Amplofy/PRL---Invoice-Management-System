import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, FileText, AlertTriangle, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react'
import { apiUpload, apiPost } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import { useAuth, isAdmin } from '../lib/auth'

type ImportType = 'invoices' | 'contracts' | 'vendors'

interface PreviewRow {
  index: number
  valid: boolean
  errors: string[]
  data: Record<string, unknown>
}

interface ParseResult {
  type: ImportType
  fileName: string
  preview: PreviewRow[]
  issues: Array<{ row: number; message: string }>
  totalRows: number
  validRows: number
}

const TYPES: Array<{ id: ImportType; label: string; hint: string }> = [
  { id: 'invoices', label: 'Invoices', hint: 'Invoice numbers, dates, amounts, contract refs' },
  { id: 'contracts', label: 'Contracts', hint: 'Contract numbers, vendors, values, windows' },
  { id: 'vendors', label: 'Vendors', hint: 'Vendor names and emails' },
]

const ACCEPT = '.csv,.xlsx,.xls,.pdf'

export default function ImportPage() {
  const [type, setType] = useState<ImportType>('invoices')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)

  const upload = async (file: File) => {
    setStep(2)
    setResult(null)
    setImportResult(null)
    const form = new FormData()
    form.append('file', file)
    form.append('type', type)
    try {
      const d = await apiUpload<ParseResult>('/api/import/parse', form)
      setResult(d)
      if (d.validRows === d.totalRows) {
        setStep(3)
      } else {
        toast.warning('Some rows need attention', `${d.totalRows - d.validRows} rows have validation issues`)
      }
    } catch (e) {
      toast.error('Import failed', (e as Error).message)
      setStep(1)
    }
  }

  const onFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) upload(f)
  }

  const confirm = async () => {
    if (!result) return
    setConfirming(true)
    try {
      const d = await apiPost<{ imported: number; skipped: number; type: ImportType }>('/api/import/confirm', {
        type: result.type,
        rows: result.preview.filter((r) => r.valid).map((r) => r.data),
      })
      setImportResult({ imported: d.imported, skipped: d.skipped })
      toast.success('Import committed', `${d.imported} rows imported`)
      setStep(3)
    } catch (e) {
      toast.error('Confirm failed', (e as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  const previewCols = (): string[] => {
    if (!result?.preview.length) return []
    const keys = new Set<string>()
    for (const row of result.preview.slice(0, 20)) for (const k of Object.keys(row.data)) keys.add(k)
    return Array.from(keys)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Import"
        description="Upload CSV, Excel or PDF files and commit them to the database after an admin review."
        actions={
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: step >= s ? 'var(--gradient-primary)' : 'var(--surface)',
                  color: step >= s ? '#fff' : 'var(--text-muted)',
                  border: step >= s ? 'none' : '1px solid var(--border)',
                }}
              >
                {s}
              </span>
            ))}
            <span className="text-xs font-semibold text-[var(--text-dim)]">
              {step === 1 ? 'Upload' : step === 2 ? 'Review' : 'Confirm'}
            </span>
          </div>
        }
      />

      {step === 1 && (
        <div className="space-y-5">
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
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)] border border-[var(--border)]">
                <Upload size={26} className="text-[var(--accent)]" />
              </div>
              <div className="text-sm font-semibold">Drag &amp; drop your file here</div>
              <div className="text-xs text-[var(--text-muted)]">
                or click to browse · CSV, XLSX, XLS, PDF · up to 20 MB
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

      {step === 2 && result && (
        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-[var(--accent)]" />
              <div>
                <div className="text-sm font-bold">{result.fileName}</div>
                <div className="text-xs text-[var(--text-muted)]">{result.totalRows} rows · {result.validRows} valid</div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Back
              </Button>
              <Button variant="primary" size="sm" onClick={() => setStep(3)}>
                Continue <ArrowRight size={15} />
              </Button>
            </div>
          </div>

          {result.issues.length > 0 && (
            <div className="mx-5 mt-4 rounded-xl border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.08)] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--warn)]">
                <AlertTriangle size={16} /> {result.issues.length} rows need attention
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--text-dim)]">
                {result.issues.slice(0, 50).map((i) => (
                  <div key={i.row}>
                    Row {i.row}: {i.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  {previewCols().map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {result.preview.slice(0, 30).map((row) => (
                  <tr key={row.index} className={!row.valid ? 'bg-[rgba(239,68,68,0.04)]' : ''}>
                    <td className="text-xs text-[var(--text-muted)]">{row.index}</td>
                    {previewCols().map((c) => (
                      <td key={c} className="text-xs">{String(row.data[c] ?? '')}</td>
                    ))}
                    <td>
                      {row.valid ? (
                        <span className="badge badge-ok"><CheckCircle2 size={12} /> Valid</span>
                      ) : (
                        <span className="badge badge-err cell-wrap"><AlertTriangle size={12} /> {row.errors[0]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {step === 3 && result && !importResult && (
        <GlassCard className="p-6">
          <div className="section-title">Confirm import</div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
            <div className="flex items-center gap-2">
              {admin ? (
                <CheckCircle2 size={18} className="text-[var(--accent-3)]" />
              ) : (
                <AlertTriangle size={18} className="text-[var(--warn)]" />
              )}
              <span>
                <b>{result.validRows}</b> of <b>{result.totalRows}</b> rows are valid and will be written to the{' '}
                <b>{result.type}</b> table.
              </span>
            </div>
            {result.totalRows - result.validRows > 0 && (
              <div className="mt-1.5 text-xs text-[var(--text-dim)]">
                {result.totalRows - result.validRows} invalid rows will be skipped.
              </div>
            )}
            {!admin && (
              <div className="mt-2 text-xs font-semibold text-[var(--warn)]">
                Admin rights are required to confirm this import.
              </div>
            )}
          </div>
          <div className="mt-5 flex gap-2.5">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={15} /> Start over
            </Button>
            {admin && (
              <Button variant="success" onClick={confirm} disabled={confirming || result.validRows === 0}>
                <CheckCircle2 size={15} /> {confirming ? 'Committing…' : 'Confirm & commit'}
              </Button>
            )}
          </div>
        </GlassCard>
      )}

      {importResult && (
        <GlassCard className="p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(16,185,129,0.12)]">
            <CheckCircle2 size={30} className="text-[var(--accent-3)]" />
          </div>
          <div className="mt-4 text-lg font-bold">Import complete</div>
          <div className="mt-1 text-sm text-[var(--text-dim)]">
            <b>{importResult.imported}</b> rows imported · <b>{importResult.skipped}</b> skipped
          </div>
          <div className="mt-5 flex justify-center gap-2.5">
            <Button variant="primary" onClick={() => { setStep(1); setResult(null); setImportResult(null) }}>
              Import another file
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
