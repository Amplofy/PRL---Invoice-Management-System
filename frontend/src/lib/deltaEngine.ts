/**
 * Universal comparison engine: profiles any tabular dataset, discovers how
 * rows correspond across two files (exact / composite / fuzzy / numeric /
 * positional strategies), verifies paired columns type-aware (numbers with
 * unit conversion, dates across formats, text) and self-diagnoses poor
 * alignments with concrete healing suggestions.
 */
import { detectUnit, normalizeToUnit, unitById, type UnitDef, type UnitInfo } from './units'

export type ValueKind = 'number' | 'date' | 'text'
export type MatchStrategy = 'exact' | 'composite' | 'fuzzy' | 'numeric' | 'position'

export interface ColumnMeta {
  name: string
  kind: ValueKind
  unit: UnitDef | null
  uniqueRatio: number
  fillRate: number
  idLike: boolean
}

export interface FileProfile {
  rowCount: number
  columns: ColumnMeta[]
}

export interface KeyCandidate {
  id: string
  strategy: MatchStrategy
  baseCols: string[]
  compareCols: string[]
  /** Estimated share of base rows that would find a counterpart. */
  matchRate: number
  score: number
}

export interface RowMatch {
  baseIdx: number
  compareIdx: number | null
  key: string
  score: number
}

export interface PairConfig {
  baseCol: string
  compareCol: string
  /** 'auto' detects units per column; a unit id forces a target. */
  targetUnit: 'auto' | string
}

export interface VerifyOptions {
  numericTolerance: number
  dateToleranceDays: number
}

export interface CellResult {
  column: string
  type: ValueKind
  baseValue: string
  compareValue: string
  baseNorm: string | null
  compareNorm: string | null
  unitNote: string | null
  status: 'match' | 'mismatch'
}

export interface RowVerify {
  key: string
  baseIdx: number
  compareIdx: number | null
  status: 'match' | 'mismatch' | 'missing_in_compare' | 'missing_in_base'
  cells: CellResult[]
}

export interface VerifyOutcome {
  rows: RowVerify[]
  conversions: string[]
  summary: {
    totalRows: number
    matchedRows: number
    mismatchRows: number
    missingInCompare: number
    missingInBase: number
    matchRate: number
  }
  heal: HealSuggestion[]
}

export interface HealSuggestion {
  message: string
  candidates: KeyCandidate[]
}

// ---------------------------------------------------------------- profiling

