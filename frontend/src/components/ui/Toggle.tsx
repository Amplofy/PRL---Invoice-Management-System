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
        className="relative h-6 w-11 rounded-full transition-colors duration-200"
        style={{
          background: checked ? 'var(--gradient-primary)' : 'var(--surface-hover)',
          border: '1px solid var(--border)',
        }}
      >
        <span
          className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
        />
      </span>
      {label && <span className="text-sm text-[var(--text-dim)]">{label}</span>}
    </button>
  )
}
