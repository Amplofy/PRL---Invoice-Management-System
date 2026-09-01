interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}

export default function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className="relative inline-flex shrink-0 items-center overflow-hidden rounded-full transition-colors duration-200"
        style={{
          width: 44,
          height: 24,
          padding: 3,
          boxSizing: 'border-box',
          background: checked ? 'var(--gradient-primary)' : 'var(--surface-hover)',
          boxShadow: 'inset 0 0 0 1px var(--border)',
        }}
      >
        <span
          className="block shrink-0 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{
            width: 18,
            height: 18,
            transform: checked ? 'translateX(20px)' : 'translateX(0)',
          }}
        />
      </span>
      {label && <span className="text-sm text-[var(--text-dim)]">{label}</span>}
    </button>
  )
}
