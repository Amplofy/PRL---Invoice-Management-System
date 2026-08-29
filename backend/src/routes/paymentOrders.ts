import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'

export const paymentOrdersRouter = Router()

paymentOrdersRouter.get('/payment-orders', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('po_versions')
      .select('*, invoices(invoice_no, invoice_date, amount, status, contracts(contract_no, vendors(name)))')
      .order('generated_at', { ascending: false })
    if (error) {
      res.status(500).json({ error: `Failed to load payment orders: ${error?.message}` })
      return
    }
    res.json({ paymentOrders: data ?? [] })
  } catch (err) {
    next(err)
  }
})
