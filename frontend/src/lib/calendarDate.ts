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

/** Leading YYYY-MM-DD, including values like 2026-06-01T00:00:00.000Z. */
export function parseCalendarYmd(raw: string): CalendarYmd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

/**
 * SheetJS and JSON date-only values are UTC midnight. Local getters then move
 * the civil day backward west of UTC, so UTC midnight stays on the UTC date.
 */
export function dateToCalendarYmd(date: Date): string {
  const utcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  if (utcMidnight) {
    return ymdToIso({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() })
  }
  return ymdToIso({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() })
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
