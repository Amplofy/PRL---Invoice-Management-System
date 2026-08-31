import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, Send, AlertTriangle, CheckCircle2, ArrowLeftRight, ArrowRight,
  Hash, Calendar, Type as TypeIcon, Wand2, Equal, SlidersHorizontal, ListOrdered, Crosshair, RotateCcw,
  X, MousePointerClick, Stethoscope, ChevronDown, Sparkles, Info, Layers,
} from 'lucide-react'
import { apiUpload, apiGet, apiPost } from '../lib/api'
import { downloadCSV } from '../lib/export'
import {
  profileFile, keyCandidates, suggestPairs, verify, narrate,
  type FileProfile, type MatchStrategy, type ValueKind,
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

type ResultTab = 'deltas' | 'unmatched' | 'clean'

interface ParsedGroup {
  name: string
  rowCount: number
  rows: Record<string, unknown>[]
  columns: string[]
}

interface Slot {
  fileName: string
  format: string
  groups: ParsedGroup[]
  selectedGroup: string
  rows: Record<string, unknown>[]
  columns: string[]
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

const TEMPERATURE_TARGETS = UNITS.filter((u) => u.kind === 'temperature')

const PAIR_ROW_LIMIT = 120

export default function DeltaAnalystPage() {
  const [fileA, setFileA] = useState<Slot | null>(null)
  const [fileB, setFileB] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [dropping, setDropping] = useState(false)

  const [chosenId, setChosenId] = useState<string | null>(null)
  const [pairs, setPairs] = useState<ColumnPair[]>([])
  const [armedSide, setArmedSide] = useState<'A' | 'B' | null>(null)
  const [unitCfg, setUnitCfg] = useState<Record<string, string>>({})
  const [numTol, setNumTol] = useState('0')
  const [dateTol, setDateTol] = useState('0')

  const [showClean, setShowClean] = useState(false)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [comparisonId, setComparisonId] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([])
  const [vendorId, setVendorId] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)

  const dropRef = useRef<HTMLDivElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  // ------------------------------------------------------------- ingestion

  const ingest = useCallback(
    async (file: File, target: 'A' | 'B') => {
      setBusy(true)
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('which', target.toLowerCase())
        const parsed = await apiUpload<{ fileName: string; format: string; groups: ParsedGroup[] }>('/api/compare/parse', form)
        const uploaded = await apiUpload<{ fileName: string }>('/api/uploads', form)
        const groups = parsed.groups.filter((g) => g.rows.length > 0)
        if (groups.length === 0) throw new Error('No readable rows found in the file')
        const best = groups.reduce((a, b) => (b.rowCount > a.rowCount ? b : a))
        const slot: Slot = {
          fileName: uploaded.fileName || parsed.fileName,
          format: parsed.format,
          groups,
          selectedGroup: best.name,
          rows: best.rows,
          columns: best.columns,
        }
        if (target === 'A') setFileA(slot)
        else setFileB(slot)
        const extra = groups.length > 1 ? ` · ${groups.length} sheets/pages` : ''
        toast.success(`File ${target} loaded`, `${best.rowCount} rows · ${best.columns.length} columns · ${parsed.format.toUpperCase()}${extra}`)
      } catch (e) {
        toast.error('Could not read file', (e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )

  const acceptFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter(Boolean)
      if (list.length === 0) return
      if (list.length >= 2 && (!fileA || !fileB)) {
        ingest(list[0]!, 'A')
        ingest(list[1]!, 'B')
        return
      }
      ingest(list[0]!, !fileA ? 'A' : 'B')
    },
    [fileA, fileB, ingest],
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropping(false)
    if (e.dataTransfer.files?.length) acceptFiles(e.dataTransfer.files)
  }

  const swap = () => {
    setFileA(fileB)
    setFileB(fileA)
  }

  const eject = (which: 'A' | 'B') => {
    if (which === 'A') setFileA(null)
    else setFileB(null)
  }

  const selectGroup = (which: 'A' | 'B', name: string) => {
    const file = which === 'A' ? fileA : fileB
    if (!file) return
    const g = file.groups.find((x) => x.name === name)
    if (!g) return
    const updated: Slot = { ...file, selectedGroup: name, rows: g.rows, columns: g.columns }
    if (which === 'A') setFileA(updated)
    else setFileB(updated)
  }

  // ------------------------------------------------------------ live engine

  const analysis = useMemo(() => {
    if (!fileA || !fileB) return null
    const bp = profileFile(fileA.rows, fileA.columns)
    const cp = profileFile(fileB.rows, fileB.columns)
    const cands = keyCandidates(fileA.rows, fileB.rows, bp, cp)
    return { bp, cp, cands }
  }, [fileA, fileB])

  const candidate = useMemo(
    () => analysis?.cands.find((c) => c.id === chosenId) ?? analysis?.cands[0] ?? null,
    [analysis, chosenId],
  )

  // switching strategy re-seeds the verified column pairs
  useEffect(() => {
    if (!fileA || !fileB || !candidate) return
    setPairs(suggestPairs(fileA.columns, fileB.columns, candidate.baseCols, candidate.compareCols))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, fileA?.fileName, fileB?.fileName])

  const cfgFor = useCallback(
    (p: ColumnPair): PairConfig => ({
      baseCol: p.baseCol,
      compareCol: p.compareCol,
      targetUnit: unitCfg[`${p.baseCol}→${p.compareCol}`] ?? 'auto',
    }),
    [unitCfg],
  )

  const outcome = useMemo(() => {
    if (!fileA || !fileB || !analysis || !candidate || pairs.length === 0) return null
    return verify(
      fileA.rows,
      fileB.rows,
      analysis.bp,
      analysis.cp,
      candidate,
      pairs.map(cfgFor),
      { numericTolerance: Number(numTol) || 0, dateToleranceDays: Number(dateTol) || 0 },
      analysis.cands,
    )
  }, [fileA, fileB, analysis, candidate, pairs, cfgFor, numTol, dateTol])

  const narration = useMemo(
    () => (outcome && candidate ? narrate(outcome, candidate, pairs) : []),
    [outcome, candidate, pairs],
  )

  // auto-persist latest analysis (debounced) so the email flow has a record
  useEffect(() => {
    if (!outcome || !candidate || !fileA || !fileB) return
    const t = setTimeout(async () => {
      try {
        const saved = await apiPost<{ comparisonId: string }>('/api/compare', {
          baseFileName: fileA.fileName,
          compareFileName: fileB.fileName,
          joinKey: `${candidate.strategy}: ${candidate.baseCols.join('+') || 'position'} ↔ ${candidate.compareCols.join('+') || 'position'}`,
          columns: pairs.map((p) => p.baseCol),
          tolerance: Number(numTol) || 0,
          mismatches: outcome.rows.flatMap((r) =>
            r.cells.filter((c) => c.status === 'mismatch').map((c) => ({
              keyValue: r.key,
              column: c.column,
              baseValue: c.baseValue,
              compareValue: c.compareValue,
            })),
          ),
          missingInCompare: outcome.rows.filter((r) => r.status === 'missing_in_compare').map((r) => ({ keyValue: r.key })),
          missingInBase: outcome.rows.filter((r) => r.status === 'missing_in_base').map((r) => ({ keyValue: r.key })),
          summary: { totalRows: outcome.summary.totalRows, matchedRows: outcome.summary.matchedRows },
        })
        setComparisonId(saved.comparisonId)
      } catch {
        /* persistence is best-effort; the workbench keeps working */
      }
    }, 900)
    return () => clearTimeout(t)
  }, [outcome, candidate, fileA, fileB, pairs, numTol])

  // ----------------------------------------------------------- interactions

  const [armedACol, setArmedACol] = useState<string | null>(null)
  const armA = (col: string) => {
    if (armedSide === 'A' && armedACol === col) {
      setArmedSide(null)
      setArmedACol(null)
      return
    }
    setArmedSide('A')
    setArmedACol(col)
  }
  const armB = (col: string) => {
    if (armedSide === 'A' && armedACol) {
      setPairs((prev) =>
        prev.some((x) => x.baseCol === armedACol && x.compareCol === col)
          ? prev
          : [...prev, { baseCol: armedACol, compareCol: col, confidence: 'manual' }],
      )
      setArmedSide(null)
      setArmedACol(null)
    }
  }

  const unitOf = (side: 'A' | 'B', col: string): UnitDef | null => {
    const file = side === 'A' ? fileA : fileB
    if (!file) return null
    const samples = file.rows.slice(0, 30).map((r) => r[col])
    return detectUnit(col, samples)?.unit ?? null
  }

  const setCfg = (p: ColumnPair, targetUnit: string) => {
    setUnitCfg((prev) => ({ ...prev, [`${p.baseCol}→${p.compareCol}`]: targetUnit }))
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

  // ------------------------------------------------------------- derived views

  const deltaRows = useMemo(() => outcome?.rows.filter((r) => r.status === 'mismatch') ?? [], [outcome])
  const unmatchedRows = useMemo(
    () => outcome?.rows.filter((r) => r.status.startsWith('missing')) ?? [],
    [outcome],
  )
  const cleanRows = useMemo(() => outcome?.rows.filter((r) => r.status === 'match') ?? [], [outcome])

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

  const bothLoaded = fileA !== null && fileB !== null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delta Analyst"
        description="Drop two files and the engine probes every alignment strategy live — watch rows pair up, flip columns like faders, and adjudicate the deltas."
        actions={
          <>
            {(fileA || fileB) && (
              <>
                {fileA && fileB && (
                  <Button variant="ghost" size="sm" onClick={swap}>
                    <ArrowLeftRight size={14} /> Swap
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setFileA(null); setFileB(null); setPairs([]); setReviewed(new Set()); setComparisonId(null) }}>
                  <RotateCcw size={14} /> Clear bench
                </Button>
              </>
            )}
            {outcome && comparisonId && (
              <Button variant="primary" size="sm" onClick={openSend}>
                <Send size={15} /> Email delta report
              </Button>
            )}
          </>
        }
      />

      <input
        ref={pickRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.pdf"
        className="hidden"
        onChange={(e) => e.target.files && acceptFiles(e.target.files)}
      />

      {(!bothLoaded || dropping) && (
        <div
          ref={dropRef}
          onDragOver={(e) => { e.preventDefault(); setDropping(true) }}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
          onClick={() => pickRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition ${dropping ? 'border-[var(--accent)] bg-[rgba(124,58,237,0.06)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg)]">
            <Upload size={22} className="text-[var(--accent)]" />
          </div>
          <div className="text-sm font-bold">
            {busy ? 'Parsing…' : bothLoaded ? 'Drop to replace' : 'Drop one or two files — CSV, XLSX, XLS, PDF'}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {bothLoaded ? 'Two files replace A and B' : fileA ? 'File A is on the bench — drop the second file to begin probing' : 'The engine starts probing the moment both files land'}
          </div>
        </div>
      )}

      {analysis && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
          {/* ------------------------------------------------ probe rail */}
          <div className="space-y-4">
            <GlassCard className="p-4">
              <div className="section-title">
                <Crosshair size={14} className="mr-1.5 inline text-[var(--accent)]" />
                Alignment probes
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">Every strategy runs in parallel — click to switch, results re-flow instantly.</div>
              <div className="mt-3 space-y-2">
                {analysis.cands.map((c) => {
                  const active = candidate?.id === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setChosenId(c.id)}
                      className="w-full rounded-xl border p-3 text-left transition"
                      style={{
                        borderColor: active ? 'var(--accent)' : 'var(--border)',
                        background: active ? 'rgba(124,58,237,0.06)' : 'var(--surface)',
                      }}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        {STRATEGY_ICON[c.strategy]}
                        <span className="truncate">{STRATEGY_LABEL[c.strategy]}</span>
                        {c.strategy === 'position' && <span className="badge badge-warn ml-auto">fallback</span>}
                      </div>
                      {c.baseCols.length > 0 && (
                        <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                          {c.baseCols.join('+')} ↔ {c.compareCols.join('+')}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg)]">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, c.matchRate * 100)}%`, background: 'var(--gradient-primary)' }} />
                        </div>
                        <span className="text-[11px] font-bold text-[var(--accent-3)]">{Math.round(c.matchRate * 100)}%</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="section-title">
                <SlidersHorizontal size={14} className="mr-1.5 inline text-[var(--accent)]" />
                Tolerances
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Numeric ±">
                  <input type="number" className="input !px-2 text-xs" value={numTol} onChange={(e) => setNumTol(e.target.value)} />
                </Field>
                <Field label="Dates ± days">
                  <input type="number" className="input !px-2 text-xs" value={dateTol} onChange={(e) => setDateTol(e.target.value)} />
                </Field>
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">Changes apply live.</div>
            </GlassCard>
          </div>

          {/* ------------------------------------------------ sandbox */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {(['A', 'B'] as const).map((side) => {
                const file = side === 'A' ? fileA : fileB
                const accent = side === 'A' ? 'var(--accent)' : 'var(--accent-2)'
                return (
                  <GlassCard key={side} className="overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
                      <span className="badge" style={{ background: accent, color: '#fff' }}>{side}</span>
                      <span className="truncate text-xs font-bold">{file?.fileName ?? 'empty slot'}</span>
                      {file && file.groups.length > 1 && (
                        <select
                          className="ml-auto max-w-32 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px]"
                          value={file.selectedGroup}
                          onChange={(e) => selectGroup(side, e.target.value)}
                        >
                          {file.groups.map((g) => (
                            <option key={g.name} value={g.name}>{file.format === 'pdf' ? 'Page' : 'Sheet'}: {g.name}</option>
                          ))}
                        </select>
                      )}
                      {file && (
                        <button className="text-[var(--danger)] hover:underline" onClick={() => eject(side)} title="Remove">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <div className="px-4 py-3">
                      <ColumnFaders
                        side={side}
                        file={file}
                        profile={side === 'A' ? analysis.bp : analysis.cp}
                        armed={armedSide === side}
                        armedCol={side === 'A' ? armedACol : null}
                        pairs={pairs}
                        unitCfg={unitCfg}
                        onArm={(col) => (side === 'A' ? armA(col) : armB(col))}
                        onRemovePair={(p) => setPairs((prev) => prev.filter((x) => x !== p))}
                        unitOf={unitOf}
                        setCfg={setCfg}
                      />
                    </div>
                  </GlassCard>
                )
              })}
            </div>

            {!bothLoaded && (
              <GlassCard className="flex items-center gap-3 p-4 text-xs text-[var(--text-muted)]">
                <MousePointerClick size={15} className="text-[var(--accent)]" />
                Click a column chip in A, then one in B, to route it through verification — like patching a mixing desk.
              </GlassCard>
            )}

            {outcome && candidate && (
              <GlassCard className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Stethoscope size={15} className="text-[var(--accent)]" />
                    Diagnosis
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-ok">{outcome.summary.matchedRows} clean</span>
                    <span className="badge badge-err">{outcome.summary.mismatchRows} deltas</span>
                    <span className="badge badge-warn">{outcome.summary.missingInCompare} only in A</span>
                    <span className="badge badge-info">{outcome.summary.missingInBase} only in B</span>
                  </div>
                </div>

                {narration.length > 0 && (
                  <div className="border-b border-[var(--border)] bg-[rgba(124,58,237,0.05)] px-5 py-3">
                    {narration.map((n, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-dim)]">
                        <Sparkles size={12} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                        {n}
                      </div>
                    ))}
                  </div>
                )}

                {outcome.heal.some((h) => h.candidates.length > 0) && (
                  <div className="border-b border-[var(--border)] bg-[rgba(245,158,11,0.07)] px-5 py-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--warn)]">
                      <Stethoscope size={13} /> Alignment looks weak — stronger probes available
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {outcome.heal.flatMap((h) => h.candidates).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setChosenId(c.id)}
                          className="rounded-lg border border-[rgba(245,158,11,0.4)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--warn)] hover:bg-[var(--surface-hover)]"
                        >
                          {STRATEGY_ICON[c.strategy]} {STRATEGY_LABEL[c.strategy]} · {c.baseCols.join('+') || 'position'} · {Math.round(c.matchRate * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {outcome.conversions.length > 0 && (
                  <div className="border-b border-[var(--border)] px-5 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {outcome.conversions.slice(0, 8).map((c) => (
                        <span key={c} className="rounded-md bg-[var(--bg)] px-2 py-0.5 text-[11px]">{c}</span>
                      ))}
                      {outcome.conversions.length > 8 && <span className="text-[11px] text-[var(--text-muted)]">+{outcome.conversions.length - 8} more</span>}
                    </div>
                  </div>
                )}

                <ResultTabs
                  outcome={outcome}
                  deltaRows={deltaRows}
                  unmatchedRows={unmatchedRows}
                  cleanRows={cleanRows}
                  reviewed={reviewed}
                  onToggleReview={(rk) =>
                    setReviewed((prev) => {
                      const next = new Set(prev)
                      if (next.has(rk)) next.delete(rk)
                      else next.add(rk)
                      return next
                    })
                  }
                  showClean={showClean}
                  onToggleClean={() => setShowClean((v) => !v)}
                  onExport={exportRows}
                />
              </GlassCard>
            )}
          </div>
        </div>
      )}

      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title="Send delta report email"
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

// ---------------------------------------------------------------- parts

function ColumnFaders({
  side,
  file,
  profile,
  armed,
  armedCol,
  pairs,
  unitCfg,
  onArm,
  onRemovePair,
  unitOf,
  setCfg,
}: {
  side: 'A' | 'B'
  file: Slot | null
  profile: FileProfile
  armed: boolean
  armedCol: string | null
  pairs: ColumnPair[]
  unitCfg: Record<string, string>
  onArm: (col: string) => void
  onRemovePair: (p: ColumnPair) => void
  unitOf: (side: 'A' | 'B', col: string) => UnitDef | null
  setCfg: (p: ColumnPair, unit: string) => void
}) {
  if (!file) {
    return <div className="py-6 text-center text-xs text-[var(--text-muted)]">Awaiting file…</div>
  }
  const pairedCols = side === 'A' ? pairs.map((p) => p.baseCol) : pairs.map((p) => p.compareCol)
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {profile.columns.map((c) => {
          const u = unitOf(side, c.name)
          const routed = pairedCols.includes(c.name)
          const isArmed = armed && armedCol === c.name
          return (
            <button
              key={c.name}
              onClick={() => onArm(c.name)}
              className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition"
              style={{
                borderColor: isArmed ? 'var(--accent)' : routed ? 'var(--accent-3)' : 'var(--border)',
                background: isArmed ? 'rgba(124,58,237,0.12)' : routed ? 'rgba(34,197,94,0.07)' : 'var(--bg)',
                color: 'var(--text-dim)',
              }}
              title={`${c.kind} · ${Math.round(c.uniqueRatio * 100)}% unique${routed ? ' · routed through verification' : ''}`}
            >
              {TYPE_ICON[c.kind]} {c.name}
              {u && <span className="ml-1 text-[var(--accent)]">· {u.label}</span>}
              {routed && <CheckCircle2 size={10} className="ml-1 inline text-[var(--accent-3)]" />}
            </button>
          )
        })}
      </div>
      {side === 'A' && pairs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {pairs.map((p) => {
            const bu = unitOf('A', p.baseCol)
            const cu = unitOf('B', p.compareCol)
            const mixed = bu && cu && bu.id !== cu.id
            const kind = profile.columns.find((c) => c.name === p.baseCol)?.kind ?? 'text'
            const targetOptions = bu?.kind === 'temperature' || cu?.kind === 'temperature' ? TEMPERATURE_TARGETS : UNITS.filter((u) => u.kind === (bu?.kind ?? cu?.kind))
            const cfgUnit = `${p.baseCol}→${p.compareCol}`
            return (
              <div key={cfgUnit} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[11px]">
                <span className="badge badge-purple">{p.baseCol}</span>
                <ArrowRight size={11} className="text-[var(--text-muted)]" />
                <span className="badge">{p.compareCol}</span>
                <span className="badge">{TYPE_ICON[kind]} {kind}</span>
                {(bu || cu) && (
                  <select
                    className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[10px]"
                    value={unitCfg[`${p.baseCol}→${p.compareCol}`] ?? 'auto'}
                    onChange={(e) => setCfg(p, e.target.value)}
                  >
                    <option value="auto">Auto ({(bu ?? cu)?.label ?? 'none'})</option>
                    {targetOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                )}
                {mixed && (
                  <span className="flex items-center gap-1 text-[var(--warn)]">
                    <Info size={10} /> converts
                  </span>
                )}
                <button className="ml-auto font-semibold text-[var(--danger)] hover:underline" onClick={() => onRemovePair(p)}>
                  unroute
                </button>
              </div>
            )
          })}
        </div>
      )}
      {side === 'A' && pairs.length === 0 && (
        <div className="mt-3 text-[11px] text-[var(--text-muted)]">No columns routed yet — click a chip here, then one in B.</div>
      )}
    </div>
  )
}

function ResultTabs({
  outcome,
  deltaRows,
  unmatchedRows,
  cleanRows,
  reviewed,
  onToggleReview,
  showClean,
  onToggleClean,
  onExport,
}: {
  outcome: VerifyOutcome
  deltaRows: VerifyOutcome['rows']
  unmatchedRows: VerifyOutcome['rows']
  cleanRows: VerifyOutcome['rows']
  reviewed: Set<string>
  onToggleReview: (key: string) => void
  showClean: boolean
  onToggleClean: () => void
  onExport: (label: string, rows: VerifyOutcome['rows']) => void
}) {
  const [tab, setTab] = useState<ResultTab>('deltas')
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-5 py-2.5">
        {([
          ['deltas', `Deltas (${outcome.summary.mismatchRows})`],
          ['unmatched', `Unmatched (${unmatchedRows.length})`],
          ['clean', `Clean (${outcome.summary.matchedRows})`],
        ] as Array<[ResultTab, string]>).map(([id, label]) => (
          <button
            key={id}
            className="rounded-full px-3 py-1 text-xs font-bold transition"
            style={
              tab === id
                ? { background: 'var(--gradient-primary)', color: '#fff' }
                : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
            }
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {tab === 'deltas' && (
            <button className="text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => onExport('delta-variances.csv', deltaRows)}>
              Export deltas
            </button>
          )}
          {tab === 'unmatched' && (
            <>
              <button className="text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => onExport('delta-only-in-a.csv', unmatchedRows.filter((r) => r.status === 'missing_in_compare'))}>
                Only-A CSV
              </button>
              <button className="text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => onExport('delta-only-in-b.csv', unmatchedRows.filter((r) => r.status === 'missing_in_base'))}>
                Only-B CSV
              </button>
            </>
          )}
          {tab === 'clean' && (
            <button className="text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => onExport('delta-clean.csv', cleanRows)}>
              Export clean
            </button>
          )}
          <button className="text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => onExport('delta-report.csv', outcome.rows)}>
            Full report
          </button>
        </div>
      </div>

      <div className="p-5">
        {tab === 'deltas' && (
          deltaRows.length === 0 ? (
            <EmptyState
              title="No deltas"
              description="Every routed column agrees within tolerance on all aligned rows."
              icon={<CheckCircle2 size={28} className="text-[var(--accent-3)]" />}
            />
          ) : (
            <div className="space-y-2.5">
              {deltaRows.slice(0, PAIR_ROW_LIMIT).map((r) => (
                <PairCard key={`d:${r.baseIdx}:${r.key}`} row={r} reviewed={reviewed} onToggleReview={onToggleReview} tone="delta" />
              ))}
              {deltaRows.length > PAIR_ROW_LIMIT && (
                <div className="text-xs text-[var(--text-muted)]">Showing first {PAIR_ROW_LIMIT} of {deltaRows.length} — export for the full list</div>
              )}
            </div>
          )
        )}

        {tab === 'unmatched' && (
          unmatchedRows.length === 0 ? (
            <EmptyState
              title="Fully matched"
              description="Every row found a counterpart on both sides."
              icon={<CheckCircle2 size={28} className="text-[var(--accent-3)]" />}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(['missing_in_compare', 'missing_in_base'] as const).map((kind) => {
                const list = unmatchedRows.filter((r) => r.status === kind)
                if (list.length === 0) return null
                const amber = kind === 'missing_in_compare'
                return (
                  <div key={kind} className={`rounded-xl border p-4 ${amber ? 'border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)]' : 'border-[rgba(96,165,250,0.3)] bg-[rgba(96,165,250,0.05)]'}`}>
                    <div className={`flex items-center justify-between text-sm font-bold ${amber ? 'text-[var(--warn)]' : 'text-[var(--accent)]'}`}>
                      <span className="flex items-center gap-2"><AlertTriangle size={15} /> Only in {amber ? 'A' : 'B'} ({list.length})</span>
                      <button className="text-xs font-semibold hover:underline" onClick={() => onExport(amber ? 'delta-only-in-a.csv' : 'delta-only-in-b.csv', list)}>CSV</button>
                    </div>
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-[var(--text-dim)]">
                      {list.slice(0, 100).map((r) => (
                        <div key={`${kind}:${r.baseIdx}:${r.compareIdx}:${r.key}`}>· {r.key}</div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {tab === 'clean' && (
          cleanRows.length === 0 ? (
            <EmptyState title="Nothing clean yet" description="No aligned rows verified equal so far." icon={<AlertTriangle size={28} className="text-[var(--warn)]" />} />
          ) : (
            <div>
              <button className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-3)]" onClick={onToggleClean}>
                <ChevronDown size={13} className={showClean ? '' : '-rotate-90'} />
                {showClean ? 'Hide' : 'Show'} {cleanRows.length} clean rows
              </button>
              {showClean && (
                <div className="space-y-2.5">
                  {cleanRows.slice(0, PAIR_ROW_LIMIT).map((r) => (
                    <PairCard key={`c:${r.baseIdx}:${r.key}`} row={r} tone="clean" />
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function PairCard({
  row,
  reviewed,
  onToggleReview,
  tone,
}: {
  row: VerifyOutcome['rows'][number]
  reviewed?: Set<string>
  onToggleReview?: (key: string) => void
  tone: 'delta' | 'clean'
}) {
  const borderColor = tone === 'delta' ? 'var(--border)' : 'rgba(34,197,94,0.25)'
  return (
    <div className="rounded-xl border bg-[var(--surface)] p-3.5" style={{ borderColor }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{row.key}</span>
        {reviewed?.has(`${row.key}|${row.cells[0]?.column ?? ''}`) ? (
          <StatusBadge tone="ok">Reviewed</StatusBadge>
        ) : (
          <StatusBadge tone={tone === 'delta' ? 'err' : 'ok'}>{tone === 'delta' ? 'Delta' : 'Clean'}</StatusBadge>
        )}
        {onToggleReview && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={reviewed?.has(`${row.key}|${row.cells[0]?.column ?? ''}`) ?? false}
              onChange={() => onToggleReview(`${row.key}|${row.cells[0]?.column ?? ''}`)}
            />
            reviewed
          </label>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">A</div>
          {row.cells.map((c) => (
            <div key={c.column} className="mt-1 text-xs">
              <span className="font-semibold">{c.column}:</span>{' '}
              <span className={c.status === 'mismatch' ? 'text-[var(--danger)]' : ''}>{c.baseValue || '—'}</span>
              {c.baseNorm && <span className="ml-1 text-[10px] text-[var(--text-muted)]">({c.baseNorm})</span>}
            </div>
          ))}
          {row.cells.length === 0 && <div className="mt-1 text-xs text-[var(--text-muted)]">no routed columns</div>}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent-2)]">B</div>
          {row.cells.map((c) => (
            <div key={c.column} className="mt-1 text-xs">
              <span className="font-semibold">{c.column}:</span>{' '}
              <span className={c.status === 'mismatch' ? 'text-[var(--accent-3)]' : ''}>{c.compareValue || '—'}</span>
              {c.compareNorm && <span className="ml-1 text-[10px] text-[var(--text-muted)]">({c.compareNorm})</span>}
              {c.unitNote && <span className="ml-1 text-[10px] text-[var(--warn)]">{c.unitNote}</span>}
            </div>
          ))}
          {row.cells.length === 0 && <div className="mt-1 text-xs text-[var(--text-muted)]">no routed columns</div>}
        </div>
      </div>
    </div>
  )
}
