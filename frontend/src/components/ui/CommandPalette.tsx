import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: ReactNode
  path?: string
  action?: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  items: CommandItem[]
}

export default function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    setQuery('')
    setIndex(0)
  }, [open])

  const filtered = items.filter((i) =>
    i.label.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, filtered.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      }
      if (e.key === 'Enter' && filtered[index]) {
        const item = filtered[index]
        if (item.action) item.action()
        else if (item.path) navigate(item.path)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, index, navigate, onClose])

  if (!open) return null

  // Portal to body: rendered inside the glass header whose backdrop-filter
  // would otherwise become the containing block for this fixed backdrop.
  return createPortal(
    <div
      className="modal-backdrop"
      style={{ alignItems: 'flex-start', paddingTop: '14vh' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-card slide-in-right" style={{ maxWidth: '34rem' }}>
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search size={18} className="shrink-0 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          <span className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[0.65rem] text-[var(--text-muted)]">
            <CornerDownLeft size={11} /> Enter
          </span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              No commands match “{query}”
            </div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onMouseEnter={() => setIndex(i)}
              onClick={() => {
                if (item.action) item.action()
                else if (item.path) navigate(item.path)
                onClose()
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                i === index ? 'bg-[var(--surface-hover)]' : ''
              }`}
            >
              <span className="shrink-0 text-[var(--text-dim)]">{item.icon}</span>
              <span className="flex-1 font-medium">{item.label}</span>
              {item.hint && <span className="text-xs text-[var(--text-muted)]">{item.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
