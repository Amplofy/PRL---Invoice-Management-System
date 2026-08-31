import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, GitCompareArrows, ArrowLeftRight, Send, AlertTriangle, CheckCircle2, FileText,
  ArrowLeft, ArrowRight, Thermometer, Ruler, Scale, Gauge, Waves, Wind, Sparkles, Info, Layers,
  Hash, Calendar, Type as TypeIcon, Wand2, Equal, SlidersHorizontal, ListOrdered, Stethoscope,
} from 'lucide-react'
import { apiUpload, apiGet, apiPost } from '../lib/api'
import { downloadCSV } from '../lib/export'
import {
  profileFile, keyCandidates, suggestPairs, verify,
  type FileProfile, type KeyCandidate, type MatchStrategy, type ValueKind,
  type ColumnPair, type VerifyOutcome, type PairConfig,
} from '../lib/deltaEngine'
import { detectUnit, UNITS, type UnitDef } from '../lib/units'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'

type Step = 1 | 2 | 3 | 4
type ResultTab = 'all' | 'matches' | 'mismatches' | 'missing'

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

const TYPE_ICON: Record<ValueKind, React.ReactNode> = {
  number: <Hash size={11} />,
  date: <Calendar size={11} />,
  text: <TypeIcon size={11} />,
}

const STRATEGY_ICON: Record<MatchStrategy, React.ReactNode> = {
  exact: <Equal size={13} />,
  composite: <Layers size={13} />,
  fuzzy: <Wand2 size={13} />,
  numeric: <SlidersHorizontal size={13} />,
  position: <ListOrdered size={13} />,
}

const STRATEGY_LABEL: Record<MatchStrategy, string> = {
  exact: 'Exact key',
  composite: 'Composite key',
  fuzzy: 'Fuzzy key',
  numeric: 'Numeric proximity',
  position: 'Row position',
}

const STRATEGY_HINT: Record<MatchStrategy, string> = {
  exact: 'Values match character-for-character',
  composite: 'Two columns combined form the row identity',
  fuzzy: 'Close enough keys counted as the same row (typos, spacing, separators)',
  numeric: 'Rows paired by nearest numeric value (dip/depth readings)',
  position: 'Nth row aligned with Nth row — for tables without any key',
}

const TEMPERATURE_TARGETS = UNITS.filter((u) => u.kind === 'temperature')

