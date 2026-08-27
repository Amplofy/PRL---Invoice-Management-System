import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { parseFile } from '../services/parse.js'
import { compareFiles } from '../services/compareService.js'
import { sendEmail, renderTemplate, textToHtml } from '../services/emailService.js'
import { getUploadedFile } from './uploads.js'
import { getSetting } from '../services/settingsService.js'

export const compareRouter = Router()

compareRouter.post('/', authRequired, async (req, res, next) => {
  try {
    const { baseFileId, compareFileId, joinKey, columns, tolerance } = req.body as {
      baseFileId: string
      compareFileId: string
      joinKey: string
      columns: string[]
      tolerance?: number
    }
    if (!baseFileId || !compareFileId || !joinKey || !Array.isArray(columns) || !columns.length) {
      res.status(400).json({ error: 'baseFileId, compareFileId, joinKey and columns are required' })
      return
    }
    const baseFile = getUploadedFile(baseFileId)
    const compareFile = getUploadedFile(compareFileId)
    if (!baseFile || !compareFile) {
      res.status(400).json({ error: 'Uploaded file expired. Please upload again.' })
      return
    }
    const baseParsed = await parseFile({ buffer: baseFile.buffer, originalname: baseFile.name })
    const compareParsed = await parseFile({
      buffer: compareFile.buffer,
      originalname: compareFile.name,
    })
    const result = compareFiles(baseParsed.rows, compareParsed.rows, {
      joinKey,
      columns,
      tolerance: Number(tolerance ?? 0),
    })

    const supabase = getSupabase()
    const { data: comparison, error } = await supabase
      .from('comparisons')
      .insert({
        user_id: (req as { user?: { id?: string } }).user?.id ?? null,
        base_file_name: baseFile.name,
        compare_file_name: compareFile.name,
        join_key: joinKey,
        columns,
        tolerance: Number(tolerance ?? 0),
        status: 'completed',
      })
      .select('id')
      .single()
    if (error || !comparison) {
      res.status(500).json({ error: 'Failed to store comparison' })
      return
    }

    const rows = [
      ...result.mismatches.map((m) => ({
        comparison_id: comparison.id,
        kind: 'mismatch',
        key_value: m.keyValue,
        column_name: m.column,
        base_value: m.baseValue,
        compare_value: m.compareValue,
      })),
      ...result.missingInCompare.map((m) => ({
        comparison_id: comparison.id,
        kind: 'missing_in_compare',
        key_value: m.keyValue,
        base_value: JSON.stringify(m.row),
      })),
      ...result.missingInBase.map((m) => ({
        comparison_id: comparison.id,
        kind: 'missing_in_base',
        key_value: m.keyValue,
        compare_value: JSON.stringify(m.row),
      })),
    ]
    if (rows.length) {
      await supabase.from('comparison_results').insert(rows)
    }

    res.json({ comparisonId: comparison.id, baseFileName: baseFile.name, compareFileName: compareFile.name, ...result })
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
