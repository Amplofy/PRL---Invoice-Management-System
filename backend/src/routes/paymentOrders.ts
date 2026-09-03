import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { audit } from '../services/auditService.js'
import { LOCKED_FY_MESSAGE, writeBlocked } from '../services/fyLock.js'
import {
  invoiceApprovedAmount,
  isFinanceRole,
  money,
  normalizePoStatus,
  PO_STATUS,
  poGeneratedAmount,
  poReleasedAmount,
  type NestedInvoice,
  type PoHistoryRow,
} from '../services/poFinance.js'
import type { AuthUser } from '../types/index.js'

export const paymentOrdersRouter = Router()

const PO_SELECT =
  '*, invoices(id, invoice_no, invoice_date, amount, approved_amount, status, cost_element, contracts(contract_no, vendors(name)))'

function actorKey(req: { user?: AuthUser }): string {
  return req.user?.id || req.user?.email || 'anon'
}

function actorEmail(req: { user?: AuthUser }): string | undefined {
  return req.user?.email
}

function firstRel<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

async function recordHistory(
  supabase: ReturnType<typeof getSupabase>,
  row: { po_id: string; invoice_id?: string | null; action: string; actor?: string; amount?: number; remarks?: string | null },
): Promise<void> {
  const { error } = await supabase.from('po_history').insert({
    po_id: row.po_id,
    invoice_id: row.invoice_id ?? null,
    action: row.action,
    actor: row.actor ?? null,
    amount: row.amount ?? null,
    remarks: row.remarks ?? null,
  })
  if (error) console.error('[po_history]', error.message)
}

function shapePo(row: Record<string, unknown>, history: PoHistoryRow[] = []) {
  const invoice = firstRel(row.invoices as NestedInvoice | NestedInvoice[] | null)
  const status = normalizePoStatus(row.status)
  const generated = poGeneratedAmount({ amount: row.amount }, invoice)
  return {
    ...row,
    status,
    amount: generated,
    invoices: invoice,
    history,
    approved_amount: invoiceApprovedAmount(invoice),
    released_amount: status === PO_STATUS.Cleared ? poReleasedAmount({ status, released_amount: row.released_amount, amount: generated }) : money(row.released_amount),
  }
}

async function loadHistoryMap(
  supabase: ReturnType<typeof getSupabase>,
  poIds: string[],
): Promise<Map<string, PoHistoryRow[]>> {
  const map = new Map<string, PoHistoryRow[]>()
  if (poIds.length === 0) return map
  const { data, error } = await supabase
    .from('po_history')
    .select('*')
    .in('po_id', poIds)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[po_history:list]', error.message)
    return map
  }
  for (const row of (data ?? []) as PoHistoryRow[]) {
    const list = map.get(row.po_id) ?? []
    list.push(row)
    map.set(row.po_id, list)
  }
  return map
}

paymentOrdersRouter.get('/payment-orders', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('po_versions')
      .select(PO_SELECT)
      .order('generated_at', { ascending: false })
    if (error) {
      res.status(500).json({ error: `Failed to load payment orders: ${error.message}` })
      return
    }
    const rows = (data ?? []) as Record<string, unknown>[]
    const history = await loadHistoryMap(supabase, rows.map((r) => String(r.id)))
    res.json({ paymentOrders: rows.map((r) => shapePo(r, history.get(String(r.id)) ?? [])) })
  } catch (err) {
    next(err)
  }
})

paymentOrdersRouter.get('/payment-orders/:id/history', authRequired, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('po_history')
      .select('*')
      .eq('po_id', req.params.id)
      .order('created_at', { ascending: true })
    if (error) {
      res.status(500).json({ error: `Failed to load PO history: ${error.message}` })
      return
    }
    res.json({ history: data ?? [] })
  } catch (err) {
    next(err)
  }
})

