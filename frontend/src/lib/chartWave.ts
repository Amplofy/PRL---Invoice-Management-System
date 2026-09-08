type MotionCtx = {
  type: string
  dataIndex: number
  datasetIndex: number
}

const EASE = 'easeOutCubic' as const

function staggerDelay(ctx: MotionCtx, step: number) {
  if (ctx.type !== 'data') return 0
  return ctx.dataIndex * step + ctx.datasetIndex * 70
}

export function barMotion() {
  return {
    duration: 720,
    easing: EASE,
    delay: (ctx: MotionCtx) => staggerDelay(ctx, 52),
  }
}

export function lineMotion() {
  return {
    duration: 860,
    easing: EASE,
  }
}

export function doughnutMotion() {
  return {
    duration: 880,
    easing: EASE,
    animateRotate: true,
    animateScale: false,
  }
}

export function barDataset() {
  return {
    borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
    borderSkipped: 'bottom' as const,
  }
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
    pointHoverRadius: 3,
    pointHitRadius: 14,
  }
}
