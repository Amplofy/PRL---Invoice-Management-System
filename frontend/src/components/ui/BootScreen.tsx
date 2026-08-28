import { useEffect, useRef, useState } from 'react'
import PRLFlame from './PRLFlame'

interface BootScreenProps {
  onDone: () => void
  duration?: number
}

export default function BootScreen({ onDone, duration = 1800 }: BootScreenProps) {
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const called = useRef(false)

  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const pct = Math.min(100, Math.round((elapsed / duration) * 100))
      setProgress(pct)
      if (pct < 100) {
        requestAnimationFrame(tick)
      } else if (!called.current) {
        called.current = true
        setDone(true)
        const t = setTimeout(onDone, 650)
        return () => clearTimeout(t)
      }
    }
    const raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, onDone])

  return (
    <div className={`boot-overlay ${done ? 'done' : ''}`}>
      <div className="boot-inner">
        <PRLFlame size={84} />
        <div className="boot-title mt-6">PRL-EOMS</div>
        <div className="mt-2 text-sm font-medium tracking-wide text-[var(--text-dim)]">
          Enterprise Operations &amp; Management Suite
        </div>
        <div className="boot-track">
          <div className="boot-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 text-xs text-[var(--text-muted)]">{progress}%</div>
      </div>
    </div>
  )
}
