import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import Popover from './Popover'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectMenuProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  searchable?: boolean | 'auto'
  className?: string
  'aria-label'?: string
}

export default function SelectMenu({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  invalid = false,
  searchable = 'auto',
  className = '',
  'aria-label': ariaLabel,
}: SelectMenuProps) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)

  const showSearch = searchable === true || (searchable === 'auto' && options.length > 8)
  const selected = options.find((o) => o.value === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [options, query])

  const openMenu = () => {
    if (disabled) return
    setQuery('')
    setRect(btnRef.current?.getBoundingClientRect() ?? null)
    const idx = options.findIndex((o) => o.value === value)
    setActive(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => searchRef.current?.focus(), 20)
    return () => window.clearTimeout(id)
  }, [open, showSearch])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open, filtered])

  const pick = (opt: SelectOption) => {
    if (opt.disabled) return
    onChange(opt.value)
    setOpen(false)
  }

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      openMenu()
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[active]
      if (opt) pick(opt)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(filtered.length - 1)
    }
  }

  const label = selected?.label || placeholder
  const empty = !selected || selected.value === ''

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`input select-trigger ${invalid ? 'invalid' : ''} ${className}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
      >
        <span className={`min-w-0 truncate ${empty ? 'text-[var(--text-muted)]' : ''}`}>{label}</span>
        <ChevronDown size={14} className={`shrink-0 text-[var(--text-muted)] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={rect} width="trigger" maxHeight={320}>
        {showSearch && (
          <div className="menu-search">
            <Search size={13} className="text-[var(--text-muted)]" />
            <input
              ref={searchRef}
              className="menu-search-input"
              value={query}
              placeholder="Search…"
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKey}
            />
          </div>
        )}
        <div ref={listRef} className="menu-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="menu-empty">No matches</div>
          ) : (
            filtered.map((opt, idx) => {
              const isSel = opt.value === value
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  role="option"
                  data-idx={idx}
                  aria-selected={isSel}
                  disabled={opt.disabled}
                  className={`menu-item${isSel ? ' is-selected' : ''}${idx === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => pick(opt)}
                >
                  <span className="min-w-0 truncate">{opt.label}</span>
                  {isSel ? <Check size={13} className="shrink-0 text-[var(--accent)]" /> : null}
                </button>
              )
            })
          )}
        </div>
      </Popover>
    </>
  )
}

export function optionsFromChildren(children: ReactNode): { options: SelectOption[]; placeholder?: string } {
  const options: SelectOption[] = []
  let placeholder: string | undefined
  const walk = (node: ReactNode) => {
    if (node == null || typeof node === 'boolean') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object' || !('props' in node)) return
    const el = node as { type?: unknown; props?: { value?: unknown; children?: ReactNode; disabled?: boolean } }
    if (el.type === 'option') {
      const value = String(el.props?.value ?? '')
      const raw = el.props?.children
      const label = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : value
      if (value === '' && options.length === 0) placeholder = label
      options.push({ value, label, disabled: Boolean(el.props?.disabled) })
      return
    }
    walk(el.props?.children)
  }
  walk(children)
  return { options, placeholder }
}
