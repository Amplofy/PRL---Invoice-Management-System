// Pakistan fiscal year helpers: FY runs 1 July - 30 June, labelled by the
// calendar year in which it ends (e.g. Jul 2025 - Jun 2026 = FY26).

export type FiscalQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export interface FiscalInfo {
  fy: string
  quarter: FiscalQuarter
}

/** "FY26" style label for the fiscal year containing the given date. */
export function fiscalYearLabel(d: Date): string {
  const year = d.getFullYear()
  const endYear = d.getMonth() >= 6 ? year + 1 : year // months are 0-based: >= 6 means July onward
  return `FY${String(endYear).slice(2)}`
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

/** Ordered quarter labels for display. */
export const QUARTERS: FiscalQuarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

/** Month labels ordered by fiscal year (Jul first). */
export const FY_MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

/** Month index within the fiscal year: 0 = July ... 11 = June. */
export function fyMonthIndex(d: Date): number {
  return (d.getMonth() - 6 + 12) % 12
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
