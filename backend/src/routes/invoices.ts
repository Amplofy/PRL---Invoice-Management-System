import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { audit } from '../services/auditService.js'

export const invoicesRouter = Router()

invoicesRouter.get('/invoices', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { status, contract, search } = req.query as Record<string, string | undefined>
    let query = supabase
      .from('invoices')
      .select('*, contracts(contract_no, service, vendors(name))')
      .order('created_at', { ascending: false })

    if (status && status !== 'all') query = query.eq('status', status)
    if (contract && contract !== 'all') query = query.eq('contract_id', contract)
    if (search) {
      const like = `%${search}%`
      query = query.or(`invoice_no.ilike.${like},serial_no.ilike.${like}`)
    }

    const { data, error } = await query
    if (error) {
      res.status(500).json({ error: 'Failed to load invoices' })
      return
    }
    res.json({ invoices: data ?? [] })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.get('/invoices/:id', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('invoices')
      .select('*, contracts(*)')
      .eq('id', req.params.id)
      .maybeSingle()
    if (error || !data) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    res.json({ invoice: data })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.post('/invoices', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const body = req.body ?? {}
    const user = (req as { user?: { id?: string; email?: string } }).user
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        serial_no: body.serial_no ?? null,
        processing_date: body.processing_date ?? body.invoice_date ?? null,
        contract_id: body.contract_id ?? null,
        invoice_no: body.invoice_no,
        invoice_date: body.invoice_date ?? null,
        t1: body.t1 ?? null,
        t2: body.t2 ?? null,
        t3: body.t3 ?? null,
        tanker_name: body.tanker_name ?? null,
        trips: body.trips ?? null,
        item_no: body.item_no ?? null,
        cost_element: body.cost_element ?? null,
        service_from: body.service_from ?? null,
        service_to: body.service_to ?? null,
        amount: body.amount ?? 0,
        status: body.status ?? 'Pending',
        remarks: body.remarks ?? null,
        created_by: user?.email,
        updated_by: user?.email,
      })
      .select()
      .single()
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    await audit('Create', 'Invoice', data.id, `Invoice ${data.invoice_no} created`)
    res.status(201).json({ invoice: data })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.put('/invoices/:id', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const body = req.body ?? {}
    const user = (req as { user?: { email?: string } }).user
    const { row_version, ...updates } = body
    const { data, error } = await supabase
      .from('invoices')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: user?.email,
      })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Invoice not found' })
      return
    }
    await audit('Update', 'Invoice', data.id, `Invoice ${data.invoice_no} updated`)
    res.json({ invoice: data })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.delete('/invoices/:id', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: pos } = await supabase.from('po_versions').select('id').eq('invoice_id', req.params.id)
    if ((pos ?? []).length) {
      res.status(400).json({ error: 'Cannot delete invoice with generated payment orders' })
      return
    }
    const { error } = await supabase.from('invoices').delete().eq('id', req.params.id)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    await audit('Delete', 'Invoice', String(req.params.id), 'Invoice deleted')
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

async function createPo(
  supabase: ReturnType<typeof getSupabase>,
  invoiceId: string,
  email: string | undefined,
): Promise<{ po: { id: string } | null; created: boolean; error?: string }> {
  const { data: existing } = await supabase
    .from('po_versions')
    .select('id')
    .eq('invoice_id', invoiceId)
    .limit(1)
  if ((existing ?? []).length) return { po: existing![0], created: false }
  const serial = `PO-${Date.now()}`
  const { data: po, error } = await supabase
    .from('po_versions')
    .insert({ invoice_id: invoiceId, serial_no: serial, generated_by: email })
    .select()
    .single()
  if (error) return { po: null, created: false, error: error.message }
  await audit('GeneratePO', 'PaymentOrder', po.id, `PO ${serial} generated for invoice ${invoiceId}`)
  return { po, created: true }
}

invoicesRouter.post('/invoices/:id/approve', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const user = (req as { user?: { email?: string } }).user
    const { remarks, approvedAmount } = req.body ?? {}
    const { data, error } = await supabase
      .from('invoices')
      .update({
        status: 'Approved',
        approved_by: user?.email,
        approved_date: new Date().toISOString(),
        approved_amount: approvedAmount ?? null,
        remarks: remarks ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Invoice not found' })
      return
    }
    await audit('Approve', 'Invoice', data.id, `Invoice ${data.invoice_no} approved`)
    const { po, error: poError } = await createPo(supabase, data.id, user?.email)
    if (poError) {
      res.status(500).json({ error: `Invoice approved but PO generation failed: ${poError}` })
      return
    }
    res.json({ invoice: data, po })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.post('/invoices/:id/reject', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const user = (req as { user?: { email?: string } }).user
    const reason = String(req.body?.reason ?? '').trim()
    if (!reason) {
      res.status(400).json({ error: 'Rejection reason is required' })
      return
    }
    const { data, error } = await supabase
      .from('invoices')
      .update({
        status: 'Rejected',
        approved_by: user?.email,
        approved_date: new Date().toISOString(),
        remarks: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Invoice not found' })
      return
    }
    await audit('Reject', 'Invoice', data.id, `Invoice ${data.invoice_no} rejected: ${reason}`)
    res.json({ invoice: data })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.post('/invoices/:id/po', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const user = (req as { user?: { email?: string } }).user
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    if (invoice.status !== 'Approved') {
      res.status(400).json({ error: 'Payment order requires an approved invoice' })
      return
    }
    const invoiceId = String(req.params.id)
    const { po, created, error: poError } = await createPo(supabase, invoiceId, user?.email)
    if (poError) {
      res.status(400).json({ error: poError })
      return
    }
    if (po) {
      res.status(created ? 201 : 200).json({ po })
      return
    }
    res.status(400).json({ error: 'Could not generate payment order' })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.get('/invoices/:id/po', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('po_versions')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('generated_at', { ascending: false })
    if (error) {
      res.status(500).json({ error: 'Failed to load payment orders' })
      return
    }
    res.json({ poVersions: data ?? [] })
  } catch (err) {
    next(err)
  }
})
