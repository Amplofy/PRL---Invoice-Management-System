import type { CompareOptions, CompareResult, Mismatch } from '../types/index.js'

function normalizeKey(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toNumber(v: unknown): number | null {
  if (v == null) return null
  const n = Number(String(v).replace(/,/g, '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Compares two sets of tabular rows, aligning on a join key column.
 * Base rows are the reference ("Compare FROM"); compare rows are the
 * candidate ("Compare TO"). Values differing within tolerance produce
 * mismatch records; rows missing on either side are flagged.
 */
export function compareFiles(
  baseRows: Record<string, unknown>[],
  compareRows: Record<string, unknown>[],
  opts: CompareOptions
): CompareResult {
  const { joinKey, columns, tolerance = 0 } = opts

  const headerMap = (rows: Record<string, unknown>[]): Record<string, string> => {
    const map: Record<string, string> = {}
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const norm = normalizeHeader(key)
        if (!(norm in map)) map[norm] = key
      }
    }
    return map
  }

  const baseHeaders = headerMap(baseRows)
  const compareHeaders = headerMap(compareRows)

  const resolveJoin = (headers: Record<string, string>, key: string): string | null => {
    const norm = normalizeHeader(key)
    if (norm in headers) return headers[norm]
    for (const [n, orig] of Object.entries(headers)) {
      if (n.includes(norm) || norm.includes(n)) return orig
    }
    return null
  }

  const baseJoinCol = resolveJoin(baseHeaders, joinKey)
  const compareJoinCol = resolveJoin(compareHeaders, joinKey)

  const resolveCol = (headers: Record<string, string>, col: string): string | null =>
    resolveJoin(headers, col)

  const mismatches: Mismatch[] = []
  const missingInCompare: CompareResult['missingInCompare'] = []
  const missingInBase: CompareResult['missingInBase'] = []

  const baseMap = new Map<string, Record<string, unknown>>()
  for (const row of baseRows) {
    const k = baseJoinCol ? normalizeKey(row[baseJoinCol]) : ''
    if (k) baseMap.set(k, row)
  }
  const compareMap = new Map<string, Record<string, unknown>>()
  for (const row of compareRows) {
    const k = compareJoinCol ? normalizeKey(row[compareJoinCol]) : ''
    if (k) compareMap.set(k, row)
  }

  const allKeys = new Set([...baseMap.keys(), ...compareMap.keys()])

  for (const key of allKeys) {
    const base = baseMap.get(key)
    const cmp = compareMap.get(key)
    if (!base) {
      if (cmp) missingInBase.push({ keyValue: key, row: cmp })
      continue
    }
    if (!cmp) {
      missingInCompare.push({ keyValue: key, row: base })
      continue
    }
    for (const col of columns) {
      const baseCol = resolveCol(baseHeaders, col)
      const compareCol = resolveCol(compareHeaders, col)
      const baseVal = baseCol ? base[baseCol] : undefined
      const compareVal = compareCol ? cmp[compareCol] : undefined
      const n1 = toNumber(baseVal)
      const n2 = toNumber(compareVal)
      if (n1 != null && n2 != null) {
        if (Math.abs(n1 - n2) > tolerance) {
          mismatches.push({
            keyValue: key,
            column: col,
            baseValue: String(baseVal ?? ''),
            compareValue: String(compareVal ?? ''),
          })
        }
      } else if (normalizeKey(baseVal) !== normalizeKey(compareVal)) {
        mismatches.push({
          keyValue: key,
          column: col,
          baseValue: String(baseVal ?? ''),
          compareValue: String(compareVal ?? ''),
        })
      }
    }
  }

  const matchedKeys = [...allKeys].filter(
    (k) => baseMap.has(k) && compareMap.has(k)
  ).length

  const summary = {
    baseRows: baseRows.length,
    compareRows: compareRows.length,
    matched: matchedKeys,
    mismatchCount: mismatches.length,
    missingInCompare: missingInCompare.length,
    missingInBase: missingInBase.length,
  }

  return { mismatches, missingInCompare, missingInBase, summary }
}
