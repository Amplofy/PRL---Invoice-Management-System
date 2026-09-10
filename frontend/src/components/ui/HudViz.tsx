import { type ReactNode } from 'react'

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function sectorPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r1, a0)
  const p1 = polar(cx, cy, r1, a1)
  const p2 = polar(cx, cy, r0, a1)
  const p3 = polar(cx, cy, r0, a0)
  const large = a1 - a0 > 180 ? 1 : 0
  return [
    `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} Z`,
  ].join(' ')
}

export function HudRing({
  slices,
  onSlice,
  center,
}: {
  slices: Array<{ label: string; value: number; color: string }>
  onSlice?: (index: number) => void
  center?: ReactNode
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const cx = 100
  const cy = 100
  const r0 = 52
  const r1 = 78
  const gap = total > 0 ? 5 : 0
  let cursor = -90
  const parts = slices.map((slice, index) => {
    const span = total > 0 ? (Math.max(0, slice.value) / total) * 360 : 0
    const a0 = cursor + gap / 2
    const a1 = cursor + span - gap / 2
    cursor += span
    return { ...slice, index, a0, a1, span }
  })

  return (
    <div className="hud-ring">
      <svg viewBox="0 0 200 200" className="hud-ring-svg">
        <circle cx={cx} cy={cy} r={(r0 + r1) / 2} className="hud-ring-well" />
        {parts.map((p) =>
          p.span <= gap + 0.4 ? null : (
            <path
              key={p.label}
              d={sectorPath(cx, cy, r0, r1, p.a0, p.a1)}
              fill={p.color}
              className="hud-ring-slice"
              role={onSlice ? 'button' : undefined}
              tabIndex={onSlice ? 0 : undefined}
              onClick={() => onSlice?.(p.index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSlice?.(p.index)
                }
              }}
            >
              <title>{`${p.label}: ${p.value}`}</title>
            </path>
          ),
        )}
      </svg>
      {center ? <div className="hud-ring-center">{center}</div> : null}
      <ul className="hud-legend">
        {slices.map((s, i) => (
          <li key={s.label}>
            <button type="button" className="hud-legend-item" onClick={() => onSlice?.(i)} disabled={!onSlice}>
              <i style={{ background: s.color }} />
              <b>{s.label}</b>
              <span>{s.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
