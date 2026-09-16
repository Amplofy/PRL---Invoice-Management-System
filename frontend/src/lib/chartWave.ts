import type { Plugin, ScriptableContext } from 'chart.js'

type MotionCtx = {
  type: string
  dataIndex: number
  datasetIndex: number
}

const SMOOTH = 'easeOutQuart' as const
const FLOW = 'easeInOutCubic' as const

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function staggerDelay(ctx: MotionCtx, step: number) {
  if (ctx.type !== 'data') return 0
  return ctx.dataIndex * step + ctx.datasetIndex * 40
}

export function barMotion() {
  if (reducedMotion()) return false as const
  return {
    duration: 980,
    easing: SMOOTH,
    delay: (ctx: MotionCtx) => staggerDelay(ctx, 28),
  }
}

export function lineMotion() {
  if (reducedMotion()) return false as const
  return {
    duration: 1180,
    easing: FLOW,
  }
}

export function doughnutMotion() {
  if (reducedMotion()) return { duration: 0, animateRotate: false, animateScale: false }
  return {
    duration: 1100,
    easing: SMOOTH,
    animateRotate: true,
    animateScale: false,
  }
}

export function chartTransitions() {
  if (reducedMotion()) {
    return {
      active: { animation: { duration: 0 } },
      resize: { animation: { duration: 0 } },
    }
  }
  return {
    active: { animation: { duration: 240, easing: SMOOTH } },
    resize: { animation: { duration: 0 } },
    show: {
      animations: {
        y: { from: 0, duration: 980, easing: SMOOTH },
      },
    },
    hide: {
      animations: {
        y: { to: 0, duration: 360, easing: 'easeInQuart' as const },
      },
    },
  }
}

export function tooltipMotion() {
  if (reducedMotion()) return { animation: { duration: 0 } }
  return { animation: { duration: 180, easing: SMOOTH } }
}

export function chartMotion(kind: 'bar' | 'line' | 'doughnut') {
  const animation = kind === 'bar' ? barMotion() : kind === 'line' ? lineMotion() : doughnutMotion()
  const base = { animation, transitions: chartTransitions() }
  if (kind === 'bar') return { ...base, animations: { colors: { duration: 0 } } }
  if (kind === 'line') return { ...base, interaction: { mode: 'index' as const, intersect: false } }
  return base
}

export function barDataset() {
  return {
    borderRadius: { topLeft: 11, topRight: 11, bottomLeft: 4, bottomRight: 4 },
    borderSkipped: false as const,
    borderWidth: 0,
    categoryPercentage: 0.7,
    barPercentage: 0.84,
  }
}

function parseRgb(color: string): [number, number, number] | null {
  const raw = color.trim()
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let s = hex[1]
    if (s.length === 3) s = `${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  }
  const rgb = raw.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

function toHex(r: number, g: number, b: number) {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function mixColor(color: string, toward: string, t: number): string {
  const a = parseRgb(color)
  const b = parseRgb(toward)
  if (!a || !b) return color
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
}

/** Per-bar vertical fill: bright crown, saturated body, deep foot. */
export function gradientBarFill(color: string) {
  return (ctx: ScriptableContext<'bar'>) => {
    if (ctx.type !== 'data') return color
    const chart = ctx.chart
    const y = chart.scales.y
    const value = ctx.parsed?.y
    if (!chart.chartArea || !y || value == null) return color
    const top = y.getPixelForValue(value)
    const base = y.getPixelForValue(0)
    if (!Number.isFinite(top) || !Number.isFinite(base) || Math.abs(base - top) < 2) return color
    const g = chart.ctx.createLinearGradient(0, Math.min(top, base), 0, Math.max(top, base))
    g.addColorStop(0, mixColor(color, '#ffffff', 0.5))
    g.addColorStop(0.14, mixColor(color, '#ffffff', 0.14))
    g.addColorStop(0.48, color)
    g.addColorStop(1, mixColor(color, '#071018', 0.44))
    return g
  }
}

export function gradientBarHover(color: string) {
  return mixColor(color, '#ffffff', 0.22)
}

/** Static crown highlight on Chart.js bars (no traveling sheen). */
export const reportBarCrown: Plugin<'bar'> = {
  id: 'reportBarCrown',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    for (const meta of chart.getSortedVisibleDatasetMetas()) {
      if (meta.type !== 'bar') continue
      for (const bar of meta.data) {
        const props = bar.getProps(['x', 'y', 'base', 'width'], true) as {
          x: number
          y: number
          base: number
          width: number
        }
        const h = Math.abs(props.base - props.y)
        if (h < 10 || props.width < 8) continue
        const left = props.x - props.width / 2
        const top = Math.min(props.y, props.base)
        const inset = Math.min(9, props.width * 0.2)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.38)'
        ctx.lineWidth = 1.35
        ctx.beginPath()
        ctx.moveTo(left + inset, top + 2.2)
        ctx.lineTo(left + props.width - inset, top + 2.2)
        ctx.stroke()
        ctx.restore()
      }
    }
  },
}

export function doughnutSlice() {
  return {
    hoverOffset: 0,
    borderWidth: 0,
  }
}

export function waveLine(color: string, _fill = true) {
  const fillColor = color.startsWith('#') && color.length === 7 ? `${color}33` : color
  return {
    borderColor: color,
    backgroundColor: fillColor,
    fill: false,
    tension: 0,
    borderWidth: 2.25,
    pointRadius: 3,
    pointHoverRadius: 5.5,
    pointHitRadius: 14,
  }
}