export default function ComparePage() {
  const [step, setStep] = useState<Step>(1)
  const [base, setBase] = useState<ParsedFile | null>(null)
  const [compare, setCompare] = useState<ParsedFile | null>(null)
  const [parsing, setParsing] = useState<'base' | 'compare' | null>(null)

  const [baseProfile, setBaseProfile] = useState<FileProfile | null>(null)
  const [compareProfile, setCompareProfile] = useState<FileProfile | null>(null)
  const [candidates, setCandidates] = useState<KeyCandidate[]>([])
  const [chosenId, setChosenId] = useState<string | null>(null)

  const [pairs, setPairs] = useState<ColumnPair[]>([])
  const [unitCfg, setUnitCfg] = useState<Record<string, string>>({})
  const [numTol, setNumTol] = useState('0')
  const [dateTol, setDateTol] = useState('0')
  const [running, setRunning] = useState(false)
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null)
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

  const ready = base !== null && compare !== null
  const candidate = candidates.find((c) => c.id === chosenId) ?? null

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
    setOutcome(null)
    setStep(1)
  }

  // Analysis runs whenever both files are ready and step 2 opens
  useEffect(() => {
    if (step !== 2 || !ready) return
    const bp = profileFile(base!.rows, base!.columns)
    const cp = profileFile(compare!.rows, compare!.columns)
    setBaseProfile(bp)
    setCompareProfile(cp)
    const cands = keyCandidates(base!.rows, compare!.rows, bp, cp)
    setCandidates(cands)
    const best = cands[0] ?? null
    setChosenId(best?.id ?? null)
    if (best) {
      setPairs(suggestPairs(base!.columns, compare!.columns, best.baseCols, best.compareCols))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ready])

  const chooseCandidate = (c: KeyCandidate) => {
    setChosenId(c.id)
    if (base && compare) {
      setPairs(suggestPairs(base.columns, compare.columns, c.baseCols, c.compareCols))
    }
  }

  const cfgFor = (p: ColumnPair): PairConfig => ({
    baseCol: p.baseCol,
    compareCol: p.compareCol,
    targetUnit: unitCfg[`${p.baseCol}→${p.compareCol}`] ?? 'auto',
  })

  const setCfg = (p: ColumnPair, patch: Partial<PairConfig>) => {
    const key = `${p.baseCol}→${p.compareCol}`
    setUnitCfg((prev) => ({ ...prev, [key]: patch.targetUnit ?? prev[key] ?? 'auto' }))
  }

  const unitOf = (side: 'base' | 'compare', col: string): UnitDef | null => {
    const file = side === 'base' ? base : compare
    if (!file) return null
    const samples = file.rows.slice(0, 30).map((r) => r[col])
    return detectUnit(col, samples)?.unit ?? null
  }

  const run = async () => {
    if (!base || !compare || !baseProfile || !compareProfile || !candidate) return
    setRunning(true)
    try {
      const result = verify(
        base.rows,
        compare.rows,
        baseProfile,
        compareProfile,
        candidate,
        pairs.map(cfgFor),
        { numericTolerance: Number(numTol) || 0, dateToleranceDays: Number(dateTol) || 0 },
        candidates,
      )
      setOutcome(result)
      setReviewed(new Set())
      setResultTab('all')
      const saved = await apiPost<{ comparisonId: string }>('/api/compare', {
        baseFileName: base.fileName,
        compareFileName: compare.fileName,
        joinKey: `${candidate.strategy}: ${candidate.baseCols.join('+') || 'position'} ↔ ${candidate.compareCols.join('+') || 'position'}`,
        columns: pairs.map((p) => p.baseCol),
        tolerance: Number(numTol) || 0,
        mismatches: result.rows.flatMap((r) =>
          r.cells.filter((c) => c.status === 'mismatch').map((c) => ({
            keyValue: r.key,
            column: c.column,
            baseValue: c.baseValue,
            compareValue: c.compareValue,
          })),
        ),
        missingInCompare: result.rows.filter((r) => r.status === 'missing_in_compare').map((r) => ({ keyValue: r.key })),
        missingInBase: result.rows.filter((r) => r.status === 'missing_in_base').map((r) => ({ keyValue: r.key })),
        summary: { totalRows: result.summary.totalRows, matchedRows: result.summary.matchedRows },
      })
      setComparisonId(saved.comparisonId)
      setStep(4)
      toast.info(
        'Delta analysis complete',
        `${result.summary.matchedRows} matched · ${result.summary.mismatchRows} mismatched · ${result.summary.missingInCompare + result.summary.missingInBase} unaligned`,
      )
    } catch (e) {
      toast.error('Verification failed', (e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const healTo = (c: KeyCandidate) => {
    chooseCandidate(c)
    setOutcome(null)
    setStep(2)
    toast.info('Key switched', `Now using ${STRATEGY_LABEL[c.strategy]} on ${c.baseCols.join(' + ') || 'row position'}`)
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
    setOutcome(null)
    setCandidates([])
    setChosenId(null)
    setPairs([])
    setStep(ready ? 2 : 1)
  }

  const reset = () => {
    setBase(null)
    setCompare(null)
    setBaseProfile(null)
    setCompareProfile(null)
    setCandidates([])
    setChosenId(null)
    setPairs([])
    setUnitCfg({})
    setOutcome(null)
    setComparisonId(null)
    setReviewed(new Set())
    setResultTab('all')
    setStep(1)
  }

  const issueRows = useMemo(
    () => (outcome ? outcome.rows.filter((r) => r.status !== 'match') : []),
    [outcome],
  )
  const matchedRows = useMemo(
    () => (outcome ? outcome.rows.filter((r) => r.status === 'match') : []),
    [outcome],
  )

  const exportRows = (label: string, rows: VerifyOutcome['rows']) => {
    downloadCSV(label, rows.flatMap((r) =>
      r.cells.length === 0
        ? [{ key: r.key, column: '', type: '', baseValue: '', compareValue: '', normalized: '', unitNote: '', result: r.status }]
        : r.cells.map((c) => ({
            key: r.key,
            column: c.column,
            type: c.type,
            baseValue: c.baseValue,
            compareValue: c.compareValue,
            normalized: `${c.baseNorm ?? ''} vs ${c.compareNorm ?? ''}`,
            unitNote: c.unitNote ?? '',
            result: c.status,
          })),
    ))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delta Analyst"
        description="Universal delta detection: the engine profiles both files, discovers how rows correspond, and verifies every value — self-healing when alignment drifts."
        actions={
          <>
            {step !== 1 && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <ArrowLeft size={14} /> Start over
              </Button>
            )}
            {step === 4 && comparisonId && (
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
          { id: 2 as Step, label: 'Understand' },
          { id: 3 as Step, label: 'Align' },
          { id: 4 as Step, label: 'Verify' },
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
              title="File A (reference)"
              hint={base?.fileName}
              busy={parsing === 'base'}
              onPick={() => baseRef.current?.click()}
              icon={<FileText size={20} className="text-[var(--accent)]" />}
            />
            {base && base.groups.length > 1 && <GroupPicker file={base} which="base" onSelect={selectGroup} />}
          </div>
          <div className="space-y-2">
            <FileDropCard
              title="File B (candidate)"
              hint={compare?.fileName}
              busy={parsing === 'compare'}
              onPick={() => compareRef.current?.click()}
              icon={<FileText size={20} className="text-[var(--accent-2)]" />}
            />
            {compare && compare.groups.length > 1 && <GroupPicker file={compare} which="compare" onSelect={selectGroup} />}
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
              Analyze <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && ready && baseProfile && compareProfile && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ProfileCard title={base!.fileName} profile={baseProfile} />
            <ProfileCard title={compare!.fileName} profile={compareProfile} />
          </div>

          <GlassCard className="p-5">
            <div className="section-title">
              <Sparkles size={15} className="mr-1.5 inline text-[var(--accent)]" />
              How should rows be matched?
            </div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              The engine tested every column pair across both files. Pick the strategy with the best expected alignment — you can switch later.
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {candidates.map((c) => {
                const active = c.id === chosenId
                return (
                  <button
                    key={c.id}
                    onClick={() => chooseCandidate(c)}
                    className="rounded-xl border p-4 text-left transition"
                    style={{
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      background: active ? 'rgba(124,58,237,0.06)' : 'var(--surface)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="badge badge-purple">{STRATEGY_ICON[c.strategy]} {STRATEGY_LABEL[c.strategy]}</span>
                      {c.strategy === 'position' && <span className="badge badge-warn">fallback</span>}
                      <span className="ml-auto text-xs font-bold text-[var(--accent-3)]">{Math.round(c.matchRate * 100)}% expected</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold">
                      {c.baseCols.length === 0
                        ? 'Nth row ↔ Nth row'
                        : `${c.baseCols.join(' + ')} ↔ ${c.compareCols.join(' + ')}`}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, c.matchRate * 100)}%`, background: 'var(--gradient-primary)' }} />
                    </div>
                    <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{STRATEGY_HINT[c.strategy]}</div>
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Files
              </Button>
              <Button variant="primary" onClick={() => setStep(3)} disabled={!chosenId}>
                Continue <ArrowRight size={15} />
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {step === 3 && ready && candidate && base && compare && (
        <GlassCard className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="section-title">
              <GitCompareArrows size={15} className="mr-1.5 inline text-[var(--accent)]" />
              Columns to verify · {base.fileName} ↔ {compare.fileName}
            </div>
            <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)]">
              <span className="badge badge-purple">{STRATEGY_ICON[candidate.strategy]} {STRATEGY_LABEL[candidate.strategy]}</span>
              <span>{base.rows.length} × {compare.rows.length} rows</span>
            </div>
          </div>

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
                const pt = baseProfile?.columns.find((c) => c.name === p.baseCol)?.kind ?? 'text'
                const targetOptions = bu?.kind === 'temperature' || cu?.kind === 'temperature' ? TEMPERATURE_TARGETS : UNITS.filter((u) => u.kind === (bu?.kind ?? cu?.kind))
                return (
                  <div key={`${p.baseCol}→${p.compareCol}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="badge badge-purple">{p.baseCol}</span>
                      <span className="text-xs text-[var(--text-muted)]">↔</span>
                      <span className="badge">{p.compareCol}</span>
                      <span className="badge badge-info">{TYPE_ICON[pt]} {pt}</span>
                      {p.confidence === 'high' && <span className="badge badge-ok"><CheckCircle2 size={11} /> auto</span>}
                      {mixed && (
                        <span className="badge badge-warn">
                          {KIND_ICON[bu!.kind]} {bu!.label} vs {cu!.label} — units differ
                        </span>
                      )}
                      <button
                        className="ml-auto text-xs font-semibold text-[var(--danger)] hover:underline"
                        onClick={() => setPairs((prev) => prev.filter((x) => x !== p))}
                      >
                        remove
                      </button>
                    </div>
                    {(bu || cu) && (
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
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <AddPairRow base={base} compare={compare} onAdd={(bp, cp) =>
            setPairs((prev) => prev.some((x) => x.baseCol === bp && x.compareCol === cp) ? prev : [...prev, { baseCol: bp, compareCol: cp, confidence: 'manual' }])
          } />

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Numeric tolerance (±)" hint="Absolute; 0.5% relative drift is always allowed">
              <input type="number" className="input" value={numTol} onChange={(e) => setNumTol(e.target.value)} />
            </Field>
            <Field label="Date tolerance (days)" hint="Dates normalize across formats first">
              <input type="number" className="input" value={dateTol} onChange={(e) => setDateTol(e.target.value)} />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft size={15} /> Strategy
            </Button>
            <Button variant="primary" onClick={run} disabled={running || pairs.length === 0}>
              <GitCompareArrows size={15} /> {running ? 'Verifying…' : 'Verify all values'}
            </Button>
          </div>
        </GlassCard>
      )}

      {step === 4 && outcome && base && compare && candidate && (
        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <div className="text-sm font-bold">Delta report</div>
              <div className="text-xs text-[var(--text-muted)]">
                {base.fileName} ({base.selectedGroup}) vs {compare.fileName} ({compare.selectedGroup}) · {STRATEGY_LABEL[candidate.strategy]} · {Math.round(outcome.summary.matchRate * 100)}% aligned
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-ok">{outcome.summary.matchedRows} clean</span>
              <span className="badge badge-err">{outcome.summary.mismatchRows} deltas</span>
              <span className="badge badge-warn">{outcome.summary.missingInCompare} only in A</span>
              <span className="badge badge-info">{outcome.summary.missingInBase} only in B</span>
            </div>
          </div>

          {outcome.heal.length > 0 && (
            <div className="border-b border-[var(--border)] bg-[rgba(245,158,11,0.07)] px-5 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--warn)]">
                <Stethoscope size={13} /> Self-healing suggestions
              </div>
              {outcome.heal.map((h, i) => (
                <div key={i} className="mt-1.5 text-xs text-[var(--text-dim)]">
                  {h.message}
                  {h.candidates.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {h.candidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => healTo(c)}
                          className="rounded-lg border border-[rgba(245,158,11,0.4)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--warn)] hover:bg-[var(--surface-hover)]"
                        >
                          {STRATEGY_ICON[c.strategy]} {STRATEGY_LABEL[c.strategy]} · {c.baseCols.join('+') || 'position'} · {Math.round(c.matchRate * 100)}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

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

          <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-5 py-2.5">
            {([
              ['all', `All (${outcome.rows.length})`],
              ['matches', `Clean (${outcome.summary.matchedRows})`],
              ['mismatches', `Deltas (${outcome.summary.mismatchRows})`],
              ['missing', `Unmatched (${issueRows.filter((r) => r.status.startsWith('missing')).length})`],
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

          {outcome.rows.length === 0 ? (
            <EmptyState
              title="Nothing to compare"
              description="Neither file produced readable rows."
              icon={<AlertTriangle size={28} className="text-[var(--warn)]" />}
            />
          ) : (
            <div className="space-y-4 p-5">
              {(resultTab === 'all' || resultTab === 'matches') && matchedRows.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--accent-3)]">
                      <CheckCircle2 size={15} /> Clean rows ({matchedRows.length})
                    </div>
                    <button className="text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => exportRows('delta-clean.csv', matchedRows)}>
                      Export clean rows (CSV)
                    </button>
                  </div>
                  <RowsTable rows={matchedRows.slice(0, resultTab === 'matches' ? 300 : 50)} />
                  {matchedRows.length > (resultTab === 'matches' ? 300 : 50) && (
                    <div className="mt-1.5 text-xs text-[var(--text-muted)]">Showing first {resultTab === 'matches' ? 300 : 50} of {matchedRows.length} — open the Matched tab or export</div>
                  )}
                </div>
              )}

              {(resultTab === 'all' || resultTab === 'mismatches') && issueRows.some((r) => r.status === 'mismatch') && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--danger)]">
                      <AlertTriangle size={15} /> Discrepancies
                    </div>
                    <button
                      className="text-xs font-semibold text-[var(--accent)] hover:underline"
                      onClick={() => exportRows('delta-variances.csv', issueRows.filter((r) => r.status === 'mismatch'))}
                    >
                      Export deltas (CSV)
                    </button>
                  </div>
                  <RowsTable
                    rows={issueRows.filter((r) => r.status === 'mismatch').slice(0, resultTab === 'mismatches' ? 300 : 50)}
                    reviewed={reviewed}
                    onToggleReview={(rk) =>
                      setReviewed((prev) => {
                        const next = new Set(prev)
                        if (next.has(rk)) next.delete(rk)
                        else next.add(rk)
                        return next
                      })
                    }
                  />
                </div>
              )}

              {(resultTab === 'all' || resultTab === 'missing') && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {outcome.summary.missingInCompare > 0 && (
                    <div className="rounded-xl border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)] p-4">
                      <div className="flex items-center justify-between text-sm font-bold text-[var(--warn)]">
                        <span className="flex items-center gap-2"><AlertTriangle size={15} /> Only in A ({outcome.summary.missingInCompare})</span>
                        <button className="text-xs font-semibold hover:underline" onClick={() => exportRows('delta-only-in-a.csv', issueRows.filter((r) => r.status === 'missing_in_compare'))}>CSV</button>
                      </div>
                      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-[var(--text-dim)]">
                        {issueRows.filter((r) => r.status === 'missing_in_compare').slice(0, 100).map((r) => (
                          <div key={`${r.baseIdx}:${r.key}`}>· {r.key}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {outcome.summary.missingInBase > 0 && (
                    <div className="rounded-xl border border-[rgba(96,165,250,0.3)] bg-[rgba(96,165,250,0.05)] p-4">
                      <div className="flex items-center justify-between text-sm font-bold text-[var(--accent)]">
                        <span className="flex items-center gap-2"><AlertTriangle size={15} /> Only in B ({outcome.summary.missingInBase})</span>
                        <button className="text-xs font-semibold hover:underline" onClick={() => exportRows('delta-only-in-b.csv', issueRows.filter((r) => r.status === 'missing_in_base'))}>CSV</button>
                      </div>
                      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-[var(--text-dim)]">
                        {issueRows.filter((r) => r.status === 'missing_in_base').slice(0, 100).map((r) => (
                          <div key={`${r.compareIdx}:${r.key}`}>· {r.key}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
            <Button variant="ghost" size="sm" onClick={() => exportRows('delta-report.csv', outcome.rows)}>
              <FileText size={14} /> Export delta report (CSV)
            </Button>
            <Button variant="primary" onClick={() => setStep(3)}>
              <ArrowLeft size={15} /> Adjust alignment
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

// ---------------------------------------------------------------- helpers

function ProfileCard({ title, profile }: { title: string; profile: FileProfile }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs font-bold">{title}</div>
        <span className="badge">{profile.rowCount} rows</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {profile.columns.map((c) => (
          <span key={c.name} className="badge" title={`${c.kind} · ${Math.round(c.uniqueRatio * 100)}% unique · ${Math.round(c.fillRate * 100)}% filled`}>
            {TYPE_ICON[c.kind]} {c.name}
            {c.unit && <span className="ml-1 text-[var(--accent)]">· {c.unit.label}</span>}
            {c.idLike && <span className="ml-1 font-bold text-[var(--accent)]">ID</span>}
          </span>
        ))}
        {profile.columns.length === 0 && <span className="text-xs text-[var(--text-muted)]">No columns detected</span>}
      </div>
    </GlassCard>
  )
}

function RowsTable({
  rows,
  reviewed,
  onToggleReview,
}: {
  rows: VerifyOutcome['rows']
  reviewed?: Set<string>
  onToggleReview?: (key: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="data-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Column</th>
            <th>A value</th>
            <th>B value</th>
            <th>Normalized</th>
            {onToggleReview && <th>Reviewed</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            r.cells.length === 0 ? (
              <tr key={`${r.baseIdx}:${r.compareIdx}:${r.key}`}>
                <td className="font-semibold">{r.key}</td>
                <td colSpan={4} className="text-xs text-[var(--text-muted)]">—</td>
                {onToggleReview && <td />}
                <td>
                  <StatusBadge tone={r.status === 'missing_in_compare' ? 'warn' : 'info'}>
                    {r.status === 'missing_in_compare' ? 'Only in B' : 'Only in A'}
                  </StatusBadge>
                </td>
              </tr>
            ) : (
              r.cells.map((c, ci) => {
                const rk = `${r.key}|${c.column}|${ci}`
                return (
                  <tr key={rk} style={{ opacity: reviewed?.has(rk) ? 0.55 : 1 }}>
                    <td className="font-semibold">{ci === 0 ? r.key : ''}</td>
                    <td>
                      <span className="badge badge-purple">{c.column}</span>
                      <span className="badge ml-1">{TYPE_ICON[c.type]} {c.type}</span>
                    </td>
                    <td className={c.status === 'mismatch' ? 'text-[var(--danger)]' : ''}>{c.baseValue || '—'}</td>
                    <td className={c.status === 'mismatch' ? 'text-[var(--accent-3)]' : ''}>{c.compareValue || '—'}</td>
                    <td className="text-xs text-[var(--text-muted)]">
                      {c.baseNorm} vs {c.compareNorm}
                      {c.unitNote && <span className="mt-0.5 block text-[var(--warn)]">{c.unitNote}</span>}
                    </td>
                    {onToggleReview && (
                      <td>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--accent)]"
                          checked={reviewed?.has(rk) ?? false}
                          onChange={() => onToggleReview(rk)}
                        />
                      </td>
                    )}
                    <td>
                      {reviewed?.has(rk) ? <StatusBadge tone="ok">Reviewed</StatusBadge> : <StatusBadge tone={c.status === 'match' ? 'ok' : 'err'}>{c.status === 'match' ? 'Clean' : 'Delta'}</StatusBadge>}
                    </td>
                  </tr>
                )
              })
            ),
          )}
        </tbody>
      </table>
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
      <Field label="Add A column">
        <select className="input !w-48" value={bc} onChange={(e) => setBc(e.target.value)}>
          <option value="">Select…</option>
          {base.columns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Add B column">
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
