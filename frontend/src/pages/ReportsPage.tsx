import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, TrendingUp, TrendingDown, AlertTriangle, BadgeCheck, Wallet, Landmark, Sparkles, CircleDollarSign, Gauge, CalendarRange, CalendarDays, Building2, FileText, Layers, Activity, X, Clock } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import { apiGet } from '../lib/api'
import { formatMoney } from '../lib/format'
import { useLiveDomain } from '../lib/store'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import EmptyState from '../components/ui/EmptyState'
import { useThemeColors } from '../lib/themeColors'
import { fiscalOf, fyMonthIndex, FY_MONTHS, QUARTERS, costCategory, currentFiscalYear, fiscalShortRange, shiftFiscalYear, elapsedInFiscalYear, nearbyFiscalYears, type FiscalQuarter } from '../lib/fiscal'
import { invoiceListPath } from '../lib/invoiceWindow'
import { downloadCSV } from '../lib/export'
import { useCountUp } from '../lib/useCountUp'
import PillSelect from '../components/ui/PillSelect'
import FilterCommandBar, { type FilterSuggestion, type FilterDimMeta } from '../components/ui/FilterCommandBar'
import Tabs from '../components/ui/Tabs'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler)

interface Invoice {
  id: string
  invoice_no: string | null
  invoice_date: string | null
  contract_id: string | null
  cost_element: string | null
  amount: number
  status: string
  contracts: { contract_no: string | null; vendors: Array<{ name: string | null }> | null } | null
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

const ALL = 'all'

type Metric = 'spend' | 'invoices' | 'approved'
type QOrder = 'chrono' | 'top'
type ReportView = 'overview' | 'spend' | 'budget' | 'aging' | 'outlook'

const METRIC_LABELS: Record<Metric, string> = {
  spend: 'Spend',
  invoices: 'Volume',
  approved: 'Approved',
}

interface FilterChip {
  dim: string
  value: string
}

const DIM_META: Record<string, FilterDimMeta> = {
  fy: { label: 'Fiscal Year', icon: CalendarRange, color: '#a78bfa' },
  quarter: { label: 'Quarter', icon: CalendarDays, color: '#60a5fa' },
  vendor: { label: 'Vendor', icon: Building2, color: '#34d399' },
  contract: { label: 'Contract', icon: FileText, color: '#fbbf24' },
  cost: { label: 'Cost Element', icon: Layers, color: '#22d3ee' },
  status: { label: 'Status', icon: Activity, color: '#f87171' },
}

const STATUS_OPTIONS = ['Pending', 'Submitted', 'Approved', 'Rejected']

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
  text: string
}

