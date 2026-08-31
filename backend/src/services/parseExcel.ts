import * as xlsx from 'xlsx'

export function parseExcel(buffer: Buffer): Record<string, unknown>[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  return xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })
}

export interface ParsedSheet {
  name: string
  rows: Record<string, unknown>[]
}

/** Parse every non-empty worksheet into its own group of rows. */
export function parseExcelGroups(buffer: Buffer): ParsedSheet[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' })
  const groups: ParsedSheet[] = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    })
    if (rows.length > 0) groups.push({ name, rows })
  }
  return groups
}
