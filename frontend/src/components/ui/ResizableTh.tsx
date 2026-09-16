import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface ColumnResizeApi {
  widthOf: (key: string) => number | undefined
  setWidth: (key: string, width: number) => void
  clearWidth: (key: string) => void
}

const ColumnResizeContext = createContext<ColumnResizeApi | null>(null)

function loadWidths(storageKey: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 48) next[k] = Math.round(n)
    }
    return next
  } catch {
    return {}
  }
}

function persistWidths(storageKey: string, widths: Record<string, number>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths))
  } catch {
    // storage unavailable
  }
}

function applyWidthsToTables(root: HTMLElement, widths: Record<string, number>) {
  const tables = root.querySelectorAll('table.data-table')
  tables.forEach((el) => {
    const table = el as HTMLTableElement
    const ths = table.tHead?.rows[0]?.cells
    if (!ths) return
    const bodies = Array.from(table.tBodies)
    for (let i = 0; i < ths.length; i++) {
      const key = ths[i].getAttribute('data-col')
      const w = key ? widths[key] : undefined
      for (const body of bodies) {
        for (const row of Array.from(body.rows)) {
          const td = row.cells[i]
          if (!td || td.colSpan > 1) continue
          if (w) {
            td.style.width = `${w}px`
            td.style.minWidth = `${w}px`
            td.style.maxWidth = `${w}px`
            td.classList.add('is-resized')
          } else {
            td.style.width = ''
            td.style.minWidth = ''
            td.style.maxWidth = ''
            td.classList.remove('is-resized')
          }
        }
      }
    }
  })
}

export function ColumnResizeProvider({
  storageKey,
  children,
}: {
  storageKey: string
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(storageKey))

  const widthOf = useCallback((key: string) => widths[key], [widths])

  const setWidth = useCallback(
    (key: string, width: number) => {
      setWidths((prev) => {
        const next = { ...prev, [key]: Math.max(56, Math.round(width)) }
        persistWidths(storageKey, next)
        return next
      })
    },
    [storageKey],
  )

  const clearWidth = useCallback(
    (key: string) => {
      setWidths((prev) => {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        persistWidths(storageKey, next)
        return next
      })
    },
    [storageKey],
  )

  useLayoutEffect(() => {
    if (rootRef.current) applyWidthsToTables(rootRef.current, widths)
  })

  return (
    <ColumnResizeContext.Provider value={{ widthOf, setWidth, clearWidth }}>
      <div ref={rootRef} className="contents">
        {children}
      </div>
    </ColumnResizeContext.Provider>
  )
}

function ResizeHandle({ columnKey }: { columnKey: string }) {
  const api = useContext(ColumnResizeContext)
  if (!api) return null

  return (
    <span
      className="th-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      title="Drag to resize. Double-click to reset."
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const th = e.currentTarget.parentElement
        if (!th) return
        const startX = e.clientX
        const startW = th.getBoundingClientRect().width
        document.body.classList.add('is-col-resizing')
        const move = (ev: MouseEvent) => api.setWidth(columnKey, startW + ev.clientX - startX)
        const up = () => {
          document.body.classList.remove('is-col-resizing')
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }}
      onDoubleClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        api.clearWidth(columnKey)
      }}
    />
  )
}

export function HeaderTh({
  columnKey,
  children,
  className = '',
  align = 'left',
  resizable = true,
}: {
  columnKey: string
  children?: ReactNode
  className?: string
  align?: 'left' | 'center' | 'right'
  resizable?: boolean
}) {
  const api = useContext(ColumnResizeContext)
  const width = api?.widthOf(columnKey)
  const resized = width != null
  return (
    <th
      data-col={columnKey}
      className={`${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${resized ? 'is-resized' : ''} ${className}`.trim()}
      style={resized ? { width, minWidth: width, maxWidth: width } : undefined}
    >
      {children}
      {resizable ? <ResizeHandle columnKey={columnKey} /> : null}
    </th>
  )
}
