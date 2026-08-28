import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Columns3, RotateCcw } from 'lucide-react'

export interface ColumnDef {
  key: string
  label: string
}

interface ColumnsButtonProps {
  columns: ColumnDef[]
  isVisible: (key: string) => boolean
  onToggle: (key: string) => void
  onReset: () => void
  hiddenCount: number
}

/**
 * Toolbar dropdown that lets the user show/hide table columns.
 * Portaled to document.body with fixed positioning so it escapes the
 * stacking contexts created by glass (backdrop-filter) containers.
 */
export default function ColumnsButton({ columns, isVisible, onToggle, onReset, hiddenCount }: ColumnsButtonProps) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const openPanel = () => {
    setRect(btnRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        className={`btn btn-ghost !px-3 ${open ? 'bg-[var(--surface-hover)]' : ''}`}
        onClick={() => (open ? setOpen(false) : openPanel())}
        title="Show or hide columns"
      >
        <Columns3 size={15} />
        <span className="hidden sm:inline">Columns</span>
        {hiddenCount > 0 && (
          <span
            className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.58rem] font-bold text-white"
            style={{ background: 'var(--gradient-primary)' }}
          >
            {hiddenCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="glass-strong pop-in fixed z-50 w-60 rounded-2xl p-3"
              style={{
                top: Math.min((rect?.bottom ?? 0) + 8, window.innerHeight - 120),
                right: Math.max(8, window.innerWidth - (rect?.right ?? 0)),
                maxHeight: `calc(100dvh - ${(rect?.bottom ?? 0) + 20}px)`,
              }}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Visible columns
                </span>
                <button
                  className="flex items-center gap-1 text-[0.62rem] font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
                  onClick={() => onReset()}
                  title="Restore default columns"
                >
                  <RotateCcw size={10} /> Reset
                </button>
              </div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto">
                {columns.map((c) => {
                  const active = isVisible(c.key)
                  return (
                    <button
                      key={c.key}
                      onClick={() => onToggle(c.key)}
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
                      <span className={active ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-dim)]'}>
                        {c.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
