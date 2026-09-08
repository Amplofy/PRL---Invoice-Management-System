import * as XLSX from 'xlsx'

export function toCSV(rows: Array<Record<string, unknown>>): string {
  const header = Object.keys(rows[0] ?? {})
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n')
}

export function downloadCSV(filename: string, rows: Array<Record<string, unknown>>) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadXlsx(
  filename: string,
  sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>,
) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const name = sheet.name.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet'
    const rows = sheet.rows.length > 0 ? sheet.rows : [{ Note: 'No rows for this sheet' }]
    const ws = XLSX.utils.json_to_sheet(rows)
    const keys = Object.keys(rows[0] ?? {})
    ws['!cols'] = keys.map((key) => {
      const cells = rows.slice(0, 80).map((row) => String(row[key] ?? ''))
      const width = Math.max(key.length, ...cells.map((c) => c.length))
      return { wch: Math.min(42, Math.max(12, width + 1)) }
    })
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, filename)
}

export type SortDirection = 'asc' | 'desc'

export function sortRows<T>(rows: T[], key: string | null, dir: SortDirection, valueOf?: (row: T, key: string) => string | number | null): T[] {
  if (!key) return rows
  const v = valueOf ?? ((row, k) => (row as Record<string, unknown>)[k] as string | number | null)
  const mult = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = v(a, key)
    const bv = v(b, key)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult
    return String(av).localeCompare(String(bv)) * mult
  })
}

export function dateSortValue(d: string | null | undefined): number {
  if (!d) return 0
  const t = Date.parse(d)
  return Number.isNaN(t) ? 0 : t
}
