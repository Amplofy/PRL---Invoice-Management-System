import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  FileCheck2,
  Banknote,
  Upload,
  Mail,
  Search,
  FileText,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { useAuth, isAdmin } from '../../lib/auth'

interface CatalogItem {
  id: string
  label: string
  short: string
  hint: string
  icon: typeof Plus
  defaultOn: boolean
  adminOnly?: boolean
}

interface Prefs {
  order: string[]
  enabled: string[]
}

const PREFS_KEY = 'prl-eoms-qa-dock'

const CATALOG: CatalogItem[] = [
  { id: 'new-invoice', label: 'New invoice', short: 'Invoice', hint: 'Open the entry form', icon: Plus, defaultOn: true },
  { id: 'search', label: 'Search', short: 'Search', hint: 'Command palette · Ctrl K', icon: Search, defaultOn: true },
  { id: 'import', label: 'Import', short: 'Import', hint: 'Bulk upload files', icon: Upload, defaultOn: true },
  { id: 'followup', label: 'Follow-up', short: 'Follow-up', hint: 'Chase pending invoices', icon: Mail, defaultOn: true },
  { id: 'decide', label: 'Decide', short: 'Decide', hint: 'Pending approvals', icon: FileCheck2, defaultOn: true },
  { id: 'new-contract', label: 'New contract', short: 'Contract', hint: 'Open the contract form', icon: FileText, defaultOn: false, adminOnly: true },
  { id: 'generate-po', label: 'Generate PO', short: 'PO', hint: 'Create payment orders', icon: Banknote, defaultOn: false },
]

function defaultPrefs(): Prefs {
  return {
    order: CATALOG.map((c) => c.id),
    enabled: CATALOG.filter((c) => c.defaultOn).map((c) => c.id),
  }
}

function readPrefs(): Prefs {
  const fallback = defaultPrefs()
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Prefs>
    const known = new Set(CATALOG.map((c) => c.id))
    const storedOrder = (parsed.order ?? []).filter((id) => known.has(id))
    const order = [...storedOrder, ...fallback.order.filter((id) => !storedOrder.includes(id))]
    const storedEnabled = new Set((parsed.enabled ?? fallback.enabled).filter((id) => known.has(id)))
    for (const item of CATALOG) {
      if (!storedOrder.includes(item.id) && item.defaultOn) storedEnabled.add(item.id)
    }
    return { order, enabled: order.filter((id) => storedEnabled.has(id)) }
  } catch {
    return fallback
  }
}

function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable
  }
}

function openPalette() {
  window.dispatchEvent(new Event('prl:open-palette'))
}

