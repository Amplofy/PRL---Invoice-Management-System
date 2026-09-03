export type BadgeTone = 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'purple'

const TONE_MAP: Record<BadgeTone, string> = {
  ok: 'badge-ok',
  warn: 'badge-warn',
  err: 'badge-err',
  info: 'badge-info',
  neutral: 'badge-neutral',
  purple: 'badge-purple',
}

interface StatusBadgeProps {
  tone: BadgeTone
  children: React.ReactNode
  title?: string
}

export function statusTone(status: string | null | undefined): BadgeTone {
  switch ((status ?? '').toLowerCase()) {
    case 'approved':
    case 'approved_paid':
    case 'cleared':
    case 'released':
    case 'payment released':
    case 'completed':
    case 'active':
    case 'sent':
      return 'ok'
    case 'paid':
      return 'purple'
    case 'pending':
    case 'pending_approval':
    case 'draft':
    case 'processing':
    case 'scheduled':
      return 'info'
    case 'rejected':
    case 'overdue':
    case 'expired':
    case 'cancelled':
    case 'failed':
      return 'err'
    case 'submitted':
    case 'follow_up':
    case 'in_progress':
    case 'generated':
    case 'awaiting finance':
      return 'warn'
    default:
      return 'neutral'
  }
}

export default function StatusBadge({ tone, children, title }: StatusBadgeProps) {
  return (
    <span className={`badge ${TONE_MAP[tone]}`} title={title}>
      {children}
    </span>
  )
}
