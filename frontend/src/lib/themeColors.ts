import { useEffect, useState } from 'react'
import { useTheme } from '../theme'

export interface ThemeColors {
  accent: string
  accent2: string
  accent3: string
  accent4: string
  ticks: string
  grid: string
  chartBg: string
  ok: string
  warn: string
  err: string
}

function readColors(): ThemeColors {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string) => s.getPropertyValue(n).trim() || '#ffffff'
  return {
    accent: v('--chart-accent'),
    accent2: v('--chart-accent-2'),
    accent3: v('--chart-accent-3'),
    accent4: v('--chart-4'),
    ticks: v('--chart-ticks'),
    grid: v('--chart-grid'),
    chartBg: v('--chart-bg'),
    ok: '#10b981',
    warn: '#fbbf24',
    err: '#f87171',
  }
}

export function useThemeColors(): ThemeColors {
  const { mode, theme } = useTheme()
  const [colors, setColors] = useState<ThemeColors>(readColors)

  useEffect(() => {
    setColors(readColors())
  }, [mode, theme])

  return colors
}
