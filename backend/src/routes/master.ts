import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { invoiceBudgetFy, LOCKED_FY_MESSAGE, writeBlocked, writeBlockedFy } from '../services/fyLock.js'
import { accrualForFy, invoiceAccrualAmount, isBudgetIncrease } from '../services/accrual.js'
import type { AuthUser } from '../types/index.js'

export const masterRouter = Router()

function actorKey(req: { user?: AuthUser }): string {
  return req.user?.id || req.user?.email || 'anon'
}

type EmailInput = string | { email?: unknown; label?: unknown; is_primary?: unknown }
type ServiceInput = { t1?: unknown; t2?: unknown; t3?: unknown; service_matrix_id?: unknown }

function normalizeVendorEmails(body: { email?: unknown; emails?: unknown }): Array<{ email: string; label: string; is_primary: boolean }> {
  const raw: EmailInput[] = Array.isArray(body.emails)
    ? (body.emails as EmailInput[])
    : body.email
      ? [String(body.email)]
      : []
  const out: Array<{ email: string; label: string; is_primary: boolean }> = []
  raw.forEach((item, idx) => {
    const email = (typeof item === 'string' ? item : String(item?.email ?? '')).trim()
    if (!email) return
    out.push({
      email,
      label: typeof item === 'string' ? (idx === 0 ? 'surveyor' : 'other') : String(item?.label || 'surveyor'),
      is_primary: typeof item === 'string' ? idx === 0 : Boolean(item?.is_primary),
    })
  })
  if (out.length && !out.some((e) => e.is_primary)) out[0].is_primary = true
  let seen = false
  for (const e of out) {
    if (e.is_primary && seen) e.is_primary = false
    else if (e.is_primary) seen = true
  }
  return out
}

async function replaceVendorEmails(
  vendorId: string,
  emails: Array<{ email: string; label: string; is_primary: boolean }>,
) {
  const supabase = getSupabase()
  await supabase.from('vendor_emails').delete().eq('vendor_id', vendorId)
  if (emails.length) {
    const { error } = await supabase.from('vendor_emails').insert(emails.map((e) => ({ vendor_id: vendorId, ...e })))
    if (error) throw error
  }
  const primary = emails.find((e) => e.is_primary)?.email ?? emails[0]?.email ?? null
  await supabase.from('vendors').update({ email: primary, updated_at: new Date().toISOString() }).eq('id', vendorId)
}

async function attachVendorEmails<T extends { id: string }>(vendors: T[]) {
  if (!vendors.length) return vendors.map((v) => ({ ...v, emails: [] as unknown[] }))
  const supabase = getSupabase()
  const { data } = await supabase.from('vendor_emails').select('*').in('vendor_id', vendors.map((v) => v.id))
  const byVendor = new Map<string, unknown[]>()
  for (const row of data ?? []) {
    const list = byVendor.get(row.vendor_id as string) ?? []
    list.push(row)
    byVendor.set(row.vendor_id as string, list)
  }
  return vendors.map((v) => ({ ...v, emails: byVendor.get(v.id) ?? [] }))
}

async function replaceContractServices(contractId: string, services: ServiceInput[]) {
  const supabase = getSupabase()
  const { data: matrix, error: matrixError } = await supabase.from('service_matrix').select('id, t1, t2, t3')
  if (matrixError) throw matrixError
  const rows: Array<{ contract_id: string; service_matrix_id: string; t1: string; t2: string | null; t3: string | null }> = []
  for (const s of services) {
    const list = matrix ?? []
    const match = s.service_matrix_id
      ? list.find((m) => m.id === s.service_matrix_id)
      : list.find((m) => m.t1 === s.t1 && (m.t2 ?? '') === (s.t2 ?? '') && (m.t3 ?? '') === (s.t3 ?? ''))
    if (!match) continue
    if (rows.some((r) => r.service_matrix_id === match.id)) continue
    rows.push({
      contract_id: contractId,
      service_matrix_id: match.id as string,
      t1: String(match.t1),
      t2: (match.t2 as string | null) ?? null,
      t3: (match.t3 as string | null) ?? null,
    })
  }
  await supabase.from('contract_services').delete().eq('contract_id', contractId)
  if (rows.length) {
    const { error } = await supabase.from('contract_services').insert(rows)
    if (error) throw error
  }
  const summary = Array.from(new Set(rows.map((r) => r.t2 || r.t1).filter(Boolean))).join(', ')
  if (summary) {
    await supabase.from('contracts').update({ service: summary, updated_at: new Date().toISOString() }).eq('id', contractId)
  }
}

