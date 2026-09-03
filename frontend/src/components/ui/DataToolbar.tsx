import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react'
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
  filterBar?: ReactNode
  children?: ReactNode
}

export default function DataToolbar({ search, filters, sort, onExport, exportLabel, resultsCount, filterBar, children }: DataToolbarProps) {
  return (
    <div className="glass p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {search && (
          <SearchField value={search.value} onChange={search.onChange} placeholder={search.placeholder} />
        )}

        {filters && filters.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {filters.map((f) => (
              <select
                key={f.key}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                aria-label={f.label}
                className="input w-[10.5rem] shrink-0"
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ))}
          </div>
        )}

        <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
          {sort && (
            <div className="flex shrink-0 items-center gap-2">
              <select
                value={sort.value}
                onChange={(e) => sort.onValueChange(e.target.value)}
                aria-label="Sort by"
                className="input w-[9.5rem] shrink-0"
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
                className="sort-dir-btn"
                title={sort.direction === 'asc' ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}
                aria-label={sort.direction === 'asc' ? 'Sort ascending' : 'Sort descending'}
                onClick={() => sort.onDirectionChange(sort.direction === 'asc' ? 'desc' : 'asc')}
                disabled={!sort.value}
              >
                {sort.direction === 'asc' ? <ArrowUp size={15} aria-hidden /> : <ArrowDown size={15} aria-hidden />}
              </button>
            </div>
          )}

          {onExport && (
            <button type="button" className="btn btn-ghost btn-sm shrink-0 whitespace-nowrap" onClick={onExport}>
              <Download size={15} /> {exportLabel ?? 'Export CSV'}
            </button>
          )}

          {resultsCount !== undefined && (
            <div className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-dim)]">
              <span className="font-bold text-[var(--text)]">{resultsCount}</span> shown
            </div>
          )}

          {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
        </div>
      </div>

      {filterBar && <div className="mt-3 border-t border-[var(--border)] pt-3">{filterBar}</div>}
    </div>
  )
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (draft !== value) onChange(draft)
    }, 180)
    return () => window.clearTimeout(id)
  }, [draft, onChange, value])

  return (
    <div className="relative min-w-[200px] flex-1">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        className="input pl-10"
        aria-label="Search"
      />
    </div>
  )
}
