import { useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { isRealCalendarDay, parseCalendarYmd, todayCalendarYmd, ymdToIso, type CalendarYmd } from '../../lib/calendarDate'
import { formatDate } from '../../lib/format'
import Popover from './Popover'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function shiftMonth(y: number, m: number, delta: number): CalendarYmd {
  const next = m - 1 + delta
  const yy = y + Math.floor(next / 12)
  const mm = ((next % 12) + 12) % 12 + 1
  return { y: yy, m: mm, d: 1 }
}

function buildGrid(y: number, m: number): CalendarYmd[] {
  const firstDow = new Date(y, m - 1, 1).getDay()
  const offset = (firstDow + 6) % 7
  const start = new Date(y, m - 1, 1 - offset)
  const cells: CalendarYmd[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() })
  }
  return cells
}

interface DateFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  className?: string
  allowClear?: boolean
  'aria-label'?: string
}

export default function DateField({
  value,
  onChange,
  disabled = false,
  invalid = false,
  placeholder = 'dd-MMM-yyyy',
  className = '',
  allowClear = true,
  'aria-label': ariaLabel,
}: DateFieldProps) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const parsed = value ? parseCalendarYmd(value) : null
  const today = todayCalendarYmd()
  const todayParts = parseCalendarYmd(today)
  const [cursor, setCursor] = useState<CalendarYmd>(() => parsed ?? todayParts ?? { y: 2026, m: 1, d: 1 })

  const openCal = () => {
    if (disabled) return
    setCursor(parsed ?? todayParts ?? cursor)
    setRect(btnRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  const grid = useMemo(() => buildGrid(cursor.y, cursor.m), [cursor.y, cursor.m])
  const shown = parsed ? formatDate(value) : ''

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`input date-field-trigger ${invalid ? 'invalid' : ''} ${className}`}
        onClick={() => (open ? setOpen(false) : openCal())}
      >
        <span className={`min-w-0 truncate ${shown ? '' : 'text-[0.65rem] text-[var(--text-muted)]'}`}>
          {shown || placeholder}
        </span>
        <CalendarDays size={14} className="shrink-0 text-[var(--text-muted)]" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={rect} width={280} align="start" maxHeight={420}>
        <div className="cal-pop">
          <div className="cal-head">
            <button type="button" className="cal-nav" onClick={() => setCursor((c) => shiftMonth(c.y, c.m, -12))} aria-label="Previous year">
              <ChevronsLeft size={14} />
            </button>
            <button type="button" className="cal-nav" onClick={() => setCursor((c) => shiftMonth(c.y, c.m, -1))} aria-label="Previous month">
              <ChevronLeft size={14} />
            </button>
            <div className="cal-caption">
              {MONTHS[cursor.m - 1]} {cursor.y}
            </div>
            <button type="button" className="cal-nav" onClick={() => setCursor((c) => shiftMonth(c.y, c.m, 1))} aria-label="Next month">
              <ChevronRight size={14} />
            </button>
            <button type="button" className="cal-nav" onClick={() => setCursor((c) => shiftMonth(c.y, c.m, 12))} aria-label="Next year">
              <ChevronsRight size={14} />
            </button>
          </div>
          <div className="cal-dow">
            {DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="cal-grid">
            {grid.map((cell) => {
              const iso = ymdToIso(cell)
              const inMonth = cell.m === cursor.m
              const selected = parsed != null && iso === value
              const isToday = iso === today
              const real = isRealCalendarDay(cell.y, cell.m, cell.d)
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!real}
                  className={`cal-day${inMonth ? '' : ' is-out'}${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  onClick={() => {
                    onChange(iso)
                    setOpen(false)
                  }}
                >
                  {cell.d}
                </button>
              )
            })}
          </div>
          <div className="cal-foot">
            <button
              type="button"
              className="cal-foot-btn"
              onClick={() => {
                onChange(today)
                setOpen(false)
              }}
            >
              Today
            </button>
            {allowClear && value && (
              <button
                type="button"
                className="cal-foot-btn"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </Popover>
    </>
  )
}
