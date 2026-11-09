import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface ActionMenuItem {
  key: string
  label: string
  onSelect: () => void
  disabled?: boolean
}

export default function ActionMenu({
  label,
  icon,
  items,
  activeKey,
  title,
}: {
  label: string
  icon?: ReactNode
  items: ActionMenuItem[]
  activeKey?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  if (items.length === 0) return null

  const openPanel = () => {
    setRect(btnRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        className={`btn btn-ghost btn-sm ${open || activeKey ? 'text-[var(--accent)]' : ''}`}
        onClick={() => (open ? setOpen(false) : openPanel())}
        title={title ?? label}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown size={12} />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="glass-strong pop-in fixed z-50 w-52 rounded-2xl p-2"
              style={{
                top: Math.min((rect?.bottom ?? 0) + 8, window.innerHeight - 120),
                right: Math.max(8, window.innerWidth - (rect?.right ?? 0)),
              }}
            >
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = activeKey === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => {
                        if (item.disabled) return
                        item.onSelect()
                        setOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[var(--surface-hover)] ${
                        active ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-dim)]'
                      }`}
                    >
                      <span>{item.label}</span>
                      {active ? <Check size={12} /> : null}
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