export default function QuickTools() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const rootRef = useRef<HTMLDivElement>(null)
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [customizing, setCustomizing] = useState(false)
  const [open, setOpen] = useState(false)

  const catalog = useMemo(
    () => CATALOG.filter((item) => !item.adminOnly || admin),
    [admin],
  )

  const expand = () => {
    setOpen(true)
  }

  const collapse = () => {
    setOpen(false)
    setCustomizing(false)
  }

  const run = (id: string) => {
    collapse()
    switch (id) {
      case 'new-invoice':
        navigate('/invoices', { state: { newInvoice: true } })
        break
      case 'search':
        openPalette()
        break
      case 'import':
        navigate('/import')
        break
      case 'followup':
        navigate('/followups')
        break
      case 'decide':
        navigate('/approvals')
        break
      case 'new-contract':
        navigate('/contracts', { state: { newContract: true } })
        break
      case 'generate-po':
        navigate('/payment-orders')
        break
      default:
        break
    }
  }

  useEffect(() => {
    writePrefs(prefs)
  }, [prefs])

  useEffect(() => {
    if (!open && !customizing) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        collapse()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, customizing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLElement && (
        e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable
      )
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        if (open) collapse()
        else expand()
        return
      }
      if ((open || customizing) && e.key === 'Escape' && !inField) {
        e.preventDefault()
        collapse()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, customizing])

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog])

  const ordered = prefs.order
    .map((id) => byId.get(id))
    .filter((item): item is CatalogItem => Boolean(item))

  const visible = ordered.filter((item) => prefs.enabled.includes(item.id))
  const enabledSet = useMemo(() => new Set(prefs.enabled), [prefs.enabled])

  const toggle = (id: string) => {
    setPrefs((prev) => {
      const on = prev.enabled.includes(id)
      return {
        ...prev,
        enabled: on ? prev.enabled.filter((x) => x !== id) : [...prev.enabled, id],
      }
    })
  }

  const move = (id: string, dir: -1 | 1) => {
    setPrefs((prev) => {
      const ids = prev.order.filter((x) => byId.has(x))
      const i = ids.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= ids.length) return prev
      const next = [...ids]
      const tmp = next[i]
      next[i] = next[j]
      next[j] = tmp
      return { ...prev, order: next }
    })
  }

  return createPortal(
    <div ref={rootRef} className={`qa-root${open ? ' is-open' : ''}`}>
      {customizing && (
        <div className="qa-panel glass-strong">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-3.5 py-3">
            <div>
              <div className="text-xs font-extrabold tracking-tight">Quick access</div>
              <div className="mt-0.5 text-[0.62rem] text-[var(--text-muted)]">Pick operations and their order.</div>
            </div>
            <button
              type="button"
              className="qa-mini"
              onClick={() => setPrefs(defaultPrefs())}
              title="Reset defaults"
            >
              <RotateCcw size={13} />
            </button>
          </div>
          <ul className="max-h-[min(52vh,22rem)] list-none overflow-y-auto p-1.5">
            {ordered.map((item, i) => {
              const on = enabledSet.has(item.id)
              return (
                <li key={item.id} className="qa-pref">
                  <span className="qa-pref-ico">
                    <item.icon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.72rem] font-bold leading-tight">{item.label}</span>
                    <span className="block truncate text-[0.58rem] text-[var(--text-muted)]">{item.hint}</span>
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      className="qa-mini"
                      disabled={i === 0}
                      onClick={() => move(item.id, -1)}
                      aria-label={`Move ${item.label} up`}
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="qa-mini"
                      disabled={i === ordered.length - 1}
                      onClick={() => move(item.id, 1)}
                      aria-label={`Move ${item.label} down`}
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? 'Hide' : 'Show'} ${item.label}`}
                    className={`qa-switch ${on ? 'is-on' : ''}`}
                    onClick={() => toggle(item.id)}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="qa-stage">
        <ul
          className="qa-chips"
          style={{ ['--qa-n']: visible.length } as CSSProperties}
        >
          {visible.map((item, i) => (
            <li
              key={item.id}
              style={{ ['--qa-d']: visible.length - i } as CSSProperties}
            >
              <button
                type="button"
                className="qa-chip"
                onClick={() => run(item.id)}
                title={item.hint}
                tabIndex={open ? 0 : -1}
              >
                <span className="qa-chip-ico">
                  <item.icon size={14} />
                </span>
                <span className="qa-chip-lab">{item.short}</span>
              </button>
            </li>
          ))}
          <li style={{ ['--qa-d']: 0 } as CSSProperties}>
            <button
              type="button"
              className={`qa-chip qa-chip-gear${customizing ? ' is-on' : ''}`}
              onClick={() => setCustomizing((v) => !v)}
              aria-expanded={customizing}
              aria-haspopup="dialog"
              aria-label="Customize quick access"
              title="Customize tools"
              tabIndex={open ? 0 : -1}
            >
              <SlidersHorizontal size={15} />
            </button>
          </li>
        </ul>
        <button
          type="button"
          className={`qa-trigger${open ? ' is-open' : ''}`}
          onClick={() => {
            if (open) collapse()
            else expand()
          }}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label="Quick access"
          title="Quick access (Ctrl + .)"
        >
          <span className="qa-trigger-ico">{open ? <X size={16} /> : <Sparkles size={16} />}</span>
        </button>
      </div>
    </div>,
    document.body,
  )
}
