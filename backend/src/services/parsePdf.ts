import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFParse } from 'pdf-parse'
import { matrixToRecords, pickBestGroup, textToMatrix, uniqueGroupName } from './parseTable.js'

export interface ParsedPage {
  name: string
  rows: Record<string, unknown>[]
  warnings?: string[]
}

const SCAN_TEXT_MIN = 40
const OCR_PAGE_CAP = 12

let tesseractAvailable: boolean | null = null

async function hasTesseract(): Promise<boolean> {
  if (tesseractAvailable !== null) return tesseractAvailable
  const ok = await new Promise<boolean>((resolve) => {
    const p = spawn('tesseract', ['--version'])
    p.on('error', () => resolve(false))
    p.on('close', (code) => resolve(code === 0))
  })
  tesseractAvailable = ok
  return ok
}

async function ocrPng(png: Uint8Array): Promise<string> {
  const file = path.join(tmpdir(), `prl-ocr-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
  await writeFile(file, Buffer.from(png))
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    const p = spawn('tesseract', [file, 'stdout', '--psm', '1', '-l', 'eng'])
    const timer = setTimeout(() => {
      p.kill()
      reject(new Error('OCR timed out'))
    }, 45000)
    p.stdout.on('data', (d: Buffer) => chunks.push(d))
    p.stderr.on('data', (d: Buffer) => errChunks.push(d))
    p.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'))
      else reject(new Error(Buffer.concat(errChunks).toString('utf8').trim() || `tesseract exit ${code}`))
    })
  })
}

function recordsFromText(text: string): Record<string, unknown>[] {
  const matrix = textToMatrix(text)
  const rows = matrixToRecords(matrix)
  if (rows.length > 0) return rows
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.map((l) => ({ line: l }))
}

function looksScanned(text: string): boolean {
  return text.replace(/\s+/g, ' ').trim().length < SCAN_TEXT_MIN
}

/**
 * Extracts tabular rows from a PDF. Prefers drawn tables, then tab-separated
 * text (handles uneven columns). Falls back to one-column lines.
 */
export async function parsePdf(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const groups = await parsePdfGroups(buffer)
  const best = pickBestGroup(groups.filter((g) => g.rows.length > 0))
  if (best) return best.rows
  return groups.flatMap((g) => g.rows)
}

/**
 * One group per page (and extra groups when a page has several tables) so the
 * user can pick exactly which pages to compare. Empty / image-only pages stay
 * in the list with a warning instead of disappearing.
 */
export async function parsePdfGroups(buffer: Buffer): Promise<ParsedPage[]> {
  const parser = new PDFParse({ data: buffer })
  try {
    let total = 0
    try {
      const info = await parser.getInfo()
      total = info.total || 0
    } catch {
      /* some truncated PDFs still yield text */
    }

    let tablePages: Array<{ num: number; tables: string[][][] }> = []
    try {
      const tableRes = await parser.getTable()
      tablePages = tableRes.pages ?? []
      if (!total) total = tableRes.total || tablePages.length
    } catch {
      tablePages = []
    }

    let textPages: Array<{ num: number; text: string }> = []
    let fullText = ''
    try {
      const textRes = await parser.getText({
        cellSeparator: '\t',
        cellThreshold: 9,
        lineEnforce: true,
        lineThreshold: 5.2,
        pageJoiner: '',
      })
      textPages = textRes.pages ?? []
      fullText = textRes.text || ''
      if (!total) total = textRes.total || textPages.length
    } catch {
      textPages = []
    }

    if (!total) total = Math.max(tablePages.length, textPages.length, fullText ? 1 : 0)
    if (total < 1) return []

    const textByPage = new Map<number, string>()
    textPages.forEach((p) => textByPage.set(p.num, p.text || ''))
    if (textByPage.size === 0 && fullText) textByPage.set(1, fullText)

    const tablesByPage = new Map<number, string[][][]>()
    tablePages.forEach((p) => {
      if (p.tables?.length) tablesByPage.set(p.num, p.tables)
    })

    const scanNums: number[] = []
    for (let n = 1; n <= total; n++) {
      const hasTable = (tablesByPage.get(n) ?? []).some((t) => t.length > 1)
      if (!hasTable && looksScanned(textByPage.get(n) ?? '')) scanNums.push(n)
    }

    const ocrByPage = new Map<number, string>()
    if (scanNums.length > 0 && (await hasTesseract())) {
      try {
        const shots = await parser.getScreenshot({
          partial: scanNums.slice(0, OCR_PAGE_CAP),
          imageBuffer: true,
          imageDataUrl: false,
          scale: 2,
        })
        for (const shot of shots.pages ?? []) {
          try {
            ocrByPage.set(shot.pageNumber, await ocrPng(shot.data))
          } catch {
            /* keep the empty text layer */
          }
        }
      } catch {
        /* canvas/screenshot unavailable */
      }
    }

    const used = new Map<string, number>()
    const groups: ParsedPage[] = []

    for (let n = 1; n <= total; n++) {
      const warnings: string[] = []
      const tables = tablesByPage.get(n) ?? []
      const usableTables = tables.filter((t) => t.length > 0 && t.some((r) => r.some((c) => String(c ?? '').trim())))

      if (usableTables.length > 0) {
        usableTables.forEach((table, ti) => {
          const rows = matrixToRecords(table)
          const name =
            usableTables.length > 1
              ? uniqueGroupName(`Page ${n} · table ${ti + 1}`, used)
              : uniqueGroupName(`Page ${n}`, used)
          groups.push({ name, rows, warnings: warnings.length ? [...warnings] : undefined })
        })
        continue
      }

      const ocrText = ocrByPage.get(n)?.trim() ?? ''
      const layerText = (textByPage.get(n) ?? '').trim()
      const sourceText = ocrText || layerText
      if (ocrText) warnings.push('Read with OCR (image/scan). Check columns if the scan is blurry.')
      else if (looksScanned(layerText)) {
        warnings.push('Little or no selectable text — this page may be a scan, photo, or colour photocopy.')
      }

      const rows = sourceText ? recordsFromText(sourceText) : []
      groups.push({
        name: uniqueGroupName(`Page ${n}`, used),
        rows,
        warnings: warnings.length ? warnings : undefined,
      })
    }

    return groups
  } finally {
    await parser.destroy()
  }
}
