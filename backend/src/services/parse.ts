import path from 'node:path'
import { UnsupportedFormatError } from '../middleware/error.js'
import { parseCsv } from './parseCsv.js'
import { parseExcel, parseExcelGroups } from './parseExcel.js'
import { parsePdf, parsePdfGroups } from './parsePdf.js'

export type ParsedFile = {
  rows: Record<string, unknown>[]
  format: 'csv' | 'xlsx' | 'pdf'
}

export type ParsedGroup = {
  name: string
  rows: Record<string, unknown>[]
}

export type ParsedFileGroups = {
  format: 'csv' | 'xlsx' | 'pdf'
  groups: ParsedGroup[]
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

/**
 * Parse a file into one group per worksheet (Excel) or per page (PDF) so the
 * user can pick exactly which sheet/page to compare.
 */
export async function parseFileGroups(file: {
  buffer: Buffer
  originalname: string
}): Promise<ParsedFileGroups> {
  const ext = path.extname(file.originalname).toLowerCase()
  if (ext === '.csv') {
    return { format: 'csv', groups: [{ name: file.originalname, rows: parseCsv(file.buffer) }] }
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return { format: 'xlsx', groups: parseExcelGroups(file.buffer) }
  }
  if (ext === '.pdf') {
    return { format: 'pdf', groups: await parsePdfGroups(file.buffer) }
  }
  throw new UnsupportedFormatError(
    `Unsupported file format "${ext}". Supported: .csv, .xlsx, .xls, .pdf`
  )
}
