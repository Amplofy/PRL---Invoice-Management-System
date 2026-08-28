import { type ReactNode } from 'react'

export interface SummaryCardItem {
  label: string
  value: string
  sub?: string
  icon?: ReactNode
  tone?: 'primary' | 'ok' | 'warn' | 'err' | 'purple' | 'neutral'
}

const TONE_BG: Record<NonNullable<SummaryCardItem['tone']>, string> = {
  primary: 'var(--gradient-primary)',
  ok: 'linear-gradient(135deg, var(--accent-3), #0e9f6e)',
  warn: 'linear-gradient(135deg, #f59e0b, #d97706)',
  err: 'linear-gradient(135deg, var(--danger), #b91c1c)',
  purple: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  neutral: 'linear-gradient(135deg, var(--text-muted), var(--text-dim))',
}

/**
 * Row of compact aggregate cards (totals, counts, quantities) above a table.
 */
export default function SummaryCards({ items }: { items: SummaryCardItem[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {items.map((item) => (
        <div key={item.label} className="glass flex items-center gap-3 p-3.5">
          {item.icon && (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: TONE_BG[item.tone ?? 'primary'] }}
            >
              {item.icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {item.label}
            </div>
            <div className="truncate text-lg font-bold leading-tight text-[var(--text)]">{item.value}</div>
            {item.sub && <div className="truncate text-[0.65rem] text-[var(--text-dim)]">{item.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
