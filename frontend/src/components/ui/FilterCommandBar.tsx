import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Search, type LucideIcon } from 'lucide-react'

export interface FilterSuggestion {
  dim: string
  value: string
  label: string
}

export interface FilterDimMeta {
  label: string
  icon: LucideIcon
  color: string
}

interface Props {
  suggestions: FilterSuggestion[]
  dimMeta: Record<string, FilterDimMeta>
  activeKeys: Set<string>
  onToggle: (s: FilterSuggestion) => void
}

const PREVIEW_PER_DIM = 3

export default function FilterCommandBar({ suggestions, dimMeta, activeKeys, onToggle }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (q === '') {
      const byDim = new Map<string, FilterSuggestion[]>()
      for (const s of suggestions) {
        const list = byDim.get(s.dim) ?? []
        if (list.length < PREVIEW_PER_DIM) list.push(s)
        byDim.set(s.dim, list)
      }
      return [...byDim.values()].flat()
    }
    return suggestions.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 14)
  }, [q, suggestions])

  useEffect(() => setActiveIdx(0), [query])

  const syncRect = () => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 8, left: Math.max(8, r.left), width: r.width })
  }

  useEffect(() => {
    if (!open) return
    syncRect()
    const onResize = () => syncRect()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  const choose = (s: FilterSuggestion) => {
    onToggle(s)
    setQuery('')
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filtered.length > 0) setActiveIdx((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filtered.length > 0) setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const s = filtered[activeIdx]
      if (s) choose(s)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, FilterSuggestion[]>()
    for (const s of filtered) {
      const list = map.get(s.dim) ?? []
      list.push(s)
      map.set(s.dim, list)
    }
    return [...map.entries()]
  }, [filtered])

  let flatIdx = -1

  return (
    <div ref={anchorRef} className="relative">
      <div
        className="flex items-center gap-2.5 rounded-xl border bg-[var(--bg)] px-3.5 py-2.5 transition-all focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
        style={{ borderColor: open ? 'var(--accent)' : 'var(--border)' }}
      >
        <Search size={15} className="shrink-0 text-[var(--text-muted)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Add a filter — try a vendor, quarter, cost element or status…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
        />
        {query && (
          <button
            className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="glass-strong fixed z-50 max-h-80 overflow-y-auto rounded-xl p-1.5 shadow-xl"
            style={{ top: rect.top, left: rect.left, width: Math.max(rect.width, 340) }}
          >
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">No matching filter</div>
            )}
            {grouped.map(([dim, items]) => {
              const meta = dimMeta[dim]
              const Icon = meta?.icon
              return (
                <div key={dim} className="mb-1 last:mb-0">
                  <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[0.6rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {meta && <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />}
                    {meta?.label ?? dim}
                  </div>
                  {items.map((s) => {
                    flatIdx += 1
                    const idx = flatIdx
                    const active = activeKeys.has(`${s.dim}:${s.value}`)
                    return (
                      <button
                        key={`${s.dim}:${s.value}`}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm ${
                          idx === activeIdx ? 'bg-[var(--accent-faded,rgba(124,58,237,0.14))]' : 'hover:bg-[var(--bg)]'
                        }`}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => choose(s)}
                      >
                        {Icon && (
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                            style={{ background: `${meta.color}22`, color: meta.color }}
                          >
                            <Icon size={12} />
                          </span>
                        )}
                        <span className="flex-1 truncate">{s.label}</span>
                        {active && <Check size={14} className="text-[var(--accent)]" />}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
