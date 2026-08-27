import { useState, type ReactNode } from 'react'

interface Tab {
  id: string
  label: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export default function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`chip ${active === tab.id ? 'active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function useTab(initial: string): [string, (id: string) => void] {
  const [active, setActive] = useState(initial)
  return [active, setActive]
}
