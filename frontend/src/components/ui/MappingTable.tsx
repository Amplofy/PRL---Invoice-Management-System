import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Calendar, ChevronDown, EyeOff, Hash, Link2, Type, X } from 'lucide-react'
import type { ElementDef, MappingState } from '../../lib/importMapping'
import type { SourceColumn } from '../../lib/importParser'
import { normalizeValue } from '../../lib/importMapping'

interface Props {
  schema: ElementDef[]
  columns: SourceColumn[]
  mapping: MappingState
  onChange: (elementKey: string, columnKey: string | null) => void
  detectedRow: number
}

const TYPE_ICON = { text: Type, number: Hash, date: Calendar }

export default function MappingTable({ schema, columns, mapping, onChange, detectedRow }: Props) {
  const [openEl, setOpenEl] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const colByKey = new Map(columns.map((c) => [c.key, c]))
  const usedBy = new Map<string, string>()
  for (const [elKey, entry] of Object.entries(mapping)) {
    if (entry.columnKey) usedBy.set(entry.columnKey, elKey)
  }

  const toggle = (elKey: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openEl === elKey) {
      setOpenEl(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    setRect({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 360)), width: 340 })
    setOpenEl(elKey)
  }

  const samplePreview = (el: ElementDef, colKey: string | null) => {
    const col = colKey ? colByKey.get(colKey) : undefined
    if (!col || col.samples.length === 0) return null
    return col.samples.slice(0, 3).map((s, i) => {
      const { value, warning } = normalizeValue(el.type, s)
      return (
        <span key={i} className="inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[0.68rem]">
          <span className="text-[var(--text-muted)]">{truncate(String(s))}</span>
          {value !== null && String(value) !== String(s) && (
            <span className="font-semibold text-[var(--accent)]">→ {truncate(String(value), 24)}</span>
          )}
          {warning && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--warn)]" title={warning}>
              <AlertTriangle size={10} /> {truncate(warning, 28)}
            </span>
          )}
        </span>
      )
    })
  }

  return (
    <div ref={anchorRef} className="relative">
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-2/5">EOMS element</th>
              <th className="w-3/5">Mapped source header</th>
            </tr>
          </thead>
          <tbody>
            {schema.map((el) => {
              const entry = mapping[el.key]
              const col = entry?.columnKey ? colByKey.get(entry.columnKey) : undefined
              const Icon = TYPE_ICON[el.type]
              const conflicted = entry?.columnKey && usedBy.get(entry.columnKey) !== el.key
              return (
                <tr key={el.key} className={!entry?.columnKey && el.required ? 'bg-[rgba(239,68,68,0.05)]' : ''}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
                        <Icon size={12} />
                      </span>
                      <span className="text-sm font-semibold">{el.label}</span>
                      {el.required && <span className="badge badge-err !text-[0.6rem]">Required</span>}
                      <span className="text-[0.6rem] uppercase tracking-wide text-[var(--text-muted)]">{el.type}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className={`flex min-w-44 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm ${
                          col ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-[var(--border)]'
                        } ${conflicted ? 'border-[var(--warn)]' : ''}`}
                        onClick={(e) => toggle(el.key, e)}
                      >
                        <span className={`truncate ${col ? '' : 'text-[var(--text-muted)]'}`}>
                          {col ? col.header : 'Select header…'}
                        </span>
                        <ChevronDown size={13} className="shrink-0 text-[var(--text-muted)]" />
                      </button>
                      {col?.hidden && (
                        <span className="inline-flex items-center gap-1 text-[0.65rem] text-[var(--text-muted)]" title="Hidden column in source file">
                          <EyeOff size={11} /> hidden
                        </span>
                      )}
                      {col?.duplicate && <span className="badge badge-warn !text-[0.6rem]">duplicate name</span>}
                      {entry?.columnKey && (
                        <button
                          className="rounded-full p-1 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
                          onClick={() => onChange(el.key, null)}
                          aria-label={`Clear ${el.label}`}
                        >
                          <X size={12} />
                        </button>
                      )}
                      {entry?.confidence === 'low' && (
                        <span className="badge badge-warn !text-[0.6rem]">low confidence</span>
                      )}
                      {!entry?.columnKey && el.required && (
                        <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-[var(--err)]">
                          <AlertTriangle size={11} /> not mapped
                        </span>
                      )}
                    </div>
                    {col && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {samplePreview(el, col.key)}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-[var(--text-muted)]">
        <Link2 size={11} /> Header row auto-detected at row {detectedRow + 1} of the sheet.
      </div>

      {openEl && rect && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenEl(null)} />
          <div
            className="glass-strong fixed z-50 max-h-96 overflow-y-auto rounded-xl p-1.5 shadow-xl"
            style={{ top: rect.top, left: rect.left, width: rect.width }}
          >
            {columns.map((c) => {
              const occupied = usedBy.get(c.key)
              const mine = usedBy.get(c.key) === openEl
              return (
                <button
                  key={c.key}
                  disabled={Boolean(occupied) && !mine}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm ${
                    mine ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--bg)]'
                  } ${occupied && !mine ? 'cursor-not-allowed opacity-40' : ''}`}
                  onClick={() => {
                    onChange(openEl, c.key)
                    setOpenEl(null)
                  }}
                >
                  <span className="w-7 shrink-0 text-[0.65rem] font-bold text-[var(--text-muted)]">{c.letter}</span>
                  <span className="flex-1 truncate">
                    {c.header}
                    {c.samples[0] !== undefined && (
                      <span className="ml-1.5 text-[0.68rem] text-[var(--text-muted)]">
                        e.g. {truncate(String(c.samples[0]), 22)}
                      </span>
                    )}
                  </span>
                  {c.hidden && <EyeOff size={11} className="text-[var(--text-muted)]" />}
                  {mine && <span className="badge badge-ok !text-[0.6rem]">current</span>}
                </button>
              )
            })}
            <div className="my-1 border-t border-[var(--border)]" />
            <button
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--bg)]"
              onClick={() => {
                onChange(openEl, null)
                setOpenEl(null)
              }}
            >
              <X size={13} /> Leave unmapped
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

function truncate(s: string, len = 30): string {
  return s.length > len ? `${s.slice(0, len - 1)}…` : s
}
