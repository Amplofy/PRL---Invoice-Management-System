import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeId = 'default' | 'aurora' | 'sunset' | 'ocean' | 'matrix' | 'graphite' | 'prl'
export type Mode = 'dark' | 'light'

export interface ThemeState {
  mode: Mode
  theme: ThemeId
  setMode: (m: Mode) => void
  setTheme: (t: ThemeId) => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeState | null>(null)

const MODE_KEY = 'prl-eoms-mode'
const THEME_KEY = 'prl-eoms-theme'

function readStorage<T extends string>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key) as T | null
    return v ?? fallback
  } catch {
    return fallback
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => readStorage<Mode>(MODE_KEY, 'dark'))
  const [theme, setThemeState] = useState<ThemeId>(() => readStorage<ThemeId>(THEME_KEY, 'default'))

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-mode', mode)
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = mode
    try {
      window.localStorage.setItem(MODE_KEY, mode)
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      // ignore storage errors
    }
  }, [mode, theme])

  const setMode = useCallback((m: Mode) => setModeState(m), [])
  const setTheme = useCallback((t: ThemeId) => setThemeState(t), [])
  const toggleMode = useCallback(() => setModeState((m) => (m === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo(
    () => ({ mode, theme, setMode, setTheme, toggleMode }),
    [mode, theme, setMode, setTheme, toggleMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export const THEME_IDS: ThemeId[] = ['default', 'aurora', 'sunset', 'ocean', 'matrix', 'graphite', 'prl']

export function themeLabel(t: ThemeId): string {
  switch (t) {
    case 'default':
      return 'Nebula'
    case 'aurora':
      return 'Aurora'
    case 'sunset':
      return 'Sunset'
    case 'ocean':
      return 'Ocean'
    case 'matrix':
      return 'Matrix'
    case 'graphite':
      return 'Graphite'
    case 'prl':
      return 'PRL'
  }
}

export interface ThemeMeta {
  id: ThemeId
  label: string
  swatch: string
  tagline: string
}

export const THEME_META: ThemeMeta[] = [
  {
    id: 'default',
    label: 'Nebula',
    swatch: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    tagline: 'Violet drift · corporate calm',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    swatch: 'linear-gradient(135deg, #10b981, #3b82f6)',
    tagline: 'Northern lights · fresh & sharp',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    swatch: 'linear-gradient(135deg, #ec4899, #f97316)',
    tagline: 'Golden hour · warm & bold',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    swatch: 'linear-gradient(135deg, #06b6d4, #6366f1)',
    tagline: 'Deep water · cool & focused',
  },
  {
    id: 'matrix',
    label: 'Matrix',
    swatch: 'linear-gradient(135deg, #22c55e, #84cc16)',
    tagline: 'Neon terminal · cyber energy',
  },
  {
    id: 'graphite',
    label: 'Graphite',
    swatch: 'linear-gradient(135deg, #f4f4f5, #a1a1aa)',
    tagline: 'Monochrome · quiet luxury',
  },
  {
    id: 'prl',
    label: 'PRL',
    swatch: 'linear-gradient(135deg, #203070, #c62a2a)',
    tagline: 'Pakistan Refinery · corporate pride',
  },
]
