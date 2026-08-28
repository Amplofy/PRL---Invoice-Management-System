interface PRLFlameProps {
  size?: number
  className?: string
}

/**
 * Animated flame lifted from the PRL logo mark — red core inside the
 * signature green droplet shell. Base stays planted while the body
 * waves along the X axis, growing toward a wavy tip.
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
        <linearGradient id="prl-flame-shell" x1="32" y1="8" x2="32" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2e9e63" />
          <stop offset="0.55" stopColor="#0b7a3b" />
          <stop offset="1" stopColor="#065f2e" />
        </linearGradient>
        <linearGradient id="prl-flame-mid" x1="32" y1="24" x2="32" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f26649" />
          <stop offset="0.45" stopColor="#d0342c" />
          <stop offset="1" stopColor="#8f1d1d" />
        </linearGradient>
        <linearGradient id="prl-flame-tip" x1="32" y1="8" x2="32" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="0.55" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="prl-flame-core" x1="32" y1="42" x2="32" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="0.5" stopColor="#f87171" />
          <stop offset="1" stopColor="#dc2626" />
        </linearGradient>
      </defs>

      {/* green droplet shell — planted base, barely sways */}
      <path
        className="prl-flame-shell"
        d="M32 4 C 21 21, 9.5 33, 9.5 49.5 A 22.5 22.5 0 0 0 54.5 49.5 C 54.5 33, 43 21, 32 4 Z"
        fill="url(#prl-flame-shell)"
      />
      {/* red inner flame — mid wave */}
      <path
        className="prl-flame-mid"
        d="M32 23 C 25.5 33.5, 19 40.5, 19 51 A 13 13 0 0 0 45 51 C 45 40.5, 38.5 33.5, 32 23 Z"
        fill="url(#prl-flame-mid)"
      />
      {/* wavy tip — largest swing */}
      <path
        className="prl-flame-tip"
        d="M32 9.5 C 33.4 15.5, 35.6 19.4, 35.6 24 C 35.6 26.8, 34 28.8, 32 28.8 C 30 28.8, 28.4 26.8, 28.4 24 C 28.4 19.4, 30.6 15.5, 32 9.5 Z"
        fill="url(#prl-flame-tip)"
      />
      {/* bright core */}
      <path
        className="prl-flame-core"
        d="M32 41 C 28.8 46.5, 26.5 49.5, 26.5 54.5 A 5.5 5.5 0 0 0 37.5 54.5 C 37.5 49.5, 35.2 46.5, 32 41 Z"
        fill="url(#prl-flame-core)"
      />
    </svg>
  )
}
