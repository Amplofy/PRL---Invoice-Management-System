import { useState } from 'react'
import { Lock, Wand2 } from 'lucide-react'
import { useMasterAccess } from '../../lib/masterAccess'
import Modal from './Modal'
import Button from './Button'
import { Field } from './Field'

interface LockedAutoFieldProps {
  label: string
  value: string
  onCommit: (next: string) => void
  hint?: string
  type?: 'text' | 'date'
  placeholder?: string
  compact?: boolean
  /** Shown in the control; `value` is still what the override editor starts from. */
  display?: string
}

export default function LockedAutoField({
  label,
  value,
  onCommit,
  hint,
  type = 'text',
  placeholder = '—',
  compact = false,
  display,
}: LockedAutoFieldProps) {
  const { unlocked } = useMasterAccess()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)

  const click = () => {
    if (!unlocked) return
    setDraft(value)
    setOpen(true)
  }

  const shown = display || value || placeholder
  const empty = !(display || value)

  const editor = (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={`Override ${label}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              onCommit(draft.trim())
              setOpen(false)
            }}
          >
            Update value
          </Button>
        </>
      }
    >
      <Field label={`New ${label}`}>
        <input
          className="input"
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onCommit(draft.trim())
              setOpen(false)
            }
          }}
        />
      </Field>
    </Modal>
  )

  if (compact) {
    return (
      <span className="inline-flex">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          style={{ cursor: unlocked ? 'pointer' : 'default' }}
          title={unlocked ? 'Master access: click to override' : hint || 'Auto-generated'}
          onClick={click}
        >
          <span className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {label}
          </span>
          <span className={`font-mono text-xs font-bold tracking-wide ${empty ? 'text-[var(--text-muted)]' : ''}`}>
            {shown}
          </span>
          <Lock size={9} className="shrink-0 text-[var(--text-muted)]" />
        </button>
        {editor}
      </span>
    )
  }

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-dim)]">
        {label}
        <span
          className="flex items-center gap-0.5 rounded-full px-1.5 py-px text-[0.55rem] font-bold uppercase tracking-wide text-[var(--accent)]"
          style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
        >
          <Wand2 size={8} /> auto
        </span>
      </span>
      <button
        type="button"
        className="input flex w-full items-center justify-between text-left font-mono text-sm font-bold tracking-wide"
        style={{
          background: 'var(--surface)',
          cursor: unlocked ? 'pointer' : 'default',
        }}
        title={unlocked ? 'Master access: click to override' : hint || 'Auto-generated'}
        onClick={click}
      >
        <span className={empty ? 'text-[var(--text-muted)]' : ''}>{shown}</span>
        <Lock size={11} className="shrink-0 text-[var(--text-muted)]" />
      </button>
      {editor}
    </div>
  )
}
