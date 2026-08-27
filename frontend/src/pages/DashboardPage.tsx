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
import { useToast } from '../components/ui/Toast'
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [allInvoices, setAllInvoices] = useState<Array<Record<string, unknown>>>([])
  const [drill, setDrill] = useState<{ title: string; subtitle: string; rows: DrillRow[] } | null>(null)
  const toast = useToast()
  const c = useThemeColors()

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const d = await apiGet<DashboardData>('/api/reports/dashboard')
        if (alive) setData(d)
        const inv = await apiGet<{ invoices: Array<Record<string, unknown>> }>('/api/invoices')
        if (alive) setAllInvoices(inv.invoices)
      } catch (e) {
        toast.error('Failed to load dashboard', (e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [toast])

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

  if (loading && !data) return <DashboardSkeleton />

  const k = data?.kpis
  if (!k) return <DashboardSkeleton />

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
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
                Good day, <span className="gradient-text">Control Tower</span>
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
                <FolderOpen size={13} className="text-[var(--accent)]" /> {k.openContracts} contracts
              </span>
            </div>
          </div>
        </div>
      </Reveal>

      {/* KPI bento (Fibonacci auto-fit grid) */}
      <div className="kpi-grid">
        <KpiCard
          label="Total Invoices"
          value={k.totalInvoices}
          icon={<Receipt size={18} className="text-white" />}
          tone="info"
          sub={`${formatMoney(k.avgInvoice)} avg`}
          delay={0}
        />
        <KpiCard
          label="Invoiced Value"
          value={`Rs ${formatMoney(k.totalValue)}`}
          icon={<Banknote size={18} className="text-white" />}
          tone="ok"
          trend={0}
          sub="cumulative"
          delay={60}
        />
        <KpiCard
          label="Pending Approval"
          value={k.pendingCount}
          icon={<Clock size={18} className="text-white" />}
          tone="warn"
          sub={`Rs ${formatMoney(k.pendingValue)}`}
          delay={120}
        />
        <KpiCard
          label="Rejected"
          value={k.rejectedCount}
          icon={<FileX2 size={18} className="text-white" />}
          tone="err"
          sub={`Rs ${formatMoney(k.rejectedValue)}`}
          delay={180}
        />
        <KpiCard
          label="Approved Value"
          value={`Rs ${formatMoney(k.approvedValue)}`}
          icon={<BadgeCheck size={18} className="text-white" />}
          tone="ok"
          sub={`${k.approvedCount} approved`}
          delay={40}
        />
        <KpiCard
          label="Open Contracts"
          value={k.openContracts}
          icon={<FolderOpen size={18} className="text-white" />}
          tone="info"
          sub={`${k.expiringContracts} expiring ≤ 60d`}
          delay={100}
        />
        <KpiCard
          label="Active Users"
          value={k.activeUsers}
          icon={<Users size={18} className="text-white" />}
          tone="purple"
          delay={160}
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
            <div className="h-64">
              <Line
                data={{
                  labels: trendData.labels,
                  datasets: [
                    {
                      label: 'Value (Rs)',
                      data: trendData.totals,
                      borderColor: c.accent,
                      backgroundColor: c.chartBg,
                      fill: true,
                      tension: 0.42,
                      pointBackgroundColor: c.accent2,
                      pointBorderColor: c.accent2,
                      pointRadius: 3,
                      pointHoverRadius: 6,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: onTrendClick,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { color: c.grid }, ticks: { color: c.ticks } },
                    y: { grid: { color: c.grid }, ticks: { color: c.ticks } },
                  },
                }}
              />
            </div>
          </GlassCard>
        </Reveal>

        <Reveal delay={140}>
          <GlassCard className="h-full p-5 md:p-6" hoverable>
            <div className="mb-1 flex items-center justify-between">
              <div className="section-title !mb-0">Status Breakdown</div>
              <span className="badge badge-neutral">click a slice</span>
            </div>
            <div className="h-64">
              <Doughnut
                data={{
                  labels: ['Approved', 'Pending', 'Rejected'],
                  datasets: [
                    {
                      data: [data.statusBreakdown.approved, data.statusBreakdown.pending, data.statusBreakdown.rejected],
                      backgroundColor: [c.accent3, c.warn, c.err],
                      borderWidth: 0,
                      hoverOffset: 10,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: onStatusClick,
                  plugins: { legend: { position: 'bottom', labels: { color: c.ticks, boxWidth: 10, padding: 14 } } },
                }}
              />
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
            <div className="space-y-4">
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
                <EmptyState title="No contracts yet" description="Import or create contracts to see utilization." />
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
            <div className="h-56">
              <Bar
                data={{
                  labels: trendData.labels.slice(-6),
                  datasets: [
                    {
                      label: 'Invoices',
                      data: trendData.counts.slice(-6),
                      backgroundColor: c.accent2 + 'B3',
                      borderRadius: 8,
                      borderSkipped: false,
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
