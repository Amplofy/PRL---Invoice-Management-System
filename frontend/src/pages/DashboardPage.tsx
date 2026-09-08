import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Receipt,
  Banknote,
  Clock,
  FileX2,
  Users,
  ArrowUpRight,
  BadgeCheck,
  FolderOpen,
  Activity,
  PieChart,
  AlertTriangle,
  RotateCcw,
  Wallet,
} from 'lucide-react'
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
import { Line, Doughnut } from 'react-chartjs-2'
import { apiGet } from '../lib/api'
import { formatMoney, formatDate, timeAgo } from '../lib/format'
import { useThemeColors } from '../lib/themeColors'
import { currentFiscalYear, elapsedFyMonths, fiscalShortRange, invoiceBudgetDate, invoiceBudgetFy, isClosedFiscalYear, nearbyFiscalYears } from '../lib/fiscal'
import { invoiceListPath } from '../lib/invoiceWindow'
import { countsTowardUtilization } from '../lib/invoice'
import { useLiveDomain } from '../lib/store'
import { costElementBreakup, filterAccrualYears, fyKpis, monthlyTrendByBudgetDate, paymentSplit, statusBreakdown, yearlyBudgetFigures, type AccrualSortKey } from '../lib/fyAnalysis'
import KpiCard from '../components/ui/KpiCard'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge, { statusTone } from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import Reveal from '../components/ui/Reveal'
import ChartDrillDown, { type DrillRow } from '../components/ui/ChartDrillDown'
import { ChartStage } from '../components/ui/EnergyWave'
import { doughnutMotion, doughnutSlice, lineMotion, waveLine } from '../lib/chartWave'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
)

