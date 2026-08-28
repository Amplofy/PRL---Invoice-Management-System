import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, X, CheckCircle2, AlertTriangle, XCircle, Info, CheckCheck, ScrollText } from 'lucide-react'
import { apiGet } from '../../lib/api'
import { subscribeAppEvents, type AppEvent } from '../../lib/notify'
import { timeAgo } from '../../lib/format'

type NotifType = 'ok' | 'warn' | 'err' | 'info'

interface Notification {
  id: string
  type: NotifType
  title: string
  message: string
  to?: string
  at: number
}

const SEEN_KEY = 'prl-eoms-notif-seen'
const MAX_ITEMS = 30

const TYPE_STYLES: Record<NotifType, { grad: string; Icon: typeof Info }> = {
  ok: { grad: 'from-emerald-400 to-teal-500', Icon: CheckCircle2 },
  warn: { grad: 'from-amber-400 to-orange-500', Icon: AlertTriangle },
  err: { grad: 'from-red-400 to-pink-500', Icon: XCircle },
  info: { grad: 'from-blue-400 to-violet-500', Icon: Info },
}

function readSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
  } catch {
    // storage unavailable — unread state stays in memory
  }
}

interface ContractRow {
  id: string
  contract_no: string
  value: number
  end_date: string | null
  vendors: Array<{ name: string | null }> | null
}

interface InvoiceRow {
  id: string
  amount: number
  status: string
  contract_id: string | null
}

interface AuditRow {
  id: string
  timestamp: string
  action: string
  summary: string | null
}

function auditType(action: string): NotifType {
  const a = action.toLowerCase()
  if (a === 'approve' || a === 'create') return 'ok'
  if (a === 'reject' || a === 'delete') return 'err'
  if (a === 'generatepo' || a === 'update' || a === 'import') return 'warn'
  return 'info'
}

