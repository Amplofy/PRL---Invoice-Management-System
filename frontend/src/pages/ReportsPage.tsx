import { useEffect, useMemo, useState } from 'react'
import { Download, TrendingUp, TrendingDown, AlertTriangle, BadgeCheck, Wallet, Landmark, Sparkles, CircleDollarSign, Gauge } from 'lucide-react'
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
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import EmptyState from '../components/ui/EmptyState'
import { useThemeColors } from '../lib/themeColors'
import { fiscalOf, fyMonthIndex, FY_MONTHS, QUARTERS, costCategory, type FiscalQuarter } from '../lib/fiscal'
import { downloadCSV } from '../lib/export'
import { useCountUp } from '../lib/useCountUp'

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

const ALL = 'all'

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

  const quarterly = useMemo(() => {
    const map = new Map<string, { invoices: number; spend: number }>()
    for (const inv of scoped) {
      const fi = fiscalOf(inv.invoice_date)
      if (!fi) continue
      const key = `${fi.fy}|${fi.quarter}`
      const bucket = map.get(key) ?? { invoices: 0, spend: 0 }
      bucket.invoices += 1
      bucket.spend += Number(inv.amount ?? 0)
      map.set(key, bucket)
    }
    return [...map.entries()]
      .sort((a, b) => {
        const [fyA, qA] = a[0].split('|')
        const [fyB, qB] = b[0].split('|')
        if (fyA !== fyB) return fyA.localeCompare(fyB)
        return QUARTERS.indexOf(qA as FiscalQuarter) - QUARTERS.indexOf(qB as FiscalQuarter)
      })
      .map(([key, v]) => {
        const [f, q] = key.split('|')
        return { fy: f, quarter: q, label: `${f} ${q}`, ...v }
      })
  }, [scoped])

  const monthly = useMemo(() => {
    const months = new Map<number, number>()
    const effectiveFy = fy !== ALL ? fy : (fyOptions[fyOptions.length - 1] ?? '')
    for (const inv of invoices) {
      const fi = fiscalOf(inv.invoice_date)
      if (!fi || fi.fy !== effectiveFy) continue
      const idx = fyMonthIndex(new Date(inv.invoice_date as string))
      months.set(idx, (months.get(idx) ?? 0) + Number(inv.amount ?? 0))
    }
    return { fy: effectiveFy, data: FY_MONTHS.map((label, idx) => ({ label, value: months.get(idx) ?? 0 })) }
  }, [invoices, fy, fyOptions])

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
      bucket.total += Number(inv.amount ?? 0)
      map.set(v, bucket)
    }
    return [...map.entries()]
      .map(([name, v]) => ({ vendor: name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped])

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

  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = []
    if (quarterly.length > 0) {
      const peak = quarterly.reduce((a, b) => (b.spend > a.spend ? b : a))
      list.push({ tone: 'primary', text: `${peak.label} is the highest-spend quarter at Rs ${formatMoney(peak.spend)}` })
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
      if (prev.spend > 0) {
        const delta = ((last.spend - prev.spend) / prev.spend) * 100
        list.push({
          tone: delta >= 0 ? 'ok' : 'primary',
          text: `${last.label} spend is ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(0)}% vs ${prev.label}`,
        })
      }
    }
    return list.slice(0, 4)
  }, [quarterly, byVendor, budgetRows, kpi])

  const animatedTotal = useCountUp(kpi.total)
  const animatedOpexPct = useCountUp(categoryMix.total > 0 ? (categoryMix.OPEX / categoryMix.total) * 100 : 0, 900)
  const animatedUtil = useCountUp(kpi.utilization, 1200)

  const exportQuarterly = () =>
    downloadCSV(
      'report-quarterly.csv',
      quarterly.map((q) => ({
        fiscal_quarter: q.label,
        invoices: q.invoices,
        spend: Math.round(q.spend),
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

  const maxQuarter = Math.max(1, ...quarterly.map((q) => q.spend))
  const maxMonth = Math.max(1, ...monthly.data.map((m) => m.value))
  const maxVendor = Math.max(1, ...byVendor.map((v) => v.total))
  const mixSegments: Array<{ key: keyof typeof categoryMix; label: string; color: string }> = [
    { key: 'OPEX', label: 'OPEX', color: c.accent },
    { key: 'CAPEX', label: 'CAPEX', color: c.warn },
    { key: 'Uncategorized', label: 'Uncategorized', color: c.grid },
  ]

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
        description="Fiscal-year intelligence: quarterly trends, OPEX/CAPEX mix and budget burn-down."
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

      {/* Filters */}
      <div className="glass flex flex-wrap items-center gap-3 p-4 rise-in" style={{ animationDelay: '40ms' }}>
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

      {/* Hero row: spend pulse + OPEX/CAPEX mix */}
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
                title={`${monthly.fy} ${m.label}: Rs ${formatMoney(m.value)}`}
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

      {/* Auto insights */}
      {insights.length > 0 && (
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="report-card glass p-6 lg:col-span-2 rise-in" style={{ animationDelay: '300ms' }}>
          <div className="mb-5 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <TrendingUp size={13} className="text-[var(--accent)]" /> Quarterly pulse
            </span>
            {quarterly.length > 1 && (
              <span className="text-[0.65rem] text-[var(--text-dim)]">
                {(() => {
                  const last = quarterly[quarterly.length - 1]
                  const prev = quarterly[quarterly.length - 2]
                  if (prev.spend <= 0) return null
                  const delta = ((last.spend - prev.spend) / prev.spend) * 100
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
                    Rs {formatMoney(q.spend)}
                  </span>
                  <div
                    className="report-bar relative w-full max-w-20 rounded-t-xl"
                    style={{
                      height: `${Math.max(6, (q.spend / maxQuarter) * 100)}%`,
                      background: `linear-gradient(to top, color-mix(in srgb, var(--accent) 55%, transparent), var(--accent))`,
                      animationDelay: `${i * 110}ms`,
                    }}
                  >
                    <span className="absolute inset-x-0 top-2 text-center text-[0.6rem] font-bold text-white/85">
                      {q.spend >= maxQuarter * 0.35 ? formatMoney(q.spend / 1000, 0) + 'k' : ''}
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
            Rs {formatMoney(kpi.total)} drawn of Rs {formatMoney(contracts.reduce((s, cn) => s + Number(cn.value ?? 0), 0))} contract value
          </div>
        </div>
      </div>

      {/* Monthly trend + vendor ranking */}
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
                    label: 'Spend (Rs)',
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
                    <b className="shrink-0">Rs {formatMoney(v.total)}</b>
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

      {/* Budget burn-down cards */}
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

      {/* Quarterly breakdown table */}
      <div className="rise-in" style={{ animationDelay: '600ms' }}>
      <GlassCard className="overflow-hidden">
        <div className="px-5 pt-5">
          <div className="section-title !mb-0">Quarterly breakdown</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fiscal Quarter</th>
                <th className="text-right">Invoices</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Share</th>
                <th className="text-right">vs previous</th>
              </tr>
            </thead>
            <tbody>
              {quarterly.map((q, i) => {
                const prev = i > 0 ? quarterly[i - 1] : null
                const delta = prev && prev.spend > 0 ? ((q.spend - prev.spend) / prev.spend) * 100 : null
                return (
                  <tr key={q.label}>
                    <td className="font-semibold">{q.label}</td>
                    <td className="text-right">{q.invoices}</td>
                    <td className="text-right font-semibold">{formatMoney(q.spend)}</td>
                    <td className="text-right text-xs text-[var(--text-dim)]">
                      {kpi.total > 0 ? `${formatMoney((q.spend / kpi.total) * 100, 1)}%` : '—'}
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
    </div>
  )
}