async function attachContractServices<T extends { id: string }>(contracts: T[]) {
  if (!contracts.length) {
    return contracts.map((c) => ({ ...c, services: [] as Array<{ id: string; t1: string; t2: string | null; t3: string | null }> }))
  }
  const supabase = getSupabase()
  const { data } = await supabase
    .from('contract_services')
    .select('id, contract_id, t1, t2, t3')
    .in('contract_id', contracts.map((c) => c.id))
  const byContract = new Map<string, Array<{ id: string; t1: string; t2: string | null; t3: string | null }>>()
  for (const row of data ?? []) {
    const list = byContract.get(row.contract_id as string) ?? []
    list.push({
      id: row.id as string,
      t1: String(row.t1),
      t2: (row.t2 as string | null) ?? null,
      t3: (row.t3 as string | null) ?? null,
    })
    byContract.set(row.contract_id as string, list)
  }
  return contracts.map((c) => ({ ...c, services: byContract.get(c.id) ?? [] }))
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
    res.json({ vendors: await attachVendorEmails((data ?? []) as Array<{ id: string }>) })
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
    const emails = normalizeVendorEmails(req.body ?? {})
    await replaceVendorEmails(data.id, emails)
    const [vendor] = await attachVendorEmails([{ ...data, id: data.id }])
    res.status(201).json({ vendor })
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
    if (Array.isArray(req.body?.emails) || req.body?.email !== undefined) {
      await replaceVendorEmails(data.id, normalizeVendorEmails(req.body ?? {}))
    }
    const [vendor] = await attachVendorEmails([data as { id: string }])
    res.json({ vendor })
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
    await replaceVendorEmails(data.id, normalizeVendorEmails(req.body ?? {}))
    const [vendor] = await attachVendorEmails([data as { id: string }])
    res.json({ vendor })
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
    res.json({ contracts: await attachContractServices((data ?? []) as Array<{ id: string }>) })
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
    if (Array.isArray(body.services)) {
      await replaceContractServices(data.id, body.services as ServiceInput[])
    }
    const [contract] = await attachContractServices([data as { id: string }])
    res.status(201).json({ contract })
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
    const { services, ...fields } = body as { services?: ServiceInput[] } & Record<string, unknown>
    const { data, error } = await supabase
      .from('contracts')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Contract not found' })
      return
    }
    if (Array.isArray(services)) {
      await replaceContractServices(data.id, services)
    }
    const [contract] = await attachContractServices([data as { id: string }])
    res.json({ contract })
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
    const stored = parseBudgetLines(existing?.value)
    const previous = stored.filter((row) => row.fy === fy)
    const kept = stored.filter((row) => row.fy !== fy)
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
    const increasing = unique.some((row) => {
      const old = previous.find((x) => x.cost_element.toUpperCase() === row.cost_element.toUpperCase())
      return isBudgetIncrease(old?.amount, row.amount)
    })
    const master = Boolean(req.body?.masterAccess)
    if (increasing && !master) {
      res.status(403).json({
        error: 'Budget increase requires Master Access',
        code: 'BUDGET_INCREASE_REQUIRES_MASTER',
      })
      return
    }
    if (writeBlockedFy(actorKey(req as { user?: AuthUser }), fy) && !(increasing && master)) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy, code: 'FY_LOCKED' })
      return
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

const ACCRUAL_SETTING_KEY = 'fy_accrual_overrides'

interface AccrualOverride {
  fy: string
  amount: number
}

