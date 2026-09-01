import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { LOCKED_FY_MESSAGE, writeBlocked, writeBlockedFy } from '../services/fyLock.js'
import type { AuthUser } from '../types/index.js'

export const masterRouter = Router()

function actorKey(req: { user?: AuthUser }): string {
  return req.user?.id || req.user?.email || 'anon'
}

// -------------------------------------------------------------
// Vendors
// -------------------------------------------------------------
masterRouter.get('/vendors', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('vendors').select('*').order('name')
    if (error) {
      res.status(500).json({ error: `Failed to load vendors: ${error?.message}` })
      return
    }
    res.json({ vendors: data ?? [] })
  } catch (err) {
    next(err)
  }
})

masterRouter.post('/vendors', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('vendors')
      .insert({ name: req.body?.name, email: req.body?.email ?? null })
      .select()
      .single()
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(201).json({ vendor: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.put('/vendors/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('vendors')
      .update({ name: req.body?.name, email: req.body?.email ?? null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Vendor not found' })
      return
    }
    res.json({ vendor: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.put('/vendors/:id/email', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('vendors')
      .update({ email: req.body?.email ?? null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Vendor not found' })
      return
    }
    res.json({ vendor: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.delete('/vendors/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: contracts } = await supabase
      .from('contracts')
      .select('id')
      .eq('vendor_id', req.params.id)
    if ((contracts ?? []).length) {
      res.status(400).json({ error: 'Cannot delete vendor with linked contracts' })
      return
    }
    const { error } = await supabase.from('vendors').delete().eq('id', req.params.id)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// Contracts
// -------------------------------------------------------------
masterRouter.get('/contracts', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('contracts')
      .select('*, vendors(name, email)')
      .order('contract_no')
    if (error) {
      res.status(500).json({ error: `Failed to load contracts: ${error?.message}` })
      return
    }
    res.json({ contracts: data ?? [] })
  } catch (err) {
    next(err)
  }
})

masterRouter.post('/contracts', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const body = req.body ?? {}
    const locked = writeBlocked(actorKey(req as { user?: AuthUser }), body.start_date)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        contract_no: body.contract_no,
        vendor_id: body.vendor_id,
        service: body.service,
        start_date: body.start_date,
        end_date: body.end_date,
        value: body.value,
        status: body.status ?? 'Open',
      })
      .select()
      .single()
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(201).json({ contract: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.put('/contracts/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const body = req.body ?? {}
    const { data: existing } = await supabase
      .from('contracts')
      .select('start_date')
      .eq('id', req.params.id)
      .maybeSingle()
    const key = actorKey(req as { user?: AuthUser })
    const locked = writeBlocked(key, existing?.start_date) || writeBlocked(key, body.start_date)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const { data, error } = await supabase
      .from('contracts')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Contract not found' })
      return
    }
    res.json({ contract: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.delete('/contracts/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: existing } = await supabase
      .from('contracts')
      .select('start_date')
      .eq('id', req.params.id)
      .maybeSingle()
    const locked = writeBlocked(actorKey(req as { user?: AuthUser }), existing?.start_date)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const { data: invoices } = await supabase.from('invoices').select('id').eq('contract_id', req.params.id)
    if ((invoices ?? []).length) {
      res.status(400).json({ error: 'Cannot delete contract with linked invoices' })
      return
    }
    const { error } = await supabase.from('contracts').delete().eq('id', req.params.id)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// Service matrix
// -------------------------------------------------------------
masterRouter.get('/service-matrix', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('service_matrix').select('*').order('t1')
    if (error) {
      res.status(500).json({ error: `Failed to load service matrix: ${error?.message}` })
      return
    }
    res.json({ serviceMatrix: data ?? [] })
  } catch (err) {
    next(err)
  }
})

masterRouter.post('/service-matrix', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const body = req.body ?? {}
    const { data, error } = await supabase
      .from('service_matrix')
      .insert({
        t1: body.t1,
        t2: body.t2,
        t3: body.t3,
        cost_element: body.cost_element,
        tanker_required: body.tanker_required ?? false,
        trips: body.trips ?? false,
      })
      .select()
      .single()
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(201).json({ service: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.put('/service-matrix/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const body = req.body ?? {}
    const { data, error } = await supabase
      .from('service_matrix')
      .update({
        t1: body.t1,
        t2: body.t2,
        t3: body.t3,
        cost_element: body.cost_element,
        tanker_required: body.tanker_required ?? false,
        trips: body.trips ?? false,
      })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Service row not found' })
      return
    }
    res.json({ service: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.delete('/service-matrix/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('service_matrix').delete().eq('id', req.params.id)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// Cost elements
// -------------------------------------------------------------
masterRouter.get('/cost-elements', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('cost_elements').select('*').order('code')
    if (error) {
      res.status(500).json({ error: `Failed to load cost elements: ${error?.message}` })
      return
    }
    res.json({ costElements: data ?? [] })
  } catch (err) {
    next(err)
  }
})

masterRouter.post('/cost-elements', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const body = req.body ?? {}
    const { data, error } = await supabase
      .from('cost_elements')
      .insert({ code: body.code, name: body.name })
      .select()
      .single()
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(201).json({ costElement: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.put('/cost-elements/:code', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const name = req.body?.name
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Name is required' })
      return
    }
    const { data, error } = await supabase
      .from('cost_elements')
      .update({ name: name.trim() })
      .eq('code', req.params.code)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Cost element not found' })
      return
    }
    res.json({ costElement: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.delete('/cost-elements/:code', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('cost_elements').delete().eq('code', req.params.code)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// Users & roles
// -------------------------------------------------------------
masterRouter.get('/users', authRequired, requireRole('admin'), async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('users')
      .select('*, roles(name, color)')
      .order('full_name')
    if (error) {
      res.status(500).json({ error: `Failed to load users: ${error?.message}` })
      return
    }
    res.json({ users: data ?? [] })
  } catch (err) {
    next(err)
  }
})

masterRouter.post('/users', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const body = req.body ?? {}
    const { data, error } = await supabase
      .from('users')
      .insert({
        username: body.username,
        full_name: body.full_name,
        email: body.email,
        role_id: body.role_id,
        status: body.status ?? 'active',
      })
      .select()
      .single()
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(201).json({ user: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.put('/users/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('users')
      .update(req.body ?? {})
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'User not found' })
      return
    }
    res.json({ user: data })
  } catch (err) {
    next(err)
  }
})

masterRouter.delete('/users/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('users').delete().eq('id', req.params.id)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

masterRouter.get('/roles', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('roles')
      .select('*, role_permissions(permission_id)')
      .order('name')
    if (error) {
      res.status(500).json({ error: `Failed to load roles: ${error?.message}` })
      return
    }
    res.json({ roles: data ?? [] })
  } catch (err) {
    next(err)
  }
})

masterRouter.get('/permissions', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('permissions').select('*').order('category')
    if (error) {
      res.status(500).json({ error: `Failed to load permissions: ${error?.message}` })
      return
    }
    res.json({ permissions: data ?? [] })
  } catch (err) {
    next(err)
  }
})

masterRouter.get('/audit-log', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(200)
    if (error) {
      res.status(500).json({ error: `Failed to load audit log: ${error?.message}` })
      return
    }
    res.json({ auditLog: data ?? [] })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// Yearly budgets (persisted as JSON in app_settings)
// -------------------------------------------------------------
const BUDGET_SETTING_KEY = 'yearly_budgets'

interface BudgetLine {
  id: string
  fy: string
  cost_element: string
  amount: number
  notes: string
}

function parseBudgetLines(raw: string | null | undefined): BudgetLine[] {
  try {
    const parsed = JSON.parse(raw || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => ({
        id: String(row.id ?? ''),
        fy: String(row.fy ?? ''),
        cost_element: String(row.cost_element ?? ''),
        amount: Number(row.amount ?? 0) || 0,
        notes: String(row.notes ?? ''),
      }))
      .filter((row) => row.fy && row.cost_element)
  } catch {
    return []
  }
}

masterRouter.get('/budgets', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', BUDGET_SETTING_KEY)
      .maybeSingle()
    if (error) {
      res.status(500).json({ error: `Failed to load budgets: ${error.message}` })
      return
    }
    res.json({ budgets: parseBudgetLines(data?.value) })
  } catch (err) {
    next(err)
  }
})

masterRouter.put('/budgets', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const fy = String(req.body?.fy ?? '').trim()
    const incoming = req.body?.lines
    if (!fy) {
      res.status(400).json({ error: 'fy is required' })
      return
    }
    if (!Array.isArray(incoming)) {
      res.status(400).json({ error: 'lines array is required' })
      return
    }
    if (writeBlockedFy(actorKey(req as { user?: AuthUser }), fy)) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy, code: 'FY_LOCKED' })
      return
    }
    const supabase = getSupabase()
    const { data: existing, error: loadError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', BUDGET_SETTING_KEY)
      .maybeSingle()
    if (loadError) {
      res.status(500).json({ error: `Failed to load budgets: ${loadError.message}` })
      return
    }
    const kept = parseBudgetLines(existing?.value).filter((row) => row.fy !== fy)
    const nextLines: BudgetLine[] = incoming
      .filter((row: { cost_element?: string }) => String(row?.cost_element ?? '').trim())
      .map((row: { id?: string; cost_element?: string; amount?: number; notes?: string }) => ({
        id: String(row.id || crypto.randomUUID()),
        fy,
        cost_element: String(row.cost_element).trim(),
        amount: Math.max(0, Number(row.amount ?? 0) || 0),
        notes: String(row.notes ?? '').trim(),
      }))
    const seen = new Set<string>()
    const unique: BudgetLine[] = []
    for (const row of nextLines) {
      const key = row.cost_element.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(row)
    }
    const all = [...kept, ...unique]
    const { error: saveError } = await supabase
      .from('app_settings')
      .upsert({ key: BUDGET_SETTING_KEY, value: JSON.stringify(all) }, { onConflict: 'key' })
    if (saveError) {
      res.status(400).json({ error: saveError.message })
      return
    }
    res.json({ budgets: unique, fy })
  } catch (err) {
    next(err)
  }
})