export default function ReportsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [yearBudgets, setYearBudgets] = useState<YearBudget[]>([])
  const [loading, setLoading] = useState(true)
  const [chips, setChips] = useState<FilterChip[]>(() => [{ dim: 'fy', value: currentFiscalYear() }])
  const [view, setView] = useState<ReportView>('overview')
  const [metric, setMetric] = useState<Metric>('spend')
  const [qOrder, setQOrder] = useState<QOrder>('chrono')
  const toast = useToast()
  const c = useThemeColors()

  const [, liveVersion] = useLiveDomain(['invoices', 'contracts', 'budgets'])
  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiGet<{ invoices: Invoice[] }>(
        invoiceListPath({ fy: chips.find((ch) => ch.dim === 'fy')?.value ?? currentFiscalYear() }),
      ),
      apiGet<{ contracts: Contract[] }>('/api/contracts'),
      apiGet<{ budgets: YearBudget[] }>('/api/budgets'),
    ])
      .then(([inv, con, bud]) => {
        setInvoices(inv.invoices)
        setContracts(con.contracts)
        setYearBudgets(bud.budgets)
      })
      .catch((e) => toast.error('Failed to load reports', (e as Error).message))
      .finally(() => setLoading(false))
  }, [toast, chips])

  useEffect(() => {
    void reload()
  }, [liveVersion, reload])

  const vendorOf = (inv: Invoice) => {
    const rel = inv.contracts
    const cn = Array.isArray(rel) ? rel[0] : rel
    return cn?.vendors?.[0]?.name ?? '—'
  }

  const fyOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...nearbyFiscalYears(new Date(), 2, 1),
          ...(invoices.map((i) => fiscalOf(i.invoice_date)?.fy).filter(Boolean) as string[]),
        ]),
      ).sort(),
    [invoices],
  )
  const vendorOptions = useMemo(
    () => Array.from(new Set(invoices.map((i) => vendorOf(i)).filter((v) => v !== '—'))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices],
  )
  const costElementOptions = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.cost_element ?? '').filter(Boolean))).sort(),
    [invoices],
  )

  const fy = chips.find((ch) => ch.dim === 'fy')?.value ?? ALL
  const quarter = chips.find((ch) => ch.dim === 'quarter')?.value ?? ALL
  const reportFy = fy !== ALL ? fy : currentFiscalYear()
  const vendors = useMemo(() => new Set(chips.filter((ch) => ch.dim === 'vendor').map((ch) => ch.value)), [chips])
  const contractIds = useMemo(() => new Set(chips.filter((ch) => ch.dim === 'contract').map((ch) => ch.value)), [chips])
  const costElements = useMemo(() => new Set(chips.filter((ch) => ch.dim === 'cost').map((ch) => ch.value)), [chips])
  const statuses = useMemo(() => new Set(chips.filter((ch) => ch.dim === 'status').map((ch) => ch.value)), [chips])

  const toggleChip = (s: FilterSuggestion) => {
    setChips((prev) => {
      const idx = prev.findIndex((ch) => ch.dim === s.dim && ch.value === s.value)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      if (s.dim === 'fy' || s.dim === 'quarter') return [...prev.filter((ch) => ch.dim !== s.dim), { dim: s.dim, value: s.value }]
      return [...prev, { dim: s.dim, value: s.value }]
    })
  }

  const suggestions = useMemo<FilterSuggestion[]>(
    () => [
      ...fyOptions.map((f) => ({ dim: 'fy', value: f, label: f })),
      ...QUARTERS.map((q) => ({ dim: 'quarter', value: q, label: q })),
      ...vendorOptions.map((v) => ({ dim: 'vendor', value: v, label: v })),
      ...contracts.map((cn) => ({ dim: 'contract', value: cn.id, label: cn.contract_no || cn.id })),
      ...costElementOptions.map((ce) => ({ dim: 'cost', value: ce, label: ce })),
      ...STATUS_OPTIONS.map((s) => ({ dim: 'status', value: s, label: s })),
    ],
    [fyOptions, vendorOptions, costElementOptions, contracts],
  )

  const activeKeys = useMemo(() => new Set(chips.map((ch) => `${ch.dim}:${ch.value}`)), [chips])

  const scoped = useMemo(
    () =>
      invoices.filter((inv) => {
        const fi = fiscalOf(inv.invoice_date)
        if (fy !== ALL && fi?.fy !== fy) return false
        if (quarter !== ALL && fi?.quarter !== quarter) return false
        if (vendors.size > 0 && !vendors.has(vendorOf(inv))) return false
        if (contractIds.size > 0 && (!inv.contract_id || !contractIds.has(inv.contract_id))) return false
        if (costElements.size > 0 && !(inv.cost_element && costElements.has(inv.cost_element))) return false
        if (statuses.size > 0 && !statuses.has(inv.status)) return false
        return true
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, fy, quarter, vendors, contractIds, costElements, statuses],
  )

  const metricValue = (inv: Invoice): number => {
    if (metric === 'invoices') return 1
    if (metric === 'approved') return inv.status === 'Approved' || inv.status === 'Submitted' ? Number(inv.amount ?? 0) : 0
    return Number(inv.amount ?? 0)
  }

  const fmtMetric = useCallback(
    (v: number) => (metric === 'invoices' ? formatMoney(v, 0) : `Rs ${formatMoney(v)}`),
    [metric],
  )

  const kpi = useMemo(() => {
    const total = scoped.reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const approved = scoped
      .filter((i) => i.status === 'Approved' || i.status === 'Submitted')
      .reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const pending = scoped.filter((i) => i.status === 'Pending').reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const targetFy = fy !== ALL ? fy : currentFiscalYear()
    const yearLines = yearBudgets.filter((b) => b.fy === targetFy)
    const yearTotal = yearLines.reduce((s, b) => s + Number(b.amount ?? 0), 0)
    const contractTotal = contracts.reduce((s, cn) => s + Number(cn.value ?? 0), 0)
    const budget = yearTotal > 0 ? yearTotal : contractTotal
    return {
      total,
      count: scoped.length,
      approved,
      pending,
      avg: scoped.length > 0 ? total / scoped.length : 0,
      utilization: budget > 0 ? (total / budget) * 100 : 0,
      budget,
      budgetLabel: yearTotal > 0 ? `${targetFy} budget` : 'contract value',
    }
  }, [scoped, contracts, yearBudgets, fy])

  const quarterly = useMemo(() => {
    const map = new Map<FiscalQuarter, { invoices: number; value: number }>()
    for (const inv of scoped) {
      const fi = fiscalOf(inv.invoice_date)
      if (!fi || fi.fy !== reportFy) continue
      const key = fi.quarter
      const bucket = map.get(key) ?? { invoices: 0, value: 0 }
      bucket.invoices += 1
      bucket.value += metricValue(inv)
      map.set(key, bucket)
    }
    const rows = QUARTERS.map((q) => {
      const v = map.get(q) ?? { invoices: 0, value: 0 }
      return { fy: reportFy, quarter: q, label: q, ...v }
    })
    return qOrder === 'top' ? [...rows].sort((a, b) => b.value - a.value) : rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, metric, qOrder, reportFy])

  const monthly = useMemo(() => {
    const months = new Map<number, number>()
    for (const inv of scoped) {
      const fi = fiscalOf(inv.invoice_date)
      if (!fi || fi.fy !== reportFy) continue
      const idx = fyMonthIndex(new Date(inv.invoice_date as string))
      months.set(idx, (months.get(idx) ?? 0) + metricValue(inv))
    }
    return { fy: reportFy, data: FY_MONTHS.map((label, idx) => ({ label, value: months.get(idx) ?? 0 })) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, reportFy, metric])

  const categoryMix = useMemo(() => {
    const mix = { OPEX: 0, CAPEX: 0, Uncategorized: 0 }
    for (const inv of scoped) mix[costCategory(inv.cost_element)] += Number(inv.amount ?? 0)
    const total = mix.OPEX + mix.CAPEX + mix.Uncategorized
    return { ...mix, total }
  }, [scoped])

  const byVendor = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const inv of scoped) {
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
  }, [scoped, metric])

  const budgetRows = useMemo(() => {
    const actualByContract = new Map<string, number>()
    for (const inv of scoped) {
      if (!inv.contract_id) continue
      actualByContract.set(inv.contract_id, (actualByContract.get(inv.contract_id) ?? 0) + Number(inv.amount ?? 0))
    }
    return contracts
      .filter((cn) => contractIds.size === 0 || contractIds.has(cn.id))
      .map((cn) => {
        const budget = Number(cn.value ?? 0)
        const actual = actualByContract.get(cn.id) ?? 0
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
  }, [contracts, scoped, contractIds])

  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = []
    if (quarterly.length > 0) {
      const peak = quarterly.reduce((a, b) => (b.value > a.value ? b : a))
      list.push({ tone: 'primary', text: `${peak.label} is the highest quarter by ${METRIC_LABELS[metric].toLowerCase()} at ${fmtMetric(peak.value)}` })
    }
    if (byVendor.length > 0 && kpi.total > 0) {
      const share = (byVendor[0].total / kpi.total) * 100
      list.push({ tone: 'purple', text: `${byVendor[0].vendor} drives ${share.toFixed(0)}% of scoped spend` })
    }
    const over = budgetRows.filter((b) => b.budget > 0 && b.actual > b.budget).length
    const tight = budgetRows.filter((b) => b.budget > 0 && b.utilization > 90 && b.actual <= b.budget).length
    if (over > 0) list.push({ tone: 'err', text: `${over} contract${over === 1 ? '' : 's'} over budget — reallocate or renegotiate` })
    else if (tight > 0) list.push({ tone: 'warn', text: `${tight} contract${tight === 1 ? '' : 's'} above 90% utilization` })
    if (kpi.total > 0 && kpi.pending > 0) {
      list.push({ tone: 'warn', text: `${((kpi.pending / kpi.total) * 100).toFixed(0)}% of scoped spend awaits approval` })
    }
    if (quarterly.length >= 2) {
      const last = quarterly[quarterly.length - 1]
      const prev = quarterly[quarterly.length - 2]
      if (prev.value > 0) {
        const delta = ((last.value - prev.value) / prev.value) * 100
        list.push({
          tone: delta >= 0 ? 'ok' : 'primary',
          text: `${last.label} spend is ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(0)}% vs ${prev.label}`,
        })
      }
    }
    return list.slice(0, 4)
  }, [quarterly, byVendor, budgetRows, kpi, metric, fmtMetric])

  const animatedTotal = useCountUp(kpi.total)
  const animatedOpexPct = useCountUp(categoryMix.total > 0 ? (categoryMix.OPEX / categoryMix.total) * 100 : 0, 900)
  const animatedUtil = useCountUp(kpi.utilization, 1200)

  // ---- Foresight: project the rest of the fiscal year ----------------------
  const forecast = useMemo(() => {
    const monthsToDate = scoped
      .filter((i) => fiscalOf(i.invoice_date)?.fy === reportFy)
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
    for (const inv of scoped) {
      if (fiscalOf(inv.invoice_date)?.fy !== targetFy) continue
      const ce = inv.cost_element ?? 'Uncoded'
      actualByCe.set(ce, (actualByCe.get(ce) ?? 0) + Number(inv.amount ?? 0))
    }
    const rows = lines.map((l) => {
      const actual = actualByCe.get(l.cost_element) ?? 0
      const variance = l.amount - actual
      return { code: l.cost_element, budget: Number(l.amount), actual, variance, utilization: l.amount > 0 ? (actual / l.amount) * 100 : 0 }
    })
    const uncoded = actualByCe.get('Uncoded') ?? 0
    if (uncoded > 0) rows.push({ code: 'Uncoded', budget: 0, actual: uncoded, variance: -uncoded, utilization: 0 })
    return rows.sort((a, b) => b.actual - a.actual)
  }, [scoped, yearBudgets, fy])

  // ---- Vendor performance scorecard ---------------------------------------
  const vendorScore = useMemo(() => {
    const map = new Map<string, { count: number; total: number; approved: number; pending: number; rejected: number }>()
    for (const inv of scoped) {
      const v = vendorOf(inv)
      const b = map.get(v) ?? { count: 0, total: 0, approved: 0, pending: 0, rejected: 0 }
      b.count += 1
      b.total += Number(inv.amount ?? 0)
      if (inv.status === 'Approved' || inv.status === 'Submitted') b.approved += 1
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
    const open = scoped.filter((i) => i.status === 'Pending' || i.status === 'Submitted')
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
        .filter((i) => fiscalOf(i.invoice_date)?.fy === label)
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
  const exportQuarterly = () =>
    downloadCSV(
      'report-quarterly.csv',
      quarterly.map((q) => ({
        fiscal_quarter: q.label,
        invoices: q.invoices,
        [metric]: Math.round(q.value),
      })),
    )

  const exportBudget = () =>
    downloadCSV(
      'report-budget.csv',
      budgetRows.map((b) => ({
        contract: b.contract_no,
        vendor: b.vendor,
        budget: Math.round(b.budget),
        actual: Math.round(b.actual),
        remaining: Math.round(b.remaining),
        utilization_pct: b.utilization.toFixed(1),
      })),
    )

  if (loading) {
    return <div className="py-24 text-center text-[var(--text-muted)]">Loading reports…</div>
  }

  const maxQuarter = Math.max(1, ...quarterly.map((q) => q.value))
  const maxMonth = Math.max(1, ...monthly.data.map((m) => m.value))
  const maxVendor = Math.max(1, ...byVendor.map((v) => v.total))
  const mixSegments: Array<{ key: keyof typeof categoryMix; label: string; color: string }> = [
    { key: 'OPEX', label: 'OPEX', color: c.accent },
    { key: 'CAPEX', label: 'CAPEX', color: c.warn },
    { key: 'Uncategorized', label: 'Uncategorized', color: c.grid },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analysis"
        description={`${reportFy} · ${fiscalShortRange(reportFy)}. Spend, budget burn, AP aging and year-end outlook.`}
        actions={
          <div className="flex gap-2.5">
            <span className="badge badge-info self-center">{reportFy} auto</span>
            <button className="btn btn-ghost btn-sm" onClick={exportQuarterly}>
              <Download size={15} /> Quarterly CSV
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportBudget}>
              <Download size={15} /> Budget CSV
            </button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'spend', label: 'Spend' },
          { id: 'budget', label: 'Budget' },
          { id: 'aging', label: 'AP aging' },
          { id: 'outlook', label: 'Outlook' },
        ]}
        active={view}
        onChange={(id) => setView(id as ReportView)}
      />

      {/* Filter command bar + active chips + analysis lens */}
      <div className="glass space-y-3 p-4 rise-in" style={{ animationDelay: '40ms' }}>
        <FilterCommandBar
          suggestions={suggestions}
          dimMeta={DIM_META}
          activeKeys={activeKeys}
          onToggle={toggleChip}
          activeCount={chips.length}
        />
        {chips.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <Activity size={12} style={{ color: 'var(--accent)' }} /> Active filters
              </span>
              <span className="rounded-full bg-[var(--accent)] px-1.5 py-px text-[0.62rem] font-bold text-white">
                {chips.length}
              </span>
              <button
                className="ml-auto text-[0.7rem] font-semibold text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
                onClick={() => setChips([{ dim: 'fy', value: currentFiscalYear() }])}
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {chips.map((ch) => {
                const meta = DIM_META[ch.dim]
                if (!meta) return null
                const Icon = meta.icon
                return (
                  <span
                    key={`${ch.dim}:${ch.value}`}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[0.8rem] font-semibold shadow-sm"
                    style={{ borderColor: `${meta.color}88`, background: `${meta.color}26` }}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded"
                      style={{ background: meta.color, color: '#fff' }}
                    >
                      <Icon size={11} />
                    </span>
                    <span className="text-[0.65rem] font-bold uppercase tracking-wide opacity-70">{meta.label}</span>
                    <span>
                      {ch.dim === 'contract'
                        ? (contracts.find((cn) => cn.id === ch.value)?.contract_no ?? ch.value)
                        : ch.value}
                    </span>
                    <button
                      className="rounded-full p-0.5 hover:bg-white/15"
                      onClick={() => setChips((prev) => prev.filter((c2) => !(c2.dim === ch.dim && c2.value === ch.value)))}
                      aria-label={`Remove ${ch.value}`}
                    >
                      <X size={13} />
                    </button>
                  </span>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-x-8 border-t border-[var(--border)] pt-3">
          <PillSelect
            label="Lens"
            value={metric}
            onChange={(v) => setMetric(v as Metric)}
            options={(Object.keys(METRIC_LABELS) as Metric[]).map((m) => ({ value: m, label: METRIC_LABELS[m] }))}
          />
          <PillSelect
            label="Order"
            value={qOrder}
            onChange={(v) => setQOrder(v as QOrder)}
            options={[
              { value: 'chrono', label: 'Timeline' },
              { value: 'top', label: 'Highest first' },
            ]}
          />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setChips([{ dim: 'fy', value: currentFiscalYear() }])
              setMetric('spend')
              setQOrder('chrono')
            }}
          >
            Reset all
          </button>
        </div>
      </div>

      {/* Hero row: spend pulse + OPEX/CAPEX mix */}
      {view === 'overview' && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '90ms' }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <CircleDollarSign size={13} className="text-[var(--accent)]" /> Total scoped spend
            </span>
            <span className="badge badge-info">
              {fy === ALL ? 'All fiscal years' : fy}
              {quarter !== ALL ? ` · ${quarter}` : ''}
            </span>
          </div>
          <div className="mt-3 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-5xl font-black tracking-tight text-transparent">
            Rs {formatMoney(animatedTotal)}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
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
          <div className="mt-5 flex h-10 items-end gap-1.5">
            {monthly.data.map((m, i) => (
              <div
                key={m.label}
                className="group relative flex-1"
                title={`${monthly.fy} ${m.label}: ${fmtMetric(m.value)}`}
              >
                <div
                  className="report-bar w-full rounded-t-md transition-opacity group-hover:opacity-100"
                  style={{
                    height: `${Math.max(4, (m.value / maxMonth) * 40)}px`,
                    background: `linear-gradient(to top, var(--accent), var(--accent-2))`,
                    opacity: 0.85,
                    animationDelay: `${i * 45}ms`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            <span>{monthly.fy} · Jul</span>
            <span>Jun</span>
          </div>
        </div>

        <div className="report-card glass flex flex-col p-6 rise-in" style={{ animationDelay: '160ms' }}>
          <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Sparkles size={13} className="text-[var(--accent)]" /> Expense mix
          </span>
          <div className="mt-3 text-4xl font-black tracking-tight">
            <span className="text-[var(--accent)]">{animatedOpexPct.toFixed(0)}%</span>
            <span className="ml-2 text-sm font-semibold text-[var(--text-muted)]">OPEX</span>
          </div>
          <div className="mt-4 flex h-3.5 w-full overflow-hidden rounded-full">
            {mixSegments.map((seg, i) => {
              const pct = categoryMix.total > 0 ? (categoryMix[seg.key] / categoryMix.total) * 100 : 0
              if (pct <= 0) return null
              return (
                <div
                  key={seg.key}
                  className="report-fill h-full"
                  style={{ width: `${pct}%`, background: seg.color, animationDelay: `${i * 120}ms` }}
                  title={`${seg.label}: ${pct.toFixed(1)}%`}
                />
              )
            })}
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
            Mapped from cost element codes · SUR / THL / SM → OPEX
          </p>
        </div>
      </div>
      )}

      {/* Foresight: cash-flow projection */}
      {view === 'outlook' && (
      <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '250ms' }}>
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Sparkles size={13} className="text-[var(--accent)]" /> Foresight · {forecast.targetFy} projection
            </span>
            <button className="btn btn-ghost btn-sm" onClick={exportForecast}><Download size={14} /> Forecast CSV</button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
        {budgetVsActual.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
      {view === 'overview' && insights.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {insights.map((ins, i) => (
            <div
              key={ins.text}
              className="report-card glass rise-in flex items-start gap-3 p-4"
              style={{ animationDelay: `${220 + i * 70}ms` }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in srgb, ${TONE_ACCENT[ins.tone]} 15%, transparent)`, color: TONE_ACCENT[ins.tone] }}
              >
                {ins.tone === 'err' ? <AlertTriangle size={15} /> : ins.tone === 'ok' ? <BadgeCheck size={15} /> : ins.tone === 'warn' ? <AlertTriangle size={15} /> : <TrendingUp size={15} />}
              </span>
              <p className="text-xs leading-relaxed text-[var(--text)]">{ins.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quarterly pulse + budget gauge */}
      {view === 'overview' && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '300ms' }}>
          <div className="mb-5 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <TrendingUp size={13} className="text-[var(--accent)]" /> Quarterly pulse · {METRIC_LABELS[metric]}
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
          {quarterly.length > 0 ? (
            <div className="flex h-52 items-end gap-3 sm:gap-5">
              {quarterly.map((q, i) => (
                <div key={q.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[0.62rem] font-bold text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                    {fmtMetric(q.value)}
                  </span>
                  <div
                    className="report-bar relative w-full max-w-20 rounded-t-xl"
                    style={{
                      height: `${Math.max(6, (q.value / maxQuarter) * 100)}%`,
                      background: `linear-gradient(to top, color-mix(in srgb, var(--accent) 55%, transparent), var(--accent))`,
                      animationDelay: `${i * 110}ms`,
                    }}
                  >
                    <span className="absolute inset-x-0 top-2 text-center text-[0.6rem] font-bold text-white/85">
                      {q.value >= maxQuarter * 0.35 ? fmtMetric(q.value) : ''}
                    </span>
                  </div>
                  <span className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-dim)]">{q.label}</span>
                  <span className="text-[0.6rem] text-[var(--text-dim)]">{q.invoices} inv</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No spend in scope" description="Adjust the filters to see quarterly data." />
          )}
        </div>

        <div className="report-card glass flex flex-col items-center justify-center p-6 rise-in" style={{ animationDelay: '360ms' }}>
          <span className="flex items-center gap-2 self-start text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Gauge size={13} className="text-[var(--accent)]" /> Budget utilization
          </span>
          <div className="relative mt-4 h-44 w-44">
            <Doughnut
              data={{
                labels: ['Utilized', 'Remaining'],
                datasets: [
                  {
                    data: [Math.min(100, kpi.utilization), Math.max(0, 100 - Math.min(100, kpi.utilization))],
                    backgroundColor: [kpi.utilization > 90 ? c.err : kpi.utilization > 70 ? c.warn : c.accent, c.grid],
                    borderWidth: 0,
                    hoverOffset: 4,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '78%',
                animation: { duration: 1000, easing: 'easeOutQuart' },
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
              }}
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black">{animatedUtil.toFixed(1)}%</span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">of budget</span>
            </div>
          </div>
          <div className="mt-3 text-center text-xs text-[var(--text-dim)]">
            Rs {formatMoney(kpi.total)} drawn of Rs {formatMoney(kpi.budget)} {kpi.budgetLabel}
          </div>
        </div>
      </div>
      )}

      {/* Monthly trend + vendor ranking */}
      {view === 'spend' && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '420ms' }}>
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Wallet size={13} className="text-[var(--accent)]" /> Monthly burn · {monthly.fy}
            </span>
          </div>
          <div className="h-56">
            <Line
              data={{
                labels: monthly.data.map((m) => m.label),
                datasets: [
                  {
                    label: `${METRIC_LABELS[metric]}`,
                    data: monthly.data.map((m) => m.value),
                    borderColor: c.accent,
                    backgroundColor: c.accent + '26',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 1100, easing: 'easeOutQuart' },
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false }, ticks: { color: c.ticks } },
                  y: { grid: { color: c.grid }, ticks: { color: c.ticks } },
                },
              }}
            />
          </div>
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
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
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
        <div className="mt-4 overflow-x-auto">
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

      {view === 'aging' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              Aging uses invoice date for Pending and Submitted rows in {reportFy}. Approved and rejected invoices are excluded.
            </p>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
