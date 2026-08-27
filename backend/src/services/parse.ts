import path from 'node:path'
import { UnsupportedFormatError } from '../middleware/error.js'
import { parseCsv } from './parseCsv.js'
import { parseExcel } from './parseExcel.js'
import { parsePdf } from './parsePdf.js'

export type ParsedFile = {
  rows: Record<string, unknown>[]
  format: 'csv' | 'xlsx' | 'pdf'
}

export async function parseFile(file: {
  buffer: Buffer
  originalname: string
}): Promise<ParsedFile> {
  const ext = path.extname(file.originalname).toLowerCase()
  if (ext === '.csv') return { rows: parseCsv(file.buffer), format: 'csv' }
  if (ext === '.xlsx' || ext === '.xls') {
    return { rows: parseExcel(file.buffer), format: 'xlsx' }
  }
  if (ext === '.pdf') return { rows: await parsePdf(file.buffer), format: 'pdf' }
  throw new UnsupportedFormatError(
    `Unsupported file format "${ext}". Supported: .csv, .xlsx, .xls, .pdf`
  )
}
