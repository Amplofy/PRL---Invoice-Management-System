import { parse } from 'csv-parse/sync'

export function parseCsv(buffer: Buffer): Record<string, unknown>[] {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  })
  return records as Record<string, unknown>[]
}
