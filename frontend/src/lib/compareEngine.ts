/**
 * Client-side comparison engine for the Compare module: column pairing
 * suggestions, join-key suggestions and unit-aware row diffing.
 */
import { detectUnit, normalizeToUnit, unitById, type UnitDef, type UnitInfo } from './units'

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
}

/**
 * Synonym groups let differently-worded headers match: "Invoice No" ↔
 * "INV #", "Amount" ↔ "Total Value", "Qty" ↔ "Quantity", etc.
 */
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
]

const TOKEN_CANON = new Map<string, string>()
SYNONYM_GROUPS.forEach((group, gi) => group.forEach((t) => TOKEN_CANON.set(t, `#${gi}`)))

const canonTokens = (tokens: string[]): string[] =>
  tokens.map((t) => TOKEN_CANON.get(t) ?? t)

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
  // synonyms alone are weaker than a literal token match, but still useful
  return overlap === at.length && overlap === bt.length ? Math.max(base, 0.7) : base
}

export type ColumnType = 'number' | 'date' | 'text'

const NUMBER_LIKE = /^-?[\d,]+(\.\d+)?([a-z°"']{0,6})?$/i

/** Infer a column's data type from a sample of its values. */
export function inferColumnType(rows: Record<string, unknown>[], col: string): ColumnType {
  const vals = rows
    .slice(0, 30)
    .map((r) => r[col])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
  if (vals.length === 0) return 'text'
  let numbers = 0
  let dates = 0
  for (const v of vals) {
    const s = String(v).trim()
    if (NUMBER_LIKE.test(s) || typeof v === 'number') numbers++
    const parsed = Date.parse(s)
    if (!Number.isNaN(parsed) && /[-/:]/.test(s)) dates++
  }
  if (numbers >= Math.ceil(vals.length * 0.7)) return 'number'
  if (dates >= Math.ceil(vals.length * 0.7)) return 'date'
  return 'text'
}

export interface ColumnPair {
  baseCol: string
  compareCol: string
  confidence: 'high' | 'low' | 'manual'
}

function uniqueness(rows: Record<string, unknown>[], col: string): number {
  const vals = rows.map((r) => String(r[col] ?? '').trim()).filter(Boolean)
  if (vals.length === 0) return 0
  return new Set(vals).size / vals.length
}

/** Suggest the join-key column pair: ID-like headers present on both sides with high uniqueness. */
export function suggestJoinKey(
  baseColumns: string[],
  compareColumns: string[],
  baseRows: Record<string, unknown>[],
  compareRows: Record<string, unknown>[],
): ColumnPair | null {
  const idish = (c: string) => /(^|[^a-z])(no|num|number|id|code|key|serial|sr)([^a-z]|$)/i.test(c) || /invoice|contract|serial|item|product|sku|part|batch|order/i.test(c)
  let best: { pair: ColumnPair; score: number } | null = null
  for (const bc of baseColumns) {
    if (!idish(bc)) continue
    for (const cc of compareColumns) {
      const score = headerScore(bc, cc)
      if (score < 0.5) continue
      const uniq = Math.min(uniqueness(baseRows, bc), uniqueness(compareRows, cc))
      if (uniq < 0.6) continue
      const total = score * 0.7 + uniq * 0.3
      if (!best || total > best.score) {
        best = { pair: { baseCol: bc, compareCol: cc, confidence: score >= 0.85 ? 'high' : 'low' }, score: total }
      }
    }
  }
  return best?.pair ?? null
}

/** Suggest data-column pairs between the two files, excluding the join columns. */
export function suggestPairs(
  baseColumns: string[],
  compareColumns: string[],
  join: ColumnPair | null,
): ColumnPair[] {
  const out: ColumnPair[] = []
  const taken = new Set<string>()
  const candidates: Array<{ pair: ColumnPair; score: number }> = []
  for (const bc of baseColumns) {
    if (join && bc === join.baseCol) continue
    for (const cc of compareColumns) {
      if (join && cc === join.compareCol) continue
      if (taken.has(cc)) continue
      const score = headerScore(bc, cc)
      if (score >= 0.45) candidates.push({ pair: { baseCol: bc, compareCol: cc, confidence: score >= 0.85 ? 'high' : 'low' }, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  for (const { pair, score } of candidates) {
    if (out.some((p) => p.baseCol === pair.baseCol) || taken.has(pair.compareCol)) continue
    taken.add(pair.compareCol)
    out.push(score >= 0.45 ? pair : pair)
  }
  return out
}

export interface CompareOutcome {
  mismatches: MismatchRow[]
  /** Rows where every compared column agreed (after unit normalization). */
  matched: MatchedRow[]
  missingInCompare: Array<{ keyValue: string }>
  missingInBase: Array<{ keyValue: string }>
  summary: { totalRows: number; matchedRows: number }
  conversions: string[]
}

export interface MatchedRow {
  keyValue: string
  matches: Array<{
    column: string
    type: ColumnType
    baseValue: string
    compareValue: string
    baseNorm: string | null
    compareNorm: string | null
    unitNote: string | null
  }>
}

export interface MismatchRow {
  keyValue: string
  column: string
  type: ColumnType
  baseValue: string
  compareValue: string
  baseNorm: string | null
  compareNorm: string | null
  unitNote: string | null
}

export interface PairConfig {
  baseCol: string
  compareCol: string
  /** 'auto' detects units per column; a unit id forces a target. */
  targetUnit: 'auto' | string
  tolerance: number
}

function numericLike(rows: Record<string, unknown>[], col: string): boolean {
  const vals = rows.slice(0, 50).map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '')
  if (vals.length === 0) return false
  const numeric = vals.filter((v) => typeof v === 'number' || /^-?[\d.,()°\s]+[a-z°"']{0,6}$/i.test(String(v).trim()))
  return numeric.length >= Math.ceil(vals.length / 2)
}

/**
 * Join both datasets on the key pair and diff the configured columns with
 * unit normalization. Values that differ only by unit get converted to the
 * target unit before comparing, and conversions are surfaced as notes.
 */
export function runCompare(
  baseRows: Record<string, unknown>[],
  compareRows: Record<string, unknown>[],
  join: ColumnPair,
  pairs: PairConfig[],
): CompareOutcome {
  const baseIndex = new Map<string, Record<string, unknown>>()
  for (const r of baseRows) {
    const k = String(r[join.baseCol] ?? '').trim()
    if (k) baseIndex.set(k.toLowerCase(), r)
  }

  const conversions: string[] = []
  const unitInfoCache = new Map<string, UnitInfo | null>()

  const unitInfoFor = (side: 'base' | 'compare', rows: Record<string, unknown>[], col: string): UnitInfo | null => {
    const cacheKey = `${side}:${col}`
    if (unitInfoCache.has(cacheKey)) return unitInfoCache.get(cacheKey)!
    if (!numericLike(rows, col)) {
      unitInfoCache.set(cacheKey, null)
      return null
    }
    const samples = rows.slice(0, 30).map((r) => r[col])
    const detected = detectUnit(col, samples)
    const info = detected ? { kind: detected.unit.kind, unit: detected.unit, source: detected.source } : null
    unitInfoCache.set(cacheKey, info)
    return info
  }

  const pickTarget = (cfg: PairConfig, baseInfo: UnitInfo | null, compareInfo: UnitInfo | null): UnitDef | null => {
    if (cfg.targetUnit !== 'auto') {
      const u = unitById(cfg.targetUnit)
      if (u) return u
    }
    return baseInfo?.unit ?? compareInfo?.unit ?? null
  }

  const typeCache = new Map<string, ColumnType>()
  const typeFor = (side: 'base' | 'compare', rows: Record<string, unknown>[], col: string): ColumnType => {
    const cacheKey = `${side}:${col}`
    if (typeCache.has(cacheKey)) return typeCache.get(cacheKey)!
    const t = inferColumnType(rows, col)
    typeCache.set(cacheKey, t)
    return t
  }

  const fmtDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

  const mismatches: MismatchRow[] = []
  const matched: MatchedRow[] = []
  const missingInCompare: Array<{ keyValue: string }> = []
  const missingInBase: Array<{ keyValue: string }> = []
  let matchedRows = 0

  const seenCompare = new Set<string>()

  for (const [keyRaw, baseRow] of baseIndex) {
    const compareRow = compareRows.find((r) => String(r[join.compareCol] ?? '').trim().toLowerCase() === keyRaw)
    if (!compareRow) {
      missingInCompare.push({ keyValue: String(baseRow[join.baseCol] ?? '') })
      continue
    }
    seenCompare.add(keyRaw)
    const keyLabel = String(baseRow[join.baseCol] ?? '')
    const rowMismatch: MismatchRow[] = []
    const rowMatches: MatchedRow['matches'] = []
    let rowOk = true

    for (const cfg of pairs) {
      const baseType = typeFor('base', baseRows, cfg.baseCol)
      const compareType = typeFor('compare', compareRows, cfg.compareCol)
      const pairType: ColumnType =
        baseType === 'number' || compareType === 'number'
          ? 'number'
          : baseType === 'date' && compareType === 'date'
            ? 'date'
            : 'text'
      const baseInfo = pairType === 'number' ? unitInfoFor('base', baseRows, cfg.baseCol) : null
      const compareInfo = pairType === 'number' ? unitInfoFor('compare', compareRows, cfg.compareCol) : null
      const target = pickTarget(cfg, baseInfo, compareInfo)

      const baseVal = baseRow[cfg.baseCol]
      const cmpVal = compareRow[cfg.compareCol]
      const column = cfg.baseCol === cfg.compareCol ? cfg.baseCol : `${cfg.baseCol} ↔ ${cfg.compareCol}`

      let entry: MatchedRow['matches'][number]

      if (pairType === 'date') {
        const bms = Date.parse(String(baseVal ?? '').trim())
        const cms = Date.parse(String(cmpVal ?? '').trim())
        const bValid = !Number.isNaN(bms)
        const cValid = !Number.isNaN(cms)
        const diffDays = bValid && cValid ? Math.abs(bms - cms) / 86400000 : null
        const withinTolerance = diffDays !== null && diffDays <= cfg.tolerance
        entry = {
          column,
          type: 'date',
          baseValue: String(baseVal ?? ''),
          compareValue: String(cmpVal ?? ''),
          baseNorm: bValid ? fmtDate(bms) : null,
          compareNorm: cValid ? fmtDate(cms) : null,
          unitNote: null,
        }
        if (withinTolerance) {
          rowMatches.push(entry)
          continue
        }
        rowOk = false
        rowMismatch.push({ keyValue: keyLabel, ...entry })
        continue
      }

      if (pairType === 'text') {
        const bText = String(baseVal ?? '').trim().toLowerCase()
        const cText = String(cmpVal ?? '').trim().toLowerCase()
        const equal = bText === cText
        entry = {
          column,
          type: 'text',
          baseValue: String(baseVal ?? ''),
          compareValue: String(cmpVal ?? ''),
          baseNorm: equal ? bText : null,
          compareNorm: equal ? cText : null,
          unitNote: null,
        }
        if (equal) {
          rowMatches.push(entry)
          continue
        }
        rowOk = false
        rowMismatch.push({ keyValue: keyLabel, ...entry })
        continue
      }

      const baseNorm = normalizeToUnit(baseVal, baseInfo, target)
      const compareNorm = normalizeToUnit(cmpVal, compareInfo, target)

      for (const n of [baseNorm.note, compareNorm.note]) {
        if (n && !conversions.includes(n)) conversions.push(n)
      }

      const unitNote =
        baseInfo && compareInfo && baseInfo.unit.id !== compareInfo.unit.id
          ? `units normalized: ${baseInfo.unit.label} vs ${compareInfo.unit.label} → ${target?.label ?? ''}`
          : null
      const fmt = (v: number | null) => (target && v !== null ? `${round2(v)} ${target.label}` : v !== null ? String(round2(v)) : null)

      entry = {
        column,
        type: 'number',
        baseValue: String(baseVal ?? ''),
        compareValue: String(cmpVal ?? ''),
        baseNorm: fmt(baseNorm.value),
        compareNorm: fmt(compareNorm.value),
        unitNote,
      }

      if (baseNorm.value === null && compareNorm.value === null) continue

      if (baseNorm.value !== null && compareNorm.value !== null) {
        const diff = Math.abs(baseNorm.value - compareNorm.value)
        const scale = Math.max(Math.abs(baseNorm.value), Math.abs(compareNorm.value), 1)
        const withinTolerance = diff <= cfg.tolerance || diff / scale <= 0.005
        if (withinTolerance) {
          rowMatches.push(entry)
          continue
        }
        rowOk = false
        rowMismatch.push({ keyValue: keyLabel, ...entry })
        continue
      }

      rowOk = false
      rowMismatch.push({ keyValue: keyLabel, ...entry })
    }

    if (rowOk) {
      matchedRows++
      matched.push({ keyValue: keyLabel, matches: rowMatches })
    } else {
      mismatches.push(...rowMismatch)
    }
  }

  for (const r of compareRows) {
    const k = String(r[join.compareCol] ?? '').trim().toLowerCase()
    if (k && !seenCompare.has(k) && !baseIndex.has(k)) {
      missingInBase.push({ keyValue: String(r[join.compareCol] ?? '') })
    }
  }

  return {
    mismatches,
    matched,
    missingInCompare,
    missingInBase,
    summary: { totalRows: baseRows.length, matchedRows },
    conversions,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
