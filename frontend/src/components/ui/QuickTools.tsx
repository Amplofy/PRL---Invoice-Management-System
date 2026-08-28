import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  FileCheck2,
  Banknote,
  Upload,
  Mail,
  Search,
  Wrench,
  X,
} from 'lucide-react'

interface Tool {
  label: string
  hint: string
  icon: typeof Plus
  action: () => void
}

export default function QuickTools() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const tools: Tool[] = [
    { label: 'New invoice', hint: 'Enter an invoice', icon: Plus, action: () => navigate('/invoices') },
    { label: 'Approvals queue', hint: 'Pending decisions', icon: FileCheck2, action: () => navigate('/approvals') },
    { label: 'Payment orders', hint: 'Generate & track POs', icon: Banknote, action: () => navigate('/payment-orders') },
    { label: 'Import data', hint: 'Bulk upload', icon: Upload, action: () => navigate('/import') },
    { label: 'Follow-up emails', hint: 'Chase pending invoices', icon: Mail, action: () => navigate('/followups') },
    {
      label: 'Quick search',
      hint: 'Ctrl + K',
      icon: Search,
      action: () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })),
    },
  ]

  return (
    <div ref={wrapRef} className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5">
      {open && (
        <div className="flex flex-col items-end gap-2">
          {tools.map(({ label, hint, icon: Icon, action }, i) => (
            <button
              key={label}
              onClick={() => {
                setOpen(false)
                action()
              }}
              className="glass-strong pop-in flex items-center gap-3 rounded-2xl py-2 pl-4 pr-2.5 text-left transition hover:bg-[var(--surface-hover)]"
              style={{ animationDelay: `${(tools.length - 1 - i) * 40}ms` }}
            >
              <span className="min-w-0">
                <span className="block text-xs font-bold leading-tight">{label}</span>
                <span className="block text-[0.62rem] text-[var(--text-muted)]">{hint}</span>
              </span>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <Icon size={15} />
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        title="Quick tools"
        aria-label="Quick tools"
        aria-expanded={open}
        className="flex items-center justify-center rounded-2xl text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition-transform duration-200 hover:scale-105 active:scale-95"
        style={{ background: 'var(--gradient-primary)', height: 52, width: 52 }}
      >
        {open ? <X size={22} /> : <Wrench size={21} />}
      </button>
    </div>
  )
}
