import * as xlsx from 'xlsx'
import { matrixToRecords, pickBestGroup, uniqueGroupName } from './parseTable.js'

export interface ParsedSheet {
  name: string
  rows: Record<string, unknown>[]
  warnings?: string[]
}

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/

/**
 * Raw cell values with date-formatted cells rendered as YYYY-MM-DD.
 *
 * Dates stay on their stored Excel serial (`raw`) and are never read through
 * `cellDates`, whose local-time Date objects can land on the neighbouring day.
 * The second pass only supplies readable text for date cells; everything else
 * keeps the raw value, so neither the timezone nor a cell format moves a date.
 */
function sheetMatrix(sheet: xlsx.WorkSheet): string[][] {
  const base = { header: 1, defval: '', blankrows: false } as const
  const raw = xlsx.utils.sheet_to_json<unknown[]>(sheet, { ...base, raw: true })
  const display = xlsx.utils.sheet_to_json<unknown[]>(sheet, { ...base, raw: false, dateNF: 'yyyy-mm-dd' })
  return raw.map((row, r) =>
    (Array.isArray(row) ? row : []).map((cell, c) => {
      if (typeof cell !== 'number') return String(cell ?? '')
      const text = display[r]?.[c]
      return typeof text === 'string' && DATE_TEXT.test(text.trim()) ? text.trim() : String(cell)
    }),
  )
}

export function parseExcel(buffer: Buffer): Record<string, unknown>[] {
  const groups = parseExcelGroups(buffer)
  const best = pickBestGroup(groups.filter((g) => g.rows.length > 0))
  return best ? best.rows : groups[0]?.rows ?? []
}

/** Parse every worksheet into its own group so the user can pick the sheet. */
export function parseExcelGroups(buffer: Buffer): ParsedSheet[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' })
  const used = new Map<string, number>()
  const groups: ParsedSheet[] = []
  for (const rawName of workbook.SheetNames) {
    const sheet = workbook.Sheets[rawName]
    if (!sheet) continue
    const matrix = sheetMatrix(sheet)
    const rows = matrixToRecords(matrix)
    const warnings: string[] = []
    if (rows.length === 0) warnings.push('This sheet is empty.')
    groups.push({
      name: uniqueGroupName(rawName || 'Sheet', used),
      rows,
      warnings: warnings.length ? warnings : undefined,
    })
  }
  return groups
}
