import { useEffect, useState } from 'react'
import { parseLocalGroups } from './importParser'
import { isDemoMode } from './supabase'
import { apiUpload } from './api'
import {
  acceptList,
  capRows,
  FILE_COL,
  inferColumns,
  newId,
  OFFICIAL_INVOICE_VISIBLE,
  OFFICIAL_SOURCE_ID,
  officialRecordsSource,
  parseJsonGroups,
  parseTsvGroups,
  pickBestGroup,
  SHEET_COL,
  suggestCharts,
  workingSet,
  type PowerChart,
  type PowerGroup,
  type PowerSource,
} from './powerGraphEngine'
import { profileFile } from './deltaEngine'

const STORAGE_KEY = 'prl-eoms-power-graph'
const MAX_PERSIST = 1_800_000

export interface PowerSession {
  sources: PowerSource[]
  charts: PowerChart[]
  visibleCols: string[]
  sortKey: string | null
  sortDir: 'asc' | 'desc'
  query: string
  officialSelected: string[]
}

const empty = (): PowerSession => ({
  sources: [],
  charts: [],
  visibleCols: [],
  sortKey: null,
  sortDir: 'desc',
  query: '',
  officialSelected: ['Invoices'],
})

let custom: PowerSession = load()
let officialLive: PowerSource | null = null
const listeners = new Set<() => void>()

function load(): PowerSession {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<PowerSession>
    const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
      .filter((s) => s && s.origin !== 'official' && s.id !== OFFICIAL_SOURCE_ID)
      .map((s) => ({ ...s, origin: 'session' as const }))
    return {
      ...empty(),
      sources,
      charts: Array.isArray(parsed.charts) ? parsed.charts : [],
      visibleCols: Array.isArray(parsed.visibleCols) ? parsed.visibleCols : [],
      sortKey: parsed.sortKey ?? null,
      sortDir: parsed.sortDir === 'asc' ? 'asc' : 'desc',
      query: typeof parsed.query === 'string' ? parsed.query : '',
      officialSelected: Array.isArray(parsed.officialSelected) ? parsed.officialSelected : ['Invoices'],
    }
  } catch {
    return empty()
  }
}

function persist() {
  try {
    const payload: PowerSession = {
      ...custom,
      sources: custom.sources.filter((s) => s.origin === 'session'),
    }
    const raw = JSON.stringify(payload)
    if (raw.length > MAX_PERSIST) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    sessionStorage.setItem(STORAGE_KEY, raw)
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // quota
    }
  }
}

function composedSources(): PowerSource[] {
  const official = officialLive
    ? [{ ...officialLive, selectedGroups: custom.officialSelected }]
    : []
  return [...official, ...custom.sources]
}

function composed(): PowerSession {
  return { ...custom, sources: composedSources() }
}

function emit() {
  persist()
  listeners.forEach((fn) => fn())
}

function setCustom(next: PowerSession) {
  custom = next
  emit()
}

export function getPowerGraphSession(): PowerSession {
  return composed()
}

