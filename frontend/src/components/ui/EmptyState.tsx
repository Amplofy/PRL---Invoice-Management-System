import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export default function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]">
        {icon ?? <Inbox size={28} />}
      </div>
      <div className="text-base font-semibold">{title}</div>
      {description && <div className="max-w-sm text-sm text-[var(--text-muted)]">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
