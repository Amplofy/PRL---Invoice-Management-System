import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { sendEmail, renderTemplate, textToHtml } from '../services/emailService.js'
import { getSetting } from '../services/settingsService.js'
import { LOCKED_FY_MESSAGE, writeBlocked } from '../services/fyLock.js'
import type { AuthUser, PendingFollowup } from '../types/index.js'

export const followupsRouter = Router()

function actorKey(req: { user?: AuthUser }): string {
  return req.user?.id || req.user?.email || 'anon'
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(dt.getDate()).padStart(2, '0')}-${months[dt.getMonth()]}-${dt.getFullYear()}`
}

followupsRouter.get('/pending', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, invoice_no, invoice_date, amount, contracts(contract_no, vendor_id, vendors(name, email))')
      .eq('status', 'Pending')
      .order('created_at', { ascending: true })
    if (error) {
      res.status(500).json({ error: `Failed to load pending invoices: ${error?.message}` })
      return
    }
    const list: PendingFollowup[] = (invoices ?? [])
      .map((inv) => {
        const rel = inv.contracts as unknown as
          | { contract_no: string; vendor_id: string; vendors: { name: string; email: string | null }[] | null }
          | null
        const contract = Array.isArray(rel) ? rel[0] : rel
        const vendor = contract?.vendors?.[0] ?? null
        return {
          invoiceId: inv.id,
          invoiceNo: inv.invoice_no,
          invoiceDate: inv.invoice_date,
          amount: Number(inv.amount || 0),
          contractNo: contract?.contract_no ?? '',
          vendorId: contract?.vendor_id ?? '',
          vendorName: vendor?.name ?? 'Unknown',
          email: vendor?.email ?? '',
        }
      })
      .filter((f) => f.email)
    res.json({ pending: list, total: list.length })
  } catch (err) {
    next(err)
  }
})

followupsRouter.post('/send', authRequired, async (req, res, next) => {
  try {
    const { invoiceIds, templateOverride } = req.body as {
      invoiceIds: string[]
      templateOverride?: string
    }
    if (!Array.isArray(invoiceIds) || !invoiceIds.length) {
      res.status(400).json({ error: 'invoiceIds array is required' })
      return
    }
    const supabase = getSupabase()
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_no, invoice_date, amount, contracts(contract_no, vendor_id, vendors(name, email))')
      .in('id', invoiceIds)
      .eq('status', 'Pending')

    const template = templateOverride || (await getSetting('followup_template')) || ''

    const sent: string[] = []
    const failed: { invoiceId: string; reason: string }[] = []

    for (const inv of invoices ?? []) {
      const locked = writeBlocked(actorKey(req as { user?: AuthUser }), inv.invoice_date as string | null)
      if (locked) {
        failed.push({ invoiceId: inv.id, reason: LOCKED_FY_MESSAGE })
        continue
      }
      const rel = inv.contracts as unknown as
        | { contract_no: string; vendor_id: string; vendors: { name: string; email: string | null }[] | null }
        | null
      const contract = Array.isArray(rel) ? rel[0] : rel
      const vendor = contract?.vendors?.[0] ?? null
      if (!vendor?.email) {
        failed.push({ invoiceId: inv.id, reason: 'No surveyor email on vendor' })
        continue
      }
      const data = {
        vendorName: vendor.name,
        contractNo: contract?.contract_no ?? '',
        invoiceNo: inv.invoice_no,
        invoiceDate: fmtDate(inv.invoice_date as string | null),
        amount: fmtMoney(Number(inv.amount || 0)),
        invoiceList: `- ${inv.invoice_no} (${fmtDate(inv.invoice_date as string | null)}): ${fmtMoney(Number(inv.amount || 0))}`,
      }
      const body = renderTemplate(template, data)
      const subject = `PRL - Pending Invoice Follow-up (${inv.invoice_no})`
      const result = await sendEmail(vendor.email, subject, textToHtml(body))
      await supabase.from('followup_emails').insert({
        invoice_id: inv.id,
        vendor_id: vendor.id,
        recipient: vendor.email,
        subject,
        body,
        status: result.error ? 'failed' : 'sent',
      })
      if (result.error) failed.push({ invoiceId: inv.id, reason: result.error })
      else sent.push(inv.id)
    }

    res.json({ sent, failed })
  } catch (err) {
    next(err)
  }
})
