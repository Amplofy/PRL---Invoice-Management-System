import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired, requireRole } from '../middleware/auth.js'

export const settingsRouter = Router()

settingsRouter.get('/', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('app_settings').select('key, value').order('key')
    if (error) {
      res.status(500).json({ error: `Failed to load settings: ${error?.message}` })
      return
    }
    const settings = (data ?? []).filter((row) => (row as { key?: string }).key !== 'fy_lock_password')
    res.json({ settings })
  } catch (err) {
    next(err)
  }
})

settingsRouter.put('/', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const entries = (req.body?.settings ?? []) as { key: string; value: string }[]
    if (!Array.isArray(entries) || !entries.length) {
      res.status(400).json({ error: 'settings array is required' })
      return
    }
    const supabase = getSupabase()
    for (const entry of entries) {
      if (!entry?.key || entry.key === 'fy_lock_password') continue
      await supabase
        .from('app_settings')
        .upsert({ key: entry.key, value: String(entry.value ?? '') }, { onConflict: 'key' })
    }
    res.json({ ok: true, updated: entries.length })
  } catch (err) {
    next(err)
  }
})