export default function Notifications() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [seen, setSeen] = useState<Set<string>>(readSeen)
  const lastAuditTs = useRef<string | null>(null)

  const push = useCallback((n: Notification) => {
    setItems((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, MAX_ITEMS))
  }, [])

  // Session events pushed by app actions
  useEffect(() => {
    return subscribeAppEvents((e: AppEvent) => {
      push({
        id: e.id,
        type: e.type,
        title: e.title,
        message: e.message,
        to: e.to,
        at: e.at,
      })
    })
  }, [push])

  // On mount: computed signals + audit-log baseline; then poll for new entries
  useEffect(() => {
    let alive = true

    const buildSignals = async () => {
      try {
        const [c, i] = await Promise.all([
          apiGet<{ contracts: ContractRow[] }>('/api/contracts'),
          apiGet<{ invoices: InvoiceRow[] }>('/api/invoices'),
        ])
        if (!alive) return
        const signals: Notification[] = []
        const now = Date.now()

        const pending = i.invoices.filter((x) => x.status === 'Pending')
        if (pending.length > 0) {
          signals.push({
            id: 'sig-pending',
            type: 'info',
            title: 'Pending approvals waiting',
            message: `${pending.length} invoice(s) await a decision (Rs ${pending
              .reduce((s, x) => s + Number(x.amount || 0), 0)
              .toLocaleString('en-PK')} total)`,
            to: '/approvals',
            at: now,
          })
        }

        for (const contract of c.contracts) {
          const used = i.invoices
            .filter(
              (x) =>
                x.contract_id === contract.id &&
                (x.status === 'Approved' || x.status === 'Accepted'),
            )
            .reduce((s, x) => s + Number(x.amount || 0), 0)
          const value = Number(contract.value || 0)
          const pct = value > 0 ? (used / value) * 100 : 0
          if (pct > 95) {
            signals.push({
              id: `sig-util-${contract.id}`,
              type: 'warn',
              title: 'Contract near limit',
              message: `${contract.contract_no} is ${pct.toFixed(1)}% utilized`,
              to: '/contracts',
              at: now,
            })
          }
          if (contract.end_date) {
            const days = Math.round((new Date(contract.end_date).getTime() - now) / 86400000)
            if (days >= 0 && days <= 60) {
              signals.push({
                id: `sig-exp-${contract.id}`,
                type: 'warn',
                title: 'Contract expiring soon',
                message: `${contract.contract_no} ends in ${days} day(s)`,
                to: '/contracts',
                at: now,
              })
            }
          }
        }
        setItems(signals)
      } catch {
        // signals are best-effort
      }
    }

    const pollAudit = async (initial = false) => {
      try {
        const d = await apiGet<{ auditLog: AuditRow[] }>('/api/audit-log')
        if (!alive) return
        const newest = d.auditLog[0]?.timestamp ?? null
        if (initial) {
          lastAuditTs.current = newest
          return
        }
        if (newest && lastAuditTs.current && newest > lastAuditTs.current) {
          const fresh = d.auditLog.filter((a) => a.timestamp > (lastAuditTs.current as string))
          for (const a of fresh.slice(0, 5)) {
            push({
              id: `audit-${a.id}`,
              type: auditType(a.action),
              title: a.action.replace(/([a-z])([A-Z])/g, '$1 $2'),
              message: a.summary ?? 'System activity recorded',
              to: '/audit-log',
              at: new Date(a.timestamp).getTime(),
            })
          }
        }
        lastAuditTs.current = newest
      } catch {
        // polling is best-effort
      }
    }

    buildSignals()
    pollAudit(true)
    const t = setInterval(() => pollAudit(), 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [push])

  // Escape closes the panel
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const unreadItems = useMemo(() => items.filter((n) => !seen.has(n.id)), [items, seen])
  const readItems = useMemo(() => items.filter((n) => seen.has(n.id)), [items, seen])
  const unread = unreadItems.length

  // Smart sizing: the panel widens as notifications pile up so entries stay readable
  const panelWidth =
    items.length === 0 ? 'max-w-[360px]' : items.length <= 4 ? 'max-w-lg' : 'max-w-xl'

  const markRead = (n: Notification) => {
    setSeen((prev) => {
      const next = new Set(prev)
      next.add(n.id)
      writeSeen(next)
      return next
    })
    if (n.to) {
      setOpen(false)
      navigate(n.to)
    }
  }

  const markAllRead = () => {
    setSeen((prev) => {
      const next = new Set(prev)
      for (const n of items) next.add(n.id)
      writeSeen(next)
      return next
    })
  }

  return (
    <>
      <button
        className={`btn btn-ghost relative !px-3 ${open ? 'bg-[var(--surface-hover)] text-[var(--accent)]' : ''}`}
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold text-white"
            style={{ background: 'var(--gradient-danger)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <div
        className={`fixed inset-0 z-50 transition ${
          open ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setOpen(false)}
        />
        <aside
          className={`glass-strong !absolute inset-y-0 right-0 flex w-full flex-col !rounded-none transition-transform duration-300 ease-out ${panelWidth} ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: 'var(--gradient-primary)' }}>
                <Bell size={15} />
                {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[0.55rem] font-bold text-white" style={{ background: 'var(--danger)' }}>{unread > 9 ? '9+' : unread}</span>}
              </span>
              <span>
                <span className="block text-sm font-bold leading-none">Notifications</span>
                <span className="mt-1 block text-[0.68rem] text-[var(--text-muted)]">
                  {unread > 0 ? `${unread} unread update${unread > 1 ? 's' : ''}` : 'All caught up'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  className="btn btn-ghost !px-2 !py-1 text-[0.7rem]"
                  onClick={markAllRead}
                  title="Mark all as read"
                >
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
              <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2.5 px-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-[var(--text-muted)]">
                  <BellOff size={22} />
                </span>
                <span className="text-sm font-bold">You're all caught up</span>
                <span className="text-xs leading-relaxed text-[var(--text-muted)]">
                  Approvals, contract limits and system activity will show up here as they happen.
                </span>
              </div>
            ) : (
              <>
                {unreadItems.length > 0 && (
                  <div className="px-1 pb-0.5 pt-1 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--accent)]">
                    New · {unreadItems.length}
                  </div>
                )}
                {unreadItems.map((n) => (
                  <NotifRow key={n.id} n={n} isUnread onOpen={markRead} />
                ))}
                {readItems.length > 0 && (
                  <div className="px-1 pb-0.5 pt-3 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Earlier
                  </div>
                )}
                {readItems.map((n) => (
                  <NotifRow key={n.id} n={n} isUnread={false} onOpen={markRead} />
                ))}
              </>
            )}
          </div>

          <div className="border-t border-[var(--border)] px-5 py-3">
            <button
              className="flex w-full items-center justify-center gap-1.5 text-[0.72rem] font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
              onClick={() => {
                setOpen(false)
                navigate('/audit-log')
              }}
            >
              <ScrollText size={12} /> View full audit trail
            </button>
          </div>
        </aside>
      </div>
    </>
  )
}

function NotifRow({
  n,
  isUnread,
  onOpen,
}: {
  n: Notification
  isUnread: boolean
  onOpen: (n: Notification) => void
}) {
  const { grad, Icon } = TYPE_STYLES[n.type] ?? TYPE_STYLES.info
  return (
    <button
      className={`w-full rounded-xl border p-3.5 text-left transition hover:bg-[var(--surface-hover)] ${
        isUnread
          ? 'border-[var(--glass-border-strong)] bg-[var(--surface-hover)]'
          : 'border-[var(--border)] bg-transparent opacity-60'
      }`}
      onClick={() => onOpen(n)}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white ${grad}`}
        >
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[0.82rem] font-bold">{n.title}</span>
            {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--text-dim)]">{n.message}</span>
          <span className="mt-1.5 block text-[0.66rem] text-[var(--text-muted)]">
            {timeAgo(new Date(n.at).toISOString())}
            {n.to ? ' · click to open' : ''}
          </span>
        </span>
      </div>
    </button>
  )
}
