import type { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  strong?: boolean
  hoverable?: boolean
  ring?: boolean
}

export default function GlassCard({
  children,
  className = '',
  strong = false,
  hoverable = false,
  ring = false,
}: GlassCardProps) {
  const cls = [
    strong ? 'glass-strong' : 'glass',
    hoverable ? 'glass-hover' : '',
    ring ? 'ring-card' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return <div className={cls}>{children}</div>
}
