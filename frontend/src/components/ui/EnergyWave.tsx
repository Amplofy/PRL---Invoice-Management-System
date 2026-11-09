import type { ReactNode } from 'react'

export function MixWave({
  segments,
  onSelect,
}: {
  segments: Array<{ key: string; value: number; color: string; label: string }>
  onSelect?: (key: string) => void
}) {
  const active = segments.filter((s) => s.value > 0)
  const sum = active.reduce((n, s) => n + s.value, 0)
  const label = active.map((s) => s.label).join(', ')

  return (
    <div className="mix-wave" role="img" aria-label={label || 'Expense mix'}>
      {sum <= 0 ? (
        <div className="mix-wave-empty" />
      ) : (
        active.map((seg, i) => (
          <button
            key={seg.key}
            type="button"
            className="mix-wave-seg"
            style={{ flexGrow: seg.value, background: seg.color, ['--i' as string]: String(i), cursor: onSelect ? 'pointer' : 'default' }}
            title={`${seg.label}`}
            onClick={() => onSelect?.(seg.key)}
          />
        ))
      )}
    </div>
  )
}

export function ChartStage({
  children,
  className = '',
}: {
  values?: number[]
  color?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`chart-stage ${className}`}>
      <div className="chart-stage-plot">{children}</div>
    </div>
  )
}
