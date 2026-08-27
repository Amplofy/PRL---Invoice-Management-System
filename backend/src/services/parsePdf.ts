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

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new pdfParse.PDFParse({ data: buffer })
  await (parser as unknown as { load(): Promise<void> }).load()
  const result = (await parser.getText()) as PdfTextResult
  parser.destroy()
  return result?.text || ''
}

/**
 * Extracts tabular rows from a text-based PDF using a whitespace-delimited
 * column heuristic. First line that matches known headers becomes the header
 * row; subsequent lines are parsed as data rows aligned to the same columns.
 */
export async function parsePdf(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const text = await extractText(buffer)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

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

  // Fallback: no headers detected — return raw one-column rows
  if (!headers) {
    return lines.map((l) => ({ line: l }))
  }
  return rows
}
