import { useEffect, useRef, useState } from 'react'
import {
  Upload, GitCompareArrows, ArrowLeftRight, Send, AlertTriangle, CheckCircle2, FileText,
  ArrowLeft, ArrowRight, Thermometer, Ruler, Scale, Gauge, Waves, Wind, Sparkles, Info, Layers,
  Hash, Calendar, Type as TypeIcon, Wand2,
} from 'lucide-react'
import { apiUpload, apiGet, apiPost } from '../lib/api'
import { downloadCSV } from '../lib/export'
import { suggestJoinKey, suggestPairs, runCompare, inferColumnType, type ColumnType, type ColumnPair, type CompareOutcome, type PairConfig } from '../lib/compareEngine'
import { detectUnit, UNITS, type UnitDef } from '../lib/units'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'

type Step = 1 | 2 | 3

interface ParsedGroup {
  name: string
  rowCount: number
  rows: Record<string, unknown>[]
  columns: string[]
}

interface ParsedFile {
  fileName: string
  format: string
  groups: ParsedGroup[]
  selectedGroup: string
  rows: Record<string, unknown>[]
  columns: string[]
}

type ResultTab = 'all' | 'matches' | 'mismatches' | 'missing'

interface UploadedFile {
  fileId: string
  fileName: string
}

const KIND_ICON: Record<string, React.ReactNode> = {
  temperature: <Thermometer size={12} />,
  length: <Ruler size={12} />,
  mass: <Scale size={12} />,
  volume: <Waves size={12} />,
  speed: <Wind size={12} />,
  pressure: <Gauge size={12} />,
}

const TEMPERATURE_TARGETS = UNITS.filter((u) => u.kind === 'temperature')

const TYPE_ICON: Record<ColumnType, React.ReactNode> = {
  number: <Hash size={11} />,
  date: <Calendar size={11} />,
  text: <TypeIcon size={11} />,
}

const TYPE_LABEL: Record<ColumnType, string> = {
  number: 'number',
  date: 'date',
  text: 'text',
}

