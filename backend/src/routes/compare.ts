import { Router } from 'express'
import multer from 'multer'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { parseFileGroups } from '../services/parse.js'
import { sendEmail, renderTemplate, textToHtml } from '../services/emailService.js'
import { getUploadedFile } from './uploads.js'
import { getSetting } from '../services/settingsService.js'
import { audit } from '../services/auditService.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

export const compareRouter = Router()

/**
 * Parse an uploaded file into per-sheet (Excel) / per-page (PDF) groups of raw
 * rows + inferred column names for the client-side mapping wizard. Accepts
 * csv / xlsx / xls / pdf.
 */
compareRouter.post('/parse', authRequired, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }
    const { format, groups } = await parseFileGroups({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
    })
    res.json({
      fileName: req.file.originalname,
      format,
      groups: groups.map((g) => ({
        name: g.name,
        rowCount: g.rows.length,
        rows: g.rows,
        columns: g.rows.length > 0 ? Object.keys(g.rows[0]!).filter((c) => c !== 'line') : [],
      })),
    })
  } catch (err) {
    next(err)
  }
})

/**
 * Persist a comparison computed client-side (mapping, unit normalization and
 * diffing all happen in the browser). Stored so discrepancy emails can
 * reference it later.
 */
compareRouter.post('/', authRequired, async (req, res, next) => {
  try {
    const { baseFileName, compareFileName, joinKey, columns, tolerance, mismatches, missingInCompare, missingInBase, summary } =
      req.body as {
        baseFileName?: string
        compareFileName?: string
        joinKey?: string
        columns?: string[]
        tolerance?: number
        mismatches?: Array<{ keyValue: string; column: string; baseValue: string; compareValue: string }>
        missingInCompare?: Array<{ keyValue: string }>
        missingInBase?: Array<{ keyValue: string }>
        summary?: { totalRows: number; matchedRows: number }
      }
    if (!baseFileName || !compareFileName || !joinKey) {
      res.status(400).json({ error: 'baseFileName, compareFileName and joinKey are required' })
      return
    }

    const supabase = getSupabase()
    const { data: comparison, error } = await supabase
      .from('comparisons')
      .insert({
        user_id: (req as { user?: { id?: string } }).user?.id ?? null,
        base_file_name: baseFileName,
        compare_file_name: compareFileName,
        join_key: joinKey,
        columns: columns ?? [],
        tolerance: Number(tolerance ?? 0),
        status: 'completed',
      })
      .select('id')
      .single()
    if (error || !comparison) {
      res.status(500).json({ error: `Failed to store comparison: ${error?.message}` })
      return
    }

    const rows = [
      ...(mismatches ?? []).map((m) => ({
        comparison_id: comparison.id,
        kind: 'mismatch',
        key_value: m.keyValue,
        column_name: m.column,
        base_value: m.baseValue,
        compare_value: m.compareValue,
      })),
      ...(missingInCompare ?? []).map((m) => ({
        comparison_id: comparison.id,
        kind: 'missing_in_compare',
        key_value: m.keyValue,
      })),
      ...(missingInBase ?? []).map((m) => ({
        comparison_id: comparison.id,
        kind: 'missing_in_base',
        key_value: m.keyValue,
      })),
    ]
    if (rows.length) {
      await supabase.from('comparison_results').insert(rows)
    }
    await audit(
      'Compare',
      'Comparison',
      comparison.id,
      `${baseFileName} vs ${compareFileName}: ${(mismatches ?? []).length} mismatches, ${(missingInCompare ?? []).length} + ${(missingInBase ?? []).length} missing`,
      (req as { user?: { email?: string } }).user?.email,
    )

    res.json({
      comparisonId: comparison.id,
      baseFileName,
      compareFileName,
      summary: summary ?? { totalRows: 0, matchedRows: 0 },
    })
  } catch (err) {
    next(err)
  }
})

compareRouter.get('/:id/results', authRequired, async (req, res, next) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()
    const { data: comparison } = await supabase
      .from('comparisons')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!comparison) {
      res.status(404).json({ error: 'Comparison not found' })
      return
    }
    const { data: results } = await supabase
      .from('comparison_results')
      .select('*')
      .eq('comparison_id', id)
      .order('key_value')
    const mismatches = (results ?? []).filter((r) => r.kind === 'mismatch')
    const missingInCompare = (results ?? []).filter((r) => r.kind === 'missing_in_compare')
    const missingInBase = (results ?? []).filter((r) => r.kind === 'missing_in_base')
    res.json({
      comparison,
      mismatches,
      missingInCompare,
      missingInBase,
      summary: {
        mismatchCount: mismatches.length,
        missingInCompare: missingInCompare.length,
        missingInBase: missingInBase.length,
      },
    })
  } catch (err) {
    next(err)
  }
})

compareRouter.post('/:id/send-discrepancy', authRequired, async (req, res, next) => {
  try {
    const { id } = req.params
    const { vendorId, notes } = req.body as { vendorId?: string; notes?: string }
    const supabase = getSupabase()
    const { data: comparison } = await supabase
      .from('comparisons')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!comparison) {
      res.status(404).json({ error: 'Comparison not found' })
      return
    }
    const { data: results } = await supabase
      .from('comparison_results')
      .select('*')
      .eq('comparison_id', id)

    const mismatches = (results ?? []).filter((r) => r.kind === 'mismatch')
    const missingInCompare = (results ?? []).filter((r) => r.kind === 'missing_in_compare')
    const missingInBase = (results ?? []).filter((r) => r.kind === 'missing_in_base')

    let vendor = null
    if (vendorId) {
      const { data: v } = await supabase.from('vendors').select('*').eq('id', vendorId).maybeSingle()
      vendor = v
    }
    if (!vendor?.email) {
      res.status(400).json({ error: 'No surveyor email available. Add an email to the vendor first.' })
      return
    }

    const template = (await getSetting('discrepancy_template')) || ''
    let discrepancyList = ''
    if (mismatches.length) {
      discrepancyList = mismatches
        .slice(0, 20)
        .map((m) => `- ${m.key_value}: ${m.column} changed from ${m.base_value} to ${m.compare_value}`)
        .join('\n')
    }
    if (missingInCompare.length) {
      discrepancyList += `\n\nRows present in base but missing in compare (${missingInCompare.length}):\n`
      discrepancyList += missingInCompare
        .slice(0, 20)
        .map((m) => `- ${m.key_value}`)
        .join('\n')
    }
    if (notes) discrepancyList += `\n\nAdditional notes:\n${notes}`

    const body = renderTemplate(template, {
      vendorName: vendor.name,
      baseFileName: comparison.base_file_name,
      compareFileName: comparison.compare_file_name,
      keyValue: mismatches[0]?.key_value || 'multiple rows',
      discrepancyList,
    })
    const subject = `PRL - Discrepancy Identified (${comparison.base_file_name} vs ${comparison.compare_file_name})`
    const emailResult = await sendEmail(vendor.email, subject, textToHtml(body))

    await supabase.from('discrepancy_emails').insert({
      comparison_id: id,
      vendor_id: vendor.id,
      recipient: vendor.email,
      subject,
      body,
      status: emailResult.error ? 'failed' : 'sent',
    })

    if (emailResult.error) {
      res.status(500).json({ error: `Email failed: ${emailResult.error}` })
      return
    }
    res.json({ ok: true, recipient: vendor.email })
  } catch (err) {
    next(err)
  }
})
