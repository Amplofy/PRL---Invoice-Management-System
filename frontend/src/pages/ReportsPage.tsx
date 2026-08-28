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
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { apiGet } from '../lib/api'
import { formatMoney } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import EmptyState from '../components/ui/EmptyState'
import SummaryCards from '../components/ui/SummaryCards'
import { useThemeColors } from '../lib/themeColors'
import { fiscalOf, fyMonthIndex, FY_MONTHS, QUARTERS, costCategory, type FiscalQuarter } from '../lib/fiscal'
import { downloadCSV } from '../lib/export'

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

interface Invoice {
  id: string
  invoice_no: string | null
  serial_no: string | null
  invoice_date: string | null
  contract_id: string | null
  cost_element: string | null
  amount: number
  status: string
  contracts: { contract_no: string | null; value: number | null; vendors: Array<{ name: string | null }> | null } | null
}
interface Contract {
  id: string
  contract_no: string
  value: number | null
  status: string | null
  vendors: Array<{ name: string | null }> | null
}

const ALL = 'all'

export default function ReportsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [fy, setFy] = useState(ALL)
  const [quarter, setQuarter] = useState(ALL)
  const [vendor, setVendor] = useState(ALL)
  const [contractId, setContractId] = useState(ALL)
  const [costElement, setCostElement] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const toast = useToast()
  const c = useThemeColors()

  useEffect(() => {
    Promise.all([
      apiGet<{ invoices: Invoice[] }>('/api/invoices'),
      apiGet<{ contracts: Contract[] }>('/api/contracts'),
    ])
      .then(([inv, con]) => {
        setInvoices(inv.invoices)
        setContracts(con.contracts)
      })
      .catch((e) => toast.error('Failed to load reports', (e as Error).message))
      .finally(() => setLoading(false))
  }, [toast])

  const vendorOf = (inv: Invoice) => {
    const rel = inv.contracts
    const cn = Array.isArray(rel) ? rel[0] : rel
    return cn?.vendors?.[0]?.name ?? '—'
  }

  // Dynamic filter option lists
  const fyOptions = useMemo(
    () => Array.from(new Set(invoices.map((i) => fiscalOf(i.invoice_date)?.fy).filter(Boolean) as string[])).sort(),
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

  const scoped = useMemo(
    () =>
      invoices.filter((inv) => {
        const fi = fiscalOf(inv.invoice_date)
        if (fy !== ALL && fi?.fy !== fy) return false
        if (quarter !== ALL && fi?.quarter !== quarter) return false
        if (vendor !== ALL && vendorOf(inv) !== vendor) return false
        if (contractId !== ALL && inv.contract_id !== contractId) return false
        if (costElement !== ALL && (inv.cost_element ?? '') !== costElement) return false
        if (status !== ALL && inv.status !== status) return false
        return true
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, fy, quarter, vendor, contractId, costElement, status],
  )

  // KPIs
  const kpi = useMemo(() => {
    const total = scoped.reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const approved = scoped
      .filter((i) => i.status === 'Approved' || i.status === 'Submitted')
      .reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const pending = scoped.filter((i) => i.status === 'Pending').reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const budget = contracts.reduce((s, cn) => s + Number(cn.value ?? 0), 0)
    return {
      total,
      count: scoped.length,
      approved,
      pending,
      avg: scoped.length > 0 ? total / scoped.length : 0,
      utilization: budget > 0 ? (total / budget) * 100 : 0,
    }
  }, [scoped, contracts])

  // Quarterly spend across the selected scope, ordered by fiscal year then quarter
  const quarterly = useMemo(() => {
    const map = new Map<string, { invoices: number; spend: number; approved: number; pending: number }>()
    for (const inv of scoped) {
      const fi = fiscalOf(inv.invoice_date)
      if (!fi) continue
      const key = `${fi.fy} ${fi.quarter}`
      const bucket = map.get(key) ?? { invoices: 0, spend: 0, approved: 0, pending: 0 }
      bucket.invoices += 1
      bucket.spend += Number(inv.amount ?? 0)
      if (inv.status === 'Approved' || inv.status === 'Submitted') bucket.approved += Number(inv.amount ?? 0)
      if (inv.status === 'Pending') bucket.pending += Number(inv.amount ?? 0)
      map.set(key, bucket)
    }
    return [...map.entries()]
      .sort((a, b) => {
        const [fyA, qA] = a[0].split(' ')
        const [fyB, qB] = b[0].split(' ')
        if (fyA !== fyB) return fyA.localeCompare(fyB)
        return QUARTERS.indexOf(qA as FiscalQuarter) - QUARTERS.indexOf(qB as FiscalQuarter)
      })
      .map(([label, v]) => ({ label, ...v }))
  }, [scoped])

  // Monthly trend within a single fiscal year (selected FY, or the latest with data)
  const monthly = useMemo(() => {
    const months = new Map<number, number>()
    const effectiveFy = fy !== ALL ? fy : (fyOptions[fyOptions.length - 1] ?? '')
    for (const inv of invoices) {
      const fi = fiscalOf(inv.invoice_date)
      if (!fi || fi.fy !== effectiveFy) continue
      const d = new Date(inv.invoice_date as string)
      const idx = fyMonthIndex(d)
      months.set(idx, (months.get(idx) ?? 0) + Number(inv.amount ?? 0))
    }
    return { fy: effectiveFy, data: FY_MONTHS.map((label, idx) => ({ label, value: months.get(idx) ?? 0 })) }
  }, [invoices, fy, fyOptions])

  // OPEX / CAPEX / Uncategorized split
  const categoryMix = useMemo(() => {
    const mix = { OPEX: 0, CAPEX: 0, Uncategorized: 0 }
    for (const inv of scoped) mix[costCategory(inv.cost_element)] += Number(inv.amount ?? 0)
    return mix
  }, [scoped])

  // Top vendors
  const byVendor = useMemo(() => {
    const map = new Map<string, { count: number; total: number; approved: number }>()
    for (const inv of scoped) {
      const v = vendorOf(inv)
      const bucket = map.get(v) ?? { count: 0, total: 0, approved: 0 }
      bucket.count += 1
      bucket.total += Number(inv.amount ?? 0)
      if (inv.status === 'Approved' || inv.status === 'Submitted') bucket.approved += Number(inv.amount ?? 0)
      map.set(v, bucket)
    }
    return [...map.entries()]
      .map(([name, v]) => ({ vendor: name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [scoped])

  // Budget vs actual per contract (actual = invoiced spend in scope)
  const budgetRows = useMemo(() => {
    const actualByContract = new Map<string, number>()
    for (const inv of scoped) {
      if (!inv.contract_id) continue
      actualByContract.set(inv.contract_id, (actualByContract.get(inv.contract_id) ?? 0) + Number(inv.amount ?? 0))
    }
    return contracts
      .filter((cn) => contractId === ALL || cn.id === contractId)
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
  }, [contracts, scoped, contractId])

  const exportQuarterly = () =>
    downloadCSV(
      'report-quarterly.csv',
      quarterly.map((q) => ({
        fiscal_quarter: q.label,
        invoices: q.invoices,
        spend: Math.round(q.spend),
        approved: Math.round(q.approved),
        pending: Math.round(q.pending),
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

  const selectCls = 'input min-w-[130px] flex-1 sm:flex-none'
  const filterSelect = (value: string, onChange: (v: string) => void, label: string, options: React.ReactNode) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={selectCls}>
      {options}
    </select>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analysis"
        description="Fiscal-year spend analysis with quarterly trends, OPEX/CAPEX split and budget utilization."
        actions={
          <div className="flex gap-2.5">
            <button className="btn btn-ghost" onClick={exportQuarterly}>
              <Download size={15} /> Quarterly CSV
            </button>
            <button className="btn btn-ghost" onClick={exportBudget}>
              <Download size={15} /> Budget CSV
            </button>
          </div>
        }
      />

      <div className="glass flex flex-wrap items-center gap-3 p-4">
        {filterSelect(fy, setFy, 'Fiscal year', (
          <>
            <option value={ALL}>All fiscal years</option>
            {fyOptions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </>
        ))}
        {filterSelect(quarter, setQuarter, 'Quarter', (
          <>
            <option value={ALL}>All quarters</option>
            {QUARTERS.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </>
        ))}
        {filterSelect(vendor, setVendor, 'Vendor', (
          <>
            <option value={ALL}>All vendors</option>
            {vendorOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </>
        ))}
        {filterSelect(contractId, setContractId, 'Contract', (
          <>
            <option value={ALL}>All contracts</option>
            {contracts.map((cn) => (
              <option key={cn.id} value={cn.id}>{cn.contract_no}</option>
            ))}
          </>
        ))}
        {filterSelect(costElement, setCostElement, 'Cost element', (
          <>
            <option value={ALL}>All cost elements</option>
            {costElementOptions.map((ce) => (
              <option key={ce} value={ce}>{ce}</option>
            ))}
          </>
        ))}
        {filterSelect(status, setStatus, 'Status', (
          <>
            <option value={ALL}>All statuses</option>
            {['Pending', 'Approved', 'Rejected', 'Submitted'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </>
        ))}
        <button
          className="btn btn-ghost !px-3"
          onClick={() => {
            setFy(ALL)
            setQuarter(ALL)
            setVendor(ALL)
            setContractId(ALL)
            setCostElement(ALL)
            setStatus(ALL)
          }}
        >
          Reset
        </button>
      </div>

      <SummaryCards
        items={[
          {
            label: 'Total Spend',
            value: `Rs ${formatMoney(kpi.total)}`,
            sub: `${kpi.count} invoice${kpi.count === 1 ? '' : 's'}`,
            tone: 'primary',
          },
          { label: 'Approved Value', value: `Rs ${formatMoney(kpi.approved)}`, sub: 'approved + submitted', tone: 'ok' },
          { label: 'Pending Value', value: `Rs ${formatMoney(kpi.pending)}`, sub: 'awaiting approval', tone: 'warn' },
          { label: 'Avg Invoice', value: `Rs ${formatMoney(kpi.avg)}`, sub: 'in current scope', tone: 'purple' },
          { label: 'Budget Utilization', value: `${formatMoney(kpi.utilization, 1)}%`, sub: 'of total contract value', tone: 'err' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="section-title">Quarterly Spend</div>
          <div className="h-72">
            {quarterly.length > 0 ? (
              <Bar
                data={{
                  labels: quarterly.map((q) => q.label),
                  datasets: [
                    { label: 'Spend (Rs)', data: quarterly.map((q) => q.spend), backgroundColor: c.accent + 'B3', borderRadius: 6 },
                    { label: 'Approved (Rs)', data: quarterly.map((q) => q.approved), backgroundColor: c.accent3 + '99', borderRadius: 6 },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom', labels: { color: c.ticks, boxWidth: 10 } } },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: c.ticks } },
                    y: { grid: { color: c.grid }, ticks: { color: c.ticks } },
                  },
                }}
              />
            ) : (
              <EmptyState title="No spend in scope" description="Adjust the filters to see quarterly data." />
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="section-title">Monthly Trend · {monthly.fy}</div>
          <div className="h-72">
            <Line
              data={{
                labels: monthly.data.map((m) => m.label),
                datasets: [
                  {
                    label: 'Spend (Rs)',
                    data: monthly.data.map((m) => m.value),
                    borderColor: c.accent,
                    backgroundColor: c.accent + '33',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
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

        <GlassCard className="p-5">
          <div className="section-title">OPEX vs CAPEX</div>
          <div className="h-72">
            <Doughnut
              data={{
                labels: ['OPEX', 'CAPEX', 'Uncategorized'],
                datasets: [
                  {
                    data: [categoryMix.OPEX, categoryMix.CAPEX, categoryMix.Uncategorized],
                    backgroundColor: [c.accent, c.warn, c.grid],
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
          <p className="mt-2 text-center text-[0.65rem] text-[var(--text-dim)]">
            Classified by cost element code (SUR / THL / SM → OPEX)
          </p>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="section-title">Top Vendors by Value</div>
          <div className="h-72">
            {byVendor.length > 0 ? (
              <Bar
                data={{
                  labels: byVendor.map((v) => v.vendor),
                  datasets: [
                    { label: 'Total (Rs)', data: byVendor.map((v) => v.total), backgroundColor: c.accent2 + 'B3', borderRadius: 6 },
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
            ) : (
              <EmptyState title="No vendor data" description="Adjust the filters to see vendor rankings." />
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="px-5 pt-5">
          <div className="section-title !mb-0">Budget vs Actual · {budgetRows.length} contracts</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Vendor</th>
                <th className="text-right">Budget</th>
                <th className="text-right">Actual (in scope)</th>
                <th className="text-right">Remaining</th>
                <th>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {budgetRows.map((b) => (
                <tr key={b.id}>
                  <td className="font-semibold">{b.contract_no}</td>
                  <td className="text-xs">{b.vendor}</td>
                  <td className="text-right">{formatMoney(b.budget)}</td>
                  <td className="text-right font-semibold">{formatMoney(b.actual)}</td>
                  <td className={`text-right ${b.remaining < 0 ? 'font-semibold text-[var(--danger)]' : ''}`}>
                    {formatMoney(b.remaining)}
                  </td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="util-bar min-w-24 max-w-40 flex-1" style={{ background: 'var(--surface)' }}>
                        <span
                          style={{
                            width: `${Math.min(100, Math.max(0, b.utilization))}%`,
                            background: b.utilization > 90 ? 'var(--danger)' : b.utilization > 70 ? 'var(--warn)' : 'var(--accent-3)',
                          }}
                        />
                      </span>
                      <span className="text-xs text-[var(--text-dim)]">{formatMoney(b.utilization, 1)}%</span>
                    </span>
                  </td>
                </tr>
              ))}
              {budgetRows.length > 0 && (
                <tr className="grand-total-row">
                  <td colSpan={2}>
                    <span className="font-bold uppercase tracking-wider">Total</span>
                  </td>
                  <td className="text-right font-bold">{formatMoney(budgetRows.reduce((s, b) => s + b.budget, 0))}</td>
                  <td className="text-right font-bold">{formatMoney(budgetRows.reduce((s, b) => s + b.actual, 0))}</td>
                  <td className="text-right font-bold">
                    {formatMoney(budgetRows.reduce((s, b) => s + b.remaining, 0))}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {budgetRows.length === 0 && (
          <EmptyState title="No contracts" description="Budget comparison appears once contracts exist." />
        )}
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="px-5 pt-5">
          <div className="section-title !mb-0">Quarterly Breakdown</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fiscal Quarter</th>
                <th className="text-right">Invoices</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Approved</th>
                <th className="text-right">Pending</th>
                <th className="text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {quarterly.map((q) => (
                <tr key={q.label}>
                  <td className="font-semibold">{q.label}</td>
                  <td className="text-right">{q.invoices}</td>
                  <td className="text-right font-semibold">{formatMoney(q.spend)}</td>
                  <td className="text-right">{formatMoney(q.approved)}</td>
                  <td className="text-right">{formatMoney(q.pending)}</td>
                  <td className="text-right text-xs text-[var(--text-dim)]">
                    {kpi.total > 0 ? `${formatMoney((q.spend / kpi.total) * 100, 1)}%` : '—'}
                  </td>
                </tr>
              ))}
              {quarterly.length > 0 && (
                <tr className="grand-total-row">
                  <td>
                    <span className="font-bold uppercase tracking-wider">Total</span>
                  </td>
                  <td className="text-right font-bold">{kpi.count}</td>
                  <td className="text-right font-bold">{formatMoney(kpi.total)}</td>
                  <td className="text-right font-bold">{formatMoney(kpi.approved)}</td>
                  <td className="text-right font-bold">{formatMoney(kpi.pending)}</td>
                  <td className="text-right text-xs">100%</td>
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
  )
}
