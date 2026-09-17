/**
 * Civil YYYY-MM-DD helpers for imported data.
 *
 * Imported dates must land exactly as written in the file. Every conversion here
 * is driven by the value itself (Excel serial, explicit day/month/year parts) so
 * the process timezone and the locale never move a date by a day.
 */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const DAY_MS = 86400000
const SERIAL_MIN = 20000
const SERIAL_MAX = 80000

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const MONTH_PATTERN = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*'

const pad2 = (n: number): string => String(n).padStart(2, '0')

function buildYmd(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null
  // 31/02/2026 and 29/02/2025 must be rejected, not rolled over into March.
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null
  }
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`
}

const expandYear = (n: number): number => (n < 100 ? 2000 + n : n)

const monthIndex = (name: string): number => MONTHS[name.slice(0, 3).toLowerCase()] ?? 0

/** Excel serial (1899-12-30 epoch) as a civil date. */
export function excelSerialToYmd(n: number): string {
  const utc = new Date(EXCEL_EPOCH_MS + Math.floor(n) * DAY_MS)
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`
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
export function dateToCalendarYmd(value: Date): string {
  const serial = Math.round((value.getTime() - EXCEL_EPOCH_MS) / DAY_MS)
  return excelSerialToYmd(serial)
}

/**
 * Canonical YYYY-MM-DD for any imported date cell. Unknown shapes return null so
 * a wrong date is never written; strings are read day-first (convention used for
 * this data) and month names are resolved explicitly instead of via `new Date()`.
 */
export function parseImportDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : dateToCalendarYmd(raw)
  }
  if (typeof raw === 'number') {
    return raw > SERIAL_MIN && raw < SERIAL_MAX ? excelSerialToYmd(raw) : null
  }

  const s = String(raw).replace(/\u00a0/g, ' ').trim()
  if (!s) return null

  // 2026-06-01, 2026-06-01T00:00:00Z, 2026/06/01, 2026.06.01
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return buildYmd(Number(m[1]), Number(m[2]), Number(m[3]))

  // Excel serial written as text
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToYmd(Number(s))

  // day-first numeric: 01/08/2026, 1-8-26, 01.08.2026
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const year = expandYear(Number(m[3]))
    if (a > 12 && b <= 12) return buildYmd(year, b, a)
    if (b > 12 && a <= 12) return buildYmd(year, a, b)
    if (a <= 12 && b <= 12) return buildYmd(year, b, a)
    return null
  }

  const flat = s.replace(/,/g, ' ').replace(/\s+/g, ' ')

  // 01-Aug-2026, 1 Aug 26, 01/Aug/2026
  m = new RegExp(`^(\\d{1,2})[\\s./-]*(${MONTH_PATTERN})[\\s./-]*(\\d{2}|\\d{4})$`, 'i').exec(flat)
  if (m) return buildYmd(expandYear(Number(m[3])), monthIndex(m[2]!), Number(m[1]))

  // 2026-Aug-01
  m = new RegExp(`^(\\d{4})[\\s./-]*(${MONTH_PATTERN})[\\s./-]*(\\d{1,2})$`, 'i').exec(flat)
  if (m) return buildYmd(Number(m[1]), monthIndex(m[2]!), Number(m[3]))

  // A month with a four digit year carries no day; the 1st is the cell value.
  // Checked before the day/year form so "Aug-2026" is not read as the 20th.
  m = new RegExp(`^(${MONTH_PATTERN})[\\s./-]*(\\d{4})$`, 'i').exec(flat)
  if (m) return buildYmd(Number(m[2]), monthIndex(m[1]!), 1)

  // Aug 01, 2026, August-1-2026
  m = new RegExp(`^(${MONTH_PATTERN})[\\s./-]*(\\d{1,2})[\\s./-]*(\\d{2}|\\d{4})$`, 'i').exec(flat)
  if (m) return buildYmd(expandYear(Number(m[3])), monthIndex(m[1]!), Number(m[2]))

  // ISO month: 2026-06
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(flat)
  if (m) return buildYmd(Number(m[1]), Number(m[2]), 1)

  return null
}

/**
 * Today as a civil YYYY-MM-DD in the process timezone.
 *
 * `new Date().toISOString().slice(0, 10)` answers the UTC day, which is the
 * wrong civil date for a few hours around midnight in every non-UTC zone.
 */
export function todayCivilYmd(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** Whole-day difference `to - from` between two civil dates. */
export function civilDayDiff(fromYmd: string, toYmd: string): number | null {
  const from = parseImportDate(fromYmd)
  const to = parseImportDate(toYmd)
  if (!from || !to) return null
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)))
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)))
  return Math.round((b - a) / DAY_MS)
}
