import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'success' | 'warn' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  success: 'btn-success',
  warn: 'btn-warn',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
}

const SIZE_CLASS = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button className={`btn ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`} {...rest}>
      {children}
    </button>
  )
}
