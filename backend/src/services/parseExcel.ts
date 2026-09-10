import * as xlsx from 'xlsx'
import { matrixToRecords, pickBestGroup, uniqueGroupName } from './parseTable.js'

export interface ParsedSheet {
  name: string
  rows: Record<string, unknown>[]
  warnings?: string[]
}

function sheetMatrix(sheet: xlsx.WorkSheet): string[][] {
  const raw = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  })
  return raw.map((row) => (Array.isArray(row) ? row : []).map((c) => String(c ?? '')))
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
