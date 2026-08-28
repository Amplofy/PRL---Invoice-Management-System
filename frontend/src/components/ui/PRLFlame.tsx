interface PRLFlameProps {
  size?: number
  className?: string
}

/**
 * Animated flame lifted from the PRL logo mark — three nested layers,
 * each enclosed within a bigger one: green shell, red flame, golden core.
 */
export default function PRLFlame({ size = 88, className = '' }: PRLFlameProps) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.25)}
      viewBox="0 0 64 80"
      fill="none"
      role="img"
      aria-label="Loading"
      className={`prl-flame ${className}`}
    >
      <defs>
        <linearGradient id="prl-flame-shell" x1="32" y1="8" x2="32" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2e9e63" />
          <stop offset="0.55" stopColor="#0b7a3b" />
          <stop offset="1" stopColor="#065f2e" />
        </linearGradient>
        <linearGradient id="prl-flame-mid" x1="32" y1="22" x2="32" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f26649" />
          <stop offset="0.45" stopColor="#d0342c" />
          <stop offset="1" stopColor="#8f1d1d" />
        </linearGradient>
        <linearGradient id="prl-flame-core" x1="32" y1="36" x2="32" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="0.5" stopColor="#f87171" />
          <stop offset="1" stopColor="#dc2626" />
        </linearGradient>
      </defs>

      {/* outermost — green shell */}
      <path
        d="M32 6 C 21 23, 8 35, 8 52 A 24 24 0 0 0 56 52 C 56 35, 43 23, 32 6 Z"
        fill="url(#prl-flame-shell)"
      />
      {/* middle — red flame, nested inside the shell */}
      <path
        className="prl-flame-mid"
        d="M32 20 C 24.5 32, 15 42, 15 59 A 17 17 0 0 0 49 59 C 49 42, 39.5 32, 32 20 Z"
        fill="url(#prl-flame-mid)"
      />
      {/* innermost — golden core, nested inside the red flame */}
      <path
        className="prl-flame-core"
        d="M32 36 C 28.5 42.5, 22 48, 22 66 A 10 10 0 0 0 42 66 C 42 48, 35.5 42.5, 32 36 Z"
        fill="url(#prl-flame-core)"
      />
    </svg>
  )
}
