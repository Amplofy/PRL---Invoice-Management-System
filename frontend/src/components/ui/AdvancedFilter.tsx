import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Filter, Plus, X } from 'lucide-react'
import { FILTER_OPS, newFilterId, opNeedsValue, type FilterColumnDef, type FilterState } from '../../lib/filters'

interface AdvancedFilterProps {
  columns: FilterColumnDef[]
  filters: FilterState[]
  onChange: (filters: FilterState[]) => void
}

/**
 * Per-column advanced filtering: pick a column, an operator and a value.
 * Active filters render as removable chips. Portaled popover to escape
 * glass (backdrop-filter) stacking contexts.
 */
export default function AdvancedFilter({ columns, filters, onChange }: AdvancedFilterProps) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [colKey, setColKey] = useState(columns[0]?.key ?? '')
  const [op, setOp] = useState(FILTER_OPS[columns[0]?.type ?? 'text'][0].value)
  const [value, setValue] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)

  const column = columns.find((c) => c.key === colKey) ?? columns[0]

  const openPanel = () => {
    setRect(btnRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  const pickColumn = (key: string) => {
    const col = columns.find((c) => c.key === key)
    setColKey(key)
    if (col) setOp(FILTER_OPS[col.type][0].value)
    setValue('')
  }

  const addFilter = () => {
    if (!column) return
    if (opNeedsValue(op) && value.trim() === '') return
    onChange([...filters, { id: newFilterId(), key: column.key, op, value: value.trim() }])
    setValue('')
    setOpen(false)
  }

  const removeFilter = (id: string) => onChange(filters.filter((f) => f.id !== id))

  const opLabel = (o: string) => FILTER_OPS[column?.type ?? 'text'].find((x) => x.value === o)?.label ?? o

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        ref={btnRef}
        type="button"
        className={`btn btn-ghost !px-3 ${filters.length > 0 ? 'text-[var(--accent)]' : ''}`}
        onClick={() => (open ? setOpen(false) : openPanel())}
        title="Filter by column"
      >
        <Filter size={15} /> Filter
      </button>

      {filters.map((f) => {
        const col = columns.find((c) => c.key === f.key)
        return (
          <span
            key={f.id}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1 pl-3 pr-1.5 text-xs"
          >
            <span className="font-semibold text-[var(--text)]">{col?.label ?? f.key}</span>
            <span className="text-[var(--text-muted)]">{opLabel(f.op)}</span>
            {opNeedsValue(f.op) && (
              <span className="max-w-[10rem] truncate font-semibold text-[var(--accent)]">{f.value}</span>
            )}
            <button
              className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--danger)]"
              onClick={() => removeFilter(f.id)}
              title="Remove filter"
            >
              <X size={11} />
            </button>
          </span>
        )
      })}

      {filters.length > 1 && (
        <button
          className="text-xs font-semibold text-[var(--text-muted)] underline-offset-4 transition hover:text-[var(--danger)] hover:underline"
          onClick={() => onChange([])}
        >
          Clear all
        </button>
      )}

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="glass-strong pop-in fixed z-50 w-64 rounded-2xl p-3"
              style={{
                top: Math.min((rect?.bottom ?? 0) + 8, window.innerHeight - 220),
                right: Math.max(8, window.innerWidth - (rect?.right ?? 0)),
              }}
            >
              <div className="pb-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Add filter
              </div>
              <div className="space-y-2">
                <select className="input" value={colKey} onChange={(e) => pickColumn(e.target.value)} aria-label="Filter column">
                  {columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select className="input" value={op} onChange={(e) => setOp(e.target.value)} aria-label="Filter operator">
                  {FILTER_OPS[column?.type ?? 'text'].map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {opNeedsValue(op) &&
                  (column?.type === 'select' ? (
                    <select className="input" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Filter value">
                      <option value="">Select value…</option>
                      {(column.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      type={column?.type === 'number' ? 'number' : column?.type === 'date' ? 'date' : 'text'}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addFilter()}
                      placeholder="Value…"
                      aria-label="Filter value"
                    />
                  ))}
                <button className="btn btn-primary w-full justify-center" onClick={addFilter} disabled={opNeedsValue(op) && value.trim() === ''}>
                  <Plus size={14} /> Add filter
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
