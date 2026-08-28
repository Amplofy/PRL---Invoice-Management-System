import { Check, Moon, Sun, MonitorCog, X, Palette } from 'lucide-react'
import { THEME_META, useTheme, type Mode } from '../theme'

const MODES: Array<{ id: Mode; label: string; icon: typeof Moon }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
]

export default function ThemePanel({ onClose }: { onClose?: () => void }) {
  const { mode, theme, setMode, setTheme } = useTheme()
  const activeIdx = MODES.findIndex((m) => m.id === mode)

  return (
    <div className="glass-strong slide-in-right flex max-h-[calc(100dvh-5.5rem)] w-80 flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Palette size={13} />
          </span>
          <span className="text-sm font-bold">Appearance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <MonitorCog size={11} /> Live
          </span>
          {onClose && (
            <button className="btn btn-ghost !px-2 !py-1.5" onClick={onClose} aria-label="Close appearance panel">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-1 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Mode</div>
        <div className="relative grid grid-cols-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
          <span
            className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg shadow-sm transition-transform duration-300 ease-out"
            style={{
              background: 'var(--gradient-primary)',
              transform: `translateX(${activeIdx * 100}%)`,
            }}
          />
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors duration-200 ${
                mode === id ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="mb-2 mt-5 flex items-center justify-between">
          <span className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Color theme
          </span>
          <span className="text-[0.62rem] text-[var(--text-muted)]">{THEME_META.length} palettes</span>
        </div>
        <div className="space-y-1">
          {THEME_META.map((t) => {
            const active = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                title={t.tagline}
                className={`group flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-all ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--surface-hover)] shadow-[0_0_0_1px_var(--accent)]'
                    : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <span
                  className="relative h-9 w-14 shrink-0 overflow-hidden rounded-lg shadow-sm transition-transform duration-300 group-hover:scale-[1.05]"
                  style={{ background: t.swatch }}
                >
                  <span className="absolute inset-x-2.5 bottom-1.5 top-4 rounded-[4px] bg-white/85" />
                  <span className="absolute left-3.5 top-1.5 h-1.5 w-6 rounded-full bg-white/80" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-xs font-bold ${
                      active ? 'text-[var(--text)]' : 'text-[var(--text-dim)] group-hover:text-[var(--text)]'
                    }`}
                  >
                    {t.label}
                  </span>
                  <span className="block truncate text-[0.62rem] text-[var(--text-muted)]">{t.tagline}</span>
                </span>
                {active && (
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    <Check size={12} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
