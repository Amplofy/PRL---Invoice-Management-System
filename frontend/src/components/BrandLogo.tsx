import { useTheme } from '../theme'

interface BrandLogoProps {
  size?: number
  className?: string
  /** 'auto' adapts to mode; 'mono' renders a white silhouette for dark brand surfaces */
  variant?: 'auto' | 'mono'
}

export default function BrandLogo({ size = 40, className = '', variant = 'auto' }: BrandLogoProps) {
  const { mode } = useTheme()

  const filter =
    variant === 'mono'
      ? 'brightness(0) invert(1) opacity(0.96)'
      : mode === 'dark'
        ? 'brightness(1.75) saturate(1.15) drop-shadow(0 1px 2px rgba(0,0,0,0.55))'
        : undefined

  return (
    <img
      src="/brand/prl-logo.png"
      alt="PRL"
      width={size}
      height={Math.round((size * 184) / 333)}
      style={{
        width: size,
        height: 'auto',
        display: 'block',
        filter,
      }}
      className={`shrink-0 ${className}`}
      draggable={false}
    />
  )
}
