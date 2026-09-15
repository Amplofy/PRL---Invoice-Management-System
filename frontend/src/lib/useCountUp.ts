import { useEffect, useRef, useState } from 'react'

/**
 * Smoothly counts toward `target` with requestAnimationFrame and an ease-out
 * quart curve. Continues from the current value when the target changes.
 */
export function useCountUp(target: number, duration = 1100): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef(0)
  const fromRef = useRef(0)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      fromRef.current = target
      return
    }
    const start = performance.now()
    const from = fromRef.current
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 4)
      const next = from + (target - from) * eased
      setValue(next)
      fromRef.current = next
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}
