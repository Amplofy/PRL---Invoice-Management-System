import { useTheme } from '../theme'

interface BrandLogoProps {
  size?: number
}

export default function BrandLogo({ size = 40 }: BrandLogoProps) {
  const { theme } = useTheme()

  if (theme === 'prl') {
    return (
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl"
        style={{
          width: size,
          height: size,
          background: 'var(--bg-3)',
          border: '1px solid var(--glass-border-strong)',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        <img
          src="/brand/prl-logo.png"
          alt="PRL"
          width={size}
          height={size}
          style={{ width: size, height: 'auto', maxWidth: 'none', objectFit: 'contain' }}
        />
      </div>
    )
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl font-extrabold text-white"
      style={{
        width: size,
        height: size,
        background: 'var(--gradient-primary)',
        boxShadow: '0 6px 20px rgba(59,130,246,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
        fontSize: size * 0.32,
        letterSpacing: '0.02em',
      }}
    >
      <svg viewBox="0 0 48 48" width={size * 0.62} height={size * 0.62} aria-hidden>
        <defs>
          <linearGradient id="prl-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#93c5fd" />
            <stop offset="1" stopColor="#e9d5ff" />
          </linearGradient>
        </defs>
        <path
          d="M24 3 L42 12 L42 30 C42 38 34 44 24 45 C14 44 6 38 6 30 L6 12 Z"
          fill="none"
          stroke="url(#prl-grad)"
          strokeWidth="2.4"
        />
        <path d="M15 32 L21 32 L21 20 L27 28 L33 20 L33 32 L38 32" fill="none" stroke="url(#prl-grad)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="15" y="36" width="18" height="2.4" rx="1.2" fill="url(#prl-grad)" />
      </svg>
    </div>
  )
}
