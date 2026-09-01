// Pakistan fiscal year helpers: FY runs 1 July – 30 June, labelled by the
// calendar year in which it STARTS (e.g. Jul 2026 – Jun 2027 = FY26).

export type FiscalQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export interface FiscalInfo {
  fy: string
  quarter: FiscalQuarter
}

/** Calendar year in which the Pakistan FY containing `d` begins (July). */
export function fiscalStartYear(d: Date): number {
  const year = d.getFullYear()
  return d.getMonth() >= 6 ? year : year - 1
}

/** Numeric start year for a label like FY26 or FY2026. */
export function fyStartYear(fy: string): number | null {
  const n = Number(fy.replace(/^FY/i, ''))
  if (!Number.isFinite(n) || n < 1) return null
  return n >= 100 ? n : 2000 + n
}

/** Shift a FY label by `delta` years. */
export function shiftFiscalYear(fy: string, delta: number): string {
  const y = fyStartYear(fy)
  if (y == null) return fy
  return `FY${String(y + delta).slice(2)}`
}

/** "FY26" style label for the fiscal year containing the given date. */
export function fiscalYearLabel(d: Date): string {
  return `FY${String(fiscalStartYear(d)).slice(2)}`
}

/** Quarter within the fiscal year: Jul-Sep Q1, Oct-Dec Q2, Jan-Mar Q3, Apr-Jun Q4. */
export function quarterOfDate(d: Date): FiscalQuarter {
  const m = d.getMonth() // 0 = Jan
  if (m >= 6 && m <= 8) return 'Q1'
  if (m >= 9 && m <= 11) return 'Q2'
  if (m <= 2) return 'Q3'
  return 'Q4'
}

/** Fiscal year + quarter for an ISO date string; null when absent/invalid. */
export function fiscalOf(dateStr: string | null | undefined): FiscalInfo | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return { fy: fiscalYearLabel(d), quarter: quarterOfDate(d) }
}

/** Current Pakistan fiscal-year label (e.g. FY26 on 31 Aug 2026). */
export function currentFiscalYear(d = new Date()): string {
  return fiscalYearLabel(d)
}

/** True when `fy` started before the running Pakistan FY. */
export function isClosedFiscalYear(fy: string, d = new Date()): boolean {
  const y = fyStartYear(fy)
  if (y == null) return false
  return y < fiscalStartYear(d)
}

/** True when the date falls in a completed fiscal year. */
export function isClosedDate(dateStr: string | null | undefined, d = new Date()): boolean {
  const info = fiscalOf(dateStr)
  return info ? isClosedFiscalYear(info.fy, d) : false
}

/** Nearby FY labels, oldest first. Default: previous, current, next. */
export function nearbyFiscalYears(d = new Date(), past = 1, future = 1): string[] {
  const startYear = fiscalStartYear(d)
  const out: string[] = []
  for (let y = startYear - past; y <= startYear + future; y++) {
    out.push(`FY${String(y).slice(2)}`)
  }
  return out
}

/** Ordered quarter labels for display. */
export const QUARTERS: FiscalQuarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

/** Month labels ordered by fiscal year (Jul first). */
export const FY_MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

/** Month index within the fiscal year: 0 = July ... 11 = June. */
export function fyMonthIndex(d: Date): number {
  return (d.getMonth() - 6 + 12) % 12
}

/** Elapsed months in the current FY, 1 (July) through 12 (June). */
export function elapsedFyMonths(d = new Date()): number {
  return fyMonthIndex(d) + 1
}

/** Elapsed / remaining months for a FY label relative to `d`. */
export function elapsedInFiscalYear(fy: string, d = new Date()): { elapsed: number; remaining: number } {
  const bounds = fiscalBounds(fy)
  if (!bounds) {
    const elapsed = elapsedFyMonths(d)
    return { elapsed, remaining: 12 - elapsed }
  }
  if (d < bounds.start) return { elapsed: 0, remaining: 12 }
  if (d > bounds.end) return { elapsed: 12, remaining: 0 }
  const elapsed = elapsedFyMonths(d)
  return { elapsed, remaining: 12 - elapsed }
}

/** Inclusive Jul 1 – Jun 30 bounds for a label like FY26 (2026-27). */
export function fiscalBounds(fy: string): { start: Date; end: Date } | null {
  const startYear = fyStartYear(fy)
  if (startYear == null) return null
  return { start: new Date(startYear, 6, 1), end: new Date(startYear + 1, 5, 30) }
}

/** Short range copy, e.g. "Jul 26 – Jun 27". */
export function fiscalShortRange(fy: string): string {
  const b = fiscalBounds(fy)
  if (!b) return fy
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  return `${fmt(b.start)} – ${fmt(b.end)}`
}

// Cost element -> expense category mapping for budget analysis.
// Recurring marine/port services are operational spend; extend this map as
// capital cost elements are introduced.
const COST_ELEMENT_CATEGORY: Record<string, 'OPEX' | 'CAPEX'> = {
  SUR: 'OPEX',
  THL: 'OPEX',
  SM: 'OPEX',
}

export function costCategory(code: string | null | undefined): 'OPEX' | 'CAPEX' | 'Uncategorized' {
  if (!code) return 'Uncategorized'
  return COST_ELEMENT_CATEGORY[code.toUpperCase()] ?? 'Uncategorized'
}
