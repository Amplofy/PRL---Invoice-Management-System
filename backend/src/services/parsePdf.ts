import * as pdfParse from 'pdf-parse'

type PdfTextResult = {
  text: string
  pages: { text: string }[]
  total: number
}

const KNOWN_HEADERS = [
  'invoice',
  'invoiceno',
  'invoice_no',
  'amount',
  'date',
  'contract',
  'contractno',
  'vendor',
  'tanker',
  'trips',
  'quantity',
  'qty',
  'product',
  'item',
  'value',
  'serial',
  'remarks',
  'name',
]

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function extractPages(buffer: Buffer): Promise<{ text: string; pages: string[] }> {
  const parser = new pdfParse.PDFParse({ data: buffer })
  await (parser as unknown as { load(): Promise<void> }).load()
  const result = (await parser.getText()) as PdfTextResult
  parser.destroy()
  return {
    text: result?.text || '',
    pages: (result?.pages || []).map((p) => p?.text || ''),
  }
}

function linesToRows(lines: string[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  let headers: string[] | null = null

  for (const line of lines) {
    // pdf text extraction collapses whitespace; first try wide gaps then single spaces
    let cells = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
    if (!headers) {
      const single = line.split(/\s+/).map((c) => c.trim()).filter(Boolean)
      if (single.length >= 2 && single.length > cells.length) cells = single
    } else if (cells.length < headers.length && !line.startsWith('--')) {
      const single = line.split(/\s+/).map((c) => c.trim()).filter(Boolean)
      if (single.length >= headers.length) cells = single
    }
    if (!cells.length) continue

    if (!headers) {
      const norm = cells.map(normalizeHeader)
      const hitCount = norm.filter((h) => KNOWN_HEADERS.includes(h)).length
      if (hitCount >= 2 && cells.length >= 2) {
        headers = cells
        continue
      }
    }

    if (headers) {
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => {
        obj[h] = cells[i] ?? ''
      })
      rows.push(obj)
    }
  }

  return rows
}

/**
 * Extracts tabular rows from a text-based PDF using a whitespace-delimited
 * column heuristic. First line that matches known headers becomes the header
 * row; subsequent lines are parsed as data rows aligned to the same columns.
 */
export async function parsePdf(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const { text } = await extractPages(buffer)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows = linesToRows(lines)
  if (rows.length > 0) return rows
  // Fallback: no headers detected — return raw one-column rows
  return lines.map((l) => ({ line: l }))
}

export interface ParsedPage {
  name: string
  rows: Record<string, unknown>[]
}

/**
 * Parses each PDF page independently so the user can pick which pages hold
 * the tables to compare. Pages without a detected header row are skipped;
 * if none match, the whole document comes back as a single raw group.
 */
export async function parsePdfGroups(buffer: Buffer): Promise<ParsedPage[]> {
  const { text, pages } = await extractPages(buffer)
  const pageTexts = pages.length > 0 ? pages : [text]
  const groups: ParsedPage[] = []
  pageTexts.forEach((pageText, i) => {
    const lines = pageText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const rows = linesToRows(lines)
    if (rows.length > 0) groups.push({ name: `Page ${i + 1}`, rows })
  })
  if (groups.length === 0) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length > 0) groups.push({ name: 'Full document', rows: lines.map((l) => ({ line: l })) })
  }
  return groups
}
