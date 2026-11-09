import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload,
  Sparkles,
  Trash2,
  FileSpreadsheet,
  X,
  Plus,
  Search,
  ArrowUpDown,
  Columns3,
  Download,
  Database,
  ArrowLeft,
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Doughnut, Line, Pie } from 'react-chartjs-2'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import ActionMenu from '../components/ui/ActionMenu'
import AdvancedFilter from '../components/ui/AdvancedFilter'
import { Field, Select } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import { apiGet } from '../lib/api'
import { isDemoMode } from '../lib/supabase'
import { invoiceListPath } from '../lib/invoiceWindow'
import { useLiveDomain } from '../lib/store'
import { useThemeColors } from '../lib/themeColors'
import { barDataset, chartMotion, doughnutSlice, gradientBarFill, reportBarCrown, tooltipMotion, waveLine } from '../lib/chartWave'
import { applyFilters, type FilterLogic, type FilterState } from '../lib/filters'
import { downloadCSV, sortRows, type SortDirection } from '../lib/export'
import { downloadAnalysisWorkbook, type AnalysisColumn } from '../lib/analysisWorkbook'
import { parseNumberLoose } from '../lib/deltaEngine'
import {
  addPowerChart,
  clearPowerGraphSession,
  ingestPowerGraphFiles,
  powerGraphAccept,
  removePowerChart,
  removePowerSource,
  restoreOfficialRecords,
  setOfficialRecords,
  setPowerQuery,
  setPowerSort,
  setPowerVisibleCols,
  togglePowerGroup,
  togglePowerVisibleCol,
  updatePowerChart,
  usePowerGraphSession,
} from '../lib/powerGraphSession'
import {
  FILE_COL,
  OFFICIAL_SOURCE_ID,
  POWER_TABLE_CAP,
  SHEET_COL,
  aggregateSeries,
  cellKind,
  displayCell,
  filterColumnsFor,
  formatHint,
  kindOf,
  moneyLike,
  profileWorking,
  workingSet,
  type AggFn,
  type ChartKind,
  type PowerChart,
} from '../lib/powerGraphEngine'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, reportBarCrown)

const CHART_TYPES: Array<{ value: ChartKind; label: string }> = [
  { value: 'bar', label: 'Column' },
  { value: 'hbar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'doughnut', label: 'Doughnut' },
  { value: 'pie', label: 'Pie' },
]

const AGGS: Array<{ value: AggFn; label: string }> = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
]

function palette(c: { accent: string; accent2: string; accent3: string; accent4: string; ok: string; warn: string }) {
  return [c.accent, c.accent2, c.accent3, c.accent4, c.ok, c.warn, '#60a5fa', '#c084fc']
}

