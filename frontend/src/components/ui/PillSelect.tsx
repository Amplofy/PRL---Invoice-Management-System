export interface PillOption {
  value: string
  label: string
}

interface PillSelectProps {
  options: PillOption[]
  value: string
  onChange: (value: string) => void
  label?: string
}

/**
 * Segmented single-select pills: every option is visible and one click away.
 * The selected pill fills with the primary gradient.
 */
export default function PillSelect({ options, value, onChange, label }: PillSelectProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && (
        <span className="mr-1 text-[0.6rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      )}
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 text-xs font-semibold transition-colors duration-200 ${
              active
                ? 'text-white'
                : 'border border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }`}
            style={{ borderRadius: 6, background: active ? 'var(--accent)' : undefined }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
