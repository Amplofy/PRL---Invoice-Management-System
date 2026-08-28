import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Layers } from 'lucide-react'

export interface GroupByOption {
  key: string
  label: string
}

interface GroupByPickerProps {
  options: GroupByOption[]
  value: string | null
  onChange: (key: string | null) => void
}

/**
 * Lets the user pick a column to group rows by and show subtotals.
 * Portaled popover to escape glass (backdrop-filter) stacking contexts.
 */
export default function GroupByPicker({ options, value, onChange }: GroupByPickerProps) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const activeLabel = value ? (options.find((o) => o.key === value)?.label ?? value) : null

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        className={`btn btn-ghost !px-3 ${value ? 'text-[var(--accent)]' : ''}`}
        onClick={() => {
          setRect(btnRef.current?.getBoundingClientRect() ?? null)
          setOpen((v) => !v)
        }}
        title="Group rows and show subtotals"
      >
        <Layers size={15} />
        <span className="hidden sm:inline">
          {activeLabel ? `Group: ${activeLabel}` : 'Group by'}
        </span>
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="glass-strong pop-in fixed z-50 w-56 rounded-2xl p-3"
              style={{
                top: Math.min((rect?.bottom ?? 0) + 8, window.innerHeight - 160),
                right: Math.max(8, window.innerWidth - (rect?.right ?? 0)),
              }}
            >
              <div className="px-1 pb-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Group by column
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[var(--surface-hover)] ${
                    value === null ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-dim)]'
                  }`}
                >
                  None (flat list)
                </button>
                {options.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => {
                      onChange(o.key)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[var(--surface-hover)] ${
                      value === o.key ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-dim)]'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
