import { Moon, Sun, MonitorCog } from 'lucide-react'
import { THEME_META, useTheme, type Mode } from '../theme'

export default function ThemePanel() {
  const { mode, theme, setMode, setTheme } = useTheme()

  const modes: Array<{ id: Mode; label: string; icon: typeof Moon }> = [
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'light', label: 'Light', icon: Sun },
  ]

  return (
    <div className="glass-strong slide-in-right w-80 rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="section-title !mb-0">Appearance</div>
        <span className="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          <MonitorCog size={12} /> Live
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`chip justify-center !py-2.5 ${mode === id ? 'active' : ''}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="mb-2 text-xs font-semibold text-[var(--text-dim)]">Theme</div>
      <div className="grid grid-cols-2 gap-2.5">
        {THEME_META.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            title={t.tagline}
            className={`group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all ${
              theme === t.id
                ? 'border-[var(--accent)] bg-[var(--surface-hover)] shadow-[0_0_0_1px_var(--accent)]'
                : 'border-[var(--border)] hover:border-[var(--text-muted)]'
            }`}
          >
            <span
              className="mb-2 block h-8 w-full rounded-lg transition-transform duration-300 group-hover:scale-[1.04]"
              style={{ background: t.swatch }}
            />
            <span
              className={`block text-xs font-bold ${
                theme === t.id ? 'text-[var(--text)]' : 'text-[var(--text-dim)] group-hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </span>
            <span className="block truncate text-[0.62rem] text-[var(--text-muted)]">{t.tagline}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
