import { Router } from 'express'
import multer from 'multer'
import { authRequired, requireRole } from '../middleware/auth.js'
import { parseFile } from '../services/parse.js'
import { confirmImport, validateRows } from '../services/importService.js'
import { getSupabase } from '../config/supabase.js'
import type { ImportConfirmBody, ImportConfirmResult, ImportType } from '../types/index.js'

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

importRouter.post(
  '/confirm',
  authRequired,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const body = req.body as ImportConfirmBody
      const type = body.type || 'invoices'
      const rows = Array.isArray(body.rows) ? body.rows : []
      const result: ImportConfirmResult = await confirmImport(
        type,
        rows,
        (req as { user?: { id?: string } }).user?.id
      )
      const supabase = getSupabase()
      await supabase.from('import_logs').insert({
        user_id: (req as { user?: { id?: string } }).user?.id ?? null,
        type,
        rows_parsed: rows.length,
        rows_imported: result.imported,
        status: 'completed',
      })
      res.json({ ...result, type })
    } catch (err) {
      next(err)
    }
  }
)