paymentOrdersRouter.post('/payment-orders/:id/approve', authRequired, async (req, res, next) => {
  try {
    const user = (req as { user?: AuthUser }).user
    if (!isFinanceRole(user?.role)) {
      res.status(403).json({ error: 'Only a finance official can approve a payment order' })
      return
    }
    const supabase = getSupabase()
    const { data: existing, error: loadError } = await supabase
      .from('po_versions')
      .select(PO_SELECT)
      .eq('id', req.params.id)
      .maybeSingle()
    if (loadError || !existing) {
      res.status(404).json({ error: 'Payment order not found' })
      return
    }
    const invoice = firstRel(existing.invoices as NestedInvoice | NestedInvoice[] | null)
    const locked = writeBlocked(actorKey(req as { user?: AuthUser }), invoice?.invoice_date)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const status = normalizePoStatus(existing.status)
    if (status === PO_STATUS.Cleared) {
      res.status(400).json({ error: 'Payment order already cleared and payment released' })
      return
    }
    if (status === PO_STATUS.Rejected) {
      res.status(400).json({ error: 'Rejected payment orders cannot be approved' })
      return
    }
    const generated = poGeneratedAmount({ amount: existing.amount }, invoice)
    const requested = req.body?.releasedAmount
    const releasedAmount = requested == null || requested === '' ? generated : money(requested)
    if (releasedAmount < 0) {
      res.status(400).json({ error: 'Released amount cannot be negative' })
      return
    }
    const remarks = String(req.body?.remarks ?? '').trim() || null
    const now = new Date().toISOString()
    const email = actorEmail(req as { user?: AuthUser })
    const { data: updated, error: updateError } = await supabase
      .from('po_versions')
      .update({
        status: PO_STATUS.Cleared,
        finance_approved_by: email,
        finance_approved_at: now,
        finance_remarks: remarks,
        released_amount: releasedAmount,
        released_by: email,
        released_at: now,
      })
      .eq('id', req.params.id)
      .select(PO_SELECT)
      .single()
    if (updateError || !updated) {
      res.status(400).json({ error: updateError?.message || 'Failed to approve payment order' })
      return
    }
    await recordHistory(supabase, {
      po_id: String(updated.id),
      invoice_id: String(updated.invoice_id ?? invoice?.id ?? ''),
      action: 'FinanceApproved',
      actor: email,
      amount: releasedAmount,
      remarks,
    })
    await recordHistory(supabase, {
      po_id: String(updated.id),
      invoice_id: String(updated.invoice_id ?? invoice?.id ?? ''),
      action: 'PaymentReleased',
      actor: email,
      amount: releasedAmount,
      remarks: remarks ?? 'Payment released to surveyor; amount deducted from budget',
    })
    await audit(
      'FinanceClearPO',
      'PaymentOrder',
      String(updated.id),
      `PO ${updated.serial_no} cleared by finance; Rs ${releasedAmount} released to surveyor`,
    )
    const invoiceId = String(updated.invoice_id ?? invoice?.id ?? '')
    if (invoiceId) {
      const { error: invErr } = await supabase
        .from('invoices')
        .update({ status: 'Paid', updated_at: now, updated_by: email ?? null })
        .eq('id', invoiceId)
      if (invErr) console.error('[invoices:markPaid]', invErr.message)
      else {
        await audit(
          'MarkPaid',
          'Invoice',
          invoiceId,
          `Invoice marked Paid after PO ${updated.serial_no} released`,
        )
      }
    }
    const history = await loadHistoryMap(supabase, [String(updated.id)])
    res.json({ po: shapePo(updated as Record<string, unknown>, history.get(String(updated.id)) ?? []) })
  } catch (err) {
    next(err)
  }
})

paymentOrdersRouter.post('/payment-orders/:id/reject', authRequired, async (req, res, next) => {
  try {
    const user = (req as { user?: AuthUser }).user
    if (!isFinanceRole(user?.role)) {
      res.status(403).json({ error: 'Only a finance official can reject a payment order' })
      return
    }
    const reason = String(req.body?.reason ?? '').trim()
    if (!reason) {
      res.status(400).json({ error: 'Rejection reason is required' })
      return
    }
    const supabase = getSupabase()
    const { data: existing, error: loadError } = await supabase
      .from('po_versions')
      .select(PO_SELECT)
      .eq('id', req.params.id)
      .maybeSingle()
    if (loadError || !existing) {
      res.status(404).json({ error: 'Payment order not found' })
      return
    }
    const invoice = firstRel(existing.invoices as NestedInvoice | NestedInvoice[] | null)
    const locked = writeBlocked(actorKey(req as { user?: AuthUser }), invoice?.invoice_date)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const status = normalizePoStatus(existing.status)
    if (status === PO_STATUS.Cleared) {
      res.status(400).json({ error: 'Cleared payment orders cannot be rejected' })
      return
    }
    if (status === PO_STATUS.Rejected) {
      res.status(400).json({ error: 'Payment order already rejected' })
      return
    }
    const email = actorEmail(req as { user?: AuthUser })
    const now = new Date().toISOString()
    const generated = poGeneratedAmount({ amount: existing.amount }, invoice)
    const { data: updated, error: updateError } = await supabase
      .from('po_versions')
      .update({
        status: PO_STATUS.Rejected,
        finance_approved_by: email,
        finance_approved_at: now,
        finance_remarks: reason,
        released_amount: null,
        released_by: null,
        released_at: null,
      })
      .eq('id', req.params.id)
      .select(PO_SELECT)
      .single()
    if (updateError || !updated) {
      res.status(400).json({ error: updateError?.message || 'Failed to reject payment order' })
      return
    }
    await recordHistory(supabase, {
      po_id: String(updated.id),
      invoice_id: String(updated.invoice_id ?? invoice?.id ?? ''),
      action: 'FinanceRejected',
      actor: email,
      amount: generated,
      remarks: reason,
    })
    await audit(
      'FinanceRejectPO',
      'PaymentOrder',
      String(updated.id),
      `PO ${updated.serial_no} rejected by finance: ${reason}`,
    )
    const history = await loadHistoryMap(supabase, [String(updated.id)])
    res.json({ po: shapePo(updated as Record<string, unknown>, history.get(String(updated.id)) ?? []) })
  } catch (err) {
    next(err)
  }
})
