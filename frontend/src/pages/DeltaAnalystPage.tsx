import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, Send, CheckCircle2, ArrowLeftRight, ArrowRight,
  Hash, Calendar, Type as TypeIcon, Equal, SlidersHorizontal, ListOrdered,
  RotateCcw, X, ChevronDown, Info, Layers, FileSpreadsheet, Plus, Wand2,
  Search, Bookmark, BookmarkPlus, Trash2, Columns3,
} from 'lucide-react'
import { apiUpload, apiGet, apiPost } from '../lib/api'
import { downloadCSV } from '../lib/export'
import {
  profileFile, keyCandidates, suggestPairs, verify, narrate, customCandidate,
  type FileProfile, type MatchStrategy, type ValueKind, type KeyCandidate,
  type ColumnPair, type VerifyOutcome, type PairConfig,
} from '../lib/deltaEngine'
import { detectUnit, UNITS, type UnitDef } from '../lib/units'
import { isDemoMode } from '../lib/supabase'
import { parseLocalGroups } from '../lib/importParser'
import {
  loadDeltaMethods, saveDeltaMethod, deleteDeltaMethod, methodGaps,
  type SavedDeltaMethod,
} from '../lib/deltaMethods'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'

type ViewFilter = 'all' | 'deltas' | 'onlyA' | 'onlyB' | 'clean'

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
  exact: 'Identical key',
  composite: 'Combined columns',
  fuzzy: 'Similar text',
  numeric: 'Close numbers',
  position: 'Same row order',
}

const STRATEGY_HELP: Record<MatchStrategy, string> = {
  exact: 'A row matches when the selected columns are the same on both files.',
  composite: 'A row matches when every selected column pair is the same.',
  fuzzy: 'A row matches when the text is close (typos and extra spaces allowed).',
  numeric: 'A row matches when the numbers are within 1%.',
  position: 'Rows are paired by order: row 1 with row 1, and so on.',
}

const TEMPERATURE_TARGETS = UNITS.filter((u) => u.kind === 'temperature')
const ROW_CAP = 250

function acceptList(): string {
  return isDemoMode() ? '.csv,.xlsx,.xls' : '.csv,.xlsx,.xls,.pdf'
}

function formatHint(): string {
  return isDemoMode() ? 'CSV, XLSX or XLS' : 'CSV, XLSX, XLS or PDF'
}

function kindOf(profile: FileProfile | null, col: string): ValueKind {
  return profile?.columns.find((c) => c.name === col)?.kind ?? 'text'
}

function statusLabel(status: VerifyOutcome['rows'][number]['status']): string {
  if (status === 'mismatch') return 'Different'
  if (status === 'missing_in_compare') return 'Only in A'
  if (status === 'missing_in_base') return 'Only in B'
  return 'Match'
}

function statusTone(status: VerifyOutcome['rows'][number]['status']): 'err' | 'warn' | 'info' | 'ok' {
  if (status === 'mismatch') return 'err'
  if (status === 'missing_in_compare') return 'warn'
  if (status === 'missing_in_base') return 'info'
  return 'ok'
}

