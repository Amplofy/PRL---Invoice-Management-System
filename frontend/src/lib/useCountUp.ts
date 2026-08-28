import { useEffect, useRef, useState } from 'react'

/**
 * Smoothly counts from 0 to `target` once, using requestAnimationFrame with an
 * ease-out curve. Re-animates whenever target changes.
 */
export function useCountUp(target: number, duration = 1100): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}
