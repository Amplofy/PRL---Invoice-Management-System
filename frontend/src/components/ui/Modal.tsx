import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
}

export default function Modal({ open, onClose, title, children, footer, maxWidth = '42rem' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth }} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <h3 className="text-base font-bold">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-dim)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
