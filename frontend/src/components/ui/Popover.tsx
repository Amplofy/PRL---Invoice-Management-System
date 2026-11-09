import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  anchor: DOMRect | null
  children: ReactNode
  width?: number | 'trigger'
  align?: 'start' | 'end' | 'stretch'
  className?: string
  maxHeight?: number
}

export default function Popover({
  open,
  onClose,
  anchor,
  children,
  width = 'trigger',
  align = 'stretch',
  className = '',
  maxHeight,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220, maxH: 280 })

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const pad = 8
    const gap = 6
    const minW = 168
    const triggerW = anchor.width
    const desired = width === 'trigger' ? triggerW : width
    const panelW = Math.min(Math.max(desired, align === 'stretch' ? triggerW : minW), window.innerWidth - pad * 2)
    const measured = panelRef.current?.offsetHeight ?? 240
    const spaceBelow = window.innerHeight - anchor.bottom - pad
    const spaceAbove = anchor.top - pad
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow
    const cap = maxHeight ?? 320
    const maxH = Math.min(cap, Math.max(120, openAbove ? spaceAbove - gap : spaceBelow - gap))
    let left = align === 'end' ? anchor.right - panelW : anchor.left
    if (align === 'stretch') left = anchor.left
    left = Math.min(Math.max(pad, left), window.innerWidth - pad - panelW)
    const top = openAbove
      ? Math.max(pad, anchor.top - Math.min(measured, maxH) - gap)
      : anchor.bottom + gap
    setPos({ top, left, width: panelW, maxH })
  }, [open, anchor, width, align, maxHeight, children])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onScroll = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, onClose])

  if (!open || !anchor) return null

  return createPortal(
    <>
      <div className="menu-backdrop" onMouseDown={onClose} />
      <div
        ref={panelRef}
        className={`menu-panel pop-in ${className}`}
        style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
        role="presentation"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
