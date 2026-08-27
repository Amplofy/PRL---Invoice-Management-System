import { type ReactNode } from 'react'
import { ArrowDownWideNarrow, ArrowUpDown, Download, Search } from 'lucide-react'
import { type SortDirection } from '../../lib/export'

export interface FilterDef {
  key: string
  label: string
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
}

export interface SortDef {
  columns: Array<{ key: string; label: string }>
  value: string
  direction: SortDirection
  onValueChange: (v: string) => void
  onDirectionChange: (d: SortDirection) => void
}

interface DataToolbarProps {
  search?: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
  }
  filters?: FilterDef[]
  sort?: SortDef
  onExport?: () => void
  exportLabel?: string
  resultsCount?: number
  children?: ReactNode
}

export default function DataToolbar({ search, filters, sort, onExport, exportLabel, resultsCount, children }: DataToolbarProps) {
  return (
    <div className="glass p-4">
      <div className="flex flex-wrap items-center gap-3">
        {search && (
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? 'Search…'}
              className="input pl-10"
            />
          </div>
        )}

        {filters?.map((f) => (
          <select
            key={f.key}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            aria-label={f.label}
            className="input min-w-[150px] flex-1 sm:flex-none"
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}

        {sort && (
          <div className="flex items-center gap-1.5">
            <select
              value={sort.value}
              onChange={(e) => sort.onValueChange(e.target.value)}
              aria-label="Sort by"
              className="input min-w-[130px] flex-1 sm:flex-none"
            >
              <option value="">No sort</option>
              {sort.columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost !px-2.5"
              title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
              onClick={() => sort.onDirectionChange(sort.direction === 'asc' ? 'desc' : 'asc')}
              disabled={!sort.value}
            >
              {sort.direction === 'asc' ? <ArrowDownWideNarrow size={15} /> : <ArrowUpDown size={15} />}
            </button>
          </div>
        )}

        {onExport && (
          <button type="button" className="btn btn-ghost !px-3" onClick={onExport}>
            <Download size={15} /> {exportLabel ?? 'Export CSV'}
          </button>
        )}

        {resultsCount !== undefined && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-dim)]">
            <span className="font-bold text-[var(--text)]">{resultsCount}</span> shown
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
