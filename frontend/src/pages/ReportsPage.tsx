import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, TrendingUp, TrendingDown, Wallet, Landmark, Sparkles, CircleDollarSign, Gauge, Clock, Banknote, FileSpreadsheet, Lock, CalendarRange, Building2 } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { apiGet } from '../lib/api'
import { formatMoney, formatDate } from '../lib/format'
import { useLiveDomain } from '../lib/store'
import { useToast } from '../components/ui/Toast'
import GlassCard from '../components/ui/GlassCard'
import EmptyState from '../components/ui/EmptyState'
import { useThemeColors } from '../lib/themeColors'
import { fyMonthIndex, FY_MONTHS, QUARTERS, costCategory, currentFiscalYear, shiftFiscalYear, elapsedInFiscalYear, nearbyFiscalYears, isClosedFiscalYear, invoiceBudgetDate, invoiceBudgetFy, invoiceBudgetInfo, isAccrualOpenInvoice, isMiscCostElement, fyStartYear, type FiscalQuarter } from '../lib/fiscal'
import { invoiceListPath } from '../lib/invoiceWindow'
import { downloadCSV } from '../lib/export'
import { useCountUp } from '../lib/useCountUp'
import PageHeader from '../components/PageHeader'
import Button from '../components/ui/Button'
import GenerateReportDialog from '../components/GenerateReportDialog'
import ReportsRibbon from '../components/ReportsRibbon'
import { invoiceApprovedAmount, poGeneratedAmount, poReleasedAmount } from '../lib/paymentOrder'
import AdvancedFilter from '../components/ui/AdvancedFilter'
import { applyFilters, type FilterColumnDef, type FilterLogic, type FilterState } from '../lib/filters'
import { isSignedOff } from '../lib/invoice'
import { costElementBreakup, filterAccrualYears, yearlyBudgetFigures, type AccrualSortKey } from '../lib/fyAnalysis'
import AccrualAnalysisPanel from './AccrualAnalysisPanel'
import { ChartStage, MixWave } from '../components/ui/EnergyWave'
import { barDataset, barMotion, doughnutMotion, doughnutSlice, lineMotion, waveLine } from '../lib/chartWave'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler)

interface Invoice {
  id: string
  invoice_no: string | null
  invoice_date: string | null
  service_to?: string | null
  contract_id: string | null
  cost_element: string | null
  amount: number
  approved_amount?: number | null
  status: string
  contracts: { contract_no: string | null; vendors: Array<{ name: string | null }> | null } | null
}
interface ReportPo {
  id: string
  invoice_id?: string | null
  status: string | null
  amount?: number | null
  released_amount?: number | null
  invoices?: {
    id?: string
    invoice_date?: string | null
    amount?: number
    approved_amount?: number | null
    cost_element?: string | null
    status?: string | null
    service_to?: string | null
  } | null
}
interface Contract {
  id: string
  contract_no: string
  value: number | null
  status: string | null
  vendors: Array<{ name: string | null }> | null
}
interface YearBudget {
  fy: string
  cost_element: string
  amount: number
}

interface AccrualSnap {
  fy: string
  unpaid: number
  consumed: number
  computed: number
  override: number | null
  secured: number
  balance: number
  invoices?: Array<{
    id: string
    invoice_no: string | null
    invoice_date: string | null
    service_to?: string | null
    status: string | null
    amount: number
  }>
}

const ALL = 'all'

type Metric = 'spend' | 'invoices' | 'approved'
type QOrder = 'chrono' | 'top'
type ReportView = 'overview' | 'spend' | 'budget' | 'accrual' | 'aging' | 'outlook'


const METRIC_LABELS: Record<Metric, string> = {
  spend: 'Spend',
  invoices: 'Volume',
  approved: 'Approved',
}

const REPORT_VIEWS: Array<{ id: ReportView; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'spend', label: 'Spend' },
  { id: 'budget', label: 'Budget' },
  { id: 'accrual', label: 'Accrual' },
  { id: 'aging', label: 'AP aging' },
  { id: 'outlook', label: 'Outlook' },
]

type Tone = 'primary' | 'ok' | 'warn' | 'err' | 'purple'

const TONE_ACCENT: Record<Tone, string> = {
  primary: 'var(--accent)',
  ok: 'var(--accent-3)',
  warn: 'var(--warn)',
  err: 'var(--danger)',
  purple: '#8b5cf6',
}

interface Insight {
  tone: Tone
  id: string
  title: string
  main: string
  left: string
  right: string
  energy: 'pulse' | 'sweep' | 'spark' | 'breath'
}

