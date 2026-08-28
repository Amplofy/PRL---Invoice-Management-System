import { useCallback, useState } from 'react'

function persist(storageKey: string, next: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...next]))
  } catch {
    // storage unavailable — visibility stays in memory
  }
}

/**
 * Per-module column visibility, persisted to localStorage.
 * The set of columns rendered today is passed as `defaultVisible`; anything
 * else in `allKeys` is optional and can be revealed by the user.
 */
export function useColumnVisibility(storageKey: string, allKeys: string[], defaultVisible: string[]) {
  const [visible, setVisible] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        const clean = arr.filter((k) => allKeys.includes(k))
        if (clean.length > 0) return new Set(clean)
      }
    } catch {
      // fall through to defaults
    }
    return new Set(defaultVisible)
  })

  const toggle = useCallback(
    (key: string) => {
      setVisible((prev) => {
        if (prev.has(key) && prev.size <= 1) return prev // keep at least one column visible
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        persist(storageKey, next)
        return next
      })
    },
    [storageKey],
  )

  const reset = useCallback(() => {
    const next = new Set(defaultVisible)
    setVisible(next)
    persist(storageKey, next)
  }, [storageKey, defaultVisible])

  const show = useCallback((key: string) => visible.has(key), [visible])

  return { show, toggle, reset, hiddenCount: allKeys.length - visible.size }
}