interface DashboardData {
  kpis: {
    totalInvoices: number
    totalValue: number
    approvedValue: number
    approvedCount: number
    pendingValue: number
    pendingCount: number
    rejectedValue: number
    rejectedCount: number
    openContracts: number
    activeUsers: number
    expiringContracts: number
    avgInvoice: number
    approvedInvoiceValue?: number
    poGeneratedValue?: number
    poGeneratedCount?: number
    paymentReleasedValue?: number
    paymentReleasedCount?: number
    financePendingValue?: number
    financePendingCount?: number
  }
  trend: Array<{ month: string; total: number; count: number }>
  statusBreakdown: { approved: number; paid?: number; pending: number; rejected: number }
  utilization: Array<{ contractNo: string; value: number; used: number; remaining: number; pct: number }>
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      <div className="kpi-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi">
            <div className="flex items-start justify-between">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-9 w-9 rounded-xl" />
            </div>
            <div className="skeleton mt-3 h-8 w-32" />
            <div className="skeleton mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="skeleton h-72 lg:col-span-2" />
        <div className="skeleton h-72" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="skeleton h-48 lg:col-span-3" />
      </div>
    </div>
  )
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <GlassCard className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-[var(--danger)]">
        <AlertTriangle size={22} />
      </span>
      <div className="text-base font-bold">Dashboard unavailable</div>
      <div className="max-w-md text-sm text-[var(--text-muted)]">{message}</div>
      <button className="btn btn-primary mt-2" onClick={onRetry}>
        <RotateCcw size={14} /> Retry
      </button>
    </GlassCard>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function ChartEmpty({ icon: Icon, title, hint }: { icon: typeof Activity; title: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-[var(--text-muted)]">
        <Icon size={20} />
      </span>
      <span className="text-sm font-bold">{title}</span>
      <span className="max-w-[240px] text-xs leading-relaxed text-[var(--text-muted)]">{hint}</span>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allInvoices, setAllInvoices] = useState<Array<Record<string, unknown>>>([])
  const [hudFy, setHudFy] = useState(currentFiscalYear)
  const [budgets, setBudgets] = useState<Array<{ fy: string; cost_element?: string; amount: number }>>([])
  const [paymentOrders, setPaymentOrders] = useState<Array<{
    amount?: number | null
    released_amount?: number | null
    status?: string | null
    invoices?: { invoice_date?: string | null; service_to?: string | null; cost_element?: string | null } | null
  }>>([])
  const [accrualYears, setAccrualYears] = useState<Array<{
    fy: string
    unpaid: number
    consumed: number
    computed: number
    override: number | null
    secured: number
    balance: number
    invoices?: Array<{ id: string; invoice_no: string | null; amount: number; status: string | null }>
  }>>([])
  const [accrualSort, setAccrualSort] = useState<AccrualSortKey>('fy')
  const [accrualFyFilter, setAccrualFyFilter] = useState('all')
  const [accrualMinBalance, setAccrualMinBalance] = useState('')
  const [drill, setDrill] = useState<{ title: string; subtitle: string; rows: DrillRow[] } | null>(null)
  const c = useThemeColors()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await apiGet<DashboardData>('/api/reports/dashboard')
      setData(d)
      const [inv, bud, po, acc] = await Promise.all([
        apiGet<{ invoices: Array<Record<string, unknown>> }>(invoiceListPath()),
        apiGet<{ budgets: Array<{ fy: string; amount: number }> }>('/api/budgets'),
        apiGet<{ paymentOrders: Array<{ amount?: number | null; released_amount?: number | null; invoices?: { invoice_date?: string | null; service_to?: string | null } | null }> }>('/api/payment-orders'),

        apiGet<{ years?: Array<{ fy: string; unpaid: number; consumed: number; computed: number; override: number | null; secured: number; balance: number; invoices?: Array<{ id: string; invoice_no: string | null; amount: number; status: string | null }> }> }>('/api/accruals').catch(() => ({ years: [] })),
      ])
      setAllInvoices(inv.invoices)
      setBudgets(bud.budgets ?? [])
      setPaymentOrders(po.paymentOrders ?? [])
      setAccrualYears(acc.years ?? [])
    } catch (e) {
      setError((e as Error).message || 'Something went wrong while loading the dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const [, liveVersion] = useLiveDomain(['invoices', 'paymentOrders', 'budgets'])
  useEffect(() => {
    if (liveVersion === 0) return
    void load()
  }, [liveVersion, load])

  const recent = useMemo(() => allInvoices.slice(0, 6), [allInvoices])

  const toDrillRow = (inv: Record<string, unknown>): DrillRow => {
    const rel = inv.contracts as { contract_no?: string; vendors?: Array<{ name?: string }> | null } | null
    return {
      id: String(inv.id),
      invoice_no: String(inv.invoice_no ?? ''),
      invoice_date: (inv.invoice_date as string | null) ?? null,
      vendor: rel?.vendors?.[0]?.name ?? 'Unknown',
      contract_no: rel?.contract_no ?? '',
      amount: Number(inv.amount ?? 0),
      status: String(inv.status ?? ''),
    }
  }

  const fyNow = currentFiscalYear()
  const fyElapsed = elapsedFyMonths()

  const fyInvoices = useMemo(
    () => allInvoices.filter((i) => invoiceBudgetFy(i) === hudFy),
    [allInvoices, hudFy],
  )

  const fyUtil = useMemo(() => {
    const usedByNo: Record<string, { used: number; count: number }> = {}
    for (const inv of fyInvoices) {
      const rel = inv.contracts as { contract_no?: string } | null
      const no = rel?.contract_no
      if (!no) continue
      usedByNo[no] ??= { used: 0, count: 0 }
      usedByNo[no].count += 1
      if (countsTowardUtilization(String(inv.status ?? ''))) {
        usedByNo[no].used += Number(inv.amount ?? 0)
      }
    }
    return (data?.utilization ?? [])
      .map((u) => {
        const hit = usedByNo[u.contractNo]
        if (!hit) return null
        const used = hit.used
        const pct = u.value > 0 ? Math.min(100, (used / u.value) * 100) : 0
        return { ...u, used, remaining: Math.max(0, u.value - used), pct, invoiceCount: hit.count }
      })
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .sort((a, b) => b.pct - a.pct)
  }, [data, fyInvoices])

  const fyVolume = useMemo(
    () => monthlyTrendByBudgetDate(fyInvoices, hudFy, hudFy === fyNow ? fyElapsed : 12),
    [fyInvoices, hudFy, fyNow, fyElapsed],
  )

  const trendData = useMemo(
    () => ({
      labels: fyVolume.map((m) => `${m.label} ${hudFy}`),
      totals: fyVolume.map((m) => m.total),
      counts: fyVolume.map((m) => m.count),
      keys: fyVolume.map((m) => m.key),
    }),
    [fyVolume, hudFy],
  )

  const fyChipOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...nearbyFiscalYears(new Date(), 2, 0),
          ...(allInvoices.map((i) => invoiceBudgetFy(i)).filter(Boolean) as string[]),
        ]),
      ).sort(),
    [allInvoices],
  )

  const hudBudget = useMemo(() => {
    const figures = yearlyBudgetFigures(hudFy, budgets, paymentOrders)
    const snap = accrualYears.find((y) => y.fy === hudFy) ?? null
    return { ...figures, snap }
  }, [budgets, paymentOrders, hudFy, accrualYears])

  const k = useMemo(() => fyKpis(allInvoices, paymentOrders, hudFy), [allInvoices, paymentOrders, hudFy])
  const fyStatus = useMemo(() => statusBreakdown(allInvoices, hudFy), [allInvoices, hudFy])
  const split = useMemo(() => paymentSplit(paymentOrders, fyNow), [paymentOrders, fyNow])
  const costBreak = useMemo(
    () => costElementBreakup(hudFy, allInvoices, paymentOrders, budgets),
    [hudFy, allInvoices, paymentOrders, budgets],
  )
  const priorAccrualRows = useMemo(
    () =>
      filterAccrualYears(accrualYears, {
        fy: accrualFyFilter,
        minBalance: Number(accrualMinBalance) || 0,
        sort: accrualSort as AccrualSortKey,
      }),
    [accrualYears, accrualFyFilter, accrualMinBalance, accrualSort],
  )
  const pastAccrualTotal = useMemo(
    () => accrualYears.filter((y) => isClosedFiscalYear(y.fy)).reduce((s, y) => s + y.balance, 0),
    [accrualYears],
  )

  const onTrendClick = (_e: unknown, els: Array<{ index?: number }>) => {
    if (!els.length) return
    const idx = els[0].index ?? 0
    const month = trendData.keys[idx]
    if (!month) return
    const rows = fyInvoices.filter((i) => String(invoiceBudgetDate(i) ?? '').startsWith(month)).map(toDrillRow)
    setDrill({ title: `${hudFy} · ${trendData.labels[idx] ?? month}`, subtitle: `${rows.length} invoices by service end`, rows })
  }

  const onStatusClick = (_e: unknown, els: Array<{ index?: number }>) => {
    if (!els.length) return
    const statuses = ['Approved', 'Paid', 'Pending', 'Rejected']
    const st = statuses[els[0].index ?? 0]
    const rows = fyInvoices.filter((i) => i.status === st).map(toDrillRow)
    setDrill({
      title: `${st} · ${hudFy}`,
      subtitle: `${rows.length} invoices · Rs ${formatMoney(rows.reduce((s, r) => s + r.amount, 0))}`,
      rows,
    })
  }

  if (error && allInvoices.length === 0) return <DashboardError message={error} onRetry={load} />
  if (loading && allInvoices.length === 0) return <DashboardSkeleton />

  const hasTrendData = trendData.totals.length > 0 && trendData.totals.some((v) => v > 0)
  const paidCount = k.paidCount
  const statusTotal = fyStatus.approved + fyStatus.paid + fyStatus.pending + fyStatus.rejected
  const hasFyUtil = fyUtil.length > 0
  const hasFyVol = fyVolume.some((m) => m.count > 0)
  const volMax = Math.max(0, ...fyVolume.map((m) => m.count))
  const ytdCount = fyInvoices.length

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      {/* Spotlight strip */}
      <Reveal>
        <div className="ct-spotlight">
          <div className="ct-spotlight-copy">
            <div className="ct-spotlight-title">
              {greeting()}, <span className="gradient-text">Control Tower</span>
            </div>
            <div className="ct-spotlight-date">{today}</div>
          </div>
          <div className="ct-spotlight-stats">
            <span className="ct-spotlight-stat">
              <BadgeCheck size={13} className="text-[var(--accent-3)]" /> {k.approvedCount} approved
            </span>
            <span className="ct-spotlight-stat">
              <Banknote size={13} className="text-[var(--accent-2)]" /> {paidCount} paid
            </span>
            <span className="ct-spotlight-stat">
              <Clock size={13} className="text-[var(--warn)]" /> {k.pendingCount} pending
            </span>
            <span className="ct-spotlight-stat">
              <FileX2 size={13} className="text-[var(--danger)]" /> {k.rejectedCount} rejected
            </span>
            <span className="ct-spotlight-stat">
              <FolderOpen size={13} className="text-[var(--accent)]" /> {data?.kpis.openContracts ?? 0} contracts
            </span>
            <span className="ct-spotlight-stat">
              <Users size={13} className="text-[var(--accent-2)]" /> {data?.kpis.activeUsers ?? 0} users
            </span>
          </div>
        </div>
      </Reveal>

      <div className="flex flex-wrap items-center gap-2">
        {fyChipOptions.map((year) => (
          <button
            key={year}
            type="button"
            className="chip"
            style={hudFy === year ? { background: 'var(--accent)', color: '#fff' } : undefined}
            onClick={() => setHudFy(year)}
          >
            {year}
          </button>
        ))}
        <span className="text-xs text-[var(--text-dim)]">Budget year = service end, else invoice date</span>
      </div>

      {/* KPI row — scoped to selected FY */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`${hudFy} Invoices`}
          value={k.totalInvoices}
          icon={<Receipt size={18} className="text-white" />}
          tone="info"
          sub={`${formatMoney(k.avgInvoice)} avg · this year only`}
          delay={0}
        />
        <KpiCard
          label={`${hudFy} Invoiced`}
          value={`Rs ${formatMoney(k.totalValue)}`}
          icon={<Banknote size={18} className="text-white" />}
          tone="ok"
          sub="service ended in this FY"
          delay={60}
        />
        <KpiCard
          label={hudFy === fyNow ? `${hudFy} Remaining` : `${hudFy} Accrual Balance`}
          value={`Rs ${formatMoney(hudFy === fyNow ? hudBudget.remaining : (hudBudget.snap?.balance ?? 0))}`}
          icon={<Wallet size={18} className="text-white" />}
          tone="ok"
          sub={hudFy === fyNow ? `budget Rs ${formatMoney(hudBudget.yearly)} minus released this year` : 'closed year · not mixed with running remaining'}
          delay={120}
        />
        <KpiCard
          label={hudFy === fyNow ? 'Released this year' : 'Released from accrual'}
          value={`Rs ${formatMoney(k.paymentReleasedValue)}`}
          icon={<BadgeCheck size={18} className="text-white" />}
          tone="purple"
          sub={hudFy === fyNow ? `${k.paymentReleasedCount} cleared against ${hudFy} budget` : `does not reduce ${fyNow} remaining`}
          delay={180}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pending Approval"
          value={k.pendingCount}
          icon={<BadgeCheck size={18} className="text-white" />}
          tone="warn"
          sub={`Rs ${formatMoney(k.pendingValue)} in ${hudFy}`}
          delay={200}
        />
        <KpiCard
          label="PO Generated"
          value={`Rs ${formatMoney(k.poGeneratedValue)}`}
          icon={<Banknote size={18} className="text-white" />}
          tone="warn"
          sub={`${k.financePendingCount} awaiting finance in ${hudFy}`}
          delay={240}
        />
        <KpiCard
          label="Approved Value"
          value={`Rs ${formatMoney(k.approvedInvoiceValue)}`}
          icon={<BadgeCheck size={18} className="text-white" />}
          tone="info"
          sub={`${k.approvedCount} signed off in ${hudFy}`}
          delay={280}
        />
        <KpiCard
          label="Past-year Accrual"
          value={`Rs ${formatMoney(pastAccrualTotal)}`}
          icon={<Wallet size={18} className="text-white" />}
          tone="purple"
          sub={`closed FYs only · released from accrual Rs ${formatMoney(split.fromAccrual)}`}
          delay={320}
        />
      </div>

      {/* Charts bento */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Reveal className="lg:col-span-2" delay={80}>
          <GlassCard className="h-full p-5 md:p-6" hoverable>
            <div className="mb-1 flex items-center justify-between">
              <div className="section-title mb-0!">{hudFy} invoice value</div>
              <span className="badge badge-neutral">click a point</span>
            </div>
            <div className="h-[300px]">
              {hasTrendData ? (
                <ChartStage className="h-full" color={c.accent} values={trendData.totals}>
                <Line
                  data={{
                    labels: trendData.labels,
                    datasets: [
                      {
                        label: 'Value (Rs)',
                        data: trendData.totals,
                        ...waveLine(c.accent, true),
                        pointBackgroundColor: c.accent2,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: onTrendClick,
                    animation: lineMotion(),
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: c.ticks } },
                      y: { beginAtZero: true, grace: '8%', grid: { color: c.grid }, ticks: { color: c.ticks } },
                    },
                  }}
                />
                </ChartStage>
              ) : (
                <ChartEmpty
                  icon={Activity}
                  title="No invoice activity yet"
                  hint="Once invoices are recorded, their monthly value trend will appear here."
                />
              )}
            </div>
          </GlassCard>
        </Reveal>

        <Reveal delay={140}>
          <GlassCard className="h-full overflow-hidden p-5 md:p-6" hoverable>
            <div className="mb-1 flex items-center justify-between">
              <div className="section-title mb-0!">Status Breakdown</div>
              <span className="badge badge-neutral">click a slice</span>
            </div>
            <div className="h-[280px] overflow-hidden px-1">
              {statusTotal > 0 ? (
                <ChartStage className="h-full" color={c.accent} values={[fyStatus.approved, fyStatus.paid, fyStatus.pending, fyStatus.rejected]}>
                <Doughnut
                  data={{
                    labels: ['Approved', 'Paid', 'Pending', 'Rejected'],
                    datasets: [
                      {
                        data: [fyStatus.approved, fyStatus.paid, fyStatus.pending, fyStatus.rejected],
                        backgroundColor: [c.accent3, c.accent2, c.warn, c.err],
                        ...doughnutSlice(),
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    onClick: onStatusClick,
                    layout: { padding: { top: 10, right: 16, bottom: 8, left: 16 } },
                    animation: doughnutMotion(),
                    plugins: { legend: { position: 'bottom', labels: { color: c.ticks, boxWidth: 10, padding: 10 } } },
                  }}
                />
                </ChartStage>
              ) : (
                <ChartEmpty
                  icon={PieChart}
                  title="No statuses to break down"
                  hint="Invoice status distribution shows up here once invoices exist."
                />
              )}
            </div>
          </GlassCard>
        </Reveal>
      </div>

      {/* Fiscal operations HUD */}
      <Reveal delay={80}>
        <section className="ct-fy">
          <header className="ct-fy-head">
            <div>
              <h2 className="ct-fy-title">This fiscal year</h2>
              <p className="ct-fy-sub">{hudFy} · {fiscalShortRange(hudFy)} · budget year is service end, then invoice date</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {fyChipOptions.map((year) => (
                <button
                  key={year}
                  type="button"
                  className="chip"
                  style={hudFy === year ? { background: 'var(--accent)', color: '#fff' } : undefined}
                  onClick={() => setHudFy(year)}
                >
                  {year}
                </button>
              ))}
              <Link to="/contracts" className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
                Contracts <ArrowUpRight size={14} />
              </Link>
            </div>
          </header>

          <div className="ct-fy-kpis">
            {hudFy === fyNow ? (
              <>
                <div className="ct-fy-tile">
                  <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Yearly budget</div>
                  <div className="mt-1 text-lg font-black">Rs {formatMoney(hudBudget.yearly)}</div>
                </div>
                <div className="ct-fy-tile">
                  <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Released this year</div>
                  <div className="mt-1 text-lg font-black">Rs {formatMoney(hudBudget.released)}</div>
                </div>
                <div className="ct-fy-tile">
                  <div className="flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    <Wallet size={12} /> Remaining
                  </div>
                  <div className="mt-1 text-lg font-black text-[var(--accent-3)]">Rs {formatMoney(hudBudget.remaining)}</div>
                  <p className="mt-1 text-[0.7rem] text-[var(--text-dim)]">Running year only. Prior-year payments stay on Accrual Balance.</p>
                </div>
              </>
            ) : (
              <>
                <div className="ct-fy-tile">
                  <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Sundry Accrual</div>
                  <div className="mt-1 text-lg font-black">Rs {formatMoney(hudBudget.snap?.secured ?? 0)}</div>
                </div>
                <div className="ct-fy-tile">
                  <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Accrual Balance</div>
                  <div className="mt-1 text-lg font-black">Rs {formatMoney(hudBudget.snap?.balance ?? 0)}</div>
                </div>
                <div className="ct-fy-tile">
                  <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Released in year</div>
                  <div className="mt-1 text-lg font-black">Rs {formatMoney(hudBudget.snap?.consumed ?? hudBudget.released)}</div>
                  <p className="mt-1 text-[0.7rem] text-[var(--text-dim)]">Does not reduce {fyNow} remaining budget.</p>
                </div>
              </>
            )}
          </div>

          {hasFyUtil || hasFyVol ? (
            <div className={`ct-fy-grid${hasFyUtil && hasFyVol ? ' is-split' : ''}`}>
              {hasFyUtil && (
                <div className="ct-pane">
                  <div className="ct-pane-head">
                    <div className="ct-pane-title">Contract utilization</div>
                    <div className="ct-pane-meta">{fyUtil.length} drawing {hudFy}</div>
                  </div>
                  <div className="ct-util-list">
                    {fyUtil.map((u, i) => {
                      const tone = u.pct >= 90 ? 'err' : u.pct >= 70 ? 'warn' : 'ok'
                      return (
                        <button
                          key={u.contractNo}
                          type="button"
                          className="ct-util-row"
                          style={{ ['--i' as string]: String(i) }}
                          onClick={() => {
                            const rows = fyInvoices
                              .filter((i) => {
                                const rel = i.contracts as { contract_no?: string } | null
                                return rel?.contract_no === u.contractNo
                              })
                              .map(toDrillRow)
                            setDrill({
                              title: `${u.contractNo} · ${hudFy}`,
                              subtitle: `${rows.length} invoices this fiscal year · Rs ${formatMoney(u.used)} used`,
                              rows,
                            })
                          }}
                        >
                          <span className="ct-util-id">{u.contractNo}</span>
                          <span className={`ct-track ${tone}`}>
                            <span className="ct-fill" style={{ width: `${Math.min(100, u.pct)}%` }} />
                          </span>
                          <span className="ct-util-pct">{Math.round(u.pct)}%</span>
                          <span className="ct-util-amt">Rs {formatMoney(u.used)} / {formatMoney(u.value)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {hasFyVol && (
                <div className="ct-pane">
                  <div className="ct-pane-head">
                    <div className="ct-pane-title">Monthly volume</div>
                    <div className="ct-pane-meta">{ytdCount} YTD · {fyElapsed} mo</div>
                  </div>
                  <div className="ct-eq">
                    {fyVolume.map((m, i) => {
                      return (
                        <button
                          key={m.key}
                          type="button"
                          className={`ct-eq-col${m.isCurrent ? ' is-now' : ''}`}
                          style={{ ['--h' as string]: String((m.count <= 0 ? 0.06 : Math.max(0.14, m.count / volMax)).toFixed(3)), ['--i' as string]: String(i) }}
                          onClick={() => {
                            const rows = allInvoices
                              .filter((i) => invoiceBudgetFy(i) === hudFy && String(invoiceBudgetDate(i) ?? '').startsWith(m.key))
                              .map(toDrillRow)
                            setDrill({
                              title: `Invoices · ${m.label} ${hudFy}`,
                              subtitle: `${rows.length} invoices · Rs ${formatMoney(m.total)}`,
                              rows,
                            })
                          }}
                        >
                          <span className="ct-eq-val">{m.count || ''}</span>
                          <span className="ct-eq-bar"><span className="ct-eq-fill" /></span>
                          <span className="ct-eq-lab">{m.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="ct-fy-empty">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-[var(--text-muted)]">
                <Activity size={18} />
              </span>
              <div className="text-sm font-bold">No {hudFy} activity yet</div>
              <div className="max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">
                Invoices posted this fiscal year will populate utilization and monthly volume here.
              </div>
            </div>
          )}
          <div className="mt-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-sm font-bold">{hudFy} budget breakup</div>
                <p className="mt-1 text-xs text-[var(--text-dim)]">
                  {hudFy === fyNow
                    ? 'Remaining is yearly budget minus payments released for invoices whose service ended in this year.'
                    : 'Closed year: unpaid sits on Accrual Balance. Released-in-year does not hit running remaining.'}
                </p>
              </div>
            </div>
            {costBreak.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">No cost-element lines for {hudFy}.</p>
            ) : (
              <div className="table-scroll mt-2">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cost element</th>
                      <th className="text-right">Yearly budget</th>
                      <th className="text-right">Released</th>
                      <th className="text-right">{hudFy === fyNow ? 'Remaining' : 'Unpaid'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costBreak.map((row) => (
                      <tr key={row.code}>
                        <td className="font-semibold">{row.code}</td>
                        <td className="text-right tabular-nums">Rs {formatMoney(row.budget)}</td>
                        <td className="text-right tabular-nums">Rs {formatMoney(row.released)}</td>
                        <td className="text-right font-semibold tabular-nums">
                          Rs {formatMoney(hudFy === fyNow ? row.remaining : row.unpaid)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold">Past-year accruals</div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input input-fit py-1!" value={accrualFyFilter} onChange={(e) => setAccrualFyFilter(e.target.value)}>
                    <option value="all">All closed FYs</option>
                    {accrualYears.filter((y) => isClosedFiscalYear(y.fy)).map((y) => (
                      <option key={y.fy} value={y.fy}>{y.fy}</option>
                    ))}
                  </select>
                  <input
                    className="input input-fit-sm py-1!"
                    type="number"
                    min={0}
                    placeholder="Min balance"
                    value={accrualMinBalance}
                    onChange={(e) => setAccrualMinBalance(e.target.value)}
                  />
                  <select className="input input-fit py-1!" value={accrualSort} onChange={(e) => setAccrualSort(e.target.value as AccrualSortKey)}>
                    <option value="fy">Sort FY</option>
                    <option value="secured">Sort accrual</option>
                    <option value="unpaid">Sort unpaid</option>
                    <option value="consumed">Sort released</option>
                    <option value="balance">Sort balance</option>
                  </select>
                </div>
              </div>
              <p className="mt-1 text-xs text-[var(--text-dim)]">
                Closed-year unpaid invoices sit here. They never mix with {fyNow} remaining budget.
              </p>
              {priorAccrualRows.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">No closed-year accrual matches the filter.</p>
              ) : (
              <div className="table-scroll mt-2">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>FY</th>
                      <th className="text-right">Sundry Accrual</th>
                      <th className="text-right">Unpaid</th>
                      <th className="text-right">Released in year</th>
                      <th className="text-right">Accrual Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priorAccrualRows.map((row) => (
                      <tr key={row.fy}>
                        <td>
                          <button type="button" className="font-semibold text-[var(--accent)]" onClick={() => setHudFy(row.fy)}>
                            {row.fy}
                          </button>
                        </td>
                        <td className="text-right tabular-nums">Rs {formatMoney(row.secured)}</td>
                        <td className="text-right tabular-nums">Rs {formatMoney(row.unpaid)}</td>
                        <td className="text-right tabular-nums">Rs {formatMoney(row.consumed)}</td>
                        <td className="text-right font-semibold tabular-nums">Rs {formatMoney(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
        </section>
      </Reveal>

      {/* Recent invoices */}
      <Reveal delay={100}>
        <GlassCard className="overflow-hidden" hoverable>
          <div className="flex items-center justify-between px-5 pt-5 md:px-6">
            <div className="section-title mb-0!">Recent Invoices</div>
            <Link to="/invoices" className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="table-scroll mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Vendor / Contract</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((inv) => {
                  const i = inv as Record<string, unknown>
                  const rel = i.contracts as
                    | { contract_no?: string; vendors?: Array<{ name?: string }> | null }
                    | null
                  return (
                    <tr key={String(i.id)}>
                      <td className="font-semibold">{String(i.invoice_no ?? '')}</td>
                      <td>{formatDate(i.invoice_date as string)}</td>
                      <td>
                        <div className="text-sm">{rel?.vendors?.[0]?.name ?? 'Unknown'}</div>
                        <div className="text-xs text-[var(--text-muted)]">{rel?.contract_no ?? ''}</div>
                      </td>
                      <td className="text-right font-semibold tabular-nums">{formatMoney(Number(i.amount))}</td>
                      <td>
                        <StatusBadge tone={statusTone(i.status as string)}>{String(i.status)}</StatusBadge>
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">{timeAgo(i.created_at as string)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {recent.length === 0 && (
            <EmptyState
              title="No invoices yet"
              description="Import invoice data or create your first invoice to get started."
              action={
                <Link to="/import" className="btn btn-primary">
                  Import data
                </Link>
              }
            />
          )}
        </GlassCard>
      </Reveal>

      <ChartDrillDown
        open={!!drill}
        title={drill?.title ?? ''}
        subtitle={drill?.subtitle ?? ''}
        rows={drill?.rows ?? []}
        onClose={() => setDrill(null)}
      />
    </div>
  )
}
