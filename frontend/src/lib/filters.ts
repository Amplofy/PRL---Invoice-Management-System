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
  valueTo?: string
}

export type FilterLogic = 'and' | 'or'

export interface FilterOpDef {
  value: string
  label: string
  chip: string
}

export const FILTER_OPS: Record<FilterType, FilterOpDef[]> = {
  text: [
    { value: 'contains', label: 'contains', chip: 'contains' },
    { value: 'equals', label: 'equals', chip: '=' },
    { value: 'not_contains', label: 'does not contain', chip: 'excludes' },
    { value: 'starts_with', label: 'starts with', chip: 'starts' },
    { value: 'ends_with', label: 'ends with', chip: 'ends' },
    { value: 'is_empty', label: 'is empty', chip: 'empty' },
    { value: 'not_empty', label: 'is not empty', chip: 'filled' },
  ],
  number: [
    { value: 'eq', label: '= equals', chip: '=' },
    { value: 'neq', label: 'not equal', chip: '!=' },
    { value: 'gt', label: '> greater than', chip: '>' },
    { value: 'gte', label: '>= at least', chip: '>=' },
    { value: 'lt', label: '< less than', chip: '<' },
    { value: 'lte', label: '<= at most', chip: '<=' },
    { value: 'between', label: 'between', chip: 'between' },
  ],
  date: [
    { value: 'on', label: 'on', chip: 'on' },
    { value: 'before', label: 'before', chip: 'before' },
    { value: 'after', label: 'after', chip: 'after' },
    { value: 'on_or_before', label: 'on or before', chip: '<=' },
    { value: 'on_or_after', label: 'on or after', chip: '>=' },
    { value: 'between', label: 'between', chip: 'between' },
  ],
  select: [
    { value: 'is', label: 'is', chip: 'is' },
    { value: 'is_not', label: 'is not', chip: 'not' },
  ],
}

export function opNeedsValue(op: string): boolean {
  return op !== 'is_empty' && op !== 'not_empty'
}

export function opNeedsRange(op: string): boolean {
  return op === 'between'
}

export function opChipLabel(type: FilterType, op: string): string {
  const found = FILTER_OPS[type].find((x) => x.value === op)
  return found?.chip ?? found?.label ?? op
}

function asText(v: string | number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v)
}

function matchFilter(
  raw: string | number | null | undefined,
  f: FilterState,
  type: FilterType,
): boolean {
  if (f.op === 'is_empty') return asText(raw).trim() === ''
  if (f.op === 'not_empty') return asText(raw).trim() !== ''
  if (type === 'number') {
    const n = Number(raw)
    const target = Number(f.value)
    if (raw === null || raw === undefined || Number.isNaN(n) || Number.isNaN(target)) return false
    if (f.op === 'eq') return n === target
    if (f.op === 'neq') return n !== target
    if (f.op === 'gt') return n > target
    if (f.op === 'gte') return n >= target
    if (f.op === 'lt') return n < target
    if (f.op === 'lte') return n <= target
    if (f.op === 'between') {
      const hi = Number(f.valueTo)
      if (Number.isNaN(hi)) return n >= target
      const lo = Math.min(target, hi)
      const top = Math.max(target, hi)
      return n >= lo && n <= top
    }
    return true
  }
  const s = asText(raw)
  if (type === 'date') {
    if (!s) return false
    const day = s.slice(0, 10)
    const target = f.value.slice(0, 10)
    if (f.op === 'on') return day === target
    if (f.op === 'before') return day < target
    if (f.op === 'after') return day > target
    if (f.op === 'on_or_before') return day <= target
    if (f.op === 'on_or_after') return day >= target
    if (f.op === 'between') {
      const end = (f.valueTo ?? f.value).slice(0, 10)
      const lo = target < end ? target : end
      const hi = target < end ? end : target
      return day >= lo && day <= hi
    }
    return true
  }
  const needle = f.value.toLowerCase()
  const hay = s.toLowerCase()
  if (f.op === 'contains') return hay.includes(needle)
  if (f.op === 'not_contains') return !hay.includes(needle)
  if (f.op === 'equals') return hay === needle
  if (f.op === 'starts_with') return hay.startsWith(needle)
  if (f.op === 'ends_with') return hay.endsWith(needle)
  if (f.op === 'is') return s === f.value
  if (f.op === 'is_not') return s !== f.value
  return true
}

/**
 * Apply advanced per-column filters to a row list.
 * `getValue` resolves the raw field for a filter key (string, number or null).
 * Combine with AND (every filter) or OR (any filter).
 */
export function applyFilters<T>(
  rows: T[],
  filters: FilterState[],
  columns: FilterColumnDef[],
  getValue: (row: T, key: string) => string | number | null | undefined,
  logic: FilterLogic = 'and',
): T[] {
  if (filters.length === 0) return rows
  const typeOf = new Map(columns.map((c) => [c.key, c.type]))
  return rows.filter((row) =>
    logic === 'or'
      ? filters.some((f) => matchFilter(getValue(row, f.key), f, typeOf.get(f.key) ?? 'text'))
      : filters.every((f) => matchFilter(getValue(row, f.key), f, typeOf.get(f.key) ?? 'text')),
  )
}

let filterSeq = 0
export function newFilterId(): string {
  filterSeq += 1
  return `f${Date.now().toString(36)}-${filterSeq}`
}
