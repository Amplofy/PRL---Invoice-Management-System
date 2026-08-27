import type { ReactNode, SelectHTMLAttributes } from 'react'

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

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode
}

export function Select({ children, className = '', ...rest }: SelectProps) {
  return (
    <select className={`input ${className}`} {...rest}>
      {children}
    </select>
  )
}
