import { useTheme } from '../theme'

interface BrandLogoProps {
  size?: number
  className?: string
}

export default function BrandLogo({ size = 40, className = '' }: BrandLogoProps) {
  const { mode } = useTheme()

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
        filter:
          mode === 'dark'
            ? 'drop-shadow(0 0 6px rgba(255,255,255,0.55)) drop-shadow(0 1px 2px rgba(0,0,0,0.6))'
            : undefined,
      }}
      className={`shrink-0 ${className}`}
      draggable={false}
    />
  )
}
