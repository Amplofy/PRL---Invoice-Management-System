import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight gradient-text md:text-[1.35rem]">{title}</h1>
        {description && <p className="mt-0.5 max-w-2xl text-[0.8rem] leading-snug text-[var(--text-dim)]">{description}</p>}
      </div>
      {actions && <div className="btn-cluster">{actions}</div>}
    </div>
  )
}
