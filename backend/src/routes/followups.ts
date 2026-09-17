import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { sendEmail, renderTemplate, textToHtml } from '../services/emailService.js'
import { getSetting } from '../services/settingsService.js'
import { invoiceBudgetDate, LOCKED_FY_MESSAGE, writeBlocked } from '../services/fyLock.js'
import { parseImportDate } from '../services/calendarDate.js'
import { firstEmbed, vendorsAsList } from '../services/embed.js'
import type { AuthUser, PendingFollowup } from '../types/index.js'

export const followupsRouter = Router()

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  const ymd = parseImportDate(String(d))
  if (!ymd) return String(d)
  const [y, m, day] = ymd.split('-')
  return `${day}-${MONTH_ABBR[Number(m) - 1]}-${y}`
}

followupsRouter.get('/pending', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, invoice_no, invoice_date, service_from, amount, contracts(contract_no, vendor_id, vendors(name, email))')
      .eq('status', 'Pending')
      .order('created_at', { ascending: true })
    if (error) {
      res.status(500).json({ error: `Failed to load pending invoices: ${error?.message}` })
      return
    }
    const list: PendingFollowup[] = (invoices ?? [])
      .map((inv) => {
        const contract = firstEmbed(inv.contracts as Record<string, unknown> | Record<string, unknown>[] | null)
        const vendor = vendorsAsList(contract?.vendors)[0] as { name?: string; email?: string | null } | undefined
        return {
          invoiceId: inv.id,
          invoiceNo: inv.invoice_no,
          invoiceDate: inv.invoice_date,
          amount: Number(inv.amount || 0),
          contractNo: String(contract?.contract_no ?? ''),
          vendorId: String(contract?.vendor_id ?? ''),
          vendorName: String(vendor?.name ?? 'Unknown'),
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
      .select('id, invoice_no, invoice_date, service_from, amount, contracts(contract_no, vendor_id, vendors(name, email))')
      .in('id', invoiceIds)
      .eq('status', 'Pending')

    const template = templateOverride || (await getSetting('followup_template')) || ''

    const sent: string[] = []
    const failed: { invoiceId: string; reason: string }[] = []

    for (const inv of invoices ?? []) {
      const locked = writeBlocked(actorKey(req as { user?: AuthUser }), invoiceBudgetDate(inv))
      if (locked) {
        failed.push({ invoiceId: inv.id, reason: LOCKED_FY_MESSAGE })
        continue
      }
      const contract = firstEmbed(inv.contracts as Record<string, unknown> | Record<string, unknown>[] | null)
      const vendor = vendorsAsList(contract?.vendors)[0] as { name?: string; email?: string | null } | undefined
      if (!vendor?.email) {
        failed.push({ invoiceId: inv.id, reason: 'No surveyor email on vendor' })
        continue
      }
      const data = {
        vendorName: vendor.name,
        contractNo: String(contract?.contract_no ?? ''),
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
        vendor_id: contract?.vendor_id ?? null,
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