const NUMBER_LIKE = /^-?[\d,]+(\.\d+)?([a-z°"']{0,6})?$/i

export function parseNumberLoose(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function parseDateLoose(raw: unknown): number | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? null : ms
}

function isIdLike(name: string): boolean {
  return (
    /(^|[^a-z])(no|num|number|id|code|key|serial|sr|ref)([^a-z]|$)/i.test(name) ||
    /invoice|contract|serial|item|product|sku|part|batch|order|tag|asset|equip|dip|gauge|chart|calib/i.test(name)
  )
}

/** Sample-based per-column profile: kind, unit, uniqueness, fill rate. */
export function profileFile(rows: Record<string, unknown>[], columns: string[]): FileProfile {
  const sample = rows.slice(0, 60)
  const columnsMeta: ColumnMeta[] = columns.map((name) => {
    const vals = sample
      .map((r) => r[name])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
    let numbers = 0
    let dates = 0
    for (const v of vals) {
      if (typeof v === 'number' || NUMBER_LIKE.test(String(v).trim())) numbers++
      if (parseDateLoose(v) !== null && /[-/:]/.test(String(v))) dates++
    }
    const n = vals.length
    const kind: ValueKind =
      n > 0 && numbers >= Math.ceil(n * 0.7) ? 'number' : n > 0 && dates >= Math.ceil(n * 0.7) ? 'date' : 'text'
    const all = rows.map((r) => String(r[name] ?? '').trim()).filter(Boolean)
    const unit =
      kind === 'number' && all.length > 0
        ? detectUnit(name, rows.slice(0, 30).map((r) => r[name]))?.unit ?? null
        : null
    return {
      name,
      kind,
      unit,
      uniqueRatio: all.length ? new Set(all.map((v) => v.toLowerCase())).size / all.length : 0,
      fillRate: rows.length ? all.length / rows.length : 0,
      idLike: isIdLike(name),
    }
  })
  return { rowCount: rows.length, columns: columnsMeta }
}

// ------------------------------------------------------------- header pairing

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
}

const SYNONYM_GROUPS: string[][] = [
  ['no', 'num', 'number', 'id', 'code', 'key', 'serial', 'sr', 'ref', 'reference'],
  ['amount', 'amt', 'value', 'total', 'sum', 'price', 'cost', 'rate'],
  ['qty', 'quantity', 'count', 'units', 'pcs'],
  ['date', 'dt', 'day', 'month', 'year', 'period'],
  ['name', 'title', 'description', 'desc', 'label'],
  ['vendor', 'supplier', 'party', 'seller', 'buyer', 'customer', 'client'],
  ['temp', 'temperature', 'celsius', 'fahrenheit', 'kelvin', 'deg', 'degrees'],
  ['invoice', 'inv', 'bill', 'challan'],
  ['contract', 'agreement', 'po', 'order', 'purchase'],
  ['product', 'item', 'sku', 'part', 'material', 'goods', 'commodity'],
  ['remarks', 'remark', 'notes', 'note', 'comment', 'comments', 'description'],
  ['status', 'state', 'stage'],
  ['tanker', 'vehicle', 'truck', 'carrier'],
  ['trip', 'trips', 'delivery', 'deliveries'],
  ['dip', 'depth', 'level', 'height', 'reading'],
  ['volume', 'vol', 'capacity', 'liters', 'litres', 'gallons', 'ullage'],
  ['calib', 'calibration', 'chart', 'table', 'factor', 'correction'],
]

const TOKEN_CANON = new Map<string, string>()
SYNONYM_GROUPS.forEach((group, gi) => group.forEach((t) => TOKEN_CANON.set(t, `#${gi}`)))

const canonTokens = (tokens: string[]): string[] => tokens.map((t) => TOKEN_CANON.get(t) ?? t)

export function headerScore(a: string, b: string): number {
  const ha = norm(a)
  const hb = norm(b)
  if (!ha || !hb) return 0
  if (ha === hb) return 1
  if (ha.length >= 4 && (ha.includes(hb) || hb.includes(ha))) return 0.85
  const at = canonTokens(tokenize(a))
  const bt = canonTokens(tokenize(b))
  const overlap = at.filter((t) => bt.includes(t)).length
  if (overlap === 0) return 0
  const base = (0.45 * overlap) / Math.max(at.length, bt.length)
  return overlap === at.length && overlap === bt.length ? Math.max(base, 0.7) : base
}

export interface ColumnPair {
  baseCol: string
  compareCol: string
  confidence: 'high' | 'low' | 'manual'
}

/** Suggest data-column pairs by header similarity, excluding the chosen keys. */
export function suggestPairs(
  baseColumns: string[],
  compareColumns: string[],
  excludeBase: string[],
  excludeCompare: string[],
): ColumnPair[] {
  const out: ColumnPair[] = []
  const taken = new Set<string>()
  const candidates: Array<{ pair: ColumnPair; score: number }> = []
  for (const bc of baseColumns) {
    if (excludeBase.includes(bc)) continue
    for (const cc of compareColumns) {
      if (excludeCompare.includes(cc) || taken.has(cc)) continue
      const score = headerScore(bc, cc)
      if (score >= 0.45) candidates.push({ pair: { baseCol: bc, compareCol: cc, confidence: score >= 0.85 ? 'high' : 'low' }, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  for (const { pair } of candidates) {
    if (out.some((p) => p.baseCol === pair.baseCol) || taken.has(pair.compareCol)) continue
    taken.add(pair.compareCol)
    out.push(pair)
  }
  return out
}

// ------------------------------------------------------------ row matching

const fuzzCache = new Map<string, string>()
function fuzzKey(v: unknown): string {
  const s = String(v ?? '').trim()
  if (fuzzCache.has(s)) return fuzzCache.get(s)!
  const out = s.toLowerCase().replace(/[^a-z0-9]/g, '')
  fuzzCache.set(s, out)
  return out
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length >= 4 && (a.includes(b) || b.includes(a))) return 0.85
  // dice coefficient over character bigrams
  if (a.length < 2 || b.length < 2) return 0
  const grams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) grams.set(a.slice(i, i + 2), (grams.get(a.slice(i, i + 2)) ?? 0) + 1)
  let hits = 0
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2)
    const c = grams.get(g) ?? 0
    if (c > 0) {
      grams.set(g, c - 1)
      hits++
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1)
}

const keyOf = (row: Record<string, unknown>, cols: string[]): string =>
  cols.map((c) => String(row[c] ?? '').trim()).join(' ¦ ')

const FUZZ_THRESHOLD = 0.78

/**
 * Estimate how many base rows would match under each strategy and rank
 * candidates. Composite keys combine two id-like columns; position matching
 * is the last-resort fallback.
 */
export function keyCandidates(
  baseRows: Record<string, unknown>[],
  compareRows: Record<string, unknown>[],
  baseProfile: FileProfile,
  compareProfile: FileProfile,
): KeyCandidate[] {
  const out: KeyCandidate[] = []
  const baseCols = baseProfile.columns
  const cmpCols = compareProfile.columns

  const rateOf = (fn: (br: Record<string, unknown>) => string | number | null, cf: (cr: Record<string, unknown>) => string | number | null): number => {
    if (baseRows.length === 0) return 0
    const index = new Map<string, number>()
    for (const cr of compareRows) {
      const k = cf(cr)
      if (k === null || k === '') continue
      index.set(String(k).toLowerCase(), (index.get(String(k).toLowerCase()) ?? 0) + 1)
    }
    let hit = 0
    for (const br of baseRows) {
      const k = fn(br)
      if (k === null || k === '') continue
      if (index.has(String(k).toLowerCase())) hit++
    }
    return hit / baseRows.length
  }

  const fuzzyRate = (bc: string, cc: string): number => {
    if (baseRows.length === 0) return 0
    const cKeys = compareRows.map((r) => fuzzKey(r[cc])).filter(Boolean)
    let hit = 0
    for (const br of baseRows.slice(0, 200)) {
      const bk = fuzzKey(br[bc])
      if (!bk) continue
      if (cKeys.some((ck) => similarity(bk, ck) >= FUZZ_THRESHOLD)) hit++
    }
    return hit / Math.min(baseRows.length, 200)
  }

  const numericRate = (bc: string, cc: string): number => {
    if (baseRows.length === 0) return 0
    const cNums = compareRows.map((r) => parseNumberLoose(r[cc])).filter((v): v is number => v !== null)
    let hit = 0
    for (const br of baseRows.slice(0, 200)) {
      const bn = parseNumberLoose(br[bc])
      if (bn === null) continue
      if (cNums.some((cn) => Math.abs(cn - bn) <= Math.max(Math.abs(bn) * 0.01, 1e-9))) hit++
    }
    return hit / Math.min(baseRows.length, 200)
  }

  for (const bc of baseCols) {
    if (bc.fillRate < 0.5) continue
    for (const cc of cmpCols) {
      if (cc.fillRate < 0.5) continue
      const hscore = headerScore(bc.name, cc.name)
      const kindCompatible =
        (bc.kind === cc.kind) ||
        (bc.kind === 'number' && cc.kind === 'text') ||
        (bc.kind === 'text' && cc.kind === 'number')
      if (!kindCompatible) continue

      const exactRate = rateOf((r) => String(r[bc.name] ?? '').trim(), (r) => String(r[cc.name] ?? '').trim())
      if (exactRate > 0.05) {
        const score = exactRate * 0.65 + hscore * 0.2 + Math.min(bc.uniqueRatio, cc.uniqueRatio) * 0.15
        out.push({ id: `exact:${bc.name}|${cc.name}`, strategy: 'exact', baseCols: [bc.name], compareCols: [cc.name], matchRate: exactRate, score })
      }

      if (bc.kind === 'text' && cc.kind === 'text') {
        const fr = fuzzyRate(bc.name, cc.name)
        if (fr > exactRate + 0.05 && fr > 0.1) {
          const score = fr * 0.7 + hscore * 0.15 + Math.min(bc.uniqueRatio, cc.uniqueRatio) * 0.15
          out.push({ id: `fuzzy:${bc.name}|${cc.name}`, strategy: 'fuzzy', baseCols: [bc.name], compareCols: [cc.name], matchRate: fr, score })
        }
      }

      if (bc.kind === 'number' && cc.kind === 'number') {
        const nr = numericRate(bc.name, cc.name)
        if (nr > exactRate + 0.05 && nr > 0.1) {
          const score = nr * 0.7 + hscore * 0.15
          out.push({ id: `numeric:${bc.name}|${cc.name}`, strategy: 'numeric', baseCols: [bc.name], compareCols: [cc.name], matchRate: nr, score })
        }
      }
    }
  }

  // composite keys: pairs of id-like columns whose headers pair up on both sides
  const baseIds = baseCols.filter((c) => c.idLike && c.fillRate >= 0.5).slice(0, 6)
  const cmpIds = cmpCols.filter((c) => c.idLike && c.fillRate >= 0.5).slice(0, 6)
  for (const b1 of baseIds) {
    for (const b2 of baseIds) {
      if (b1.name === b2.name) continue
      for (const c1 of cmpIds) {
        if (headerScore(b1.name, c1.name) < 0.5) continue
        for (const c2 of cmpIds) {
          if (c1.name === c2.name) continue
          if (headerScore(b2.name, c2.name) < 0.5) continue
          const rate = rateOf(
            (r) => [b1, b2].map((c) => String(r[c.name] ?? '').trim().toLowerCase()).join('¦'),
            (r) => [c1, c2].map((c) => String(r[c.name] ?? '').trim().toLowerCase()).join('¦'),
          )
          if (rate > 0.05) {
            out.push({
              id: `composite:${b1.name}+${b2.name}|${c1.name}+${c2.name}`,
              strategy: 'composite',
              baseCols: [b1.name, b2.name],
              compareCols: [c1.name, c2.name],
              matchRate: rate,
              score: rate * 0.8 + 0.1,
            })
          }
        }
      }
    }
  }

  // positional fallback: always "matches" min(n) rows
  const posRate = Math.min(baseRows.length, compareRows.length) / Math.max(baseRows.length, 1)
  out.push({
    id: 'position',
    strategy: 'position',
    baseCols: [],
    compareCols: [],
    matchRate: posRate,
    score: posRate * 0.4,
  })

  out.sort((a, b) => b.score - a.score)
  return out.slice(0, 8)
}

function matchRows(
  baseRows: Record<string, unknown>[],
  compareRows: Record<string, unknown>[],
  candidate: KeyCandidate,
): RowMatch[] {
  const matches: RowMatch[] = []

  if (candidate.strategy === 'position') {
    const n = Math.min(baseRows.length, compareRows.length)
    for (let i = 0; i < n; i++) matches.push({ baseIdx: i, compareIdx: i, key: `#${i + 1}`, score: 1 })
    return matches
  }

  if (candidate.strategy === 'numeric') {
    const bc = candidate.baseCols[0]
    const cc = candidate.compareCols[0]
    const cNums = compareRows
      .map((r, i) => ({ num: parseNumberLoose(r[cc]), i }))
      .filter((x): x is { num: number; i: number } => x.num !== null)
      .sort((a, b) => a.num - b.num)
    baseRows.forEach((br, bi) => {
      const bn = parseNumberLoose(br[bc])
      const key = bn === null ? keyOf(br, [bc]) : String(bn)
      if (bn === null) {
        matches.push({ baseIdx: bi, compareIdx: null, key, score: 0 })
        return
      }
      // binary search nearest
      let lo = 0
      let hi = cNums.length - 1
      let best: { num: number; i: number } | null = null
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const cur = cNums[mid]!
        if (!best || Math.abs(cur.num - bn) < Math.abs(best.num - bn)) best = cur
        if (cur.num < bn) lo = mid + 1
        else hi = mid - 1
      }
      const ok = best !== null && Math.abs(best.num - bn) <= Math.max(Math.abs(bn) * 0.01, 1e-9)
      matches.push({ baseIdx: bi, compareIdx: ok ? best!.i : null, key, score: ok ? 1 : 0 })
    })
    return matches
  }

  if (candidate.strategy === 'fuzzy') {
    const bc = candidate.baseCols[0]
    const cc = candidate.compareCols[0]
    const cKeys = compareRows.map((r, i) => ({ k: fuzzKey(r[cc]), i }))
    baseRows.forEach((br, bi) => {
      const raw = keyOf(br, [bc])
      const bk = fuzzKey(br[bc])
      let bestIdx: number | null = null
      let bestScore = 0
      for (const { k, i } of cKeys) {
        const s = similarity(bk, k)
        if (s > bestScore) {
          bestScore = s
          bestIdx = i
        }
      }
      matches.push({ baseIdx: bi, compareIdx: bestScore >= FUZZ_THRESHOLD ? bestIdx : null, key: raw, score: bestScore })
    })
    return matches
  }

  // exact / composite
  const index = new Map<string, number[]>()
  compareRows.forEach((cr, i) => {
    const k = candidate.compareCols.map((c) => String(cr[c] ?? '').trim().toLowerCase()).join('¦')
    if (!k) return
    const list = index.get(k) ?? []
    list.push(i)
    index.set(k, list)
  })
  baseRows.forEach((br, bi) => {
    const k = candidate.baseCols.map((c) => String(br[c] ?? '').trim().toLowerCase()).join('¦')
    const hit = index.get(k)
    matches.push({ baseIdx: bi, compareIdx: hit?.[0] ?? null, key: keyOf(br, candidate.baseCols), score: hit ? 1 : 0 })
  })
  return matches
}

/**
 * Build a user-defined alignment candidate and score it against the current files.
 * Exact/composite join on the given columns; fuzzy/numeric use the first column pair.
 */
export function customCandidate(
  baseRows: Record<string, unknown>[],
  compareRows: Record<string, unknown>[],
  strategy: MatchStrategy,
  baseCols: string[],
  compareCols: string[],
): KeyCandidate {
  const id = `custom:${strategy}:${baseCols.join('+')}|${compareCols.join('+')}`
  const cand: KeyCandidate = {
    id,
    strategy,
    baseCols,
    compareCols,
    matchRate: 0,
    score: 2,
  }
  const matches = matchRows(baseRows, compareRows, cand)
  const hit = matches.filter((m) => m.compareIdx !== null).length
  cand.matchRate = baseRows.length === 0 ? 0 : hit / baseRows.length
  return cand
}

// ------------------------------------------------------------- verification

interface UnitInfoCache {
  get(side: 'base' | 'compare', rows: Record<string, unknown>[], col: string): UnitInfo | null
}

function makeUnitCache(): UnitInfoCache {
  const cache = new Map<string, UnitInfo | null>()
  return {
    get(side, rows, col) {
      const key = `${side}:${col}`
      if (cache.has(key)) return cache.get(key)!
      const samples = rows.slice(0, 30).map((r) => r[col])
      const detected = detectUnit(col, samples)
      const info = detected ? { kind: detected.unit.kind, unit: detected.unit, source: detected.source } : null
      cache.set(key, info)
      return info
    },
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Match rows under the chosen strategy and verify every configured column
 * pair cell-by-cell. Produces per-row status plus self-healing suggestions
 * when the alignment underperforms.
 */
export function verify(
  baseRows: Record<string, unknown>[],
  compareRows: Record<string, unknown>[],
  baseProfile: FileProfile,
  compareProfile: FileProfile,
  candidate: KeyCandidate,
  pairs: PairConfig[],
  options: VerifyOptions,
  alternatives: KeyCandidate[],
): VerifyOutcome {
  const unitCache = makeUnitCache()
  const conversions: string[] = []
  const matches = matchRows(baseRows, compareRows, candidate)
  const rows: RowVerify[] = []
  const usedCompare = new Set<number>()

  const kindOf = (side: 'base' | 'compare', col: string): ValueKind =>
    (side === 'base' ? baseProfile : compareProfile).columns.find((c) => c.name === col)?.kind ?? 'text'

  for (const m of matches) {
    if (m.compareIdx !== null) usedCompare.add(m.compareIdx)
    if (m.compareIdx === null) {
      rows.push({ key: m.key, baseIdx: m.baseIdx, compareIdx: null, status: 'missing_in_compare', cells: [] })
      continue
    }
    const br = baseRows[m.baseIdx]!
    const cr = compareRows[m.compareIdx]!
    const cells: CellResult[] = []
    let rowOk = true

    for (const cfg of pairs) {
      const bk = kindOf('base', cfg.baseCol)
      const ck = kindOf('compare', cfg.compareCol)
      const pairType: ValueKind =
        bk === 'number' && ck === 'number' ? 'number' : bk === 'date' && ck === 'date' ? 'date' : 'text'
      const column = cfg.baseCol === cfg.compareCol ? cfg.baseCol : `${cfg.baseCol} ↔ ${cfg.compareCol}`
      const baseVal = br[cfg.baseCol]
      const cmpVal = cr[cfg.compareCol]

      let cell: CellResult
      if (pairType === 'number') {
        const bInfo = unitCache.get('base', baseRows, cfg.baseCol)
        const cInfo = unitCache.get('compare', compareRows, cfg.compareCol)
        const target =
          cfg.targetUnit !== 'auto'
            ? unitById(cfg.targetUnit) ?? null
            : bInfo?.unit ?? cInfo?.unit ?? null
        const bNorm = normalizeToUnit(baseVal, bInfo, target)
        const cNorm = normalizeToUnit(cmpVal, cInfo, target)
        for (const note of [bNorm.note, cNorm.note]) {
          if (note && !conversions.includes(note)) conversions.push(note)
        }
        const unitNote =
          bInfo && cInfo && bInfo.unit.id !== cInfo.unit.id
            ? `units normalized: ${bInfo.unit.label} vs ${cInfo.unit.label} → ${target?.label ?? ''}`
            : null
        const fmt = (v: number | null) =>
          target && v !== null ? `${round2(v)} ${target.label}` : v !== null ? String(round2(v)) : null
        let ok: boolean
        if (bNorm.value === null && cNorm.value === null) ok = true
        else if (bNorm.value === null || cNorm.value === null) ok = false
        else {
          const diff = Math.abs(bNorm.value - cNorm.value)
          const scale = Math.max(Math.abs(bNorm.value), Math.abs(cNorm.value), 1)
          ok = diff <= options.numericTolerance || diff / scale <= 0.005
        }
        cell = {
          column,
          type: 'number',
          baseValue: String(baseVal ?? ''),
          compareValue: String(cmpVal ?? ''),
          baseNorm: fmt(bNorm.value),
          compareNorm: fmt(cNorm.value),
          unitNote,
          status: ok ? 'match' : 'mismatch',
        }
      } else if (pairType === 'date') {
        const bms = parseDateLoose(baseVal)
        const cms = parseDateLoose(cmpVal)
        const diffDays = bms !== null && cms !== null ? Math.abs(bms - cms) / 86400000 : null
        const ok = diffDays !== null && diffDays <= options.dateToleranceDays
        cell = {
          column,
          type: 'date',
          baseValue: String(baseVal ?? ''),
          compareValue: String(cmpVal ?? ''),
          baseNorm: bms !== null ? new Date(bms).toISOString().slice(0, 10) : null,
          compareNorm: cms !== null ? new Date(cms).toISOString().slice(0, 10) : null,
          unitNote: null,
          status: ok ? 'match' : 'mismatch',
        }
      } else {
        const bText = String(baseVal ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
        const cText = String(cmpVal ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
        const ok = bText === cText
        cell = {
          column,
          type: 'text',
          baseValue: String(baseVal ?? ''),
          compareValue: String(cmpVal ?? ''),
          baseNorm: ok ? bText : null,
          compareNorm: ok ? cText : null,
          unitNote: null,
          status: ok ? 'match' : 'mismatch',
        }
      }

      if (cell.status === 'mismatch') rowOk = false
      cells.push(cell)
    }

    rows.push({
      key: m.key,
      baseIdx: m.baseIdx,
      compareIdx: m.compareIdx,
      status: rowOk ? 'match' : 'mismatch',
      cells,
    })
  }

  // compare rows never claimed by any base row
  compareRows.forEach((cr, i) => {
    if (!usedCompare.has(i)) {
      rows.push({ key: keyOf(cr, candidate.compareCols.length ? candidate.compareCols : ['__pos__']).replace('__pos__', `#${i + 1}`), baseIdx: -1, compareIdx: i, status: 'missing_in_base', cells: [] })
    }
  })

  const matchedRows = rows.filter((r) => r.status === 'match').length
  const mismatchRows = rows.filter((r) => r.status === 'mismatch').length
  const missingInCompare = rows.filter((r) => r.status === 'missing_in_compare').length
  const missingInBase = rows.filter((r) => r.status === 'missing_in_base').length
  const matchRate = baseRows.length ? matchedRows / baseRows.length : 0

  const heal: HealSuggestion[] = []
  if (matchRate < 0.6 && baseRows.length > 0) {
    const better = alternatives
      .filter((c) => c.id !== candidate.id && c.matchRate > candidate.matchRate + 0.1)
      .sort((a, b) => b.matchRate - a.matchRate)
      .slice(0, 3)
    if (better.length) {
      heal.push({
        message: `Only ${Math.round(matchRate * 100)}% of rows aligned with the current key. These strategies look better:`,
        candidates: better,
      })
    }
    if (candidate.strategy === 'position' && pairs.length === 0) {
      heal.push({ message: 'Positional alignment has no verification columns — map at least one column pair.', candidates: [] })
    }
  }

  return {
    rows,
    conversions,
    summary: { totalRows: baseRows.length, matchedRows, mismatchRows, missingInCompare, missingInBase, matchRate },
    heal,
  }
}

/**
 * Analyst narration: translates raw counts into plain conclusions, the way
 * a human analyst would brief the findings.
 */
export function narrate(outcome: VerifyOutcome, candidate: KeyCandidate, pairs: ColumnPair[]): string[] {
  const s = outcome.summary
  const lines: string[] = []
  const keyDesc =
    candidate.baseCols.length > 0
      ? `${candidate.baseCols.join(' + ')} ↔ ${candidate.compareCols.join(' + ')}`
      : 'row position'
  lines.push(
    `Aligned ${Math.round(s.matchRate * 100)}% of ${s.totalRows} rows via ${candidate.strategy} matching on ${keyDesc}.`,
  )
  if (s.mismatchRows > 0) {
    lines.push(`${s.mismatchRows} row(s) carry value deltas across ${pairs.length} verified column pair(s).`)
  }
  if (s.missingInCompare > 0) lines.push(`${s.missingInCompare} row(s) exist only in file A.`)
  if (s.missingInBase > 0) lines.push(`${s.missingInBase} row(s) exist only in file B.`)
  if (s.mismatchRows === 0 && s.missingInCompare === 0 && s.missingInBase === 0) {
    lines.push('No deltas found — the files agree within tolerance.')
  }
  if (outcome.conversions.length > 0) {
    lines.push(`${outcome.conversions.length} unit conversion(s) were applied before comparing values.`)
  }
  return lines
}
