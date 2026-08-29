import { Router } from 'express'
import multer from 'multer'
import { authRequired, requireRole } from '../middleware/auth.js'
import { parseFile } from '../services/parse.js'
import {
  applyImportRows,
  createBatch,
  decideBatch,
  detectConflicts,
  listBatches,
  validateRows,
} from '../services/importService.js'
import { getSupabase } from '../config/supabase.js'
import { audit } from '../services/auditService.js'
import type { AuthedRequest, ImportConfirmBody, ImportType } from '../types/index.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

export const importRouter = Router()

importRouter.post(
  '/parse',
  authRequired,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const type = (req.body?.type || 'invoices') as ImportType
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' })
        return
      }
      const { rows } = await parseFile({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      })
      const preview = await validateRows(type, rows)
      const issues = preview
        .filter((r) => !r.valid)
        .map((r) => ({ row: r.index, message: r.errors.join('; ') }))
      res.json({
        type,
        fileName: req.file.originalname,
        preview,
        issues,
        totalRows: preview.length,
        validRows: preview.filter((r) => r.valid).length,
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Submit an import for processing.
 * - admin + zero duplicates (or admin + mode=overwrite) -> rows applied immediately
 * - duplicates present (append mode) or non-admin submitter -> stored as a
 *   pending batch that an admin must approve before anything touches the tables
 */
importRouter.post('/confirm', authRequired, async (req, res, next) => {
  try {
    const user = (req as AuthedRequest).user
    const body = req.body as ImportConfirmBody
    const type = body.type || 'invoices'
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (rows.length === 0) {
      res.status(400).json({ error: 'No rows to import' })
      return
    }
    const mode = body.mode === 'overwrite' ? 'overwrite' : 'append'

    const conflicts = await detectConflicts(type, rows)
    const isAdmin = user.role === 'admin'
    const autoApprove = isAdmin && (conflicts.length === 0 || mode === 'overwrite')

    let imported = 0
    let skipped = 0
    let updated = 0
    let batchId: string | undefined

    if (autoApprove) {
      const result = await applyImportRows(type, rows, user.id, mode === 'overwrite')
      imported = result.imported
      skipped = result.skipped
      updated = result.updated
      await getSupabase().from('import_logs').insert({
        user_id: user.id,
        type,
        rows_parsed: rows.length,
        rows_imported: imported,
        status: 'completed',
      })
      await audit(
        'import.confirmed',
        type,
        null,
        `imported ${imported}, updated ${updated} of ${rows.length} rows (${mode})`,
        user.email ?? user.id,
      )
    } else {
      const batch = await createBatch(
        type,
        rows,
        conflicts,
        body.fileName ?? '',
        user.email ?? user.id,
        mode,
      )
      batchId = batch.id
      await audit(
        'import.submitted',
        type,
        batchId ?? null,
        `${rows.length} rows, ${conflicts.length} duplicate(s), awaiting admin approval`,
        user.email ?? user.id,
      )
    }

    res.json({
      status: autoApprove ? 'approved' : 'pending',
      imported,
      skipped,
      updated,
      batchId,
      duplicates: conflicts.length,
      type,
    })
  } catch (err) {
    next(err)
  }
})

importRouter.get('/batches', authRequired, requireRole('admin'), async (_req, res, next) => {
  try {
    const batches = await listBatches()
    res.json({ batches })
  } catch (err) {
    next(err)
  }
})

importRouter.post(
  '/batches/:id/decide',
  authRequired,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const user = (req as AuthedRequest).user
      const decision = req.body?.decision === 'reject' ? 'rejected' : 'approved'
      const overwrite = req.body?.overwrite === true
      const batch = await decideBatch(String(req.params.id), decision, user.email ?? user.id, overwrite)
      if (!batch) {
        res.status(404).json({ error: 'Batch not found' })
        return
      }
      await audit(
        decision === 'approved' ? 'import.batch_approved' : 'import.batch_rejected',
        batch.import_type,
        batch.id,
        `batch ${batch.total_rows} rows, ${batch.duplicate_rows} duplicate(s)${overwrite ? ', overwrite mode' : ''}`,
        user.email ?? user.id,
      )
      res.json({ batch })
    } catch (err) {
      next(err)
    }
  }
)
