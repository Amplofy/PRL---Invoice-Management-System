import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

export type KpiTone = 'ok' | 'warn' | 'err' | 'info' | 'purple'

interface KpiCardProps {
  label: string
  value: string | number
  icon: ReactNode
  tone?: KpiTone
  trend?: number
  sub?: string
  delay?: number
}

const MAX_TILT = 7

function useCountUp(target: number, active: boolean, duration = 800): string {
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    if (!active || target === 0) {
      setDisplay(target.toLocaleString())
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(target * eased).toLocaleString())
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, duration])

  return display
}

export default function KpiCard({
  label,
  value,
  icon,
  tone = 'info',
  trend,
  sub,
  delay = 0,
}: KpiCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [tilt, setTilt] = useState<{ rx: number; ry: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('in-view')
            setInView(true)
            io.disconnect()
          }
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ rx: -py * MAX_TILT, ry: px * MAX_TILT })
  }, [])

  const onLeave = useCallback(() => setTilt(null), [])

  const hasTrend = trend !== undefined && trend !== 0
  const up = (trend ?? 0) >= 0
  const isNumber = typeof value === 'number' && Number.isFinite(value)
  const animated = useCountUp(isNumber ? value : 0, inView)
  const shown = isNumber ? animated : String(value)

  const transform = tilt
    ? `perspective(900px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg) translateY(-4px)`
    : undefined
  const transition = tilt ? 'transform 0.08s linear' : undefined

  return (
    <div
      ref={ref}
      className={`kpi ${tone} reveal`}
      style={{ ['--d' as string]: `${delay}ms`, transform, transition }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="accent-bar" />
      <div className="flex items-start justify-between">
        <div className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          {label}
        </div>
        <div
          className="kpi-icon h-9 w-9 text-white"
          style={{ background: 'var(--gradient-primary)' }}
        >
          {icon}
        </div>
      </div>
      <div className="mt-2 text-[1.75rem] font-bold leading-tight tracking-tight tabular-nums">{shown}</div>
      <div className="mt-1 flex items-center gap-2">
        {hasTrend && (
          <span
            className="flex items-center gap-1 text-[0.75rem] font-semibold"
            style={{ color: up ? 'var(--accent-3)' : 'var(--danger)' }}
          >
            {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(trend ?? 0)}%
          </span>
        )}
        {sub && <span className="text-[0.75rem] text-[var(--text-muted)]">{sub}</span>}
      </div>
    </div>
  )
}