export default function DeltaAnalystPage() {
  const [fileA, setFileA] = useState<Slot | null>(null)
  const [fileB, setFileB] = useState<Slot | null>(null)
  const [busy, setBusy] = useState<'A' | 'B' | null>(null)

  const [chosenId, setChosenId] = useState<string | null>(null)
  const [customCand, setCustomCand] = useState<KeyCandidate | null>(null)
  const [pairs, setPairs] = useState<ColumnPair[]>([])
  const [unitCfg, setUnitCfg] = useState<Record<string, string>>({})
  const [numTol, setNumTol] = useState('0')
  const [dateTol, setDateTol] = useState('0')
  const [addA, setAddA] = useState('')
  const [addB, setAddB] = useState('')
  const [showMethods, setShowMethods] = useState(false)
  const [showColumns, setShowColumns] = useState(false)

  const [view, setView] = useState<ViewFilter>('deltas')
  const [query, setQuery] = useState('')
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [comparisonId, setComparisonId] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([])
  const [vendorId, setVendorId] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)

  const [saved, setSaved] = useState<SavedDeltaMethod[]>(() => loadDeltaMethods())
  const [customOpen, setCustomOpen] = useState(false)
  const [methodName, setMethodName] = useState('')
  const [customStrategy, setCustomStrategy] = useState<MatchStrategy>('exact')
  const [customBase, setCustomBase] = useState<string[]>([''])
  const [customCompare, setCustomCompare] = useState<string[]>([''])

  const skipSuggest = useRef(false)
  const toast = useToast()

  const ingest = useCallback(
    async (file: File, target: 'A' | 'B') => {
      setBusy(target)
      try {
        let parsed: { fileName: string; format: string; groups: ParsedGroup[] }
        let storedName: string
        if (isDemoMode()) {
          parsed = await parseLocalGroups(file)
          storedName = parsed.fileName
        } else {
          const form = new FormData()
          form.append('file', file)
          form.append('which', target.toLowerCase())
          parsed = await apiUpload<{ fileName: string; format: string; groups: ParsedGroup[] }>('/api/compare/parse', form)
          const uploaded = await apiUpload<{ fileName: string }>('/api/uploads', form)
          storedName = uploaded.fileName || parsed.fileName
        }
        const groups = parsed.groups.filter((g) => g.rows.length > 0)
        if (groups.length === 0) throw new Error('No readable rows found in the file')
        const best = groups.reduce((a, b) => (b.rowCount > a.rowCount ? b : a))
        const slot: Slot = {
          fileName: storedName,
          format: parsed.format,
          groups,
          selectedGroup: best.name,
          rows: best.rows,
          columns: best.columns,
        }
        if (target === 'A') setFileA(slot)
        else setFileB(slot)
        toast.success(`File ${target} loaded`, `${best.rowCount} rows · ${best.columns.length} columns`)
      } catch (e) {
        toast.error(`Could not read file ${target}`, (e as Error).message)
      } finally {
        setBusy(null)
      }
    },
    [toast],
  )

  const takeFiles = (side: 'A' | 'B', files: FileList | File[]) => {
    const list = Array.from(files).filter(Boolean)
    if (list.length === 0) return
    if (list.length >= 2) {
      void ingest(list[0]!, 'A')
      void ingest(list[1]!, 'B')
      return
    }
    void ingest(list[0]!, side)
  }

  const clearBench = () => {
    setFileA(null)
    setFileB(null)
    setPairs([])
    setReviewed(new Set())
    setComparisonId(null)
    setChosenId(null)
    setCustomCand(null)
    setAddA('')
    setAddB('')
    setShowMethods(false)
    setQuery('')
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

  const analysis = useMemo(() => {
    if (!fileA || !fileB) return null
    const bp = profileFile(fileA.rows, fileA.columns)
    const cp = profileFile(fileB.rows, fileB.columns)
    const cands = keyCandidates(fileA.rows, fileB.rows, bp, cp)
    if (customCand) {
      const live = customCandidate(fileA.rows, fileB.rows, customCand.strategy, customCand.baseCols, customCand.compareCols)
      return { bp, cp, cands: [live, ...cands.filter((c) => c.id !== live.id)] }
    }
    return { bp, cp, cands }
  }, [fileA, fileB, customCand])

  const candidate = useMemo(
    () => analysis?.cands.find((c) => c.id === chosenId) ?? analysis?.cands[0] ?? null,
    [analysis, chosenId],
  )

  useEffect(() => {
    if (!fileA || !fileB || !candidate) return
    if (skipSuggest.current) {
      skipSuggest.current = false
      return
    }
    setPairs(suggestPairs(fileA.columns, fileB.columns, candidate.baseCols, candidate.compareCols))
    setAddA('')
    setAddB('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, fileA?.fileName, fileB?.fileName, fileA?.selectedGroup, fileB?.selectedGroup])

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

  useEffect(() => {
    if (isDemoMode()) return
    if (!outcome || !candidate || !fileA || !fileB) return
    const t = setTimeout(async () => {
      try {
        const savedCmp = await apiPost<{ comparisonId: string }>('/api/compare', {
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
        setComparisonId(savedCmp.comparisonId)
      } catch {
        /* persistence is best-effort */
      }
    }, 900)
    return () => clearTimeout(t)
  }, [outcome, candidate, fileA, fileB, pairs, numTol])

  const unitOf = (side: 'A' | 'B', col: string): UnitDef | null => {
    const file = side === 'A' ? fileA : fileB
    if (!file) return null
    const samples = file.rows.slice(0, 30).map((r) => r[col])
    return detectUnit(col, samples)?.unit ?? null
  }

  const setCfg = (p: ColumnPair, targetUnit: string) => {
    setUnitCfg((prev) => ({ ...prev, [`${p.baseCol}→${p.compareCol}`]: targetUnit }))
  }

  const pickMethod = (c: KeyCandidate, fromCustom = false) => {
    if (!fromCustom) setCustomCand(null)
    setChosenId(c.id)
    setShowMethods(false)
  }

  const openCustom = (seed?: KeyCandidate) => {
    const src = seed ?? candidate
    setMethodName('')
    setCustomStrategy(src?.strategy ?? 'exact')
    setCustomBase(src?.baseCols.length ? [...src.baseCols] : [''])
    setCustomCompare(src?.compareCols.length ? [...src.compareCols] : [''])
    setCustomOpen(true)
  }

  const liveCustom = useMemo(() => {
    if (!fileA || !fileB || !customOpen) return null
    const b = customBase.map((s) => s.trim()).filter(Boolean)
    const c = customCompare.map((s) => s.trim()).filter(Boolean)
    if (customStrategy !== 'position' && (b.length === 0 || c.length === 0)) return null
    if ((customStrategy === 'fuzzy' || customStrategy === 'numeric' || customStrategy === 'exact') && (b.length !== 1 || c.length !== 1)) {
      if (b.length === 0 || c.length === 0) return null
    }
    return customCandidate(fileA.rows, fileB.rows, customStrategy, b, c)
  }, [fileA, fileB, customOpen, customStrategy, customBase, customCompare])

  const applyCustom = (persist: boolean) => {
    if (!fileA || !fileB) return
    const b = customBase.map((s) => s.trim()).filter(Boolean)
    const c = customCompare.map((s) => s.trim()).filter(Boolean)
    if (customStrategy !== 'position' && (b.length === 0 || c.length === 0)) {
      toast.error('Pick a key column on both files')
      return
    }
    if (persist && !methodName.trim()) {
      toast.error('Name this method to save it')
      return
    }
    const live = customCandidate(fileA.rows, fileB.rows, customStrategy, b, c)
    skipSuggest.current = persist && pairs.length > 0
    setCustomCand(live)
    setChosenId(live.id)
    setCustomOpen(false)
    setShowMethods(false)
    if (persist) {
      setSaved(saveDeltaMethod({
        name: methodName.trim(),
        strategy: customStrategy,
        baseCols: b,
        compareCols: c,
        pairs: pairs.map((p) => ({
          baseCol: p.baseCol,
          compareCol: p.compareCol,
          targetUnit: unitCfg[`${p.baseCol}→${p.compareCol}`] ?? 'auto',
        })),
        numericTolerance: numTol,
        dateToleranceDays: dateTol,
      }))
      toast.success('Method saved', 'It will be available the next time you open Delta Analyst')
    } else {
      toast.success('Custom method applied')
    }
  }

  const applySaved = (m: SavedDeltaMethod) => {
    if (!fileA || !fileB) return
    const gaps = methodGaps(m, fileA.columns, fileB.columns)
    if (gaps.length > 0) {
      toast.error('This method does not fit these files', `Missing ${gaps.join(', ')}`)
      return
    }
    const live = customCandidate(fileA.rows, fileB.rows, m.strategy, m.baseCols, m.compareCols)
    skipSuggest.current = true
    setCustomCand(live)
    setChosenId(live.id)
    const restored = m.pairs
      .filter((p) => fileA.columns.includes(p.baseCol) && fileB.columns.includes(p.compareCol))
      .map((p) => ({ baseCol: p.baseCol, compareCol: p.compareCol, confidence: 'manual' as const }))
    if (restored.length > 0) setPairs(restored)
    const units: Record<string, string> = {}
    for (const p of m.pairs) units[`${p.baseCol}→${p.compareCol}`] = p.targetUnit
    setUnitCfg(units)
    setNumTol(m.numericTolerance)
    setDateTol(m.dateToleranceDays)
    setShowMethods(false)
    toast.success(`Using “${m.name}”`)
  }

  const saveCurrent = () => {
    if (!candidate) return
    const name = window.prompt('Name this matching method')
    if (!name?.trim()) return
    setSaved(saveDeltaMethod({
      name: name.trim(),
      strategy: candidate.strategy,
      baseCols: candidate.baseCols,
      compareCols: candidate.compareCols,
      pairs: pairs.map((p) => ({
        baseCol: p.baseCol,
        compareCol: p.compareCol,
        targetUnit: unitCfg[`${p.baseCol}→${p.compareCol}`] ?? 'auto',
      })),
      numericTolerance: numTol,
      dateToleranceDays: dateTol,
    }))
    toast.success('Method saved')
  }

  const addPair = () => {
    if (!addA || !addB) return
    setPairs((prev) => {
      if (prev.some((p) => p.baseCol === addA && p.compareCol === addB)) return prev
      return [...prev, { baseCol: addA, compareCol: addB, confidence: 'manual' }]
    })
    setAddA('')
    setAddB('')
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
      toast.success('Report emailed')
      setSendOpen(false)
    } catch (e) {
      toast.error('Email failed', (e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const visibleRows = useMemo(() => {
    if (!outcome) return []
    let rows = outcome.rows
    if (view === 'deltas') rows = rows.filter((r) => r.status === 'mismatch')
    else if (view === 'onlyA') rows = rows.filter((r) => r.status === 'missing_in_compare')
    else if (view === 'onlyB') rows = rows.filter((r) => r.status === 'missing_in_base')
    else if (view === 'clean') rows = rows.filter((r) => r.status === 'match')
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) => {
        if (r.key.toLowerCase().includes(q)) return true
        return r.cells.some((c) =>
          `${c.baseValue} ${c.compareValue} ${c.column}`.toLowerCase().includes(q),
        )
      })
    }
    return rows
  }, [outcome, view, query])

  const exportVisible = () => {
    if (!outcome) return
    downloadCSV('delta-report.csv', visibleRows.flatMap((r) =>
      r.cells.length === 0
        ? [{ key: r.key, result: statusLabel(r.status), column: '', fileA: '', fileB: '' }]
        : r.cells.map((c) => ({
            key: r.key,
            result: statusLabel(r.status),
            column: c.column,
            fileA: c.baseValue,
            fileB: c.compareValue,
          })),
    ))
  }

  const bothLoaded = fileA !== null && fileB !== null
  const needsCols = customStrategy === 'composite' || customStrategy === 'exact' || customStrategy === 'fuzzy' || customStrategy === 'numeric'
  const multiKey = customStrategy === 'composite'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Delta Analyst"
        description="Load two files, then read the numbers. Click a count to filter the table."
        actions={
          <>
            {bothLoaded && (
              <Button variant="ghost" size="sm" onClick={() => { setFileA(fileB); setFileB(fileA) }}>
                <ArrowLeftRight size={14} /> Swap A/B
              </Button>
            )}
            {(fileA || fileB) && (
              <Button variant="ghost" size="sm" onClick={clearBench}>
                <RotateCcw size={14} /> Start over
              </Button>
            )}
            {outcome && comparisonId && !isDemoMode() && (
              <Button variant="primary" size="sm" onClick={openSend}>
                <Send size={15} /> Email report
              </Button>
            )}
          </>
        }
      />

      {isDemoMode() && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.08)] px-4 py-2.5 text-xs font-semibold text-[var(--warn)]">
          <Info size={14} aria-hidden /> Demo session: files stay in this browser ({formatHint()}). Saved methods stay on this device.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FileSlot side="A" file={fileA} busy={busy === 'A'} onFiles={(f) => takeFiles('A', f)} onEject={() => setFileA(null)} onSelectGroup={(n) => selectGroup('A', n)} />
        <FileSlot side="B" file={fileB} busy={busy === 'B'} onFiles={(f) => takeFiles('B', f)} onEject={() => setFileB(null)} onSelectGroup={(n) => selectGroup('B', n)} />
      </div>

      {bothLoaded && analysis && candidate && (
        <>
          {outcome && (
            <GlassCard className="overflow-hidden">
              <div role="group" aria-label="Filter results by status" className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
                <StatFilter label="Differences" value={outcome.summary.mismatchRows} tone="err" active={view === 'deltas'} onClick={() => setView('deltas')} />
                <StatFilter label="Only in A" value={outcome.summary.missingInCompare} tone="warn" active={view === 'onlyA'} onClick={() => setView('onlyA')} />
                <StatFilter label="Only in B" value={outcome.summary.missingInBase} tone="info" active={view === 'onlyB'} onClick={() => setView('onlyB')} />
                <StatFilter label="Matching" value={outcome.summary.matchedRows} tone="ok" active={view === 'clean'} onClick={() => setView('clean')} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
                <p className="text-sm text-[var(--text-dim)]" role="status">{narration[0]}</p>
                <button type="button" className="text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => setView('all')} aria-pressed={view === 'all'}>
                  Show all {outcome.summary.totalRows} rows
                </button>
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Matching method</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {STRATEGY_ICON[candidate.strategy]}
                  <span>
                    {STRATEGY_LABEL[candidate.strategy]}
                    {candidate.baseCols.length > 0 ? ` · ${candidate.baseCols.join(' + ')}` : ''}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-[var(--accent-3)]">{Math.round(candidate.matchRate * 100)}% aligned</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowMethods((v) => !v)} aria-expanded={showMethods}>
                <ChevronDown size={14} className={showMethods ? '' : '-rotate-90'} /> Change
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openCustom(candidate)}>
                <Plus size={14} /> Custom
              </Button>
              <Button variant="ghost" size="sm" onClick={saveCurrent}>
                <BookmarkPlus size={14} /> Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowColumns((v) => !v)} aria-expanded={showColumns}>
                <Columns3 size={14} /> Columns ({pairs.length})
              </Button>
            </div>

            {showMethods && (
              <div className="mt-4 space-y-4">
                {saved.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Saved methods</div>
                    <ul className="space-y-1.5">
                      {saved.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                          <Bookmark size={13} className="text-[var(--accent)]" aria-hidden />
                          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline" onClick={() => applySaved(m)}>
                            {m.name}
                            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{STRATEGY_LABEL[m.strategy]} · {m.baseCols.join(' + ') || 'row order'}</span>
                          </button>
                          <button type="button" className="rounded-md p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]" aria-label={`Delete ${m.name}`} onClick={() => setSaved(deleteDeltaMethod(m.id))}>
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Suggested for these files</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {analysis.cands.filter((c) => !c.id.startsWith('custom:')).map((c) => (
                      <MethodCard key={c.id} cand={c} active={candidate.id === c.id} onPick={() => pickMethod(c)} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showColumns && fileA && fileB && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <div className="mb-3 grid max-w-md grid-cols-2 gap-3">
                  <Field label="Numeric ±">
                    <input type="number" className="input" value={numTol} onChange={(e) => setNumTol(e.target.value)} />
                  </Field>
                  <Field label="Date ± days">
                    <input type="number" className="input" value={dateTol} onChange={(e) => setDateTol(e.target.value)} />
                  </Field>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                        <th scope="col" className="pb-2 pr-3">File A</th>
                        <th scope="col" className="w-8 pb-2" />
                        <th scope="col" className="pb-2 pr-3">File B</th>
                        <th scope="col" className="pb-2 pr-3">Type</th>
                        <th scope="col" className="pb-2 pr-3">Unit</th>
                        <th scope="col" className="pb-2"><span className="sr-only">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.map((p) => (
                        <PairRow
                          key={`${p.baseCol}→${p.compareCol}`}
                          pair={p}
                          kind={kindOf(analysis.bp, p.baseCol)}
                          unitA={unitOf('A', p.baseCol)}
                          unitB={unitOf('B', p.compareCol)}
                          unitValue={unitCfg[`${p.baseCol}→${p.compareCol}`] ?? 'auto'}
                          onUnit={(v) => setCfg(p, v)}
                          onRemove={() => setPairs((prev) => prev.filter((x) => x !== p))}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="min-w-36 flex-1 text-xs font-semibold text-[var(--text-muted)]">
                    Column in A
                    <select className="input mt-1" value={addA} onChange={(e) => setAddA(e.target.value)}>
                      <option value="">Select…</option>
                      {fileA.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <ArrowRight size={14} className="mb-3 text-[var(--text-muted)]" aria-hidden />
                  <label className="min-w-36 flex-1 text-xs font-semibold text-[var(--text-muted)]">
                    Column in B
                    <select className="input mt-1" value={addB} onChange={(e) => setAddB(e.target.value)}>
                      <option value="">Select…</option>
                      {fileB.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <Button variant="ghost" size="sm" onClick={addPair} disabled={!addA || !addB}>
                    <Plus size={14} /> Add
                  </Button>
                </div>
              </div>
            )}
          </GlassCard>

          {outcome && (
            <GlassCard className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
                <label className="relative min-w-48 flex-1">
                  <span className="sr-only">Search compared rows</span>
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
                  <input
                    className="input pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search key or value…"
                  />
                </label>
                <div className="text-xs text-[var(--text-muted)] tabular-nums">
                  {visibleRows.length} row{visibleRows.length === 1 ? '' : 's'}
                </div>
                <Button variant="ghost" size="sm" onClick={exportVisible}>Export CSV</Button>
              </div>
              <ResultTable
                rows={visibleRows}
                pairs={pairs}
                reviewed={reviewed}
                onToggleReview={(k) => {
                  setReviewed((prev) => {
                    const next = new Set(prev)
                    if (next.has(k)) next.delete(k)
                    else next.add(k)
                    return next
                  })
                }}
              />
            </GlassCard>
          )}

          {bothLoaded && !outcome && (
            <GlassCard className="p-6">
              <EmptyState
                title="Add columns to compare"
                description="Open Columns and add at least one pair, then the table will fill in."
                icon={<Columns3 size={28} />}
                action={<Button size="sm" onClick={() => setShowColumns(true)}>Open columns</Button>}
              />
            </GlassCard>
          )}
        </>
      )}

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom matching method"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>Cancel</Button>
            <Button variant="ghost" onClick={() => applyCustom(false)}>Use once</Button>
            <Button variant="primary" onClick={() => applyCustom(true)}>
              <BookmarkPlus size={14} /> Save and use
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required hint="Used when you save this method for later">
            <input className="input" value={methodName} onChange={(e) => setMethodName(e.target.value)} placeholder="e.g. Dip vs lab ticket" />
          </Field>
          <fieldset>
            <legend className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">How rows should match</legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {(Object.keys(STRATEGY_LABEL) as MatchStrategy[]).map((s) => (
                <label key={s} className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm" style={{ borderColor: customStrategy === s ? 'var(--accent)' : 'var(--border)', background: customStrategy === s ? 'rgba(124,58,237,0.06)' : 'var(--bg)' }}>
                  <input type="radio" className="mt-1" name="delta-strategy" checked={customStrategy === s} onChange={() => setCustomStrategy(s)} />
                  <span>
                    <span className="font-semibold">{STRATEGY_LABEL[s]}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{STRATEGY_HELP[s]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {needsCols && fileA && fileB && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <KeyPicker label="Key on file A" columns={fileA.columns} values={customBase} multi={multiKey} onChange={setCustomBase} />
              <KeyPicker label="Key on file B" columns={fileB.columns} values={customCompare} multi={multiKey} onChange={setCustomCompare} />
            </div>
          )}
          {liveCustom && (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" role="status">
              {Math.round(liveCustom.matchRate * 100)}% of rows in A find a pair with this method.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title="Email difference report"
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
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Additional notes">
            <textarea className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for the recipient…" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function StatFilter({
  label, value, tone, active, onClick,
}: {
  label: string
  value: number
  tone: 'ok' | 'err' | 'warn' | 'info'
  active: boolean
  onClick: () => void
}) {
  const color = tone === 'ok' ? 'var(--accent-3)' : tone === 'err' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="bg-[var(--surface)] px-4 py-3.5 text-left transition hover:bg-[var(--surface-hover)]"
      style={{ boxShadow: active ? `inset 0 -3px 0 ${color}` : undefined }}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color }}>{value}</div>
    </button>
  )
}

function MethodCard({ cand, active, onPick }: { cand: KeyCandidate; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className="rounded-xl border p-3 text-left transition"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'rgba(124,58,237,0.06)' : 'var(--bg)',
      }}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold">
        {STRATEGY_ICON[cand.strategy]}
        <span className="truncate">{STRATEGY_LABEL[cand.strategy]}</span>
      </div>
      {cand.baseCols.length > 0 && (
        <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{cand.baseCols.join(' + ')} → {cand.compareCols.join(' + ')}</div>
      )}
      <div className="mt-2 text-[11px] font-bold tabular-nums">{Math.round(cand.matchRate * 100)}% aligned</div>
    </button>
  )
}

function FileSlot({
  side, file, busy, onFiles, onEject, onSelectGroup,
}: {
  side: 'A' | 'B'
  file: Slot | null
  busy: boolean
  onFiles: (files: FileList) => void
  onEject: () => void
  onSelectGroup: (name: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const accent = side === 'A' ? 'var(--accent)' : 'var(--accent-2)'
  const inputId = `delta-file-${side}`

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
      }}
    >
      <GlassCard className={`overflow-hidden transition ${over ? 'ring-2 ring-[var(--accent)]' : ''}`}>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={acceptList()}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-extrabold text-white" style={{ background: accent }}>{side}</span>
          <span className="truncate text-sm font-bold">{file?.fileName ?? `File ${side}`}</span>
          {file && (
            <button type="button" className="ml-auto rounded-md p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]" onClick={onEject} aria-label={`Remove file ${side}`}>
              <X size={14} />
            </button>
          )}
        </div>
        {file ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-[var(--text-muted)]">
            <FileSpreadsheet size={13} aria-hidden />
            <span>{file.rows.length} rows · {file.columns.length} columns</span>
            {file.groups.length > 1 && (
              <label className="ml-auto flex items-center gap-1.5 font-semibold">
                {file.format === 'pdf' ? 'Page' : 'Sheet'}
                <select className="input !py-1 !text-xs" value={file.selectedGroup} onChange={(e) => onSelectGroup(e.target.value)}>
                  {file.groups.map((g) => <option key={g.name} value={g.name}>{g.name} ({g.rowCount})</option>)}
                </select>
              </label>
            )}
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? 'Reading…' : 'Replace'}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="flex w-full flex-col items-center gap-1.5 px-4 py-7 text-center"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={`Upload file ${side}, ${formatHint()}`}
          >
            <Upload size={18} className="text-[var(--accent)]" aria-hidden />
            <span className="text-sm font-bold">{busy ? 'Reading…' : `Drop file ${side}`}</span>
            <span className="text-xs text-[var(--text-muted)]">{formatHint()}</span>
          </button>
        )}
      </GlassCard>
    </div>
  )
}

function KeyPicker({
  label, columns, values, multi, onChange,
}: {
  label: string
  columns: string[]
  values: string[]
  multi: boolean
  onChange: (next: string[]) => void
}) {
  const setAt = (i: number, v: string) => {
    const next = [...values]
    next[i] = v
    onChange(next)
  }
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-[var(--text-dim)]">{label}</div>
      <div className="space-y-1.5">
        {(multi ? values : values.slice(0, 1)).map((v, i) => (
          <select key={i} className="input" value={v} onChange={(e) => setAt(i, e.target.value)}>
            <option value="">Select…</option>
            {columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ))}
      </div>
      {multi && (
        <button type="button" className="mt-1.5 text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => onChange([...values, ''])}>
          Add another column
        </button>
      )}
    </div>
  )
}

function PairRow({
  pair, kind, unitA, unitB, unitValue, onUnit, onRemove,
}: {
  pair: ColumnPair
  kind: ValueKind
  unitA: UnitDef | null
  unitB: UnitDef | null
  unitValue: string
  onUnit: (v: string) => void
  onRemove: () => void
}) {
  const targetOptions =
    unitA?.kind === 'temperature' || unitB?.kind === 'temperature'
      ? TEMPERATURE_TARGETS
      : UNITS.filter((u) => u.kind === (unitA?.kind ?? unitB?.kind))
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-2 pr-3 font-semibold">{pair.baseCol}</td>
      <td className="py-2 text-[var(--text-muted)]"><ArrowRight size={12} aria-hidden /></td>
      <td className="py-2 pr-3 font-semibold">{pair.compareCol}</td>
      <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1">{TYPE_ICON[kind]} {kind}</span>
      </td>
      <td className="py-2 pr-3">
        {(unitA || unitB) ? (
          <select className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs" value={unitValue} onChange={(e) => onUnit(e.target.value)}>
            <option value="auto">Auto ({(unitA ?? unitB)?.label ?? 'none'})</option>
            {targetOptions.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        )}
      </td>
      <td className="py-2 text-right">
        <button type="button" className="rounded-md p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]" onClick={onRemove} aria-label={`Remove ${pair.baseCol}`}>
          <X size={14} />
        </button>
      </td>
    </tr>
  )
}

function ResultTable({
  rows, pairs, reviewed, onToggleReview,
}: {
  rows: VerifyOutcome['rows']
  pairs: ColumnPair[]
  reviewed: Set<string>
  onToggleReview: (key: string) => void
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing in this view"
        description="Try another count at the top, or clear the search."
        icon={<CheckCircle2 size={28} className="text-[var(--accent-3)]" />}
      />
    )
  }
  const shown = rows.slice(0, ROW_CAP)
  return (
    <div className="table-container" tabIndex={0} aria-label="Comparison results">
      <table className="data-table">
        <caption className="sr-only">
          {shown.length} compared rows. Different values are marked in the Result column and in each pair of A/B cells.
        </caption>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Result</th>
            {pairs.map((p) => (
              <th key={`${p.baseCol}:${p.compareCol}`} scope="col">{p.baseCol === p.compareCol ? p.baseCol : `${p.baseCol} / ${p.compareCol}`}</th>
            ))}
            <th scope="col">Reviewed</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const rk = `${r.key}|${r.cells[0]?.column ?? ''}`
            return (
              <tr key={`${r.baseIdx}:${r.compareIdx}:${r.key}`}>
                <td className="font-semibold">{r.key}</td>
                <td>
                  <StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge>
                </td>
                {pairs.map((p) => {
                  const cell = r.cells.find((c) => c.column === p.baseCol || c.column === `${p.baseCol} ↔ ${p.compareCol}` || c.column === p.compareCol)
                  const a = cell?.baseValue || (r.status === 'missing_in_base' ? '' : '—')
                  const b = cell?.compareValue || (r.status === 'missing_in_compare' ? '' : '—')
                  const diff = cell?.status === 'mismatch'
                  return (
                    <td key={`${p.baseCol}:${p.compareCol}`} className="cell-wrap">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span>
                          <span className="mr-1 text-[10px] font-bold text-[var(--accent)]">A</span>
                          <span className={diff ? 'font-semibold text-[var(--danger)]' : ''}>{a || '—'}</span>
                          {diff && <span className="sr-only"> differs</span>}
                        </span>
                        <span>
                          <span className="mr-1 text-[10px] font-bold text-[var(--accent-2)]">B</span>
                          <span className={diff ? 'font-semibold text-[var(--danger)]' : ''}>{b || '—'}</span>
                        </span>
                      </div>
                    </td>
                  )
                })}
                <td>
                  {r.status === 'mismatch' ? (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={reviewed.has(rk)} onChange={() => onToggleReview(rk)} />
                      <span className="sr-only">Mark {r.key} reviewed</span>
                      {reviewed.has(rk) ? 'Yes' : ''}
                    </label>
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > ROW_CAP && (
        <div className="px-4 py-2 text-xs text-[var(--text-muted)]">Showing first {ROW_CAP} of {rows.length}. Search or export to see the rest.</div>
      )}
    </div>
  )
}