export default function ReportsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [yearBudgets, setYearBudgets] = useState<YearBudget[]>([])
  const [paymentOrders, setPaymentOrders] = useState<ReportPo[]>([])
  const [accrual, setAccrual] = useState<AccrualSnap | null>(null)
  const [priorAccrual, setPriorAccrual] = useState<AccrualSnap | null>(null)
  const [ledgerSort, setLedgerSort] = useState<'date' | 'amount'>('date')
  const [accrualYears, setAccrualYears] = useState<AccrualSnap[]>([])
  const [accrualTableSort, setAccrualTableSort] = useState<AccrualSortKey>('fy')
  const [accrualTableFy, setAccrualTableFy] = useState('all')
  const [accrualMinBalance, setAccrualMinBalance] = useState('')
  const [loading, setLoading] = useState(true)
  const [fyScope, setFyScope] = useState(() => currentFiscalYear())
  const [genOpen, setGenOpen] = useState(false)
  const [view, setView] = useState<ReportView>('overview')
  const [metric, setMetric] = useState<Metric>('spend')
  const [qOrder, setQOrder] = useState<QOrder>('chrono')
  const [filters, setFilters] = useState<FilterState[]>([])
  const [filterLogic, setFilterLogic] = useState<FilterLogic>('and')
  const toast = useToast()
  const c = useThemeColors()

  const [, liveVersion] = useLiveDomain(['invoices', 'contracts', 'budgets', 'paymentOrders'])
  const reload = useCallback(() => {
    setLoading(true)
    const accrualFy = fyScope === 'all' ? currentFiscalYear() : fyScope
    Promise.all([
      apiGet<{ invoices: Invoice[] }>(
        invoiceListPath(),
      ),
      apiGet<{ contracts: Contract[] }>('/api/contracts'),
      apiGet<{ budgets: YearBudget[] }>('/api/budgets'),
      apiGet<{ paymentOrders: ReportPo[] }>('/api/payment-orders'),
    ])
      .then(async ([inv, con, bud, po]) => {
        setInvoices(inv.invoices)
        setContracts(con.contracts)
        setYearBudgets(bud.budgets)
        setPaymentOrders(po.paymentOrders)
        try {
          const allAcc = await apiGet<{ years?: AccrualSnap[] }>('/api/accruals')
          setAccrualYears(allAcc.years ?? [])
        } catch {
          setAccrualYears([])
        }
        try {
          setAccrual(await apiGet<AccrualSnap>(`/api/accruals?fy=${encodeURIComponent(accrualFy)}`))
        } catch {
          setAccrual(null)
        }
        const running = currentFiscalYear()
        if (accrualFy === running) {
          try {
            setPriorAccrual(await apiGet<AccrualSnap>(`/api/accruals?fy=${encodeURIComponent(shiftFiscalYear(running, -1))}`))
          } catch {
            setPriorAccrual(null)
          }
        } else {
          setPriorAccrual(null)
        }
      })
      .catch((e) => toast.error('Failed to load reports', (e as Error).message))
      .finally(() => setLoading(false))
  }, [toast, fyScope])

  useEffect(() => {
    void reload()
  }, [liveVersion, reload])

  const vendorOf = (inv: Invoice) => {
    const rel = inv.contracts
    const cn = Array.isArray(rel) ? rel[0] : rel
    return cn?.vendors?.[0]?.name ?? '—'
  }

  const fyChoices = useMemo(() => nearbyFiscalYears(undefined, 2, 1), [])
  const selectedFys = fyScope === 'all' ? fyChoices : [fyScope]
  const fySet = useMemo(() => new Set(selectedFys), [selectedFys])
  const fy = fyScope === 'all' ? ALL : fyScope
  const quarter = ALL
  const reportFy = fyScope === 'all' ? currentFiscalYear() : fyScope
  const fyLabel = fyScope === 'all' ? 'All years' : fyScope
  const contractIds = useMemo(() => new Set<string>(), [])
  const costElements = useMemo(() => new Set<string>(), [])

  const filterColumns = useMemo<FilterColumnDef[]>(() => {
    const vendors = new Set<string>()
    const elements = new Set<string>()
    for (const inv of invoices) {
      const rel = inv.contracts
      const cn = Array.isArray(rel) ? rel[0] : rel
      const name = cn?.vendors?.[0]?.name
      if (name) vendors.add(name)
      if (inv.cost_element) elements.add(inv.cost_element)
    }
    return [
      { key: 'vendor', label: 'Vendor', type: 'select', options: [...vendors].sort().map((v) => ({ value: v, label: v })) },
      { key: 'contract_id', label: 'Contract', type: 'select', options: contracts.map((cn) => ({ value: cn.id, label: cn.contract_no })) },
      { key: 'cost_element', label: 'Cost element', type: 'select', options: [...elements].sort().map((v) => ({ value: v, label: v })) },
      { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Approved', 'Rejected', 'Draft', 'Void', 'Paid'].map((s) => ({ value: s, label: s })) },
      { key: 'quarter', label: 'Quarter', type: 'select', options: QUARTERS.map((q) => ({ value: q, label: q })) },
      { key: 'invoice_date', label: 'Invoice date', type: 'date' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'budget_fy', label: 'Budget FY', type: 'select', options: fyChoices.map((y) => ({ value: y, label: y })) },
    ]
  }, [invoices, contracts, fyChoices])

  const invoiceFilterValue = (inv: Invoice, key: string): string | number | null => {
    switch (key) {
      case 'vendor':
        return vendorOf(inv)
      case 'contract_id':
        return inv.contract_id
      case 'budget_fy':
        return invoiceBudgetFy(inv)
      case 'quarter':
        return invoiceBudgetInfo(inv)?.quarter ?? null
      default:
        return (inv as unknown as Record<string, string | number | null>)[key] ?? null
    }
  }

  const scoped = useMemo(() => {
    const fyRows =
      fyScope === 'all' ? invoices : invoices.filter((inv) => invoiceBudgetFy(inv) === fyScope)
    return applyFilters(fyRows, filters, filterColumns, invoiceFilterValue, filterLogic)
  }, [invoices, fyScope, filters, filterColumns, filterLogic])

  const spendScoped = useMemo(
    () => scoped.filter((inv) => !isAccrualOpenInvoice(inv)),
    [scoped],
  )

  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices])

  const scopedPos = useMemo(() => {
    const ids = new Set(scoped.map((i) => i.id))
    return paymentOrders.filter((p) => {
      const id = p.invoice_id ?? p.invoices?.id
      return Boolean(id && ids.has(id))
    })
  }, [paymentOrders, scoped])

  const metricValue = (inv: Invoice): number => {
    if (metric === 'invoices') return 1
    if (metric === 'approved') return isSignedOff(inv.status) ? invoiceApprovedAmount(inv) : 0
    return Number(inv.amount ?? 0)
  }

  const fmtMetric = useCallback(
    (v: number) => (metric === 'invoices' ? formatMoney(v, 0) : `Rs ${formatMoney(v)}`),
    [metric],
  )

  const kpi = useMemo(() => {
    const total = spendScoped.reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const approved = spendScoped
      .filter((i) => isSignedOff(i.status))
      .reduce((s, i) => s + invoiceApprovedAmount(i), 0)
    const pending = spendScoped.filter((i) => i.status === 'Pending').reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const targetFy = reportFy
    const contractTotal = contracts.reduce((s, cn) => s + Number(cn.value ?? 0), 0)
    const figures = selectedFys.reduce(
      (acc, year) => {
        const f = yearlyBudgetFigures(year, yearBudgets, paymentOrders, costElements.size > 0 ? costElements : undefined)
        return {
          yearly: acc.yearly + f.yearly,
          released: acc.released + f.released,
          remaining: acc.remaining + f.remaining,
        }
      },
      { yearly: 0, released: 0, remaining: 0 },
    )
    const budget = figures.yearly > 0 ? figures.yearly : contractTotal
    const approvedInvoice = spendScoped
      .filter((i) => isSignedOff(i.status))
      .reduce((s, i) => s + invoiceApprovedAmount(i), 0)
    const poGenerated = scopedPos.reduce((s, p) => s + poGeneratedAmount(p, p.invoices), 0)
    const releasedYear = figures.released
    const released = scopedPos.reduce((s, p) => s + poReleasedAmount(p), 0)
    return {
      total,
      count: spendScoped.length,
      approved,
      pending,
      avg: spendScoped.length > 0 ? total / spendScoped.length : 0,
      utilization: figures.yearly > 0 ? (releasedYear / figures.yearly) * 100 : budget > 0 ? (releasedYear / budget) * 100 : 0,
      budget: figures.yearly > 0 ? figures.yearly : budget,
      budgetLabel: figures.yearly > 0 ? `${fyLabel} yearly budget` : 'contract value',
      approvedInvoice,
      poGenerated,
      released,
      yearReleased: releasedYear,
      remaining: figures.yearly > 0 ? figures.remaining : budget - releasedYear,
      targetFy,
    }
  }, [spendScoped, scopedPos, contracts, yearBudgets, selectedFys, fyLabel, reportFy, paymentOrders, costElements])

  const quarterly = useMemo(() => {
    const map = new Map<FiscalQuarter, { invoices: number; value: number }>()
    for (const inv of spendScoped) {
      const fi = invoiceBudgetInfo(inv)
      if (!fi || !fySet.has(fi.fy)) continue
      const key = fi.quarter
      const bucket = map.get(key) ?? { invoices: 0, value: 0 }
      bucket.invoices += 1
      bucket.value += metricValue(inv)
      map.set(key, bucket)
    }
    const rows = QUARTERS.map((q) => {
      const v = map.get(q) ?? { invoices: 0, value: 0 }
      return { fy: fyLabel, quarter: q, label: q, ...v }
    })
    return qOrder === 'top' ? [...rows].sort((a, b) => b.value - a.value) : rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendScoped, metric, qOrder, fySet, fyLabel])

  const quarterlyByFy = useMemo(() => {
    const maps = new Map<string, Map<FiscalQuarter, number>>()
    for (const year of selectedFys) maps.set(year, new Map())
    for (const inv of spendScoped) {
      const fi = invoiceBudgetInfo(inv)
      if (!fi) continue
      const map = maps.get(fi.fy)
      if (!map) continue
      map.set(fi.quarter, (map.get(fi.quarter) ?? 0) + metricValue(inv))
    }
    return selectedFys.map((year) => ({
      fy: year,
      data: QUARTERS.map((q) => maps.get(year)?.get(q) ?? 0),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendScoped, selectedFys, metric])

  const monthly = useMemo(() => {
    const months = new Map<number, number>()
    for (const inv of spendScoped) {
      const date = invoiceBudgetDate(inv)
      const fi = invoiceBudgetInfo(inv)
      if (!date || !fi || !fySet.has(fi.fy)) continue
      const idx = fyMonthIndex(new Date(date))
      months.set(idx, (months.get(idx) ?? 0) + metricValue(inv))
    }
    return { fy: fyLabel, data: FY_MONTHS.map((label, idx) => ({ label, value: months.get(idx) ?? 0 })) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendScoped, fySet, fyLabel, metric])

  const paymentMonthly = useMemo(() => {
    const approved = new Map<number, number>()
    const generated = new Map<number, number>()
    const released = new Map<number, number>()
    for (const inv of scoped) {
      const date = invoiceBudgetDate(inv)
      const fi = invoiceBudgetInfo(inv)
      if (!date || !fi || fi.fy !== reportFy) continue
      const idx = fyMonthIndex(new Date(date))
      if (isSignedOff(inv.status)) {
        approved.set(idx, (approved.get(idx) ?? 0) + invoiceApprovedAmount(inv))
      }
    }
    for (const p of scopedPos) {
      const inv = invoiceById.get(p.invoice_id ?? p.invoices?.id ?? '') ?? p.invoices
      const date = invoiceBudgetDate(inv ?? {})
      const fi = invoiceBudgetInfo(inv ?? {})
      if (!date || !fi || fi.fy !== reportFy) continue
      const idx = fyMonthIndex(new Date(date))
      generated.set(idx, (generated.get(idx) ?? 0) + poGeneratedAmount(p, inv))
      const rel = poReleasedAmount(p)
      if (rel > 0) released.set(idx, (released.get(idx) ?? 0) + rel)
    }
    return FY_MONTHS.map((label, idx) => ({
      label,
      approved: approved.get(idx) ?? 0,
      generated: generated.get(idx) ?? 0,
      released: released.get(idx) ?? 0,
    }))
  }, [scoped, scopedPos, invoiceById, reportFy])

  const vendorReleasedRank = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of scopedPos) {
      const rel = poReleasedAmount(p)
      if (rel <= 0) continue
      const inv = invoiceById.get(p.invoice_id ?? p.invoices?.id ?? '')
      const vendor = inv ? vendorOf(inv) : 'Unknown'
      map.set(vendor, (map.get(vendor) ?? 0) + rel)
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 5).map(([vendor, released]) => ({ vendor, released }))
    const others = sorted.slice(5).reduce((sum, [, n]) => sum + n, 0)
    const rows = others > 0 ? [...top, { vendor: 'Others', released: others }] : top
    const total = rows.reduce((sum, row) => sum + row.released, 0)
    return { rows, total, vendorCount: sorted.length }
  }, [scopedPos, invoiceById])

  const categoryMix = useMemo(() => {
    let opex = 0
    let opexBudget = 0
    let miscBudget = 0
    for (const inv of spendScoped) {
      if (costCategory(inv.cost_element) === 'OPEX') opex += Number(inv.amount ?? 0)
    }
    for (const b of yearBudgets) {
      if (!fySet.has(b.fy)) continue
      const amt = Number(b.amount ?? 0)
      if (isMiscCostElement(b.cost_element)) miscBudget += amt
      else if (costCategory(b.cost_element) === 'OPEX') opexBudget += amt
    }
    const capex = Math.max(0, opexBudget - opex)
    const total = opex + capex + miscBudget
    return { OPEX: opex, CAPEX: capex, Uncategorized: miscBudget, total }
  }, [spendScoped, yearBudgets, fySet])

  const byVendor = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const inv of spendScoped) {
      const v = vendorOf(inv)
      const bucket = map.get(v) ?? { count: 0, total: 0 }
      bucket.count += 1
      bucket.total += metricValue(inv)
      map.set(v, bucket)
    }
    return [...map.entries()]
      .map(([name, v]) => ({ vendor: name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendScoped, metric])

  const budgetRows = useMemo(() => {
    const releasedByContract = new Map<string, number>()
    for (const p of scopedPos) {
      const inv = invoiceById.get(p.invoice_id ?? p.invoices?.id ?? '')
      if (!inv?.contract_id) continue
      releasedByContract.set(inv.contract_id, (releasedByContract.get(inv.contract_id) ?? 0) + poReleasedAmount(p))
    }
    return contracts
      .filter((cn) => contractIds.size === 0 || contractIds.has(cn.id))
      .map((cn) => {
        const budget = Number(cn.value ?? 0)
        const actual = releasedByContract.get(cn.id) ?? 0
        return {
          id: cn.id,
          contract_no: cn.contract_no,
          vendor: cn.vendors?.[0]?.name ?? '—',
          budget,
          actual,
          remaining: budget - actual,
          utilization: budget > 0 ? (actual / budget) * 100 : 0,
        }
      })
      .sort((a, b) => b.utilization - a.utilization)
  }, [contracts, scopedPos, invoiceById, contractIds])

  const accrualCover = useMemo(() => {
    const minYear = Math.min(...selectedFys.map((y) => fyStartYear(y) ?? Number.POSITIVE_INFINITY))
    const prior = accrualYears
      .filter((y) => isClosedFiscalYear(y.fy) && !fySet.has(y.fy) && (fyStartYear(y.fy) ?? 0) < minYear)
      .reduce((s, y) => s + Number(y.balance ?? 0), 0)
    const keep = selectedFys.reduce((s, year) => {
      if (isClosedFiscalYear(year)) {
        const snap = accrualYears.find((y) => y.fy === year)
        return s + Number(snap?.unpaid ?? snap?.secured ?? 0)
      }
      return (
        s +
        invoices
          .filter((inv) => invoiceBudgetFy(inv) === year && (inv.status === 'Pending' || inv.status === 'Approved' || inv.status === 'Draft'))
          .reduce((sum, inv) => sum + Number(inv.amount ?? 0), 0)
      )
    }, 0)
    return { prior, keep, total: prior + keep }
  }, [selectedFys, fySet, accrualYears, invoices])

  const insightCards = useMemo<Insight[]>(() => {
    const pendingPct = kpi.total > 0 ? (kpi.pending / kpi.total) * 100 : 0
    const lead = byVendor[0]
    const leadShare = lead && kpi.total > 0 ? (lead.total / kpi.total) * 100 : 0
    return [
      {
        id: 'util',
        title: 'Budget used',
        main: `${kpi.utilization.toFixed(1)}%`,
        left: `Released Rs ${formatMoney(kpi.yearReleased)}`,
        right: `Yearly Rs ${formatMoney(kpi.budget)}`,
        tone: kpi.utilization > 90 ? 'err' : kpi.utilization > 70 ? 'warn' : 'ok',
        energy: 'pulse',
      },
      {
        id: 'pending',
        title: 'Awaiting approval',
        main: `${pendingPct.toFixed(0)}%`,
        left: `Pending Rs ${formatMoney(kpi.pending)}`,
        right: `Approved Rs ${formatMoney(kpi.approved)}`,
        tone: pendingPct > 40 ? 'warn' : 'primary',
        energy: 'sweep',
      },
      {
        id: 'vendor',
        title: 'Lead vendor',
        main: lead?.vendor ?? '—',
        left: lead ? `Rs ${formatMoney(lead.total)}` : 'No vendor spend',
        right: lead ? `${leadShare.toFixed(0)}% of scoped` : METRIC_LABELS[metric],
        tone: 'purple',
        energy: 'spark',
      },
      {
        id: 'accrual',
        title: 'Accrual cover',
        main: `Rs ${formatMoney(accrualCover.total)}`,
        left: `Prior Rs ${formatMoney(accrualCover.prior)}`,
        right: `Keep Rs ${formatMoney(accrualCover.keep)}`,
        tone: 'ok',
        energy: 'breath',
      },
    ]
  }, [kpi, byVendor, metric, accrualCover])

  const animatedTotal = useCountUp(kpi.total)
  const animatedOpexPct = useCountUp(categoryMix.total > 0 ? (categoryMix.OPEX / categoryMix.total) * 100 : 0, 900)
  const animatedUtil = useCountUp(kpi.utilization, 1200)

  // ---- Foresight: project the rest of the fiscal year ----------------------
  const forecast = useMemo(() => {
    const monthsToDate = scoped
      .filter((i) => invoiceBudgetFy(i) === reportFy)
      .reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const { elapsed, remaining } = elapsedInFiscalYear(reportFy)
    const rate = elapsed > 0 ? monthsToDate / elapsed : 0
    const projected = rate * 12
    const budgetForFy = yearBudgets.filter((b) => b.fy === reportFy).reduce((s, b) => s + Number(b.amount ?? 0), 0)
    const projectedRemaining = rate * remaining
    const variance = budgetForFy > 0 ? projected - budgetForFy : 0
    return { targetFy: reportFy, monthsToDate, elapsed, rate, projected, budgetForFy, remaining, projectedRemaining, variance }
  }, [scoped, yearBudgets, reportFy])

  // ---- Budget vs actual by cost element ------------------------------------
  const budgetVsActual = useMemo(() => {
    const targetFy = fy !== ALL ? fy : currentFiscalYear()
    const lines = yearBudgets.filter((b) => b.fy === targetFy)
    const actualByCe = new Map<string, number>()
    for (const p of scopedPos) {
      const inv = invoiceById.get(p.invoice_id ?? p.invoices?.id ?? '') ?? p.invoices
      if (invoiceBudgetFy(inv ?? {}) !== targetFy) continue
      const ce = inv?.cost_element ?? 'Uncoded'
      actualByCe.set(ce, (actualByCe.get(ce) ?? 0) + poReleasedAmount(p))
    }
    const rows = lines.map((l) => {
      const actual = actualByCe.get(l.cost_element) ?? 0
      const variance = l.amount - actual
      return { code: l.cost_element, budget: Number(l.amount), actual, variance, utilization: l.amount > 0 ? (actual / l.amount) * 100 : 0 }
    })
    const uncoded = actualByCe.get('Uncoded') ?? 0
    if (uncoded > 0) rows.push({ code: 'Uncoded', budget: 0, actual: uncoded, variance: -uncoded, utilization: 0 })
    return rows.sort((a, b) => b.actual - a.actual)
  }, [scopedPos, invoiceById, yearBudgets, fy])

  // ---- Vendor performance scorecard ---------------------------------------
  const vendorScore = useMemo(() => {
    const map = new Map<string, { count: number; total: number; approved: number; pending: number; rejected: number }>()
    for (const inv of scoped) {
      const v = vendorOf(inv)
      const b = map.get(v) ?? { count: 0, total: 0, approved: 0, pending: 0, rejected: 0 }
      b.count += 1
      b.total += Number(inv.amount ?? 0)
      if (isSignedOff(inv.status)) b.approved += 1
      else if (inv.status === 'Pending') b.pending += 1
      else if (inv.status === 'Rejected') b.rejected += 1
      map.set(v, b)
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, approvalRate: v.count > 0 ? (v.approved / v.count) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [scoped, metric])

  const aging = useMemo(() => {
    const buckets = [
      { key: '0-30', label: '0-30 days', min: 0, max: 30 },
      { key: '31-60', label: '31-60 days', min: 31, max: 60 },
      { key: '61-90', label: '61-90 days', min: 61, max: 90 },
      { key: '90+', label: '90+ days', min: 91, max: 100000 },
    ]
    const open = scoped.filter((i) => i.status === 'Pending')
    const now = Date.now()
    return buckets.map((b) => {
      const rows = open.filter((i) => {
        if (!i.invoice_date) return false
        const days = Math.floor((now - new Date(i.invoice_date).getTime()) / 86400000)
        return days >= b.min && days <= b.max
      })
      return {
        ...b,
        count: rows.length,
        amount: rows.reduce((s, i) => s + Number(i.amount ?? 0), 0),
      }
    })
  }, [scoped])

  const yoy = useMemo(() => {
    const prevFy = shiftFiscalYear(reportFy, -1)
    const sumFy = (label: string) =>
      invoices
        .filter((i) => invoiceBudgetFy(i) === label)
        .reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const current = sumFy(reportFy)
    const previous = sumFy(prevFy)
    const delta = previous > 0 ? ((current - previous) / previous) * 100 : null
    return { prevFy, current, previous, delta }
  }, [invoices, reportFy])

  const exportForecast = () =>
    downloadCSV('report-forecast.csv', [{ fiscal_year: forecast.targetFy, ytd_spend: Math.round(forecast.monthsToDate), projected_year: Math.round(forecast.projected), budget: Math.round(forecast.budgetForFy), variance: Math.round(forecast.variance) }])

  const exportBudgetVsActual = () =>
    downloadCSV('report-budget-vs-actual.csv', budgetVsActual.map((r) => ({ cost_element: r.code, budget: Math.round(r.budget), actual: Math.round(r.actual), variance: Math.round(r.variance), utilization_pct: r.utilization.toFixed(1) })))

  if (loading) {
    return <div className="py-24 text-center text-[var(--text-muted)]">Loading reports…</div>
  }

  const runningFy = currentFiscalYear()
  const priorFy = shiftFiscalYear(runningFy, -1)
  const showPriorAccrual = reportFy === runningFy && !!priorAccrual && isClosedFiscalYear(priorFy)
  const ledgerSnap = isClosedFiscalYear(reportFy) ? accrual : showPriorAccrual ? priorAccrual : null
  const ledgerFy = isClosedFiscalYear(reportFy) ? reportFy : priorFy
  const ledgerRows = [...(ledgerSnap?.invoices ?? [])].sort((a, b) => {
    if (ledgerSort === 'amount') return Number(b.amount) - Number(a.amount)
    return String(invoiceBudgetDate(a) ?? '').localeCompare(String(invoiceBudgetDate(b) ?? ''))
  })
  const accrualTableRows = filterAccrualYears(accrualYears, {
    fy: accrualTableFy,
    minBalance: Number(accrualMinBalance) || 0,
    sort: accrualTableSort,
  })
  const reportCostBreak = costElementBreakup(reportFy, invoices, paymentOrders, yearBudgets)
  const maxVendor = Math.max(1, ...byVendor.map((v) => v.total))
  const mixSegments: Array<{ key: keyof typeof categoryMix; label: string; color: string }> = [
    { key: 'OPEX', label: 'OPEX', color: c.accent },
    { key: 'CAPEX', label: 'CAPEX outlook', color: c.warn },
    { key: 'Uncategorized', label: 'Misc.', color: c.grid },
  ]
  const quarterOrder = qOrder === 'top'
    ? QUARTERS.map((q, i) => ({ q, i, total: quarterlyByFy.reduce((s, row) => s + row.data[i], 0) }))
        .sort((a, b) => b.total - a.total)
    : QUARTERS.map((q, i) => ({ q, i, total: 0 }))
  const fyBarPalette = [c.accent, c.accent2, c.accent3, c.accent4, c.warn]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analysis"
        description="Analyse spend, budget, accruals and AP aging. Generate an Excel workbook from Gen Report."
        actions={
          <Button variant="primary" onClick={() => setGenOpen(true)}>
            <FileSpreadsheet size={16} /> Gen Report
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {fyChoices.map((year) => (
          <button
            key={year}
            type="button"
            className={`chip ${fyScope === year ? 'active' : ''}`}
            onClick={() => setFyScope(year)}
            aria-pressed={fyScope === year}
          >
            {isClosedFiscalYear(year) ? <Lock size={11} /> : null}
            {year}
            {year === currentFiscalYear() ? ' · now' : ''}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${fyScope === 'all' ? 'active' : ''}`}
          onClick={() => setFyScope('all')}
          aria-pressed={fyScope === 'all'}
        >
          All years
        </button>
      </div>

      <ReportsRibbon tabs={REPORT_VIEWS} value={view} onChange={(id) => setView(id as ReportView)}>
        <div className="flex flex-wrap items-center gap-2">
          <AdvancedFilter
            columns={filterColumns}
            filters={filters}
            onChange={setFilters}
            logic={filterLogic}
            onLogicChange={setFilterLogic}
          />
          {(view === 'overview' || view === 'spend') && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip ${metric === m ? 'active' : ''}`}
                  onClick={() => setMetric(m)}
                  aria-pressed={metric === m}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
              <button
                type="button"
                className={`chip ${qOrder === 'chrono' ? 'active' : ''}`}
                onClick={() => setQOrder('chrono')}
                aria-pressed={qOrder === 'chrono'}
              >
                Timeline
              </button>
              <button
                type="button"
                className={`chip ${qOrder === 'top' ? 'active' : ''}`}
                onClick={() => setQOrder('top')}
                aria-pressed={qOrder === 'top'}
              >
                Highest first
              </button>
            </div>
          )}
        </div>
      </ReportsRibbon>

      {/* Hero row: spend pulse + OPEX/CAPEX mix */}
      {view === 'overview' && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '90ms' }}>
          <div className="reports-panel-head">
            <span className="reports-kicker">
              <CircleDollarSign size={13} className="text-[var(--accent)]" /> Total scoped spend
            </span>
            <span className="badge badge-info">
              {fyLabel}
              {quarter !== ALL ? ` · ${quarter}` : ''}
            </span>
          </div>
          <div className="mt-3 text-5xl font-black tracking-tight text-[var(--accent)]">
            Rs {formatMoney(animatedTotal)}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <div>
              <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Invoices</span>
              <b className="text-lg">{kpi.count}</b>
            </div>
            <div>
              <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Avg invoice</span>
              <b className="text-lg">Rs {formatMoney(kpi.avg)}</b>
            </div>
            <div>
              <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Approved</span>
              <b className="text-lg text-[var(--accent-3)]">Rs {formatMoney(kpi.approved)}</b>
            </div>
            <div>
              <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Pending</span>
              <b className="text-lg text-[var(--warn)]">Rs {formatMoney(kpi.pending)}</b>
            </div>
          </div>
          <div className="spend-wave mt-6" title={`${monthly.fy} monthly spend`}>
            {(() => {
              const max = Math.max(1, ...monthly.data.map((row) => row.value))
              return monthly.data.map((m, i) => (
                <span
                  key={m.label}
                  style={{
                    height: `${Math.max(6, (m.value / max) * 100)}%`,
                    background: c.accent,
                    ['--i' as string]: String(i),
                  }}
                />
              ))
            })()}
          </div>
          <div className="mt-1.5 flex justify-between text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            <span>{monthly.fy} · Jul</span>
            <span>Jun</span>
          </div>
        </div>

        <div className="report-card glass flex flex-col p-6 rise-in" style={{ animationDelay: '160ms' }}>
          <div className="reports-panel-head">
            <span className="reports-kicker">
            <Sparkles size={13} className="text-[var(--accent)]" /> Expense mix
          </span>
          </div>
          <div className="mt-3 text-4xl font-black tracking-tight">
            <span className="text-[var(--accent)]">{animatedOpexPct.toFixed(0)}%</span>
            <span className="ml-2 text-sm font-semibold text-[var(--text-muted)]">OPEX</span>
          </div>
          <div className="mt-4">
            <MixWave
              segments={mixSegments.map((seg) => ({
                key: seg.key,
                value: categoryMix[seg.key],
                color: seg.color,
                label: seg.label,
              }))}
            />
          </div>
          <div className="mt-4 space-y-2">
            {mixSegments.map((seg) => (
              <div key={seg.key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: seg.color }} />
                  <span className={categoryMix[seg.key] > 0 ? 'font-semibold' : 'text-[var(--text-dim)]'}>{seg.label}</span>
                </span>
                <b>Rs {formatMoney(categoryMix[seg.key])}</b>
              </div>
            ))}
          </div>
          <p className="mt-auto pt-3 text-[0.62rem] text-[var(--text-dim)]">
            OPEX = SUR / THL / SM spend · CAPEX = unused OPEX budget · Misc. = Admin budget
          </p>
        </div>
      </div>
      )}

      {/* Foresight: cash-flow projection */}
      {view === 'outlook' && (
      <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '250ms' }}>
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Sparkles size={13} className="text-[var(--accent)]" /> Foresight · {forecast.targetFy} projection
            </span>
            <button className="btn btn-ghost btn-sm" onClick={exportForecast}><Download size={14} /> Forecast CSV</button>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">YTD spend</div>
              <div className="mt-1 text-xl font-black">Rs {formatMoney(forecast.monthsToDate)}</div>
            </div>
            <div>
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Run-rate / mo</div>
              <div className="mt-1 text-xl font-black">Rs {formatMoney(forecast.rate)}</div>
            </div>
            <div>
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Projected year</div>
              <div className="mt-1 text-xl font-black text-[var(--accent)]">Rs {formatMoney(forecast.projected)}</div>
            </div>
            <div>
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Budget</div>
              <div className="mt-1 text-xl font-black">Rs {formatMoney(forecast.budgetForFy)}</div>
            </div>
          </div>
          <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
            <div
              className="report-fill h-full rounded-full"
              style={{
                width: `${forecast.budgetForFy > 0 ? Math.min(100, (forecast.projected / forecast.budgetForFy) * 100) : 0}%`,
                background: forecast.variance > 0 ? 'var(--danger)' : 'var(--gradient-primary)',
              }}
            />
          </div>
          <p className="mt-3 text-sm">
            {forecast.budgetForFy > 0 ? (
              forecast.variance > 0 ? (
                <span className="font-semibold text-[var(--danger)]">Projected to exceed budget by Rs {formatMoney(forecast.variance)} at current run-rate.</span>
              ) : (
                <span className="font-semibold text-[var(--accent-3)]">On track — Rs {formatMoney(-forecast.variance)} of headroom expected at year end.</span>
              )
            ) : (
              <span className="text-[var(--text-dim)]">Set a {forecast.targetFy} budget to enable variance forecasting.</span>
            )}
          </p>
        </div>

        <div className="report-card glass flex flex-col p-6 rise-in" style={{ animationDelay: '300ms' }}>
          <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <CalendarRange size={13} className="text-[var(--accent)]" /> Remaining window
          </span>
          <div className="mt-3 text-4xl font-black tracking-tight">{forecast.remaining}<span className="ml-1 text-base font-semibold text-[var(--text-muted)]">mo</span></div>
          <div className="mt-2 text-xs text-[var(--text-dim)]">{forecast.elapsed} of 12 months elapsed</div>
          <div className="mt-4 rounded-xl border border-[var(--border)] p-3 text-sm">
            Expected next {forecast.remaining} months: <b className="block text-lg text-[var(--accent)]">Rs {formatMoney(forecast.projectedRemaining)}</b>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{yoy.prevFy} spend</div>
          <div className="mt-1 text-2xl font-black">Rs {formatMoney(yoy.previous)}</div>
        </div>
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{reportFy} spend</div>
          <div className="mt-1 text-2xl font-black text-[var(--accent)]">Rs {formatMoney(yoy.current)}</div>
        </div>
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Year on year</div>
          <div className={`mt-1 text-2xl font-black ${yoy.delta != null && yoy.delta >= 0 ? 'text-[var(--danger)]' : 'text-[var(--accent-3)]'}`}>
            {yoy.delta == null ? 'n/a' : `${yoy.delta >= 0 ? '+' : ''}${yoy.delta.toFixed(0)}%`}
          </div>
          <p className="mt-1 text-xs text-[var(--text-dim)]">vs {yoy.prevFy} full-year spend</p>
        </div>
      </div>
      </>
      )}

      {/* Budget vs actual by cost element */}
      {view === 'budget' && (
      <div className="rise-in" style={{ animationDelay: '340ms' }}>
        <div className="flex items-center justify-between">
          <div className="section-title" style={{ marginBottom: 0 }}>Budget vs actual</div>
          <button className="btn btn-ghost btn-sm" onClick={exportBudgetVsActual}><Download size={14} /> CSV</button>
        </div>
        {isClosedFiscalYear(reportFy) && accrual && (
          <p className="mt-2 text-xs text-[var(--text-dim)]">
            {reportFy} budget Rs {formatMoney(kpi.budget)} · released Rs {formatMoney(kpi.released)} · Accrual Balance Rs {formatMoney(accrual.balance)}
          </p>
        )}
        {showPriorAccrual && priorAccrual && (
          <p className="mt-2 text-xs text-[var(--text-dim)]">
            {priorFy} Accrual Balance Rs {formatMoney(priorAccrual.balance)} · {reportFy} remaining = budget minus released of this year
          </p>
        )}
        {budgetVsActual.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {budgetVsActual.map((r, i) => {
              const over = r.budget > 0 && r.actual > r.budget
              return (
                <div key={r.code} className="report-card glass p-4" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold">{r.code}</span>
                    {r.budget === 0 ? (
                      <span className="badge badge-warn">No budget</span>
                    ) : over ? (
                      <span className="badge badge-err">Over</span>
                    ) : r.utilization > 90 ? (
                      <span className="badge badge-warn">Near</span>
                    ) : (
                      <span className="badge badge-ok">Healthy</span>
                    )}
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
                    <div
                      className="report-fill h-full rounded-full"
                      style={{ width: `${Math.min(100, r.utilization)}%`, background: over ? 'var(--danger)' : r.utilization > 90 ? 'var(--warn)' : 'var(--gradient-primary)' }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span><b>Rs {formatMoney(r.actual)}</b> <span className="text-[var(--text-dim)]">/ {r.budget > 0 ? `Rs ${formatMoney(r.budget)}` : '—'}</span></span>
                    <span className={r.variance < 0 ? 'font-bold text-[var(--danger)]' : 'font-semibold text-[var(--accent-3)]'}>
                      {r.variance < 0 ? '-' : ''}Rs {formatMoney(Math.abs(r.variance))} {r.variance < 0 ? 'over' : 'left'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState title="No budget lines" description="Add a yearly budget to compare against actuals." />
        )}
      </div>
      )}

      {/* Vendor performance scorecard */}
      {view === 'spend' && (
      <div className="rise-in" style={{ animationDelay: '380ms' }}>
        <div className="section-title">Vendor performance</div>
        {vendorScore.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="text-right">Invoices</th>
                  <th className="text-right">Spend</th>
                  <th className="text-right">Approved</th>
                  <th className="text-right">Pending</th>
                  <th className="text-right">Rejected</th>
                  <th className="text-right">Approval rate</th>
                </tr>
              </thead>
              <tbody>
                {vendorScore.map((v) => (
                  <tr key={v.name}>
                    <td className="font-semibold">{v.name}</td>
                    <td className="text-right">{v.count}</td>
                    <td className="text-right">Rs {formatMoney(v.total)}</td>
                    <td className="text-right text-[var(--accent-3)]">{v.approved}</td>
                    <td className="text-right text-[var(--warn)]">{v.pending}</td>
                    <td className="text-right text-[var(--danger)]">{v.rejected}</td>
                    <td className="text-right font-bold">{v.approvalRate.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No vendor data" description="Adjust the filters to see vendor performance." />
        )}
      </div>
      )}

      {/* Auto insights */}
      {view === 'overview' && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {insightCards.map((ins, i) => {
            const Icon = ins.id === 'util' ? Gauge : ins.id === 'pending' ? Clock : ins.id === 'vendor' ? Building2 : Wallet
            return (
            <div
              key={ins.id}
              className="report-card glass insight-card rise-in"
              style={{ animationDelay: `${220 + i * 70}ms` }}
            >
              <div className="insight-head">
                <span
                  className="insight-ico"
                  style={{ background: `color-mix(in srgb, ${TONE_ACCENT[ins.tone]} 15%, transparent)`, color: TONE_ACCENT[ins.tone] }}
                >
                  <Icon size={14} />
                </span>
                <span className="insight-kicker">{ins.title}</span>
              </div>
              <div className="insight-body">
                <div className="insight-main">{ins.main}</div>
                <div className="insight-break">
                  <span>{ins.left}</span>
                  <span>{ins.right}</span>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Quarterly pulse + budget gauge */}
      {view === 'overview' && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '300ms' }}>
          <div className="reports-panel-head">
            <span className="reports-kicker">
              <TrendingUp size={13} className="text-[var(--accent)]" /> Quarterly spend · {METRIC_LABELS[metric]}
              {qOrder === 'top' ? ' (ranked)' : ''}
            </span>
            {quarterly.length > 1 && qOrder === 'chrono' && (
              <span className="text-[0.65rem] text-[var(--text-dim)]">
                {(() => {
                  const last = quarterly[quarterly.length - 1]
                  const prev = quarterly[quarterly.length - 2]
                  if (prev.value <= 0) return null
                  const delta = ((last.value - prev.value) / prev.value) * 100
                  return (
                    <span className={`inline-flex items-center gap-1 font-semibold ${delta >= 0 ? 'text-[var(--accent-3)]' : 'text-[var(--danger)]'}`}>
                      {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {Math.abs(delta).toFixed(0)}% vs {prev.label}
                    </span>
                  )
                })()}
              </span>
            )}
          </div>
          {quarterlyByFy.some((row) => row.data.some((n) => n > 0)) ? (
            <ChartStage
              className="h-56"
              color={c.accent}
              values={quarterOrder.map((x) => quarterlyByFy.reduce((s, row) => s + row.data[x.i], 0))}
            >
              <Bar
                data={{
                  labels: quarterOrder.map((x) => x.q),
                  datasets: quarterlyByFy.map((row, idx) => {
                    return {
                      label: row.fy,
                      data: quarterOrder.map((x) => row.data[x.i]),
                      backgroundColor: fyBarPalette[idx % fyBarPalette.length],
                      ...barDataset(),
                      maxBarThickness: selectedFys.length > 1 ? 28 : 52,
                    }
                  }),
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: barMotion(),
                  plugins: {
                    legend: {
                      display: selectedFys.length > 1,
                      position: 'bottom',
                      labels: { color: c.ticks, boxWidth: 10, padding: 10 },
                    },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${fmtMetric(Number(ctx.parsed.y ?? 0))}`,
                      },
                    },
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: c.ticks } },
                    y: {
                      beginAtZero: true,
                      grace: '8%',
                      grid: { color: c.grid },
                      ticks: {
                        color: c.ticks,
                        callback: (value) => fmtMetric(Number(value)),
                      },
                    },
                  },
                }}
              />
            </ChartStage>
          ) : (
            <EmptyState title="No spend in scope" description="Adjust the filters to see quarterly data." />
          )}
        </div>

        <div className="report-card glass flex flex-col items-center justify-center p-6 rise-in" style={{ animationDelay: '360ms' }}>
          <span className="reports-kicker self-start">
            <Gauge size={13} className="text-[var(--accent)]" /> Budget utilization
          </span>
          <div className="relative mt-5 h-44 w-44 overflow-hidden rounded-[8px]">
            <Doughnut
              data={{
                labels: ['Utilized', 'Remaining'],
                datasets: [
                  {
                    data: [Math.min(100, kpi.utilization), Math.max(0, 100 - Math.min(100, kpi.utilization))],
                    backgroundColor: [kpi.utilization > 90 ? c.err : kpi.utilization > 70 ? c.warn : c.accent, c.grid],
                    ...doughnutSlice(),
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '78%',
                animation: doughnutMotion(),
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
              }}
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black">{animatedUtil.toFixed(1)}%</span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">of budget</span>
            </div>
          </div>
          <div className="mt-3 text-center text-xs text-[var(--text-dim)]">
            Rs {formatMoney(kpi.released)} released of Rs {formatMoney(kpi.budget)} {kpi.budgetLabel}
            <div className="mt-1">Rs {formatMoney(kpi.remaining)} remaining</div>
            {isClosedFiscalYear(reportFy) && accrual && (
              <div className="mt-1">Accrual Balance Rs {formatMoney(accrual.balance)}</div>
            )}
            {showPriorAccrual && priorAccrual && (
              <div className="mt-1">{priorFy} Accrual Balance Rs {formatMoney(priorAccrual.balance)}</div>
            )}
          </div>
        </div>
      </div>
      )}

      {view === 'overview' && showPriorAccrual && priorAccrual && (
        <div className="report-card glass p-5 rise-in" style={{ animationDelay: '220ms' }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{priorFy} closed</div>
              <div className="mt-1 text-xl font-black">Accrual Balance Rs {formatMoney(priorAccrual.balance)}</div>
              <p className="mt-1 text-xs text-[var(--text-dim)]">
                Sundry Accrual Rs {formatMoney(priorAccrual.secured)} · unpaid Rs {formatMoney(priorAccrual.unpaid)}. Payments of {priorFy} do not reduce {reportFy} remaining.
              </p>
            </div>
          </div>
        </div>
      )}
      {view === 'overview' && isClosedFiscalYear(reportFy) && accrual && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 rise-in" style={{ animationDelay: '240ms' }}>
          <div className="report-card glass p-5">
            <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Sundry Accrual</div>
            <div className="mt-1 text-2xl font-black">Rs {formatMoney(accrual.secured)}</div>
            <p className="mt-1 text-xs text-[var(--text-dim)]">{reportFy} secured against unpaid invoices</p>
          </div>
          <div className="report-card glass p-5">
            <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Accrual Balance</div>
            <div className={`mt-1 text-2xl font-black ${accrual.balance < 0 ? 'text-[var(--danger)]' : 'text-[var(--accent-3)]'}`}>Rs {formatMoney(accrual.balance)}</div>
            <p className="mt-1 text-xs text-[var(--text-dim)]">After released-in-year payments</p>
          </div>
          <div className="report-card glass p-5">
            <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Released in year</div>
            <div className="mt-1 text-2xl font-black">Rs {formatMoney(accrual.consumed)}</div>
            <p className="mt-1 text-xs text-[var(--text-dim)]">Does not reduce {currentFiscalYear()} remaining budget</p>
          </div>
        </div>
      )}

      {view === 'overview' && ledgerSnap && (
        <div className="report-card glass p-5 rise-in" style={{ animationDelay: '250ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{ledgerFy} accrual ledger</div>
              <p className="mt-1 text-xs text-[var(--text-dim)]">
                Unpaid invoices of {ledgerFy} stay on Accrual Balance. They do not mix with {runningFy} remaining budget.
              </p>
            </div>
            <div className="flex gap-2">
              <button className={`btn btn-ghost btn-sm${ledgerSort === 'date' ? ' is-active' : ''}`} onClick={() => setLedgerSort('date')}>
                Sort date
              </button>
              <button className={`btn btn-ghost btn-sm${ledgerSort === 'amount' ? ' is-active' : ''}`} onClick={() => setLedgerSort('amount')}>
                Sort amount
              </button>
            </div>
          </div>
          {ledgerRows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">No unpaid invoices on {ledgerFy} accrual.</p>
          ) : (
            <div className="table-scroll mt-3">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Service end</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-semibold">{row.invoice_no ?? row.id}</td>
                      <td>{formatDate(invoiceBudgetDate(row))}</td>
                      <td>{row.status ?? '—'}</td>
                      <td className="text-right font-semibold tabular-nums">Rs {formatMoney(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'overview' && (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 rise-in" style={{ animationDelay: '280ms' }}>
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Invoice approved</div>
          <div className="mt-1 text-2xl font-black text-[var(--accent)]">Rs {formatMoney(kpi.approvedInvoice)}</div>
          <p className="mt-1 text-xs text-[var(--text-dim)]">Amount signed off on invoices</p>
        </div>
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">PO generated</div>
          <div className="mt-1 text-2xl font-black">Rs {formatMoney(kpi.poGenerated)}</div>
          <p className="mt-1 text-xs text-[var(--text-dim)]">Pay orders waiting on or cleared by finance</p>
        </div>
        <div className="report-card glass p-5">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Payment released</div>
          <div className="mt-1 text-2xl font-black text-[var(--accent-3)]">Rs {formatMoney(kpi.released)}</div>
          <p className="mt-1 text-xs text-[var(--text-dim)]">
            {isClosedFiscalYear(reportFy)
              ? `Released from ${reportFy} Accrual Balance. Does not reduce ${runningFy} remaining.`
              : `Released against ${reportFy} yearly budget. Past-year payments stay on Accrual Balance.`}
          </p>
        </div>
      </div>
      )}

      {view === 'overview' && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '320ms' }}>
          <span className="reports-kicker">
            <Banknote size={13} className="text-[var(--accent-3)]" /> Monthly cash pipeline · {reportFy}
          </span>
          <p className="mt-1 text-xs text-[var(--text-dim)]">Approved invoices vs pay orders generated vs amount released</p>
          <ChartStage className="mt-5 h-56" color={c.accent3} values={paymentMonthly.map((m) => m.released)}>
            <Line
              data={{
                labels: paymentMonthly.map((m) => m.label),
                datasets: [
                  {
                    label: 'Approved',
                    data: paymentMonthly.map((m) => m.approved),
                    ...waveLine(c.accent, true),
                  },
                  {
                    label: 'PO generated',
                    data: paymentMonthly.map((m) => m.generated),
                    ...waveLine(c.warn, true),
                  },
                  {
                    label: 'Released',
                    data: paymentMonthly.map((m) => m.released),
                    ...waveLine(c.accent3, true),
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: lineMotion(),
                plugins: { legend: { position: 'bottom', labels: { color: c.ticks, boxWidth: 10, padding: 12 } } },
                scales: {
                  x: { grid: { display: false }, ticks: { color: c.ticks } },
                  y: { beginAtZero: true, grace: '8%', grid: { color: c.grid }, ticks: { color: c.ticks } },
                },
              }}
            />
          </ChartStage>
        </div>
        <div className="report-card glass p-6 rise-in" style={{ animationDelay: '380ms' }}>
          <span className="reports-kicker">
            <Landmark size={13} className="text-[var(--accent)]" /> Released by vendor
          </span>
          <p className="mt-1 text-xs text-[var(--text-dim)]">
            {vendorReleasedRank.vendorCount > 0
              ? `Released cash · ${vendorReleasedRank.vendorCount} vendor${vendorReleasedRank.vendorCount === 1 ? '' : 's'}`
              : 'Released cash by vendor'}
          </p>
          {vendorReleasedRank.rows.length > 0 ? (
            <ol className="vendor-rank">
              {vendorReleasedRank.rows.map((row, i) => {
                const pct = vendorReleasedRank.total > 0 ? (row.released / vendorReleasedRank.total) * 100 : 0
                return (
                  <li key={row.vendor} className="vendor-rank-row">
                    <span className="vendor-rank-name" title={row.vendor}>{row.vendor}</span>
                    <span className="vendor-rank-amt">Rs {formatMoney(row.released)}</span>
                    <div className="vendor-rank-meta">
                      <div className="vendor-rank-track" aria-hidden>
                        <div className="vendor-rank-fill" style={{ width: `${Math.max(pct, 3)}%`, ['--i' as string]: String(i) }} />
                      </div>
                      <div className="mt-1 text-[0.62rem] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
                        {pct.toFixed(0)}% of released
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="mt-4">
              <EmptyState title="No released payments" description="Release a pay order to populate this ranking." />
            </div>
          )}
        </div>
      </div>
      )}

      {/* Monthly trend + vendor ranking */}
      {view === 'spend' && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '420ms' }}>
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Wallet size={13} className="text-[var(--accent)]" /> Monthly burn · {monthly.fy}
            </span>
          </div>
          <ChartStage className="h-56" color={c.accent} values={monthly.data.map((m) => m.value)}>
            <Line
              data={{
                labels: monthly.data.map((m) => m.label),
                datasets: [
                  {
                    label: `${METRIC_LABELS[metric]}`,
                    data: monthly.data.map((m) => m.value),
                    ...waveLine(c.accent, true),
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: lineMotion(),
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false }, ticks: { color: c.ticks } },
                  y: { beginAtZero: true, grace: '8%', grid: { color: c.grid }, ticks: { color: c.ticks } },
                },
              }}
            />
          </ChartStage>
        </div>

        <div className="report-card glass p-6 rise-in" style={{ animationDelay: '480ms' }}>
          <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Landmark size={13} className="text-[var(--accent)]" /> Vendor leaderboard
          </span>
          <div className="mt-4 space-y-3.5">
            {byVendor.length > 0 ? (
              byVendor.map((v, i) => (
                <div key={v.vendor}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-black text-white"
                        style={{ background: i === 0 ? 'var(--gradient-primary)' : 'var(--surface-hover)', color: i === 0 ? '#fff' : 'var(--text-muted)' }}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate font-semibold">{v.vendor}</span>
                    </span>
                    <b className="shrink-0">{fmtMetric(v.total)}</b>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
                    <div
                      className="report-fill h-full rounded-full"
                      style={{
                        width: `${(v.total / maxVendor) * 100}%`,
                        background: i === 0 ? 'var(--gradient-primary)' : 'var(--accent)',
                        opacity: i === 0 ? 1 : 0.55,
                        animationDelay: `${i * 90}ms`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No vendor data" description="Adjust the filters to see rankings." />
            )}
          </div>
        </div>
      </div>
      )}

      {/* Budget burn-down cards */}
      {view === 'budget' && (
      <div className="rise-in" style={{ animationDelay: '540ms' }}>
        <div className="section-title">Budget burn-down</div>
        {budgetRows.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
            {budgetRows.map((b, i) => {
              const over = b.budget > 0 && b.actual > b.budget
              return (
                <div key={b.id} className="report-card glass p-4" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{b.contract_no}</div>
                      <div className="truncate text-xs text-[var(--text-muted)]">{b.vendor}</div>
                    </div>
                    {over ? (
                      <span className="badge badge-err shrink-0">Over budget</span>
                    ) : b.utilization > 90 ? (
                      <span className="badge badge-warn shrink-0">Near limit</span>
                    ) : (
                      <span className="badge badge-ok shrink-0">Healthy</span>
                    )}
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
                    <div
                      className="report-fill h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, b.utilization))}%`,
                        background: over ? 'var(--danger)' : b.utilization > 90 ? 'var(--warn)' : 'var(--gradient-primary)',
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs">
                    <span>
                      <b>Rs {formatMoney(b.actual)}</b>
                      <span className="text-[var(--text-dim)]"> of Rs {formatMoney(b.budget)}</span>
                    </span>
                    <span className={b.remaining < 0 ? 'font-bold text-[var(--danger)]' : 'font-semibold text-[var(--accent-3)]'}>
                      {b.remaining < 0 ? '-' : ''}Rs {formatMoney(Math.abs(b.remaining))} {b.remaining < 0 ? 'over' : 'left'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState title="No contracts" description="Budget burn-down appears once contracts exist." />
        )}
      </div>
      )}

      {/* Quarterly breakdown table */}
      {view === 'overview' && (
      <div className="rise-in" style={{ animationDelay: '600ms' }}>
      <GlassCard className="overflow-hidden">
        <div className="px-5 pt-5">
          <div className="section-title" style={{ marginBottom: 0 }}>{reportFy} quarterly breakdown</div>
        </div>
        <div className="table-scroll mt-4">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fiscal Quarter</th>
                <th className="text-right">Invoices</th>
                <th className="text-right">{METRIC_LABELS[metric]}</th>
                <th className="text-right">Share</th>
                <th className="text-right">vs previous</th>
              </tr>
            </thead>
            <tbody>
              {quarterly.map((q, i) => {
                const prev = i > 0 ? quarterly[i - 1] : null
                const delta = prev && prev.value > 0 ? ((q.value - prev.value) / prev.value) * 100 : null
                return (
                  <tr key={q.label}>
                    <td className="font-semibold">{q.label}</td>
                    <td className="text-right">{q.invoices}</td>
                    <td className="text-right font-semibold">{fmtMetric(q.value)}</td>
                    <td className="text-right text-xs text-[var(--text-dim)]">
                      {kpi.total > 0 ? `${formatMoney((metric === 'invoices' ? q.invoices / kpi.count : q.value / kpi.total) * 100, 1)}%` : '—'}
                    </td>
                    <td className="text-right text-xs">
                      {delta === null ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 font-semibold ${delta >= 0 ? 'text-[var(--accent-3)]' : 'text-[var(--danger)]'}`}>
                          {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {Math.abs(delta).toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {quarterly.length > 0 && (
                <tr className="grand-total-row">
                  <td>
                    <span className="font-bold uppercase tracking-wider">Total</span>
                  </td>
                  <td className="text-right font-bold">{kpi.count}</td>
                  <td className="text-right font-bold">{formatMoney(kpi.total)}</td>
                  <td className="text-right text-xs">100%</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {quarterly.length === 0 && (
          <EmptyState
            title="No quarterly data"
            description="Invoices need a valid invoice date to appear in the quarterly breakdown."
          />
        )}
      </GlassCard>
      </div>
      )}

      {view === 'accrual' && (
        <AccrualAnalysisPanel
          reportFy={reportFy}
          runningFy={runningFy}
          remaining={kpi.remaining}
          budget={kpi.budget}
          yearReleased={kpi.yearReleased ?? kpi.released}
          accrual={accrual}
          priorAccrual={priorAccrual}
          years={accrualYears}
          tableRows={accrualTableRows}
          tableFy={accrualTableFy}
          onTableFy={setAccrualTableFy}
          minBalance={accrualMinBalance}
          onMinBalance={setAccrualMinBalance}
          sort={accrualTableSort}
          onSort={setAccrualTableSort}
          costBreak={reportCostBreak}
          ledgerFy={ledgerFy}
          ledgerRows={ledgerRows}
          ledgerSort={ledgerSort}
          onLedgerSort={setLedgerSort}
        />
      )}

      {view === 'aging' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {aging.map((b) => (
              <div key={b.key} className="report-card glass p-5">
                <div className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <Clock size={13} className="text-[var(--accent)]" /> {b.label}
                </div>
                <div className="mt-2 text-2xl font-black tabular-nums">Rs {formatMoney(b.amount)}</div>
                <div className="mt-1 text-xs text-[var(--text-dim)]">{b.count} open invoice{b.count === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>
          <GlassCard className="p-5">
            <p className="text-sm text-[var(--text-dim)]">
              Aging uses invoice date for Pending rows in {reportFy}. Approved, paid and rejected invoices are excluded.
            </p>
          </GlassCard>
        </div>
      )}

      <GenerateReportDialog
        open={genOpen}
        onClose={() => setGenOpen(false)}
        data={{ invoices, contracts, yearBudgets, paymentOrders, accrualYears }}
        fyChoices={fyChoices}
        initialFy={fyScope}
        initialTemplate={view === 'spend' || view === 'budget' || view === 'accrual' || view === 'aging' || view === 'outlook' ? view : 'overview'}
        onGenerated={(hint) => toast.success('Report generated', hint)}
      />
    </div>
  )
}
