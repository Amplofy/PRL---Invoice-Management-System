import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'

type ToastTone = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: number
  tone: ToastTone
  title: string
  detail?: string
}

interface ToastContextValue {
  toast: (tone: ToastTone, title: string, detail?: string) => void
  success: (title: string, detail?: string) => void
  error: (title: string, detail?: string) => void
  info: (title: string, detail?: string) => void
  warning: (title: string, detail?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={18} className="text-[var(--accent-3)]" />,
  error: <XCircle size={18} className="text-[var(--danger)]" />,
  info: <Info size={18} className="text-[var(--accent)]" />,
  warning: <AlertTriangle size={18} className="text-[var(--warn)]" />,
}

const TONE_ACCENT: Record<ToastTone, string> = {
  success: 'var(--accent-3)',
  error: 'var(--danger)',
  info: 'var(--accent)',
  warning: 'var(--warn)',
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (tone: ToastTone, title: string, detail?: string) => {
      const id = nextId++
      setToasts((prev) => [...prev, { id, tone, title, detail }])
      const t = setTimeout(() => dismiss(id), 4200)
      timers.current.set(id, t)
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, detail) => toast('success', title, detail),
      error: (title, detail) => toast('error', title, detail),
      info: (title, detail) => toast('info', title, detail),
      warning: (title, detail) => toast('warning', title, detail),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast flex items-start gap-3">
            <span className="mt-0.5 shrink-0">{TONE_ICON[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.detail && <div className="mt-0.5 text-xs text-[var(--text-dim)]">{t.detail}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
            <div
              className="absolute bottom-0 left-0 h-0.5 w-full"
              style={{
                background: `linear-gradient(90deg, ${TONE_ACCENT[t.tone]}, transparent)`,
              }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
