import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface RibbonTab {
  id: string
  label: string
}

interface Props {
  tabs: RibbonTab[]
  value: string
  onChange: (id: string) => void
  children: ReactNode
}

export default function ReportsRibbon({ tabs, value, onChange, children }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [hill, setHill] = useState({ left: 12, width: 96 })
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const list = listRef.current
    const btn = btnRefs.current[value]
    if (!list || !btn) return

    const place = () => {
      setHill({ left: btn.offsetLeft, width: btn.offsetWidth })
      setReady(true)
    }
    place()

    const ro = new ResizeObserver(place)
    ro.observe(list)
    ro.observe(btn)
    list.addEventListener('scroll', place, { passive: true })
    return () => {
      ro.disconnect()
      list.removeEventListener('scroll', place)
    }
  }, [value, tabs])

  return (
    <div className="reports-ribbon">
      <div className="reports-ribbon-tabs" ref={listRef} role="tablist" aria-label="Report views">
        <div
          className={`reports-ribbon-hill${ready ? ' is-ready' : ''}`}
          style={{ transform: `translateX(${hill.left}px)`, width: hill.width }}
          aria-hidden
        />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            ref={(el) => {
              btnRefs.current[tab.id] = el
            }}
            className={`reports-ribbon-tab${value === tab.id ? ' is-active' : ''}`}
            aria-selected={value === tab.id}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="reports-ribbon-body">{children}</div>
    </div>
  )
}