export default function PowerGraphPage({ onExit }: { onExit?: () => void }) {
  const session = usePowerGraphSession()
  const toast = useToast()
  const colors = useThemeColors()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [filters, setFilters] = useState<FilterState[]>([])
  const [logic, setLogic] = useState<FilterLogic>('and')
  const [showCols, setShowCols] = useState(false)
  const [loadingOfficial, setLoadingOfficial] = useState(true)
  const demo = isDemoMode()
  const [, liveVersion] = useLiveDomain(['invoices', 'contracts'])

  useEffect(() => {
    let cancelled = false
    setLoadingOfficial(true)
    Promise.all([
      apiGet<{ invoices: Record<string, unknown>[] }>(invoiceListPath({ limit: 5000 })),
      apiGet<{ contracts: Record<string, unknown>[] }>('/api/contracts'),
    ])
      .then(([inv, con]) => {
        if (cancelled) return
        setOfficialRecords(inv.invoices ?? [], con.contracts ?? [])
      })
      .catch((e) => {
        if (!cancelled) toast.error('Could not load official records', (e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoadingOfficial(false)
      })
    return () => {
      cancelled = true
    }
  }, [liveVersion, toast])

  const { rows, columns } = useMemo(() => workingSet(session.sources), [session.sources])
  const profile = useMemo(() => profileWorking(rows, columns), [rows, columns])
  const filterCols = useMemo(() => filterColumnsFor(profile, columns, rows), [profile, columns, rows])
  const catCols = useMemo(
    () => columns.filter((c) => kindOf(profile, c) !== 'number' || c === FILE_COL || c === SHEET_COL),
    [columns, profile],
  )
  const numCols = useMemo(() => columns.filter((c) => kindOf(profile, c) === 'number'), [columns, profile])
  const visible = session.visibleCols.filter((c) => columns.includes(c))
  const shown = visible.length ? visible : columns.slice(0, 8)

  const filtered = useMemo(() => {
    let next = applyFilters(rows, filters, filterCols, (row, key) => {
      const raw = row[key]
      if (raw == null || String(raw).trim() === '') return null
      if (kindOf(profile, key) === 'number') return parseNumberLoose(raw)
      return String(raw)
    }, logic)
    const q = session.query.trim().toLowerCase()
    if (q) {
      next = next.filter((row) =>
        shown.some((col) => String(row[col] ?? '').toLowerCase().includes(q)),
      )
    }
    return next
  }, [rows, filters, filterCols, profile, logic, session.query, shown])

  const sorted = useMemo(() => {
    return sortRows(filtered, session.sortKey, session.sortDir as SortDirection, (row, key) => {
      const raw = row[key]
      if (kindOf(profile, key) === 'number') return parseNumberLoose(raw)
      if (raw == null) return null
      return String(raw)
    })
  }, [filtered, session.sortKey, session.sortDir, profile])

  const tableRows = sorted.slice(0, POWER_TABLE_CAP)

  const takeFiles = useCallback(
    async (list: FileList | File[]) => {
      const files = Array.from(list).filter(Boolean)
      if (files.length === 0) return
      setBusy(true)
      try {
        const { added, labels, errors } = await ingestPowerGraphFiles(files)
        if (added > 0) toast.success(added === 1 ? 'File loaded' : `${added} files loaded`, labels.join(' · '))
        if (errors.length) toast.warning('Some files skipped', errors.join(' · '))
      } catch (e) {
        toast.error('Could not read file', (e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )

  const exportRows = useMemo(() => {
    return sorted.map((row) => {
      const obj: Record<string, unknown> = {}
      for (const col of shown) obj[col] = row[col] ?? ''
      return obj
    })
  }, [sorted, shown])

  const analysisColumns = useMemo<AnalysisColumn[]>(
    () =>
      shown.map((key) => ({
        key,
        header: key === FILE_COL ? 'File' : key === SHEET_COL ? 'Sheet' : key,
        kind: cellKind(profile.columns.find((c) => c.name === key), key),
        width: Math.min(36, Math.max(12, key.length + 4)),
      })),
    [shown, profile],
  )

  const exportExcel = async (ext: 'xlsx' | 'xlsm') => {
    if (exportRows.length === 0) {
      toast.warning('Nothing to export', 'Load a file first.')
      return
    }
    const chartSheets = session.charts.map((chart) => {
      const series = aggregateSeries(
        filtered,
        chart.categoryCol,
        chart.valueCol,
        chart.agg,
        chart.topN,
        kindOf(profile, chart.categoryCol),
      )
      return {
        name: chart.title.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Chart',
        title: chart.title,
        columns: [
          { key: 'label', header: chart.categoryCol, kind: 'text' as const, width: 28 },
          { key: 'value', header: chart.valueCol ?? 'Count', kind: moneyLike(chart.valueCol ?? '') ? 'money' as const : 'n' as const, width: 16 },
        ],
        rows: series.map((p) => ({ label: p.label, value: p.value })),
        grandTotal: true,
        chart: {
          type: chart.type === 'line' ? 'line' as const : chart.type === 'pie' || chart.type === 'doughnut' ? 'pie' as const : 'col' as const,
          title: chart.title,
          categoryKey: 'label',
          valueKey: 'value',
        },
      }
    })
    await downloadAnalysisWorkbook(
      `power-graph.${ext}`,
      [
        {
          name: 'Data',
          title: 'Power Graph',
          subtitle: 'Official records plus session overlay — not written back',
          columns: analysisColumns,
          rows: exportRows,
          grandTotal: analysisColumns.some((c) => c.kind === 'money' || c.kind === 'n'),
        },
        ...chartSheets,
      ],
      { title: 'Power Graph', subtitle: `${exportRows.length} rows · official + session overlay` },
    )
  }

  const exportPdf = () => {
    if (exportRows.length === 0) {
      toast.warning('Nothing to export', 'Load a file first.')
      return
    }
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      toast.error('Pop-up blocked', 'Allow pop-ups to export PDF.')
      return
    }
    const heads = shown.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = tableRows
      .map((row) => `<tr>${shown.map((c) => `<td>${escapeHtml(displayCell(row[c], kindOf(profile, c), c))}</td>`).join('')}</tr>`)
      .join('')
    const charts = session.charts
      .map((chart) => {
        const series = aggregateSeries(filtered, chart.categoryCol, chart.valueCol, chart.agg, chart.topN, kindOf(profile, chart.categoryCol))
        const items = series.map((p) => `<li>${escapeHtml(p.label)} — ${p.value}</li>`).join('')
        return `<h2>${escapeHtml(chart.title)}</h2><ul>${items}</ul>`
      })
      .join('')
    w.document.write(`<!doctype html><html><head><title>Power Graph</title>
      <style>body{font:13px/1.4 system-ui,sans-serif;padding:24px;color:#122} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccd;padding:6px 8px;text-align:left} th{background:#eef3f8}</style>
      </head><body><h1>Power Graph</h1><p>${exportRows.length} rows · official + session overlay · ${new Date().toISOString().slice(0, 10)}</p>
      ${charts}<h2>Data</h2><table><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }

  const addChart = () => {
    const categoryCol = catCols[0] ?? columns[0]
    const valueCol = numCols[0] ?? null
    if (!categoryCol) return
    addPowerChart({
      title: valueCol ? `${valueCol} by ${categoryCol}` : `Count by ${categoryCol}`,
      type: 'bar',
      categoryCol,
      valueCol,
      agg: valueCol ? 'sum' : 'count',
      topN: 12,
    })
  }

  const toggleSort = (key: string) => {
    if (session.sortKey === key) setPowerSort(key, session.sortDir === 'asc' ? 'desc' : 'asc')
    else setPowerSort(key, kindOf(profile, key) === 'number' ? 'desc' : 'asc')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Power Graph"
        description="Official invoices and contracts load by default. Custom files overlay this view for the current session and are wiped on sign-out. Official records are never written."
        actions={
          <>
            {onExit ? (
              <Button variant="ghost" size="sm" onClick={onExit}>
                <ArrowLeft size={14} /> Exit
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload size={14} /> {busy ? 'Reading…' : 'Import file'}
            </Button>
            <ActionMenu
              label="Actions"
              icon={<Download size={14} />}
              items={[
                { key: 'csv', label: 'Export CSV', onSelect: () => downloadCSV('power-graph.csv', exportRows), disabled: exportRows.length === 0 },
                { key: 'xlsx', label: 'Export Excel', onSelect: () => { void exportExcel('xlsx') }, disabled: exportRows.length === 0 },
                { key: 'xlsm', label: 'Export XLSM', onSelect: () => { void exportExcel('xlsm') }, disabled: exportRows.length === 0 },
                { key: 'pdf', label: 'Export PDF', onSelect: exportPdf, disabled: exportRows.length === 0 },
                { key: 'wipe', label: 'Clear custom files', onSelect: () => { clearPowerGraphSession(); setFilters([]) } },
                { key: 'official', label: 'Show official records', onSelect: restoreOfficialRecords },
              ]}
            />
          </>
        }
      />

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={powerGraphAccept(demo)}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void takeFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {loadingOfficial && session.sources.length === 0 ? (
        <GlassCard className="power-graph p-8">
          <EmptyState icon={<Sparkles size={28} />} title="Loading official records" description="Invoices and contracts will appear here." />
        </GlassCard>
      ) : session.sources.length === 0 ? (
        <GlassCard
          className={`power-graph p-8 ${over ? 'ring-2 ring-[var(--accent)]' : ''}`}
          hoverable
        >
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              if (e.dataTransfer.files?.length) void takeFiles(e.dataTransfer.files)
            }}
          >
            <EmptyState
              icon={<Sparkles size={28} />}
              title="No official rows yet"
              description={`${formatHint(demo)}. Import a custom file to analyse in this session.`}
              action={
                <Button onClick={() => inputRef.current?.click()} disabled={busy}>
                  <Upload size={16} /> Choose files
                </Button>
              }
            />
          </div>
        </GlassCard>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-3"
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              if (e.dataTransfer.files?.length) void takeFiles(e.dataTransfer.files)
            }}
          >
            {session.sources.map((src) => {
              const official = src.origin === 'official' || src.id === OFFICIAL_SOURCE_ID
              return (
              <GlassCard key={src.id} className={`power-graph min-w-[240px] flex-1 p-4 ${over ? 'ring-2 ring-[var(--accent)]' : ''}`}>
                <div className="flex items-start gap-2">
                  {official ? <Database size={16} className="mt-0.5 text-[var(--accent)]" /> : <FileSpreadsheet size={16} className="mt-0.5 text-[var(--accent)]" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{src.fileName}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {official ? 'Live database · read only' : `Session file · ${src.format.toUpperCase()}`}
                      {' · '}{src.groups.length} table{src.groups.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  {official ? null : (
                    <button type="button" className="rounded-md p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]" onClick={() => removePowerSource(src.id)} aria-label={`Remove ${src.fileName}`}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {src.groups.map((g) => {
                    const on = src.selectedGroups.includes(g.name)
                    return (
                      <button
                        key={g.name}
                        type="button"
                        className={`chip ${on ? 'active' : ''}`}
                        disabled={g.rows.length === 0}
                        onClick={() => togglePowerGroup(src.id, g.name)}
                      >
                        {g.name} · {g.rowCount}
                      </button>
                    )
                  })}
                </div>
              </GlassCard>
              )
            })}
            <button
              type="button"
              className="glass flex min-h-[96px] min-w-[160px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[var(--border)] px-4 text-sm font-semibold text-[var(--text-dim)]"
              onClick={() => inputRef.current?.click()}
            >
              <Plus size={16} /> Overlay file
            </button>
          </div>

          <GlassCard className="power-graph pg-chart-board p-0!">
            <div className="pg-chart-board-head">
              <div className="section-title" style={{ marginBottom: 0 }}>Charts</div>
              <Button variant="ghost" size="sm" onClick={addChart} disabled={columns.length === 0}>
                <Plus size={14} /> Chart
              </Button>
            </div>
            {session.charts.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No charts yet" description="Add a chart or import a file to auto-suggest views." action={<Button variant="ghost" onClick={addChart}><Plus size={14} /> Add chart</Button>} />
              </div>
            ) : (
              <div className={`pg-chart-board-grid${session.charts.length > 1 ? ' is-split' : ''}`}>
                {session.charts.map((chart) => (
                  <ChartCard
                    key={chart.id}
                    chart={chart}
                    rows={filtered}
                    catCols={catCols.length ? catCols : columns}
                    numCols={numCols}
                    profileKind={(col) => kindOf(profile, col)}
                    colors={colors}
                    onChange={(patch) => updatePowerChart(chart.id, patch)}
                    onRemove={() => removePowerChart(chart.id)}
                  />
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard className="power-graph overflow-hidden p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  className="input pl-9!"
                  value={session.query}
                  placeholder="Search visible columns"
                  onChange={(e) => setPowerQuery(e.target.value)}
                />
              </div>
              <AdvancedFilter columns={filterCols} filters={filters} onChange={setFilters} logic={logic} onLogicChange={setLogic} />
              <ActionMenu
                label="Sort"
                icon={<ArrowUpDown size={14} />}
                activeKey={session.sortKey ?? undefined}
                items={shown.map((col) => ({
                  key: col,
                  label: session.sortKey === col ? `${col} · ${session.sortDir}` : col,
                  onSelect: () => toggleSort(col),
                }))}
              />
              <Button variant="ghost" size="sm" onClick={() => setShowCols((v) => !v)} aria-expanded={showCols}>
                <Columns3 size={14} /> Columns
              </Button>
              <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
                {sorted.length} row{sorted.length === 1 ? '' : 's'}
                {sorted.length > POWER_TABLE_CAP ? ` · showing ${POWER_TABLE_CAP}` : ''}
              </span>
            </div>

            {showCols && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {columns.map((col) => (
                  <button
                    key={col}
                    type="button"
                    className={`chip ${shown.includes(col) ? 'active' : ''}`}
                    onClick={() => {
                      if (session.visibleCols.length === 0) setPowerVisibleCols(shown)
                      togglePowerVisibleCol(col)
                    }}
                  >
                    {col}
                  </button>
                ))}
              </div>
            )}

            {tableRows.length === 0 ? (
              <EmptyState title="No rows in view" description="Adjust filters or import another file." />
            ) : (
              <div className="table-scroll scroll-y max-h-[28rem]">
                <table className="data-table">
                  <thead>
                    <tr>
                      {shown.map((col) => (
                        <th key={col} data-col={col}>
                          <button type="button" className="th-sort" onClick={() => toggleSort(col)}>
                            {col === FILE_COL ? 'File' : col === SHEET_COL ? 'Sheet' : col}
                            {session.sortKey === col ? (session.sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, i) => (
                      <tr key={i}>
                        {shown.map((col) => (
                          <td key={col} data-col={col} className={kindOf(profile, col) === 'text' && String(row[col] ?? '').length > 48 ? 'cell-wrap' : ''}>
                            {displayCell(row[col], kindOf(profile, col), col)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  )
}

function ChartCard({
  chart,
  rows,
  catCols,
  numCols,
  profileKind,
  colors,
  onChange,
  onRemove,
}: {
  chart: PowerChart
  rows: Record<string, unknown>[]
  catCols: string[]
  numCols: string[]
  profileKind: (col: string) => 'number' | 'date' | 'text'
  colors: ReturnType<typeof useThemeColors>
  onChange: (patch: Partial<PowerChart>) => void
  onRemove: () => void
}) {
  const series = useMemo(
    () => aggregateSeries(rows, chart.categoryCol, chart.valueCol, chart.agg, chart.topN, profileKind(chart.categoryCol)),
    [rows, chart, profileKind],
  )
  const swatch = palette(colors)
  const values = series.map((p) => p.value)
  const labels = series.map((p) => p.label)
  const fills = labels.map((_, i) => swatch[i % swatch.length])
  return (
    <div className="pg-chart-pane">
      <div className="mb-3 flex items-start justify-between gap-2">
        <input
          className="input min-w-0 flex-1 font-semibold"
          value={chart.title}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-label="Chart title"
        />
        <button type="button" className="shrink-0 rounded-md p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]" onClick={onRemove} aria-label="Remove chart">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Type">
          <Select value={chart.type} onChange={(e) => onChange({ type: e.target.value as ChartKind })}>
            {CHART_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={chart.categoryCol} onChange={(e) => onChange({ categoryCol: e.target.value })}>
            {catCols.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Value">
          <Select value={chart.valueCol ?? ''} onChange={(e) => onChange({ valueCol: e.target.value || null, agg: e.target.value ? chart.agg : 'count' })}>
            <option value="">Row count</option>
            {numCols.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Agg">
          <Select value={chart.agg} onChange={(e) => onChange({ agg: e.target.value as AggFn })}>
            {AGGS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Top N">
          <input type="number" min={0} max={40} className="input" value={chart.topN} onChange={(e) => onChange({ topN: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      </div>
      {series.length === 0 ? (
        <EmptyState title="No series" description="Pick a category with values in the current filter." />
      ) : (
        <div className={`pg-chart-plot${chart.type === 'pie' || chart.type === 'doughnut' ? ' is-round' : ''}`}>
          {chart.type === 'line' ? (
            <Line
              data={{ labels, datasets: [{ label: chart.title, data: values, ...waveLine(colors.accent) }] }}
              options={chartOptions(colors, chart.type)}
            />
          ) : chart.type === 'doughnut' ? (
            <Doughnut data={{ labels, datasets: [{ data: values, backgroundColor: fills, ...doughnutSlice() }] }} options={chartOptions(colors, chart.type)} />
          ) : chart.type === 'pie' ? (
            <Pie data={{ labels, datasets: [{ data: values, backgroundColor: fills, ...doughnutSlice() }] }} options={chartOptions(colors, chart.type)} />
          ) : (
            <Bar
              data={{
                labels,
                datasets: [{
                  label: chart.title,
                  data: values,
                  backgroundColor: gradientBarFill(colors.accent),
                  ...barDataset(),
                  maxBarThickness: chart.type === 'hbar' ? 22 : 48,
                }],
              }}
              options={{
                ...chartOptions(colors, chart.type),
                indexAxis: chart.type === 'hbar' ? 'y' : 'x',
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function chartOptions(c: ReturnType<typeof useThemeColors>, type: ChartKind) {
  const round = type === 'pie' || type === 'doughnut'
  const hbar = type === 'hbar'
  const motion = type === 'line' ? 'line' : round ? 'doughnut' : 'bar'
  return {
    responsive: true,
    maintainAspectRatio: false,
    clip: false as const,
    layout: { padding: { top: 10, right: 8, bottom: 4, left: 4 } },
    ...chartMotion(motion),
    plugins: {
      legend: {
        display: round,
        position: 'bottom' as const,
        labels: { color: c.ticks, boxWidth: 10, padding: 12, font: { size: 11 } },
      },
      tooltip: { ...tooltipMotion() },
    },
    scales: round
      ? undefined
      : {
          x: {
            grid: { display: false },
            ticks: {
              color: c.ticks,
              autoSkip: true,
              maxRotation: hbar ? 0 : 40,
              minRotation: 0,
              font: { size: 11 },
            },
          },
          y: {
            beginAtZero: true,
            grace: '10%',
            grid: { color: c.grid },
            ticks: {
              color: c.ticks,
              autoSkip: true,
              font: { size: 11 },
              callback: (value: string | number) => {
                const n = Number(value)
                if (!Number.isFinite(n)) return value
                if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
                if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
                return n
              },
            },
          },
        },
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}