export default function ComparePage() {
  const [step, setStep] = useState<Step>(1)
  const [base, setBase] = useState<ParsedFile | null>(null)
  const [compare, setCompare] = useState<ParsedFile | null>(null)
  const [parsing, setParsing] = useState<'base' | 'compare' | null>(null)
  const [join, setJoin] = useState<ColumnPair | null>(null)
  const [pairs, setPairs] = useState<ColumnPair[]>([])
  const [configs, setConfigs] = useState<Record<string, PairConfig>>({})
  const [tolerance, setTolerance] = useState('0')
  const [comparing, setComparing] = useState(false)
  const [outcome, setOutcome] = useState<CompareOutcome | null>(null)
  const [resultTab, setResultTab] = useState<ResultTab>('all')
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [comparisonId, setComparisonId] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([])
  const [vendorId, setVendorId] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const baseRef = useRef<HTMLInputElement>(null)
  const compareRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const parseFile = async (file: File, which: 'base' | 'compare') => {
    setParsing(which)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('which', which)
      const parsed = await apiUpload<{ fileName: string; format: string; groups: ParsedGroup[] }>('/api/compare/parse', form)
      const uploaded = await apiUpload<UploadedFile>('/api/uploads', form)
      const groups = parsed.groups.filter((g) => g.rows.length > 0)
      if (groups.length === 0) throw new Error('No readable rows found in the file')
      // default to the largest group; user can switch sheet/page below
      const best = groups.reduce((a, b) => (b.rowCount > a.rowCount ? b : a))
      const withNames: ParsedFile = {
        fileName: uploaded.fileName || parsed.fileName,
        format: parsed.format,
        groups,
        selectedGroup: best.name,
        rows: best.rows,
        columns: best.columns,
      }
      if (which === 'base') setBase(withNames)
      else setCompare(withNames)
      const extra = groups.length > 1 ? ` · ${groups.length} sheets/pages` : ''
      toast.success('File parsed', `${best.rowCount} rows · ${best.columns.length} columns · ${parsed.format.toUpperCase()}${extra}`)
    } catch (e) {
      toast.error('Could not read file', (e as Error).message)
    } finally {
      setParsing(null)
    }
  }

  const selectGroup = (which: 'base' | 'compare', name: string) => {
    const file = which === 'base' ? base : compare
    if (!file) return
    const g = file.groups.find((x) => x.name === name)
    if (!g) return
    const updated: ParsedFile = { ...file, selectedGroup: name, rows: g.rows, columns: g.columns }
    if (which === 'base') setBase(updated)
    else setCompare(updated)
    setJoin(null)
    setPairs([])
    setOutcome(null)
  }

  const ready = base !== null && compare !== null

  useEffect(() => {
    if (step !== 2 || !ready) return
    const jk = suggestJoinKey(base!.columns, compare!.columns, base!.rows, compare!.rows)
    setJoin(jk)
    const suggested = suggestPairs(base!.columns, compare!.columns, jk)
    setPairs(suggested)
    setConfigs({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ready])

  const cfgFor = (p: ColumnPair): PairConfig =>
    configs[`${p.baseCol}→${p.compareCol}`] ?? { baseCol: p.baseCol, compareCol: p.compareCol, targetUnit: 'auto', tolerance: 0 }

  const autoMatch = () => {
    if (!base || !compare) return
    const suggested = suggestPairs(base.columns, compare.columns, join)
    setPairs((prev) => {
      const seen = new Set(prev.map((p) => `${p.baseCol}→${p.compareCol}`))
      return [...prev, ...suggested.filter((p) => !seen.has(`${p.baseCol}→${p.compareCol}`))]
    })
    toast.info('Headers auto-matched', `${suggested.length} column pair(s) recognized across both files`)
  }

  const setCfg = (p: ColumnPair, patch: Partial<PairConfig>) => {
    const key = `${p.baseCol}→${p.compareCol}`
    setConfigs((prev) => ({ ...prev, [key]: { ...cfgFor(p), ...patch } }))
  }

  const unitOf = (side: 'base' | 'compare', col: string): UnitDef | null => {
    const file = side === 'base' ? base : compare
    if (!file) return null
    const samples = file.rows.slice(0, 30).map((r) => r[col])
    return detectUnit(col, samples)?.unit ?? null
  }

  const run = async () => {
    if (!base || !compare || !join || pairs.length === 0) return
    setComparing(true)
    try {
      const tol = Number(tolerance) || 0
      const result = runCompare(
        base.rows,
        compare.rows,
        join,
        pairs.map((p) => ({ ...cfgFor(p), tolerance: tol })),
      )
      setOutcome(result)
      const saved = await apiPost<{ comparisonId: string }>('/api/compare', {
        baseFileName: base.fileName,
        compareFileName: compare.fileName,
        joinKey: `${join.baseCol} ↔ ${join.compareCol}`,
        columns: pairs.map((p) => p.baseCol),
        tolerance: tol,
        mismatches: result.mismatches,
        missingInCompare: result.missingInCompare,
        missingInBase: result.missingInBase,
        summary: result.summary,
      })
      setComparisonId(saved.comparisonId)
      setReviewed(new Set())
      setResultTab('all')
      setStep(3)
      toast.info(
        'Comparison complete',
        `${result.mismatches.length} mismatch(es) · ${result.missingInCompare.length} missing in TO · ${result.missingInBase.length} missing in FROM`,
      )
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
    if (!comparisonId || !vendorId) {
      toast.error('Select a vendor with an email')
      return
    }
    setSending(true)
    try {
      await apiPost(`/api/compare/${comparisonId}/send-discrepancy`, { vendorId, notes })
      toast.success('Discrepancy email sent')
      setSendOpen(false)
    } catch (e) {
      toast.error('Email failed', (e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const swap = () => {
    setBase(compare)
    setCompare(base)
    setJoin(null)
    setPairs([])
    setOutcome(null)
    setReviewed(new Set())
    setResultTab('all')
    setStep(ready ? 2 : 1)
  }

  const reset = () => {
    setBase(null)
    setCompare(null)
    setJoin(null)
    setPairs([])
    setOutcome(null)
    setComparisonId(null)
    setConfigs({})
    setReviewed(new Set())
    setResultTab('all')
    setStep(1)
  }

  const totalIssues = (outcome?.mismatches.length ?? 0) + (outcome?.missingInCompare.length ?? 0) + (outcome?.missingInBase.length ?? 0)

  const exportMatches = () => {
    if (!outcome) return
    downloadCSV('compare-matches.csv', outcome.matched.flatMap((row) =>
      row.matches.map((m) => ({
        key: row.keyValue,
        column: m.column,
        baseValue: m.baseValue,
        compareValue: m.compareValue,
        normalized: `${m.baseNorm ?? ''} vs ${m.compareNorm ?? ''}`,
        unitNote: m.unitNote ?? '',
        result: 'match',
      })),
    ))
  }

  const exportFindings = () => {
    if (!outcome) return
    downloadCSV('compare-findings.csv', [
      ...outcome.mismatches.map((m) => ({
        key: m.keyValue,
        column: m.column,
        baseValue: m.baseValue,
        compareValue: m.compareValue,
        normalized: `${m.baseNorm ?? ''} vs ${m.compareNorm ?? ''}`,
        unitNote: m.unitNote ?? '',
        result: 'mismatch',
      })),
      ...outcome.matched.flatMap((row) =>
        row.matches.map((m) => ({
          key: row.keyValue,
          column: m.column,
          baseValue: m.baseValue,
          compareValue: m.compareValue,
          normalized: `${m.baseNorm ?? ''} vs ${m.compareNorm ?? ''}`,
          unitNote: m.unitNote ?? '',
          result: 'match',
        })),
      ),
      ...outcome.missingInCompare.map((m) => ({ key: m.keyValue, column: '', baseValue: '', compareValue: '', normalized: '', unitNote: '', result: 'missing in TO' })),
      ...outcome.missingInBase.map((m) => ({ key: m.keyValue, column: '', baseValue: '', compareValue: '', normalized: '', unitNote: '', result: 'missing in FROM' })),
    ])
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compare Files"
        description="Upload two files in any format, map the columns, and let smart unit detection diff them fairly."
        actions={
          <>
            {step !== 1 && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <ArrowLeft size={14} /> Start over
              </Button>
            )}
            {step === 3 && comparisonId && (
              <Button variant="primary" size="sm" onClick={openSend}>
                <Send size={15} /> Email discrepancy report
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center gap-1.5">
        {[
          { id: 1 as Step, label: 'Upload' },
          { id: 2 as Step, label: 'Map & Units' },
          { id: 3 as Step, label: 'Results' },
        ].map((s, i) => (
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
              <span className="hidden sm:inline">{s.label}</span>
            </span>
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <FileDropCard
              title="Compare FROM (base)"
              hint={base?.fileName}
              busy={parsing === 'base'}
              onPick={() => baseRef.current?.click()}
              icon={<FileText size={20} className="text-[var(--accent)]" />}
            />
            {base && base.groups.length > 1 && (
              <GroupPicker file={base} which="base" onSelect={selectGroup} />
            )}
          </div>
          <div className="space-y-2">
            <FileDropCard
              title="Compare TO (candidate)"
              hint={compare?.fileName}
              busy={parsing === 'compare'}
              onPick={() => compareRef.current?.click()}
              icon={<FileText size={20} className="text-[var(--accent-2)]" />}
            />
            {compare && compare.groups.length > 1 && (
              <GroupPicker file={compare} which="compare" onSelect={selectGroup} />
            )}
          </div>
          <input
            ref={baseRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0], 'base')}
          />
          <input
            ref={compareRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0], 'compare')}
          />
          <div className="flex items-center justify-between gap-3 lg:col-span-2">
            <Button variant="ghost" onClick={swap} disabled={!base && !compare}>
              <ArrowLeftRight size={15} /> Swap files
            </Button>
            <Button variant="primary" onClick={() => setStep(2)} disabled={!ready}>
              Continue <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && ready && (
        <GlassCard className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="section-title">
              <Sparkles size={15} className="mr-1.5 inline text-[var(--accent)]" />
              Map columns · {base!.fileName} ↔ {compare!.fileName}
            </div>
            <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)]">
              <span>{base!.rows.length} base rows</span>
              <span>·</span>
              <span>{compare!.rows.length} compare rows</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Join key (base column)" required hint="Row identity used to match rows">
              <select
                className="input"
                value={join?.baseCol ?? ''}
                onChange={(e) => setJoin({ baseCol: e.target.value, compareCol: join?.compareCol ?? '', confidence: 'manual' })}
              >
                <option value="">Select column…</option>
                {base!.columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Join key (compare column)" required>
              <select
                className="input"
                value={join?.compareCol ?? ''}
                onChange={(e) => setJoin({ baseCol: join?.baseCol ?? '', compareCol: e.target.value, confidence: 'manual' })}
              >
                <option value="">Select column…</option>
                {compare!.columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="section-title">
              <Sparkles size={15} className="mr-1.5 inline text-[var(--accent)]" />
              Recognized column headers
            </div>
            <Button variant="ghost" size="sm" onClick={autoMatch} disabled={!join}>
              <Wand2 size={13} /> Auto-match headers
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <HeaderChips title={base!.fileName} file={base!} />
            <HeaderChips title={compare!.fileName} file={compare!} />
          </div>

          <div className="mt-5 section-title">Columns to compare</div>
          {pairs.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
              No automatic suggestions — add column pairs manually below.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pairs.map((p) => {
                const bu = unitOf('base', p.baseCol)
                const cu = unitOf('compare', p.compareCol)
                const mixed = bu && cu && bu.id !== cu.id
                const cfg = cfgFor(p)
                const pt = inferColumnType(base!.rows, p.baseCol)
                const targetOptions = bu?.kind === 'temperature' || cu?.kind === 'temperature' ? TEMPERATURE_TARGETS : UNITS.filter((u) => u.kind === (bu?.kind ?? cu?.kind))
                return (
                  <div key={`${p.baseCol}→${p.compareCol}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="badge badge-purple">{p.baseCol}</span>
                      <span className="text-xs text-[var(--text-muted)]">↔</span>
                      <span className="badge">{p.compareCol}</span>
                      <span className="badge badge-info">{TYPE_ICON[pt]} {TYPE_LABEL[pt]}</span>
                      {p.confidence === 'high' && <span className="badge badge-ok"><CheckCircle2 size={11} /> auto</span>}
                      {mixed && (
                        <span className="badge badge-warn">
                          {KIND_ICON[bu!.kind]} {bu!.label} vs {cu!.label} — units differ
                        </span>
                      )}
                      {!mixed && (bu || cu) && (
                        <span className="badge badge-info">
                          {KIND_ICON[(bu ?? cu)!.kind]} {(bu ?? cu)!.label}
                        </span>
                      )}
                      <button
                        className="ml-auto text-xs font-semibold text-[var(--danger)] hover:underline"
                        onClick={() => setPairs((prev) => prev.filter((x) => x !== p))}
                      >
                        remove
                      </button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5">
                        Target unit
                        <select
                          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-xs"
                          value={cfg.targetUnit}
                          onChange={(e) => setCfg(p, { targetUnit: e.target.value })}
                        >
                          <option value="auto">Auto ({(bu ?? cu)?.label ?? 'none'})</option>
                          {targetOptions.map((u) => (
                            <option key={u.id} value={u.id}>{u.label}</option>
                          ))}
                        </select>
                      </label>
                      {mixed && (
                        <span className="flex items-center gap-1 text-[var(--warn)]">
                          <Info size={12} /> Values will be converted before comparing
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <AddPairRow
            base={base!}
            compare={compare!}
            onAdd={(bp, cp) =>
              setPairs((prev) =>
                prev.some((x) => x.baseCol === bp && x.compareCol === cp) ? prev : [...prev, { baseCol: bp, compareCol: cp, confidence: 'manual' }],
              )
            }
          />

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <Field label="Tolerance (±)" hint="Absolute tolerance; small relative drift is always allowed">
              <input type="number" className="input !w-40" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
            </Field>
            <div className="flex gap-2.5">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Files
              </Button>
              <Button variant="primary" onClick={run} disabled={comparing || !join || pairs.length === 0}>
                <GitCompareArrows size={15} /> {comparing ? 'Comparing…' : 'Run comparison'}
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {step === 3 && outcome && (
        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <div className="text-sm font-bold">Results</div>
              <div className="text-xs text-[var(--text-muted)]">
                {base?.fileName} ({base?.selectedGroup}) vs {compare?.fileName} ({compare?.selectedGroup}) · join “{join?.baseCol} ↔ {join?.compareCol}” · {outcome.summary.matchedRows}/{outcome.summary.totalRows} rows matched
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-ok">{outcome.matched.length} rows matched</span>
              <span className="badge badge-err">{outcome.mismatches.length} mismatches</span>
              <span className="badge badge-warn">{outcome.missingInCompare.length} missing in TO</span>
              <span className="badge badge-info">{outcome.missingInBase.length} missing in FROM</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-5 py-2.5">
            {([
              ['all', `All (${outcome.matched.length + outcome.mismatches.length + outcome.missingInCompare.length + outcome.missingInBase.length})`],
              ['matches', `Matches (${outcome.matched.length})`],
              ['mismatches', `Mismatches (${outcome.mismatches.length})`],
              ['missing', `Missing (${outcome.missingInCompare.length + outcome.missingInBase.length})`],
            ] as Array<[ResultTab, string]>).map(([id, label]) => (
              <button
                key={id}
                className="rounded-full px-3 py-1 text-xs font-bold transition"
                style={
                  resultTab === id
                    ? { background: 'var(--gradient-primary)', color: '#fff' }
                    : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                }
                onClick={() => setResultTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {outcome.conversions.length > 0 && (
            <div className="border-b border-[var(--border)] bg-[rgba(124,58,237,0.05)] px-5 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)]">
                <Sparkles size={13} /> Unit conversions applied ({outcome.conversions.length})
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {outcome.conversions.slice(0, 12).map((c) => (
                  <span key={c} className="rounded-md bg-[var(--bg)] px-2 py-0.5 text-xs">{c}</span>
                ))}
                {outcome.conversions.length > 12 && (
                  <span className="text-xs text-[var(--text-muted)]">+{outcome.conversions.length - 12} more</span>
                )}
              </div>
            </div>
          )}

          {totalIssues === 0 && outcome.matched.length === 0 ? (
            <EmptyState
              title="Nothing to show"
              description="The files match within the configured tolerance, after unit normalization."
              icon={<CheckCircle2 size={28} className="text-[var(--accent-3)]" />}
            />
          ) : (
            <div className="space-y-4 p-5">
              {(resultTab === 'all' || resultTab === 'matches') && outcome.matched.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--accent-3)]">
                      <CheckCircle2 size={15} /> Matched values ({outcome.matched.length} rows)
                    </div>
                    <button
                      className="text-xs font-semibold text-[var(--accent)] hover:underline"
                      onClick={() => exportMatches()}
                    >
                      Export matched (CSV)
                    </button>
                  </div>
                  <MatchedTable outcome={outcome} expanded={resultTab === 'matches'} />
                </div>
              )}

              {(resultTab === 'all' || resultTab === 'mismatches') && outcome.mismatches.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Column</th>
                        <th>Base value</th>
                        <th>Compare value</th>
                        <th>Normalized</th>
                        <th>Reviewed</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outcome.mismatches.slice(0, resultTab === 'mismatches' ? 300 : 100).map((m, i) => {
                        const rk = `${m.keyValue}|${m.column}|${i}`
                        return (
                          <tr key={i} style={{ opacity: reviewed.has(rk) ? 0.55 : 1 }}>
                            <td className="font-semibold">{m.keyValue}</td>
                            <td>
                              <span className="badge badge-purple">{m.column}</span>
                              <span className="badge ml-1">{TYPE_ICON[m.type]} {TYPE_LABEL[m.type]}</span>
                            </td>
                            <td className="text-[var(--danger)]">{m.baseValue || '—'}</td>
                            <td className="text-[var(--accent-3)]">{m.compareValue || '—'}</td>
                            <td className="text-xs text-[var(--text-muted)]">
                              {m.baseNorm} vs {m.compareNorm}
                              {m.unitNote && (
                                <span className="mt-0.5 block text-[var(--warn)]">{m.unitNote}</span>
                              )}
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[var(--accent)]"
                                checked={reviewed.has(rk)}
                                onChange={() =>
                                  setReviewed((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(rk)) next.delete(rk)
                                    else next.add(rk)
                                    return next
                                  })
                                }
                              />
                            </td>
                            <td>{reviewed.has(rk) ? <StatusBadge tone="ok">Reviewed</StatusBadge> : <StatusBadge tone="err">Mismatch</StatusBadge>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {outcome.mismatches.length > (resultTab === 'mismatches' ? 300 : 100) && (
                    <div className="px-4 py-2 text-xs text-[var(--text-muted)]">
                      Showing first {resultTab === 'mismatches' ? 300 : 100} of {outcome.mismatches.length} — switch to the Mismatches tab or export to see all
                    </div>
                  )}
                </div>
              )}

              {(resultTab === 'all' || resultTab === 'missing') && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(resultTab === 'missing' || outcome.missingInCompare.length > 0) && outcome.missingInCompare.length > 0 && (
                    <div className="rounded-xl border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)] p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-[var(--warn)]">
                        <AlertTriangle size={15} /> Missing in Compare TO ({outcome.missingInCompare.length})
                      </div>
                      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-[var(--text-dim)]">
                        {outcome.missingInCompare.slice(0, 100).map((m) => (
                          <div key={m.keyValue}>· {m.keyValue}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(resultTab === 'missing' || outcome.missingInBase.length > 0) && outcome.missingInBase.length > 0 && (
                    <div className="rounded-xl border border-[rgba(96,165,250,0.3)] bg-[rgba(96,165,250,0.05)] p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-[var(--accent)]">
                        <AlertTriangle size={15} /> Missing in Base FROM ({outcome.missingInBase.length})
                      </div>
                      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-[var(--text-dim)]">
                        {outcome.missingInBase.slice(0, 100).map((m) => (
                          <div key={m.keyValue}>· {m.keyValue}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
            <Button variant="ghost" size="sm" onClick={exportFindings}>
              <FileText size={14} /> Export findings (CSV)
            </Button>
            <Button variant="primary" onClick={() => setStep(2)}>
              <ArrowLeft size={15} /> Adjust mapping
            </Button>
          </div>
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
            The email uses the discrepancy template from Admin settings and includes up to 20 mismatches and missing rows.
          </div>
        </div>
      </Modal>
    </div>
  )
}

function HeaderChips({ title, file }: { title: string; file: ParsedFile }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
      <div className="truncate text-xs font-bold">{title}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {file.columns.map((c) => {
          const t = inferColumnType(file.rows, c)
          const u = detectUnit(c, file.rows.slice(0, 30).map((r) => r[c]))?.unit
          return (
            <span key={c} className="badge">
              {TYPE_ICON[t]} {c}
              {u && <span className="ml-1 text-[var(--accent)]">· {u.label}</span>}
            </span>
          )
        })}
        {file.columns.length === 0 && <span className="text-xs text-[var(--text-muted)]">No columns detected</span>}
      </div>
    </div>
  )
}

function GroupPicker({
  file,
  which,
  onSelect,
}: {
  file: ParsedFile
  which: 'base' | 'compare'
  onSelect: (which: 'base' | 'compare', name: string) => void
}) {
  return (
    <GlassCard className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)]">
        <Layers size={14} className="text-[var(--accent)]" />
        {file.format === 'pdf' ? 'Page' : 'Sheet'}
      </div>
      <select
        className="input !w-auto flex-1 text-xs"
        value={file.selectedGroup}
        onChange={(e) => onSelect(which, e.target.value)}
      >
        {file.groups.map((g) => (
          <option key={g.name} value={g.name}>
            {g.name} · {g.rowCount} rows
          </option>
        ))}
      </select>
    </GlassCard>
  )
}

function MatchedTable({ outcome, expanded }: { outcome: CompareOutcome; expanded: boolean }) {
  const limit = expanded ? 300 : 50
  const flat = outcome.matched.flatMap((row) =>
    row.matches.map((m) => ({ key: row.keyValue, ...m })),
  )
  return (
    <div className="overflow-x-auto rounded-xl border border-[rgba(34,197,94,0.25)]">
      <table className="data-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Column</th>
            <th>Base value</th>
            <th>Compare value</th>
            <th>Normalized</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {flat.slice(0, limit).map((m, i) => (
            <tr key={i}>
              <td className="font-semibold">{m.key}</td>
              <td>
                <span className="badge badge-purple">{m.column}</span>
                <span className="badge ml-1">{TYPE_ICON[m.type]} {TYPE_LABEL[m.type]}</span>
              </td>
              <td>{m.baseValue || '—'}</td>
              <td>{m.compareValue || '—'}</td>
              <td className="text-xs text-[var(--text-muted)]">
                {m.baseNorm} vs {m.compareNorm}
                {m.unitNote && <span className="mt-0.5 block text-[var(--warn)]">{m.unitNote}</span>}
              </td>
              <td><StatusBadge tone="ok">Match</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
      {flat.length > limit && (
        <div className="px-4 py-2 text-xs text-[var(--text-muted)]">
          Showing first {limit} of {flat.length} matched values — open the Matches tab or export to see all
        </div>
      )}
    </div>
  )
}

function AddPairRow({
  base,
  compare,
  onAdd,
}: {
  base: ParsedFile
  compare: ParsedFile
  onAdd: (baseCol: string, compareCol: string) => void
}) {
  const [bc, setBc] = useState('')
  const [cc, setCc] = useState('')
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2.5">
      <Field label="Add base column">
        <select className="input !w-48" value={bc} onChange={(e) => setBc(e.target.value)}>
          <option value="">Select…</option>
          {base.columns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Add compare column">
        <select className="input !w-48" value={cc} onChange={(e) => setCc(e.target.value)}>
          <option value="">Select…</option>
          {compare.columns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Button
        variant="ghost"
        size="sm"
        disabled={!bc || !cc}
        onClick={() => {
          onAdd(bc, cc)
          setBc('')
          setCc('')
        }}
      >
        + Add pair
      </Button>
    </div>
  )
}

function FileDropCard({
  title,
  hint,
  busy,
  onPick,
  icon,
}: {
  title: string
  hint?: string
  busy: boolean
  onPick: () => void
  icon: React.ReactNode
}) {
  return (
    <GlassCard
      className={`flex flex-col items-center justify-center gap-2 p-8 transition hover:bg-[var(--surface-hover)] ${hint ? '' : 'border-dashed'}`}
    >
      <div onClick={onPick} className="flex cursor-pointer flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {icon}
        </div>
        <div className="text-sm font-bold">{title}</div>
        {busy ? (
          <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]">Parsing…</div>
        ) : hint ? (
          <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <CheckCircle2 size={13} /> {hint}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Upload size={13} /> Click to upload · CSV, XLSX, XLS, PDF
          </div>
        )}
      </div>
    </GlassCard>
  )
}
