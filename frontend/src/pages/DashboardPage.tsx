import { useEffect, useMemo, useState } from 'react'
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
  BarChart3,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import { apiGet } from '../lib/api'
import { formatMoney, formatDate, timeAgo } from '../lib/format'
import { useThemeColors } from '../lib/themeColors'
import KpiCard from '../components/ui/KpiCard'
import GlassCard from '../components/ui/GlassCard'
import StatusBadge, { statusTone } from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import Reveal from '../components/ui/Reveal'
import ChartDrillDown, { type DrillRow } from '../components/ui/ChartDrillDown'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
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
  }
  trend: Array<{ month: string; total: number; count: number }>
  statusBreakdown: { approved: number; pending: number; rejected: number }
  utilization: Array<{ contractNo: string; value: number; used: number; remaining: number; pct: number }>
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex
    const n = parseInt(full, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  return color
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
        <div className="skeleton h-64 lg:col-span-2" />
        <div className="skeleton h-64" />
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
  const [drill, setDrill] = useState<{ title: string; subtitle: string; rows: DrillRow[] } | null>(null)
  const c = useThemeColors()

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await apiGet<DashboardData>('/api/reports/dashboard')
      setData(d)
      const inv = await apiGet<{ invoices: Array<Record<string, unknown>> }>('/api/invoices')
      setAllInvoices(inv.invoices)
    } catch (e) {
      setError((e as Error).message || 'Something went wrong while loading the dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    const run = async () => {
      await load()
      if (!alive) return
    }
    run()
    return () => {
      alive = false
    }
  }, [])

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

  const trendData = useMemo(() => {
    const labels = data?.trend.map((t) => {
      const [y, m] = t.month.split('-')
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${months[Number(m) - 1]} ${y}`
    }) ?? []
    return {
      labels,
      totals: data?.trend.map((t) => t.total) ?? [],
      counts: data?.trend.map((t) => t.count) ?? [],
    }
  }, [data])

  const onTrendClick = (_e: unknown, els: Array<{ index?: number }>) => {
    if (!els.length || !data) return
    const idx = els[0].index ?? 0
    const month = data.trend[idx]?.month
    if (!month) return
    const rows = allInvoices.filter((i) => String(i.invoice_date ?? '').startsWith(month)).map(toDrillRow)
    setDrill({ title: `Invoices · ${trendData.labels[idx] ?? month}`, subtitle: `${rows.length} invoices billed that month`, rows })
  }

  const onStatusClick = (_e: unknown, els: Array<{ index?: number }>) => {
    if (!els.length) return
    const statuses = ['Approved', 'Pending', 'Rejected']
    const st = statuses[els[0].index ?? 0]
    const rows = allInvoices.filter((i) => i.status === st).map(toDrillRow)
    setDrill({
      title: `${st} Invoices`,
      subtitle: `${rows.length} invoices · Rs ${formatMoney(rows.reduce((s, r) => s + r.amount, 0))}`,
      rows,
    })
  }

  if (error && !data) return <DashboardError message={error} onRetry={load} />
  if (loading && !data) return <DashboardSkeleton />

  const k = data?.kpis
  if (!k) return <DashboardSkeleton />

  const hasTrendData = trendData.totals.length > 0 && trendData.totals.some((v) => v > 0)
  const statusTotal = data.statusBreakdown.approved + data.statusBreakdown.pending + data.statusBreakdown.rejected
  const hasVolumeData = trendData.counts.slice(-6).some((v) => v > 0)

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const lineGradient = (area: { top: number; bottom: number }, ctx: CanvasRenderingContext2D) => {
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom)
    g.addColorStop(0, withAlpha(c.accent, 0.3))
    g.addColorStop(1, withAlpha(c.accent, 0.01))
    return g
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      {/* Spotlight strip */}
      <Reveal>
        <div className="ring-card glass-hover glass relative overflow-hidden rounded-2xl px-5 py-4 md:px-7">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full opacity-30 blur-3xl"
            style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold tracking-tight">
                {greeting()}, <span className="gradient-text">Control Tower</span>
              </div>
              <div className="mt-0.5 text-sm text-[var(--text-muted)]">{today}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip !cursor-default">
                <BadgeCheck size={13} className="text-[var(--accent-3)]" /> {k.approvedCount} approved
              </span>
              <span className="chip !cursor-default">
                <Clock size={13} className="text-[var(--warn)]" /> {k.pendingCount} pending
              </span>
              <span className="chip !cursor-default">
                <FileX2 size={13} className="text-[var(--danger)]" /> {k.rejectedCount} rejected
              </span>
              <span className="chip !cursor-default">
                <FolderOpen size={13} className="text-[var(--accent)]" /> {k.openContracts} contracts
              </span>
              <span className="chip !cursor-default">
                <Users size={13} className="text-[var(--accent-2)]" /> {k.activeUsers} users
              </span>
            </div>
          </div>
        </div>
      </Reveal>

      {/* KPI row — even 4-column rhythm */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Invoices"
          value={k.totalInvoices}
          icon={<Receipt size={18} className="text-white" />}
          tone="info"
          sub={`${formatMoney(k.avgInvoice)} avg value`}
          delay={0}
        />
        <KpiCard
          label="Invoiced Value"
          value={`Rs ${formatMoney(k.totalValue)}`}
          icon={<Banknote size={18} className="text-white" />}
          tone="ok"
          sub="cumulative across all contracts"
          delay={60}
        />
        <KpiCard
          label="Pending Approval"
          value={k.pendingCount}
          icon={<Clock size={18} className="text-white" />}
          tone="warn"
          sub={`Rs ${formatMoney(k.pendingValue)} awaiting decision`}
          delay={120}
        />
        <KpiCard
          label="Approved Value"
          value={`Rs ${formatMoney(k.approvedValue)}`}
          icon={<BadgeCheck size={18} className="text-white" />}
          tone="purple"
          sub={`${k.approvedCount} invoices approved`}
          delay={180}
        />
      </div>

      {/* Charts bento */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Reveal className="lg:col-span-2" delay={80}>
          <GlassCard className="h-full p-5 md:p-6" hoverable>
            <div className="mb-1 flex items-center justify-between">
              <div className="section-title !mb-0">Invoice Value Trend</div>
              <span className="badge badge-neutral">click a point</span>
            </div>
            <div className="h-[300px]">
              {hasTrendData ? (
                <Line
                  data={{
                    labels: trendData.labels,
                    datasets: [
                      {
                        label: 'Value (Rs)',
                        data: trendData.totals,
                        borderColor: c.accent,
                        backgroundColor: (context: { chart: ChartJS }) => {
                          const { chartArea, ctx } = context.chart
                          if (!chartArea) return 'transparent'
                          return lineGradient(chartArea, ctx)
                        },
                        fill: true,
                        tension: 0.42,
                        pointBackgroundColor: c.accent2,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1.5,
                        pointRadius: 3.5,
                        pointHoverRadius: 6.5,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: onTrendClick,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: c.ticks } },
                      y: { grid: { color: c.grid }, ticks: { color: c.ticks } },
                    },
                  }}
                />
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
          <GlassCard className="h-full p-5 md:p-6" hoverable>
            <div className="mb-1 flex items-center justify-between">
              <div className="section-title !mb-0">Status Breakdown</div>
              <span className="badge badge-neutral">click a slice</span>
            </div>
            <div className="h-[300px]">
              {statusTotal > 0 ? (
                <Doughnut
                  data={{
                    labels: ['Approved', 'Pending', 'Rejected'],
                    datasets: [
                      {
                        data: [data.statusBreakdown.approved, data.statusBreakdown.pending, data.statusBreakdown.rejected],
                        backgroundColor: [c.accent3, c.warn, c.err],
                        borderWidth: 0,
                        hoverOffset: 10,
                        borderRadius: 4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    onClick: onStatusClick,
                    plugins: { legend: { position: 'bottom', labels: { color: c.ticks, boxWidth: 10, padding: 14 } } },
                  }}
                />
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

      {/* Utilization + volume bento */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Reveal className="lg:col-span-2" delay={80}>
          <GlassCard className="h-full p-5 md:p-6" hoverable>
            <div className="mb-4 flex items-center justify-between">
              <div className="section-title !mb-0">Contract Utilization</div>
              <Link to="/contracts" className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
                View all <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="flex min-h-[300px] flex-col justify-center space-y-4">
              {data?.utilization.slice(0, 6).map((u) => (
                <div key={u.contractNo} className="flex items-center gap-3">
                  <div className="w-24 truncate text-sm font-medium md:w-40">{u.contractNo}</div>
                  <div className={`util-bar flex-1 ${u.pct >= 90 ? 'err' : u.pct >= 70 ? 'warn' : 'ok'}`}>
                    <span style={{ width: `${Math.min(100, u.pct)}%` }} />
                  </div>
                  <div className="hidden w-36 shrink-0 text-right text-xs text-[var(--text-dim)] md:block">
                    {formatMoney(u.used)} / {formatMoney(u.value)}
                  </div>
                  <div className="w-14 shrink-0 text-right text-xs font-bold tabular-nums">
                    {formatMoney(u.pct, 0)}%
                  </div>
                </div>
              ))}
              {(data?.utilization.length ?? 0) === 0 && (
                <EmptyState
                  icon={<FolderOpen size={28} />}
                  title="No contracts yet"
                  description="Import or create contracts to see utilization."
                />
              )}
            </div>
          </GlassCard>
        </Reveal>

        <Reveal delay={140}>
          <GlassCard className="h-full p-5 md:p-6" hoverable>
            <div className="mb-3 flex items-center justify-between">
              <div className="section-title !mb-0">Monthly Volume</div>
              <Activity size={15} className="text-[var(--text-muted)]" />
            </div>
            <div className="h-[300px]">
              {hasVolumeData ? (
                <Bar
                  data={{
                    labels: trendData.labels.slice(-6),
                    datasets: [
                      {
                        label: 'Invoices',
                        data: trendData.counts.slice(-6),
                        backgroundColor: (context: { chart: ChartJS }) => {
                          const { chartArea, ctx } = context.chart
                          if (!chartArea) return withAlpha(c.accent2, 0.7)
                          const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
                          g.addColorStop(0, withAlpha(c.accent2, 0.25))
                          g.addColorStop(1, withAlpha(c.accent2, 0.85))
                          return g
                        },
                        borderRadius: 8,
                        borderSkipped: false,
                        maxBarThickness: 34,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: c.ticks } },
                      y: { grid: { color: c.grid }, ticks: { color: c.ticks } },
                    },
                  }}
                />
              ) : (
                <ChartEmpty
                  icon={BarChart3}
                  title="No monthly volume yet"
                  hint="The number of invoices raised each month will chart here."
                />
              )}
            </div>
          </GlassCard>
        </Reveal>
      </div>

      {/* Recent invoices */}
      <Reveal delay={100}>
        <GlassCard className="overflow-hidden" hoverable>
          <div className="flex items-center justify-between px-5 pt-5 md:px-6">
            <div className="section-title !mb-0">Recent Invoices</div>
            <Link to="/invoices" className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
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
