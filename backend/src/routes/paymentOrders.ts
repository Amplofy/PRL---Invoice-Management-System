import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { audit } from '../services/auditService.js'
import { LOCKED_FY_MESSAGE, writeBlockedForPayment } from '../services/fyLock.js'
import { parseReleasedVia } from '../services/accrual.js'
import {
  bulkSummary,
  invoiceApprovedAmount,
  isAwaitingFinance,
  isFinanceRole,
  money,
  normalizePoStatus,
  PO_STATUS,
  poGeneratedAmount,
  poReleasedAmount,
  rejectPatch,
  releasePatch,
  type NestedInvoice,
  type PoBulkResult,
  type PoHistoryRow,
} from '../services/poFinance.js'
import type { AuthUser } from '../types/index.js'
import { normalizeInvoiceEmbed } from '../services/embed.js'

export const paymentOrdersRouter = Router()

const PO_SELECT =
  '*, invoices(id, invoice_no, invoice_date, processing_date, service_from, service_to, amount, approved_amount, status, cost_element, t1, t2, t3, location, tanker_name, trips, item_no, remarks, contracts(contract_no, vendor_id, vendors(name, email)))'

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
    invoices: normalizeInvoiceEmbed(invoice),
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
    const locked = writeBlockedForPayment(actorKey(req as { user?: AuthUser }), invoice?.invoice_date, invoice?.status, invoice?.service_from)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const status = normalizePoStatus(existing.status)
    if (!isAwaitingFinance(existing.status)) {
      res.status(400).json({
        error:
          status === PO_STATUS.Rejected
            ? 'Rejected payment orders cannot be approved'
            : 'Payment order already cleared and payment released',
      })
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
    const viaRaw = req.body?.releasedVia
    const releasedVia = viaRaw == null || viaRaw === '' ? null : parseReleasedVia(viaRaw)
    if (viaRaw != null && String(viaRaw).trim() !== '' && !releasedVia) {
      res.status(400).json({ error: 'Invalid releasedVia' })
      return
    }
    const releaseReference = String(req.body?.releaseReference ?? '').trim() || null
    const now = new Date().toISOString()
    const email = actorEmail(req as { user?: AuthUser })
    const { data: updated, error: updateError } = await supabase
      .from('po_versions')
      .update(releasePatch({ email, now, releasedAmount, releasedVia, releaseReference, remarks }))
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
    const locked = writeBlockedForPayment(actorKey(req as { user?: AuthUser }), invoice?.invoice_date, invoice?.status, invoice?.service_from)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const status = normalizePoStatus(existing.status)
    if (!isAwaitingFinance(existing.status)) {
      res.status(400).json({
        error: status === PO_STATUS.Rejected ? 'Payment order already rejected' : 'Cleared payment orders cannot be rejected',
      })
      return
    }
    const email = actorEmail(req as { user?: AuthUser })
    const now = new Date().toISOString()
    const generated = poGeneratedAmount({ amount: existing.amount }, invoice)
    const { data: updated, error: updateError } = await supabase
      .from('po_versions')
      .update(rejectPatch({ email, now, reason }))
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

function poSerial(row: Record<string, unknown>): string | null {
  return row.serial_no == null || row.serial_no === '' ? null : String(row.serial_no)
}

async function loadBulkTargets(
  supabase: ReturnType<typeof getSupabase>,
  ids: string[],
): Promise<{ targets: Record<string, unknown>[]; outcomes: PoBulkResult[] }> {
  const { data, error } = await supabase.from('po_versions').select(PO_SELECT).in('id', ids)
  if (error) throw new Error(`Failed to load payment orders: ${error.message}`)
  const byId = new Map<string, Record<string, unknown>>()
  for (const row of (data ?? []) as Record<string, unknown>[]) byId.set(String(row.id), row)
  const targets: Record<string, unknown>[] = []
  const outcomes: PoBulkResult[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (!row) {
      outcomes.push({ serial: null, outcome: 'failed' })
      continue
    }
    if (!isAwaitingFinance(row.status)) {
      outcomes.push({ serial: poSerial(row), outcome: 'skipped' })
      continue
    }
    targets.push(row)
  }
  return { targets, outcomes }
}

function firstLockedFy(
  req: { user?: AuthUser },
  targets: Record<string, unknown>[],
): string | null {
  const userKey = actorKey(req)
  for (const row of targets) {
    const invoice = firstRel(row.invoices as NestedInvoice | NestedInvoice[] | null)
    const locked = writeBlockedForPayment(userKey, invoice?.invoice_date, invoice?.status, invoice?.service_from)
    if (locked) return locked
  }
  return null
}

paymentOrdersRouter.post('/payment-orders/bulk-release', authRequired, async (req, res, next) => {
  try {
    const user = (req as { user?: AuthUser }).user
    if (!isFinanceRole(user?.role)) {
      res.status(403).json({ error: 'Only a finance official can approve a payment order' })
      return
    }
    const ids = Array.isArray(req.body?.ids)
      ? Array.from(new Set((req.body.ids as unknown[]).map((raw) => String(raw)).filter((id) => id.trim() !== '')))
      : []
    if (ids.length === 0) {
      res.status(400).json({ error: 'No payment orders selected' })
      return
    }
    const remarks = String(req.body?.remarks ?? '').trim() || null
    const viaRaw = req.body?.releasedVia
    const releasedVia = viaRaw == null || viaRaw === '' ? null : parseReleasedVia(viaRaw)
    if (viaRaw != null && String(viaRaw).trim() !== '' && !releasedVia) {
      res.status(400).json({ error: 'Invalid releasedVia' })
      return
    }
    const releaseReference = String(req.body?.releaseReference ?? '').trim() || null
    const supabase = getSupabase()
    const { targets, outcomes } = await loadBulkTargets(supabase, ids)
    const locked = firstLockedFy(req as { user?: AuthUser }, targets)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const email = actorEmail(req as { user?: AuthUser })
    const now = new Date().toISOString()
    for (const row of targets) {
      const id = String(row.id)
      const serial = poSerial(row)
      const invoice = firstRel(row.invoices as NestedInvoice | NestedInvoice[] | null)
      const releasedAmount = poGeneratedAmount({ amount: row.amount }, invoice)
      const { data: updated, error: updateError } = await supabase
        .from('po_versions')
        .update(releasePatch({ email, now, releasedAmount, releasedVia, releaseReference, remarks }))
        .eq('id', id)
        .select('id, serial_no, invoice_id')
        .single()
      if (updateError || !updated) {
        outcomes.push({ serial, outcome: 'failed' })
        continue
      }
      const invoiceId = String(updated.invoice_id ?? invoice?.id ?? '')
      const label = updated.serial_no ?? serial
      await recordHistory(supabase, {
        po_id: id,
        invoice_id: invoiceId,
        action: 'FinanceApproved',
        actor: email,
        amount: releasedAmount,
        remarks,
      })
      await recordHistory(supabase, {
        po_id: id,
        invoice_id: invoiceId,
        action: 'PaymentReleased',
        actor: email,
        amount: releasedAmount,
        remarks: remarks ?? 'Payment released to surveyor; amount deducted from budget',
      })
      await audit('FinanceClearPO', 'PaymentOrder', id, `PO ${label} cleared by finance; Rs ${releasedAmount} released to surveyor`)
      if (invoiceId) {
        const { error: invErr } = await supabase
          .from('invoices')
          .update({ status: 'Paid', updated_at: now, updated_by: email ?? null })
          .eq('id', invoiceId)
        if (invErr) console.error('[invoices:markPaid]', invErr.message)
        else await audit('MarkPaid', 'Invoice', invoiceId, `Invoice marked Paid after PO ${label} released`)
      }
      outcomes.push({ serial, outcome: 'succeeded' })
    }
    const summary = bulkSummary(outcomes)
    res.json({
      released: summary.succeeded,
      skipped: summary.skipped,
      failed: summary.failed,
      skippedSerials: summary.skippedSerials,
      failedSerials: summary.failedSerials,
    })
  } catch (err) {
    next(err)
  }
})

paymentOrdersRouter.post('/payment-orders/bulk-reject', authRequired, async (req, res, next) => {
  try {
    const user = (req as { user?: AuthUser }).user
    if (!isFinanceRole(user?.role)) {
      res.status(403).json({ error: 'Only a finance official can reject a payment order' })
      return
    }
    const ids = Array.isArray(req.body?.ids)
      ? Array.from(new Set((req.body.ids as unknown[]).map((raw) => String(raw)).filter((id) => id.trim() !== '')))
      : []
    if (ids.length === 0) {
      res.status(400).json({ error: 'No payment orders selected' })
      return
    }
    const reason = String(req.body?.reason ?? '').trim()
    if (!reason) {
      res.status(400).json({ error: 'Rejection reason is required' })
      return
    }
    const supabase = getSupabase()
    const { targets, outcomes } = await loadBulkTargets(supabase, ids)
    const locked = firstLockedFy(req as { user?: AuthUser }, targets)
    if (locked) {
      res.status(403).json({ error: LOCKED_FY_MESSAGE, fy: locked, code: 'FY_LOCKED' })
      return
    }
    const email = actorEmail(req as { user?: AuthUser })
    const now = new Date().toISOString()
    for (const row of targets) {
      const id = String(row.id)
      const serial = poSerial(row)
      const invoice = firstRel(row.invoices as NestedInvoice | NestedInvoice[] | null)
      const generated = poGeneratedAmount({ amount: row.amount }, invoice)
      const { data: updated, error: updateError } = await supabase
        .from('po_versions')
        .update(rejectPatch({ email, now, reason }))
        .eq('id', id)
        .select('id, serial_no, invoice_id')
        .single()
      if (updateError || !updated) {
        outcomes.push({ serial, outcome: 'failed' })
        continue
      }
      await recordHistory(supabase, {
        po_id: id,
        invoice_id: String(updated.invoice_id ?? invoice?.id ?? ''),
        action: 'FinanceRejected',
        actor: email,
        amount: generated,
        remarks: reason,
      })
      await audit(
        'FinanceRejectPO',
        'PaymentOrder',
        id,
        `PO ${updated.serial_no ?? serial} rejected by finance: ${reason}`,
      )
      outcomes.push({ serial, outcome: 'succeeded' })
    }
    const summary = bulkSummary(outcomes)
    res.json({
      rejected: summary.succeeded,
      skipped: summary.skipped,
      failed: summary.failed,
      skippedSerials: summary.skippedSerials,
      failedSerials: summary.failedSerials,
    })
  } catch (err) {
    next(err)
  }
})
