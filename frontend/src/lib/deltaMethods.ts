import type { MatchStrategy } from './deltaEngine'

const KEY = 'prl-eoms-delta-methods'

export interface SavedPair {
  baseCol: string
  compareCol: string
  targetUnit: string
}

export interface SavedDeltaMethod {
  id: string
  name: string
  strategy: MatchStrategy
  baseCols: string[]
  compareCols: string[]
  pairs: SavedPair[]
  numericTolerance: string
  dateToleranceDays: string
  createdAt: string
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `method-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadDeltaMethods(): SavedDeltaMethod[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedDeltaMethod[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveDeltaMethod(input: Omit<SavedDeltaMethod, 'id' | 'createdAt'> & { id?: string }): SavedDeltaMethod[] {
  const list = loadDeltaMethods()
  const next: SavedDeltaMethod = {
    id: input.id ?? uid(),
    name: input.name.trim() || 'Untitled method',
    strategy: input.strategy,
    baseCols: input.baseCols,
    compareCols: input.compareCols,
    pairs: input.pairs,
    numericTolerance: input.numericTolerance,
    dateToleranceDays: input.dateToleranceDays,
    createdAt: new Date().toISOString(),
  }
  const without = list.filter((m) => m.id !== next.id && m.name.toLowerCase() !== next.name.toLowerCase())
  const out = [next, ...without].slice(0, 40)
  try {
    localStorage.setItem(KEY, JSON.stringify(out))
  } catch {
    /* storage full or blocked */
  }
  return out
}

export function deleteDeltaMethod(id: string): SavedDeltaMethod[] {
  const out = loadDeltaMethods().filter((m) => m.id !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(out))
  } catch {
    /* ignore */
  }
  return out
}

export function methodGaps(m: SavedDeltaMethod, colsA: string[], colsB: string[]): string[] {
  const missing: string[] = []
  for (const c of m.baseCols) {
    if (!colsA.includes(c)) missing.push(`A: ${c}`)
  }
  for (const c of m.compareCols) {
    if (!colsB.includes(c)) missing.push(`B: ${c}`)
  }
  return missing
}
