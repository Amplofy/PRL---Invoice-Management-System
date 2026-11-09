import type { ChangeEvent, ReactNode, SelectHTMLAttributes } from 'react'
import SelectMenu, { optionsFromChildren } from './SelectMenu'

interface FieldProps {
  label: string
  children: ReactNode
  required?: boolean
  hint?: string
  error?: string
}

export function Field({ label, children, required, hint, error }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-[var(--danger)]">{error}</span>}
    </label>
  )
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  children: ReactNode
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void
}

export function Select({ children, className = '', value, onChange, disabled, 'aria-label': ariaLabel }: SelectProps) {
  const parsed = optionsFromChildren(children)
  return (
    <SelectMenu
      value={String(value ?? '')}
      onChange={(next) => {
        if (!onChange) return
        onChange({ target: { value: next } } as ChangeEvent<HTMLSelectElement>)
      }}
      options={parsed.options}
      placeholder={parsed.placeholder}
      disabled={disabled}
      invalid={className.includes('invalid')}
      className={className}
      aria-label={ariaLabel}
    />
  )
}