function parseAccrualOverrides(raw: string | null | undefined): AccrualOverride[] {
  try {
    const parsed = JSON.parse(raw || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => ({ fy: String(row.fy ?? ''), amount: Number(row.amount) }))
      .filter((row) => row.fy && Number.isFinite(row.amount))
  } catch {
    return []
  }
}

async function loadAccrualSnapshot(fy: string) {
  const supabase = getSupabase()
  const [{ data: setting }, { data: invoiceRows }, { data: poRows }] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', ACCRUAL_SETTING_KEY).maybeSingle(),
    supabase.from('invoices').select('id, invoice_no, invoice_date, service_to, amount, approved_amount, status'),
    supabase.from('po_versions').select('status, released_amount, amount, invoices(invoice_date, service_to)'),
  ])
  const override = parseAccrualOverrides(setting?.value).find((row) => row.fy === fy)?.amount ?? null
  const invoices = (invoiceRows ?? []) as Array<{
    id: string
    invoice_no: string | null
    invoice_date: string | null
    service_to?: string | null
    amount: unknown
    approved_amount: unknown
    status: string | null
  }>
  const pos = (poRows ?? []) as Array<{
    status?: unknown
    released_amount?: unknown
    amount?: unknown
    invoices?: { invoice_date?: string | null; service_to?: string | null } | { invoice_date?: string | null; service_to?: string | null }[] | null
  }>
  const shapedPos = pos.map((p) => ({
    ...p,
    invoices: Array.isArray(p.invoices) ? (p.invoices[0] ?? null) : (p.invoices ?? null),
  }))
  const snap = accrualForFy(fy, invoices, shapedPos, override)
  const unpaidInvoices = invoices
    .filter((i) => invoiceBudgetFy(i) === fy && String(i.status ?? '') !== 'Paid')
    .map((i) => ({
      id: i.id,
      invoice_no: i.invoice_no,
      invoice_date: i.invoice_date,
      service_to: i.service_to ?? null,
      status: i.status,
      amount: invoiceAccrualAmount(i),
    }))
  return { ...snap, invoices: unpaidInvoices }
}

masterRouter.get('/accruals', authRequired, async (req, res, next) => {
  try {
    const fy = String(req.query?.fy ?? '').trim()
    if (!fy) {
      const now = new Date()
      const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
      const labels: string[] = []
      for (let y = start - 3; y <= start; y++) labels.push(`FY${String(y).slice(2)}`)
      res.json({ years: await Promise.all(labels.map((year) => loadAccrualSnapshot(year))) })
      return
    }
    res.json(await loadAccrualSnapshot(fy))
  } catch (err) {
    next(err)
  }
})

masterRouter.put('/accruals', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const fy = String(req.body?.fy ?? '').trim()
    if (!fy) {
      res.status(400).json({ error: 'fy is required' })
      return
    }
    if (!req.body?.masterAccess) {
      res.status(403).json({ error: 'Accrual override requires Master Access', code: 'MASTER_ACCESS_REQUIRED' })
      return
    }
    const raw = req.body?.override
    let override: number | null = null
    if (raw !== null && raw !== undefined && raw !== '') {
      override = Number(raw)
      if (!Number.isFinite(override) || override < 0) {
        res.status(400).json({ error: 'override must be a non-negative number or null' })
        return
      }
    }
    const supabase = getSupabase()
    const { data: existing, error: loadError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', ACCRUAL_SETTING_KEY)
      .maybeSingle()
    if (loadError) {
      res.status(500).json({ error: `Failed to load accruals: ${loadError.message}` })
      return
    }
    const next = parseAccrualOverrides(existing?.value).filter((row) => row.fy !== fy)
    if (override != null) next.push({ fy, amount: override })
    const { error: saveError } = await supabase
      .from('app_settings')
      .upsert({ key: ACCRUAL_SETTING_KEY, value: JSON.stringify(next) }, { onConflict: 'key' })
    if (saveError) {
      res.status(400).json({ error: saveError.message })
      return
    }
    res.json(await loadAccrualSnapshot(fy))
  } catch (err) {
    next(err)
  }
})
