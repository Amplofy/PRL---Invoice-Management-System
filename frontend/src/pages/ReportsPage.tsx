import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
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
import { Bar, Doughnut } from 'react-chartjs-2'
import { apiGet } from '../lib/api'
import { formatMoney } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import EmptyState from '../components/ui/EmptyState'
import { useThemeColors } from '../lib/themeColors'

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

interface SummaryData {
  byVendor: Array<{ vendor: string; total: number; count: number; approved: number }>
  byService: Array<{ service: string; total: number }>
  approvalSummary: {
    total: number
    approved: number
    pending: number
    rejected: number
    approvedValue: number
    pendingValue: number
    rejectedValue: number
  }
}

export default function ReportsPage() {
  const [data, setData] = useState<SummaryData | null>(null)
  const toast = useToast()
  const c = useThemeColors()

  useEffect(() => {
    apiGet<SummaryData>('/api/reports/summary')
      .then(setData)
      .catch((e) => toast.error('Failed to load reports', (e as Error).message))
  }, [toast])

  const byService = useMemo(() => {
    const top = [...(data?.byService ?? [])].sort((a, b) => b.total - a.total).slice(0, 8)
    const rest = (data?.byService ?? []).slice(8).reduce((s, x) => s + x.total, 0)
    return rest > 0 ? [...top, { service: 'Other', total: rest }] : top
  }, [data])

  const byVendor = useMemo(
    () => [...(data?.byVendor ?? [])].sort((a, b) => b.total - a.total).slice(0, 10),
    [data],
  )

  const exportCsv = (filename: string, header: string[], rows: (string | number)[][]) => {
    const esc = (v: string | number) => {
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportVendor = () =>
    exportCsv(
      'vendors-summary.csv',
      ['Vendor', 'Invoices', 'Total (Rs)', 'Approved (Rs)'],
      byVendor.map((v) => [v.vendor, v.count, Math.round(v.total), Math.round(v.approved)]),
    )

  const exportService = () =>
    exportCsv(
      'services-summary.csv',
      ['Service', 'Total (Rs)'],
      byService.map((s) => [s.service, Math.round(s.total)]),
    )

  if (!data) {
    return <div className="py-24 text-center text-[var(--text-muted)]">Loading reports…</div>
  }

  const a = data.approvalSummary

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Summarized spend by vendor and service, with exportable CSV."
        actions={
          <div className="flex gap-2.5">
            <button className="btn btn-ghost" onClick={exportVendor}>
              <Download size={15} /> Vendors CSV
            </button>
            <button className="btn btn-ghost" onClick={exportService}>
              <Download size={15} /> Services CSV
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <GlassCard className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">Total invoices</div>
          <div className="mt-1 text-2xl font-bold">{a.total}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">Approved value</div>
          <div className="mt-1 text-2xl font-bold text-[var(--accent-3)]">Rs {formatMoney(a.approvedValue)}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">Pending value</div>
          <div className="mt-1 text-2xl font-bold text-[var(--warn)]">Rs {formatMoney(a.pendingValue)}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">Rejected value</div>
          <div className="mt-1 text-2xl font-bold text-[var(--danger)]">Rs {formatMoney(a.rejectedValue)}</div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="section-title">Spend by Service</div>
          <div className="h-72">
            <Bar
              data={{
                labels: byService.map((s) => s.service),
                datasets: [
                  {
                    label: 'Total (Rs)',
                    data: byService.map((s) => s.total),
                    backgroundColor: c.accent2 + 'B3',
                    borderRadius: 6,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { color: c.grid }, ticks: { color: c.ticks } },
                  y: { grid: { display: false }, ticks: { color: c.ticks } },
                },
              }}
            />
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="section-title">Approval Mix</div>
          <div className="h-72">
            <Doughnut
              data={{
                labels: ['Approved', 'Pending', 'Rejected'],
                datasets: [
                  {
                    data: [a.approved, a.pending, a.rejected],
                    backgroundColor: [c.accent3, c.warn, c.err],
                    borderWidth: 0,
                    hoverOffset: 8,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: c.ticks, boxWidth: 10 } } },
              }}
            />
          </div>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="px-5 pt-5">
          <div className="section-title !mb-0">Top Vendors by Value</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th className="text-right">Invoices</th>
                <th className="text-right">Total</th>
                <th className="text-right">Approved</th>
                <th>Approval Rate</th>
              </tr>
            </thead>
            <tbody>
              {byVendor.map((v) => (
                <tr key={v.vendor}>
                  <td className="font-semibold">{v.vendor}</td>
                  <td className="text-right">{v.count}</td>
                  <td className="text-right font-semibold">{formatMoney(v.total)}</td>
                  <td className="text-right">{formatMoney(v.approved)}</td>
                  <td>
                    {v.total > 0 ? (
                      <span className="flex items-center gap-2">
                        <span className="util-bar min-w-24 max-w-40 flex-1" style={{ background: 'var(--surface)' }}>
                          <span style={{ width: `${Math.min(100, (v.approved / v.total) * 100)}%` }} />
                        </span>
                        <span className="text-xs text-[var(--text-dim)]">
                          {formatMoney((v.approved / v.total) * 100, 0)}%
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {byVendor.length === 0 && (
          <EmptyState title="No vendor data yet" description="Import or create invoices to see spend summaries." />
        )}
      </GlassCard>
    </div>
  )
}
