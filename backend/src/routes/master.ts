import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired, requireRole } from '../middleware/auth.js'

export const masterRouter = Router()

// -------------------------------------------------------------
// Vendors
// -------------------------------------------------------------
masterRouter.get('/vendors', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('vendors').select('*').order('name')
    if (error) {
      res.status(500).json({ error: 'Failed to load vendors' })
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
      res.status(500).json({ error: 'Failed to load contracts' })
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
      res.status(500).json({ error: 'Failed to load service matrix' })
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
      res.status(500).json({ error: 'Failed to load cost elements' })
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
      res.status(500).json({ error: 'Failed to load users' })
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
      res.status(500).json({ error: 'Failed to load roles' })
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
      res.status(500).json({ error: 'Failed to load permissions' })
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
      res.status(500).json({ error: 'Failed to load audit log' })
      return
    }
    res.json({ auditLog: data ?? [] })
  } catch (err) {
    next(err)
  }
})
