/** Civil YYYY-MM-DD helpers. Invoice/service dates must not shift with timezone. */

export interface CalendarYmd {
  y: number
  m: number
  d: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function ymdToIso(p: CalendarYmd): string {
  return `${String(p.y).padStart(4, '0')}-${pad2(p.m)}-${pad2(p.d)}`
}

/** True for a real calendar day; rejects 31/02, 31/04 and 29/02 on non-leap years. */
export function isRealCalendarDay(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

/** Leading YYYY-MM-DD, including values like 2026-06-01T00:00:00.000Z. */
export function parseCalendarYmd(raw: string): CalendarYmd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!isRealCalendarDay(y, mo, d)) return null
  return { y, m: mo, d }
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const MONTH_PATTERN = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*'

const expandYear = (n: number): number => (n < 100 ? 2000 + n : n)

const monthIndex = (name: string): number => MONTHS[name.slice(0, 3).toLowerCase()] ?? 0

/**
 * YYYY-MM-DD for a date written as text, resolved from the parts in the string.
 * `new Date(text)` is deliberately avoided: it parses month names in local time,
 * which moves the civil day in far-east timezones.
 */
export function parseCalendarText(s: string): { value: string; warning?: string } | null {
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) {
    const p = ymdToIso({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) })
    return parseCalendarYmd(p) ? { value: p } : null
  }

  // day-first numeric: 01/08/2026, 1-8-26, 01.08.2026
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const year = expandYear(Number(m[3]))
    if (a > 12 && b <= 12) return monthResult(year, b, a)
    if (b > 12 && a <= 12) return monthResult(year, a, b, 'month-first date detected')
    if (a <= 12 && b <= 12) return monthResult(year, b, a, 'ambiguous day/month — read day-first')
    return null
  }

  const flat = s.replace(/,/g, ' ').replace(/\s+/g, ' ')

  // 01-Aug-2026, 1 Aug 26, 01/Aug/2026
  m = new RegExp(`^(\\d{1,2})[\\s./-]*(${MONTH_PATTERN})[\\s./-]*(\\d{2}|\\d{4})$`, 'i').exec(flat)
  if (m) return monthResult(expandYear(Number(m[3])), monthIndex(m[2]!), Number(m[1]))

  // 2026-Aug-01
  m = new RegExp(`^(\\d{4})[\\s./-]*(${MONTH_PATTERN})[\\s./-]*(\\d{1,2})$`, 'i').exec(flat)
  if (m) return monthResult(Number(m[1]), monthIndex(m[2]!), Number(m[3]))

  // A month with a four digit year carries no day; the 1st is the cell value.
  // Checked before the day/year form so "Aug-2026" is not read as the 20th.
  m = new RegExp(`^(${MONTH_PATTERN})[\\s./-]*(\\d{4})$`, 'i').exec(flat)
  if (m) return monthResult(Number(m[2]), monthIndex(m[1]!), 1, `no day in "${s}" — read as the 1st`)

  // Aug 01, 2026, August-1-2026
  m = new RegExp(`^(${MONTH_PATTERN})[\\s./-]*(\\d{1,2})[\\s./-]*(\\d{2}|\\d{4})$`, 'i').exec(flat)
  if (m) return monthResult(expandYear(Number(m[3])), monthIndex(m[1]!), Number(m[2]))

  // ISO month: 2026-06
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(flat)
  if (m) return monthResult(Number(m[1]), Number(m[2]), 1, `no day in "${s}" — read as the 1st`)

  return null
}

function monthResult(y: number, m: number, d: number, warning?: string): { value: string; warning?: string } | null {
  const value = ymdToIso({ y, m, d })
  if (!parseCalendarYmd(value)) return null
  return warning ? { value, warning } : { value }
}

/**
 * Civil day of a JS Date, independent of the process timezone.
 *
 * The instant is converted through its Excel serial and rounded to the nearest
 * day. That answers UTC-midnight instants exactly and also recovers the
 * intended day from the near-midnight instants some readers produce. Callers
 * should pass one of those two shapes; a Date built from local parts is an
 * instant this function cannot distinguish from the neighbouring UTC day, and
 * Excel date cells themselves are read as raw serials and never arrive here.
 */
export function dateToCalendarYmd(date: Date): string {
  const ms = date.getTime()
  if (Number.isNaN(ms)) return ''
  const serial = Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000)
  return excelSerialToYmd(serial)
}

export function excelSerialToYmd(n: number): string {
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)
  return ymdToIso({ y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() })
}

/** Local noon so DST cannot roll the calendar day. */
export function calendarDateAtNoon(raw: string): Date | null {
  const p = parseCalendarYmd(raw)
  if (!p) return null
  return new Date(p.y, p.m - 1, p.d, 12, 0, 0)
}

/**
 * Today's civil date in the user's own timezone.
 *
 * `new Date().toISOString().slice(0, 10)` answers the UTC day, which is the
 * wrong civil date for a few hours around midnight in every non-UTC zone.
 */
export function todayCalendarYmd(now: Date = new Date()): string {
  return ymdToIso({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
}

/** Whole-day difference `to - from` between two civil dates. */
export function civilDayDiff(from: string, to: string): number | null {
  const a = parseCalendarYmd(from)
  const b = parseCalendarYmd(to)
  if (!a || !b) return null
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000)
}
