import { Router } from 'express'
import { getSupabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'

export const reportsRouter = Router()

function toMoney(v: unknown): number {
  return Number(v ?? 0) || 0
}

reportsRouter.get('/reports/dashboard', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: invoices } = await supabase.from('invoices').select(
      'amount, status, invoice_date, contract_id'
    )
    const { data: contracts } = await supabase
      .from('contracts')
      .select('id, contract_no, value, start_date, end_date, status')
    const { data: users } = await supabase.from('users').select('id, status')

    const inv = invoices ?? []
    const totalInv = inv.length
    const totalVal = inv.reduce((s, i) => s + toMoney(i.amount), 0)
    const approved = inv.filter((i) => i.status === 'Approved')
    const pending = inv.filter((i) => i.status === 'Pending')
    const rejected = inv.filter((i) => i.status === 'Rejected')
    const approvedVal = approved.reduce((s, i) => s + toMoney(i.amount), 0)
    const pendingVal = pending.reduce((s, i) => s + toMoney(i.amount), 0)
    const rejectedVal = rejected.reduce((s, i) => s + toMoney(i.amount), 0)

    const today = new Date()
    const openContracts = (contracts ?? []).filter((c) => {
      if (!c.end_date) return true
      return new Date(c.end_date) >= today
    }).length
    const expiring = (contracts ?? []).filter((c) => {
      if (!c.end_date) return false
      const days = Math.round((new Date(c.end_date).getTime() - today.getTime()) / 86400000)
      return days >= 0 && days <= 60
    }).length

    const monthly: Record<string, { month: string; total: number; count: number }> = {}
    for (const i of inv) {
      if (!i.invoice_date) continue
      const key = String(i.invoice_date).slice(0, 7)
      monthly[key] ??= { month: key, total: 0, count: 0 }
      monthly[key].total += toMoney(i.amount)
      monthly[key].count += 1
    }
    const trend = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month))

    const utilization = (contracts ?? []).map((c) => {
      const used = inv
        .filter((i) => i.contract_id === c.id && ['Approved', 'Accepted'].includes(i.status))
        .reduce((s, i) => s + toMoney(i.amount), 0)
      const value = toMoney(c.value)
      return {
        contractId: c.id,
        contractNo: c.contract_no ?? c.id,
        value,
        used,
        remaining: Math.max(0, value - used),
        pct: value > 0 ? Math.min(100, (used / value) * 100) : 0,
      }
    })

    res.json({
      kpis: {
        totalInvoices: totalInv,
        totalValue: totalVal,
        approvedValue: approvedVal,
        approvedCount: approved.length,
        pendingValue: pendingVal,
        pendingCount: pending.length,
        rejectedValue: rejectedVal,
        rejectedCount: rejected.length,
        openContracts,
        activeUsers: (users ?? []).filter((u) => u.status === 'active').length,
        expiringContracts: expiring,
        avgInvoice: totalInv ? totalVal / totalInv : 0,
      },
      trend,
      statusBreakdown: {
        approved: approved.length,
        pending: pending.length,
        rejected: rejected.length,
      },
      utilization,
    })
  } catch (err) {
    next(err)
  }
})

reportsRouter.get('/reports/summary', authRequired, async (_req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: invoices } = await supabase.from('invoices').select(
      'amount, status, contracts(contract_no, service, vendors(name))'
    )
    const inv = invoices ?? []

    const byVendor: Record<string, { vendor: string; total: number; count: number; approved: number }> = {}
    const byService: Record<string, number> = {}
    for (const i of inv) {
      const rel = i.contracts as unknown as
        | { contract_no: string; service: string; vendors: { name: string }[] | null }
        | null
      const contract = Array.isArray(rel) ? rel[0] : rel
      const vendorName = contract?.vendors?.[0]?.name ?? 'Unknown'
      const service = contract?.service ?? 'Unknown'
      byVendor[vendorName] ??= { vendor: vendorName, total: 0, count: 0, approved: 0 }
      byVendor[vendorName].total += toMoney(i.amount)
      byVendor[vendorName].count += 1
      if (i.status === 'Approved') byVendor[vendorName].approved += toMoney(i.amount)
      byService[service] = (byService[service] ?? 0) + toMoney(i.amount)
    }

    const approvalSummary = {
      total: inv.length,
      approved: inv.filter((i) => i.status === 'Approved').length,
      pending: inv.filter((i) => i.status === 'Pending').length,
      rejected: inv.filter((i) => i.status === 'Rejected').length,
      approvedValue: inv
        .filter((i) => i.status === 'Approved')
        .reduce((s, i) => s + toMoney(i.amount), 0),
      pendingValue: inv
        .filter((i) => i.status === 'Pending')
        .reduce((s, i) => s + toMoney(i.amount), 0),
      rejectedValue: inv
        .filter((i) => i.status === 'Rejected')
        .reduce((s, i) => s + toMoney(i.amount), 0),
    }

    res.json({
      byVendor: Object.values(byVendor).sort((a, b) => b.total - a.total),
      byService: Object.entries(byService).map(([service, total]) => ({ service, total })),
      approvalSummary,
    })
  } catch (err) {
    next(err)
  }
})