export function subscribePowerGraph(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function clearPowerGraphSession() {
  const officialSelected = ['Invoices']
  const live = officialLive ? [{ ...officialLive, selectedGroups: officialSelected }] : []
  custom = {
    ...empty(),
    officialSelected,
    charts: autoChartsFor(live),
    visibleCols: defaultVisible(workingSet(live).columns),
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn())
}

function normalizeGroups(groups: PowerGroup[]): PowerGroup[] {
  return groups.map((g) => {
    const rows = capRows(g.rows ?? [])
    const columns = g.columns?.length ? g.columns : inferColumns(rows)
    return {
      ...g,
      rows,
      columns,
      rowCount: g.rowCount ?? rows.length,
    }
  })
}

function defaultVisible(columns: string[]): string[] {
  const data = columns.filter((c) => c !== FILE_COL && c !== SHEET_COL)
  const preferred = OFFICIAL_INVOICE_VISIBLE.filter((c) => data.includes(c))
  if (preferred.length >= 4) return preferred
  const pick = data.length <= 10 ? data : data.slice(0, 8)
  return pick.length ? pick : columns.slice(0, 8)
}

function autoChartsFor(sources: PowerSource[]): PowerChart[] {
  const { rows, columns } = workingSet(sources)
  if (rows.length === 0) return []
  const profile = profileFile(rows, columns)
  return suggestCharts(profile, columns).map((c) => ({ ...c, id: newId('chart') }))
}

function withVisible(next: PowerSession, sources: PowerSource[]): PowerSession {
  const { columns } = workingSet(sources)
  if (next.visibleCols.length === 0) return { ...next, visibleCols: defaultVisible(columns) }
  const keep = next.visibleCols.filter((c) => columns.includes(c))
  return { ...next, visibleCols: keep.length ? keep : defaultVisible(columns) }
}

export function setOfficialRecords(invoices: Record<string, unknown>[], contracts: Record<string, unknown>[]) {
  officialLive = officialRecordsSource(invoices, contracts)
  const available = new Set(officialLive.groups.map((g) => g.name))
  let selected = custom.officialSelected.filter((n) => available.has(n))
  if (selected.length === 0 && custom.sources.length === 0) {
    selected = officialLive.selectedGroups
  }
  const sources = [
    { ...officialLive, selectedGroups: selected },
    ...custom.sources,
  ]
  let next = { ...custom, officialSelected: selected }
  if (next.charts.length === 0) {
    next = { ...next, charts: autoChartsFor(sources) }
  }
  next = withVisible(next, sources)
  setCustom(next)
}

export async function ingestPowerGraphFiles(files: File[]): Promise<{ added: number; labels: string[]; errors: string[] }> {
  const demo = isDemoMode()
  const labels: string[] = []
  const errors: string[] = []
  let added = 0
  const firstCustom = custom.sources.length === 0
  const nextSources = [...custom.sources]

  for (const file of files) {
    try {
      const lower = file.name.toLowerCase()
      let groups: PowerGroup[]
      let format = 'xlsx'
      if (lower.endsWith('.json')) {
        groups = parseJsonGroups(await file.text(), file.name.replace(/\.[^.]+$/, '') || 'JSON')
        format = 'json'
      } else if (lower.endsWith('.tsv')) {
        groups = parseTsvGroups(await file.text(), file.name.replace(/\.[^.]+$/, '') || 'TSV')
        format = 'tsv'
      } else if (lower.endsWith('.pdf')) {
        if (demo) throw new Error('PDF needs a signed-in session. Drop CSV, XLSX, XLS or JSON locally.')
        const form = new FormData()
        form.append('file', file)
        const parsed = await apiUpload<{ fileName: string; format: string; groups: PowerGroup[] }>('/api/compare/parse', form)
        groups = normalizeGroups(parsed.groups ?? [])
        format = parsed.format || 'pdf'
      } else {
        const parsed = await parseLocalGroups(file)
        groups = normalizeGroups(parsed.groups)
        format = parsed.format
      }
      groups = normalizeGroups(groups)
      const best = pickBestGroup(groups)
      if (!best) throw new Error(`No readable rows in ${file.name}`)
      nextSources.push({
        id: newId('src'),
        fileName: file.name,
        format,
        origin: 'session',
        groups,
        selectedGroups: [best.name],
      })
      labels.push(`${file.name} · ${best.rowCount} rows`)
      added += 1
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`)
    }
  }

  if (added > 0) {
    const officialSelected = firstCustom ? [] : custom.officialSelected
    let next: PowerSession = {
      ...custom,
      sources: nextSources,
      officialSelected,
      charts: firstCustom ? [] : custom.charts,
      visibleCols: firstCustom ? [] : custom.visibleCols,
    }
    const sources = [
      ...(officialLive ? [{ ...officialLive, selectedGroups: officialSelected }] : []),
      ...nextSources,
    ]
    next = { ...next, charts: next.charts.length ? next.charts : autoChartsFor(sources) }
    next = withVisible(next, sources)
    setCustom(next)
  }
  if (added === 0 && errors[0]) throw new Error(errors.join(' · '))
  return { added, labels, errors }
}

export function removePowerSource(id: string) {
  if (id === OFFICIAL_SOURCE_ID) {
    setCustom({ ...custom, officialSelected: [] })
    return
  }
  const sources = custom.sources.filter((s) => s.id !== id)
  if (sources.length === 0) {
    const officialSelected = custom.officialSelected.length ? custom.officialSelected : ['Invoices']
    const live = officialLive ? [{ ...officialLive, selectedGroups: officialSelected }] : []
    setCustom({
      ...empty(),
      officialSelected,
      charts: autoChartsFor(live),
      visibleCols: defaultVisible(workingSet(live).columns),
    })
    return
  }
  const composedList = [
    ...(officialLive ? [{ ...officialLive, selectedGroups: custom.officialSelected }] : []),
    ...sources,
  ]
  setCustom(withVisible({
    ...custom,
    sources,
    charts: custom.charts.filter((c) => workingSet(composedList).columns.includes(c.categoryCol)),
  }, composedList))
}

export function togglePowerGroup(sourceId: string, name: string) {
  if (sourceId === OFFICIAL_SOURCE_ID) {
    const cur = custom.officialSelected
    const on = cur.includes(name)
    setCustom({ ...custom, officialSelected: on ? cur.filter((n) => n !== name) : [...cur, name] })
    return
  }
  setCustom({
    ...custom,
    sources: custom.sources.map((s) => {
      if (s.id !== sourceId) return s
      const cur = s.selectedGroups
      const on = cur.includes(name)
      return { ...s, selectedGroups: on ? cur.filter((n) => n !== name) : [...cur, name] }
    }),
  })
}

export function setPowerVisibleCols(cols: string[]) {
  setCustom({ ...custom, visibleCols: cols.length ? cols : custom.visibleCols })
}

export function togglePowerVisibleCol(col: string) {
  const has = custom.visibleCols.includes(col)
  if (has && custom.visibleCols.length <= 1) return
  setCustom({
    ...custom,
    visibleCols: has ? custom.visibleCols.filter((c) => c !== col) : [...custom.visibleCols, col],
  })
}

export function setPowerSort(key: string | null, dir: 'asc' | 'desc' = custom.sortDir) {
  setCustom({ ...custom, sortKey: key, sortDir: dir })
}

export function setPowerQuery(query: string) {
  setCustom({ ...custom, query })
}

export function addPowerChart(chart: Omit<PowerChart, 'id'>) {
  setCustom({ ...custom, charts: [...custom.charts, { ...chart, id: newId('chart') }] })
}

export function updatePowerChart(id: string, patch: Partial<PowerChart>) {
  setCustom({
    ...custom,
    charts: custom.charts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  })
}

export function removePowerChart(id: string) {
  setCustom({ ...custom, charts: custom.charts.filter((c) => c.id !== id) })
}

export function restoreOfficialRecords() {
  if (!officialLive) return
  const selected = officialLive.selectedGroups
  const sources = [{ ...officialLive, selectedGroups: selected }, ...custom.sources]
  setCustom(withVisible({ ...custom, officialSelected: selected }, sources))
}

export function powerGraphAccept(demo = isDemoMode()): string {
  return acceptList(demo)
}

export function usePowerGraphSession(): PowerSession {
  const [snap, setSnap] = useState<PowerSession>(() => getPowerGraphSession())
  useEffect(() => subscribePowerGraph(() => setSnap({ ...getPowerGraphSession() })), [])
  return snap
}

export { empty as emptyPowerSession, FILE_COL, SHEET_COL, OFFICIAL_SOURCE_ID }
