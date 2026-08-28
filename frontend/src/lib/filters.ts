export type FilterType = 'text' | 'number' | 'date' | 'select'

export interface FilterColumnDef {
  key: string
  label: string
  type: FilterType
  options?: Array<{ value: string; label: string }>
}

export interface FilterState {
  id: string
  key: string
  op: string
  value: string
}

export const FILTER_OPS: Record<FilterType, Array<{ value: string; label: string }>> = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'equals' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'not_empty', label: 'is not empty' },
  ],
  number: [
    { value: 'eq', label: '= equals' },
    { value: 'gte', label: '≥ at least' },
    { value: 'lte', label: '≤ at most' },
  ],
  date: [
    { value: 'on', label: 'on' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
  ],
  select: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
  ],
}

export function opNeedsValue(op: string): boolean {
  return op !== 'is_empty' && op !== 'not_empty'
}

function asText(v: string | number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v)
}

/**
 * Apply advanced per-column filters to a row list.
 * `getValue` resolves the raw field for a filter key (string, number or null).
 * All filters must match (AND).
 */
export function applyFilters<T>(
  rows: T[],
  filters: FilterState[],
  columns: FilterColumnDef[],
  getValue: (row: T, key: string) => string | number | null | undefined,
): T[] {
  if (filters.length === 0) return rows
  const typeOf = new Map(columns.map((c) => [c.key, c.type]))
  return rows.filter((row) =>
    filters.every((f) => {
      const raw = getValue(row, f.key)
      const type = typeOf.get(f.key) ?? 'text'
      if (f.op === 'is_empty') return asText(raw).trim() === ''
      if (f.op === 'not_empty') return asText(raw).trim() !== ''
      if (type === 'number') {
        const n = Number(raw)
        const target = Number(f.value)
        if (raw === null || raw === undefined || Number.isNaN(n) || Number.isNaN(target)) return false
        if (f.op === 'eq') return n === target
        if (f.op === 'gte') return n >= target
        if (f.op === 'lte') return n <= target
        return true
      }
      const s = asText(raw)
      if (type === 'date') {
        if (!s) return false
        if (f.op === 'on') return s.slice(0, 10) === f.value.slice(0, 10)
        if (f.op === 'before') return s.slice(0, 10) < f.value.slice(0, 10)
        if (f.op === 'after') return s.slice(0, 10) > f.value.slice(0, 10)
        return true
      }
      const needle = f.value.toLowerCase()
      if (f.op === 'contains') return s.toLowerCase().includes(needle)
      if (f.op === 'not_contains') return !s.toLowerCase().includes(needle)
      if (f.op === 'equals') return s.toLowerCase() === needle
      if (f.op === 'is') return s === f.value
      if (f.op === 'is_not') return s !== f.value
      return true
    }),
  )
}

let filterSeq = 0
export function newFilterId(): string {
  filterSeq += 1
  return `f${Date.now().toString(36)}-${filterSeq}`
}
