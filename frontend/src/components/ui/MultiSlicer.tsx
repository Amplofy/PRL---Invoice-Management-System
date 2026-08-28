import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, SquareDashedMousePointer, X } from 'lucide-react'

interface MultiSlicerProps {
  label: string
  options: Array<{ value: string; label: string }>
  selected: Set<string>
  onChange: (next: Set<string>) => void
}

/**
 * Multi-select dimension slicer: opens a searchable checkbox panel; the
 * trigger shows how many values are selected. Empty selection = no filter.
 * Portaled to escape glass stacking contexts.
 */
export default function MultiSlicer({ label, options, selected, onChange }: MultiSlicerProps) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [query, setQuery] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)

  const count = selected.size
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))

  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setRect(btnRef.current?.getBoundingClientRect() ?? null)
          setOpen((v) => !v)
          setQuery('')
        }}
        className={`btn btn-ghost !px-3 ${count > 0 ? 'border border-[var(--accent)] text-[var(--accent)]' : ''}`}
        title={`Filter by ${label.toLowerCase()}`}
      >
        <SquareDashedMousePointer size={14} />
        <span className="hidden sm:inline">{label}</span>
        {count > 0 && (
          <span
            className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.58rem] font-bold text-white"
            style={{ background: 'var(--gradient-primary)' }}
          >
            {count}
          </span>
        )}
        <ChevronDown size={12} className="opacity-60" />
      </button>

      {count > 0 && (
        <span className="ml-1.5 flex flex-wrap items-center gap-1">
          {options
            .filter((o) => selected.has(o.value))
            .slice(0, 2)
            .map((o) => (
              <span
                key={o.value}
                className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] py-0.5 pl-2 pr-1 text-[0.65rem]"
              >
                <span className="max-w-24 truncate font-semibold text-[var(--text)]">{o.label}</span>
                <button
                  onClick={() => toggle(o.value)}
                  className="text-[var(--text-muted)] transition hover:text-[var(--danger)]"
                  title={`Remove ${o.label}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          {count > 2 && (
            <button
              onClick={() => onChange(new Set())}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--text-muted)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
              title="Clear selection"
            >
              +{count - 2}
            </button>
          )}
        </span>
      )}

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="glass-strong pop-in fixed z-50 w-64 rounded-2xl p-3"
              style={{
                top: Math.min((rect?.bottom ?? 0) + 8, window.innerHeight - 300),
                right: Math.max(8, window.innerWidth - (rect?.right ?? 0) - 40),
              }}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {label} · {count > 0 ? `${count} selected` : 'all'}
                </span>
                <button
                  className="text-[0.62rem] font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
                  onClick={() => onChange(new Set())}
                >
                  Clear
                </button>
              </div>
              <input
                className="input mb-2"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
              />
              <div className="max-h-56 space-y-0.5 overflow-y-auto">
                {filtered.map((o) => {
                  const active = selected.has(o.value)
                  return (
                    <button
                      key={o.value}
                      onClick={() => toggle(o.value)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[var(--surface-hover)]"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                          active ? 'border-transparent text-white' : 'border-[var(--border)]'
                        }`}
                        style={active ? { background: 'var(--gradient-primary)' } : undefined}
                      >
                        {active && <Check size={11} />}
                      </span>
                      <span className={`truncate ${active ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
                        {o.label}
                      </span>
                    </button>
                  )
                })}
                {filtered.length === 0 && (
                  <div className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">No matches</div>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
