import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatMoney } from '../../lib/format'

type Point = { x: number; y: number; v: number; i: number }

function axisRs(n: number) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m >= 10 || n % 1_000_000 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (n >= 1_000) {
    const k = n / 1_000
    return `${n >= 10_000 || n % 1_000 === 0 ? k.toFixed(0) : k.toFixed(1)}k`
  }
  return String(Math.round(n))
}

function shortLabel(label: string) {
  return label.split(/\s+/)[0] ?? label
}

function monotoneLine(pts: Array<{ x: number; y: number }>) {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  const n = pts.length
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x
    const dy = pts[i + 1].y - pts[i].y
    m[i] = dy / (dx[i] || 1e-6)
  }
  const t = Array<number>(n)
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-8) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i]
    const b = t[i + 1] / m[i]
    const s = a * a + b * b
    if (s > 9) {
      const f = 3 / Math.sqrt(s)
      t[i] = f * a * m[i]
      t[i + 1] = f * b * m[i]
    }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i].x + dx[i] / 3
    const y1 = pts[i].y + (t[i] * dx[i]) / 3
    const x2 = pts[i + 1].x - dx[i] / 3
    const y2 = pts[i + 1].y - (t[i + 1] * dx[i]) / 3
    d += ` C ${x1} ${y1}, ${x2} ${y2}, ${pts[i + 1].x} ${pts[i + 1].y}`
  }
  return d
}

export function InvoiceValueChart({
  labels,
  values,
  counts,
  color,
  onSelect,
}: {
  labels: string[]
  values: number[]
  counts?: number[]
  color: string
  onSelect?: (index: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const uid = useId().replace(/:/g, '')
  const [size, setSize] = useState({ w: 640, h: 280 })
  const [hover, setHover] = useState<number | null>(null)
  const [pathLen, setPathLen] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const apply = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(280, Math.round(r.width)), h: Math.max(220, Math.round(r.height)) })
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pad = { l: 46, r: 18, t: 20, b: 30 }
  const innerW = Math.max(1, size.w - pad.l - pad.r)
  const innerH = Math.max(1, size.h - pad.t - pad.b)
  const max = Math.max(1, ...values)
  const n = values.length

  const points = useMemo<Point[]>(() => {
    if (n === 0) return []
    return values.map((v, i) => ({
      x: pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW),
      y: pad.t + innerH - (v / max) * innerH,
      v,
      i,
    }))
  }, [values, n, innerW, innerH, pad.l, pad.t, max])

  const line = useMemo(() => monotoneLine(points), [points])
  const area = useMemo(() => {
    if (points.length === 0) return ''
    const last = points[points.length - 1]
    const first = points[0]
    const base = pad.t + innerH
    return `${line} L ${last.x} ${base} L ${first.x} ${base} Z`
  }, [line, points, pad.t, innerH])

  useEffect(() => {
    const p = pathRef.current
    if (!p) return
    setPathLen(p.getTotalLength())
  }, [line, size.w, size.h])

  const peak = useMemo(() => {
    let idx = 0
    for (let i = 1; i < values.length; i++) if (values[i] > values[idx]) idx = i
    return idx
  }, [values])

  const lastLive = n > 0 ? n - 1 : 0
  const active = hover ?? lastLive
  const activePt = points[active]
  const ticks = [0, 0.5, 1]
  const yTicks = ticks.map((t) => ({ t, y: pad.t + innerH * (1 - t), v: max * t }))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const dir = e.key === 'ArrowRight' ? 1 : -1
      setHover((cur) => {
        const base = cur ?? lastLive
        return Math.max(0, Math.min(n - 1, base + dir))
      })
    }
    if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
      e.preventDefault()
      onSelect(active)
    }
  }

  if (n === 0) return null

  const chipLeft = activePt ? Math.min(size.w - 128, Math.max(8, activePt.x - 64)) : 8
  const chipTop = activePt ? Math.max(4, activePt.y - 62) : 4
  const count = counts?.[active] ?? 0

  return (
    <div
      ref={wrapRef}
      className={`ivc${pathLen > 0 ? ' is-ready' : ''}`}
      tabIndex={0}
      role="img"
      aria-label="Monthly invoice value. Arrow keys move, Enter opens invoices."
      onKeyDown={onKeyDown}
      onMouseLeave={() => setHover(null)}
    >
      <svg className="ivc-svg" viewBox={`0 0 ${size.w} ${size.h}`}>
        <defs>
          <linearGradient id={`ivc-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick.t}>
            <line className="ivc-grid" x1={pad.l} x2={size.w - pad.r} y1={tick.y} y2={tick.y} />
            <text className="ivc-axis" x={pad.l - 8} y={tick.y + 3} textAnchor="end">
              {axisRs(tick.v)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#ivc-fill-${uid})`} className="ivc-fill" />
        <path
          ref={pathRef}
          d={line}
          className="ivc-stroke"
          style={{ stroke: color, ['--len' as string]: String(pathLen) }}
        />
        {activePt && hover != null && (
          <line className="ivc-scan" x1={activePt.x} x2={activePt.x} y1={pad.t} y2={pad.t + innerH} />
        )}
        {points.map((pt, i) => {
          const on = hover === i
          const isPeak = i === peak && values[i] > 0
          const isLast = i === lastLive
          return (
            <g key={i} className="ivc-dot" style={{ animationDelay: `${0.72 + i * 0.045}s` }}>
              {isLast && (
                <circle cx={pt.x} cy={pt.y} r="6" className="ivc-pulse" style={{ stroke: color }} fill="none" />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={on ? 5.5 : isPeak ? 4.2 : 3.2}
                fill={on || isPeak || isLast ? color : 'var(--bg-2)'}
                stroke={color}
                strokeWidth={on ? 2.5 : 1.6}
              />
            </g>
          )
        })}
        {points.map((pt, i) => (
          <text key={`l${i}`} className="ivc-lab" x={pt.x} y={size.h - 8} textAnchor="middle">
            {shortLabel(labels[i] ?? '')}
          </text>
        ))}
      </svg>
      <div className="ivc-hits" aria-hidden={!onSelect}>
        {values.map((_, i) => (
          <button
            key={labels[i] ?? i}
            type="button"
            className={hover === i ? 'is-on' : ''}
            aria-label={`${labels[i]}: Rs ${formatMoney(values[i])}, ${counts?.[i] ?? 0} invoices`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => onSelect?.(i)}
          />
        ))}
      </div>
      {hover != null && activePt && (
        <div className="ivc-chip" style={{ left: chipLeft, top: chipTop }}>
          <b>{labels[active]}</b>
          <span>Rs {formatMoney(values[active])}</span>
          <em>
            {count} invoice{count === 1 ? '' : 's'}
          </em>
        </div>
      )}
    </div>
  )
}
