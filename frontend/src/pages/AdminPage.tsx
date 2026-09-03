import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import {
  Save, Plus, Trash2, Pencil, ShieldCheck, Building2, Mail,
  Users as UsersIcon, Layers, Hash, Wallet, AlertTriangle, Search,
  Bell, ShieldAlert, Workflow, CheckCircle2, CalendarRange,
  Lock, KeyRound,
} from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { formatMoney } from '../lib/format'
import { currentFiscalYear, fiscalOf, fiscalShortRange, isClosedFiscalYear, nearbyFiscalYears, shiftFiscalYear } from '../lib/fiscal'
import { useToast } from '../components/ui/Toast'
import { emitCrossModule, useLiveDomain } from '../lib/store'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Tabs, { useTab } from '../components/ui/Tabs'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { Field } from '../components/ui/Field'
import EmptyState from '../components/ui/EmptyState'
import Toggle from '../components/ui/Toggle'
import SummaryCards from '../components/ui/SummaryCards'
import { useFyLock } from '../lib/FyLockProvider'
import { poReleasedAmount } from '../lib/paymentOrder'

interface Setting { key: string; value: string }
interface Vendor { id: string; name: string; email: string | null }
interface ServiceMatrix {
  id: string
  t1: string
  t2: string | null
  t3: string | null
  cost_element: string | null
  tanker_required: boolean
  trips: boolean
}
interface CostElement { code: string; name: string | null }
interface BudgetLine { id: string; fy: string; cost_element: string; amount: number; notes: string }
interface AdminPo {
  id: string
  invoice_id?: string | null
  status: string | null
  amount?: number | null
  released_amount?: number | null
  invoices?: { cost_element?: string | null; invoice_date?: string | null } | null
}

interface DraftLine {
  id: string
  cost_element: string
  amount: string
  notes: string
}

const COMPANY_KEYS = ['cost_center', 'maximum_invoice_amount', 'expiring_threshold_days'] as const
const RULE_KEYS = ['duplicate_check', 'future_date_allowed', 'enable_audit'] as const
const MAIL_KEYS = ['followup_template', 'discrepancy_template'] as const

const SETTING_META: Record<string, { label: string; hint?: string; rows?: number }> = {
  cost_center: { label: 'Default cost center' },
  maximum_invoice_amount: { label: 'Maximum invoice amount (Rs)', hint: 'Invoices above this value fail validation on import' },
  expiring_threshold_days: { label: 'Contract expiring warning (days)' },
  duplicate_check: { label: 'Block duplicate invoice numbers' },
  future_date_allowed: { label: 'Allow future invoice dates' },
  enable_audit: { label: 'Write an audit trail' },
  followup_template: {
    label: 'Follow-up email template',
    hint: 'Tokens: {{vendorName}}, {{contractNo}}, {{invoiceNo}}, {{invoiceDate}}, {{amount}}, {{invoiceList}}',
    rows: 10,
  },
  discrepancy_template: {
    label: 'Discrepancy email template',
    hint: 'Tokens: {{vendorName}}, {{baseFileName}}, {{compareFileName}}, {{keyValue}}, {{discrepancyList}}',
    rows: 10,
  },
}

const SETTING_DEFAULTS: Record<string, string> = {
  cost_center: '',
  maximum_invoice_amount: '0',
  expiring_threshold_days: '60',
  duplicate_check: 'true',
  future_date_allowed: 'false',
  enable_audit: 'true',
  followup_template: '',
  discrepancy_template: '',
}

function mergeSettings(loaded: Setting[]): Setting[] {
  const map = new Map(loaded.map((s) => [s.key, s.value]))
  const known: string[] = [...COMPANY_KEYS, ...RULE_KEYS, ...MAIL_KEYS]
  const out: Setting[] = known.map((key) => ({ key, value: map.get(key) ?? SETTING_DEFAULTS[key] ?? '' }))
  for (const s of loaded) {
    if (s.key === 'yearly_budgets') continue
    if (s.key === 'financial_year') continue
    if (!known.includes(s.key)) out.push(s)
  }
  return out
}

function newDraftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function AdminPage() {
  const [tab, setTab] = useTab('overview')
  const [settings, setSettings] = useState<Setting[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [matrix, setMatrix] = useState<ServiceMatrix[]>([])
  const [costs, setCosts] = useState<CostElement[]>([])
  const [budgets, setBudgets] = useState<BudgetLine[]>([])
  const [paymentOrders, setPaymentOrders] = useState<AdminPo[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const [, liveVersion] = useLiveDomain(['invoices', 'contracts', 'vendors', 'budgets', 'settings', 'paymentOrders'])
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVersion])

  const load = useCallback(async () => {
    try {
      const [s, v, m, c, b, po] = await Promise.all([
        apiGet<{ settings: Setting[] }>('/api/settings'),
        apiGet<{ vendors: Vendor[] }>('/api/vendors'),
        apiGet<{ serviceMatrix: ServiceMatrix[] }>('/api/service-matrix'),
        apiGet<{ costElements: CostElement[] }>('/api/cost-elements'),
        apiGet<{ budgets: BudgetLine[] }>('/api/budgets'),
        apiGet<{ paymentOrders: AdminPo[] }>('/api/payment-orders'),
      ])
      setSettings(mergeSettings(s.settings))
      setVendors(v.vendors)
      setMatrix(m.serviceMatrix)
      setCosts(c.costElements)
      setBudgets(b.budgets)
      setPaymentOrders(po.paymentOrders)
    } catch (e) {
      toast.error('Failed to load administration data', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const fyNow = currentFiscalYear()
  const missingEmails = vendors.filter((v) => !v.email).length
  const fyBudget = budgets.filter((b) => b.fy === fyNow)
  const fyBudgetTotal = fyBudget.reduce((s, b) => s + b.amount, 0)
  const fyActual = paymentOrders.reduce((s, p) => {
    const date = p.invoices?.invoice_date
    if (fiscalOf(date)?.fy !== fyNow) return s
    return s + poReleasedAmount(p)
  }, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Administration"
        description="Master data, yearly budgets and rules. The running fiscal year follows the calendar — Jul 2026 starts FY26."
        actions={
          <span className="badge badge-purple">
            <ShieldCheck size={13} /> Admin only
          </span>
        }
      />

       <Tabs
         tabs={[
           { id: 'overview', label: 'Overview' },
           { id: 'budgets', label: 'Yearly budgets' },
           { id: 'vendors', label: 'Vendors' },
           { id: 'catalog', label: 'Service catalog' },
           { id: 'costs', label: 'Cost elements' },
           { id: 'workflow', label: 'Workflow & approvals' },
           { id: 'alerts', label: 'Alerts & notifications' },
           { id: 'settings', label: 'Company rules' },
           { id: 'mail', label: 'Mail templates' },
         ]}
         active={tab}
         onChange={setTab}
       />

       {tab === 'overview' && (
        <OverviewPanel
          loading={loading}
          vendorCount={vendors.length}
          missingEmails={missingEmails}
          matrixCount={matrix.length}
          costCount={costs.length}
          fy={fyNow}
          budgetTotal={fyBudgetTotal}
          actual={fyActual}
          onOpen={(id) => setTab(id)}
        />
      )}
      {tab === 'budgets' && (
        <BudgetPanel costs={costs} paymentOrders={paymentOrders} saved={budgets} onSaved={setBudgets} />
      )}
      {tab === 'vendors' && <VendorPanel vendors={vendors} onReload={load} />}
      {tab === 'catalog' && <CatalogPanel matrix={matrix} costs={costs} onReload={load} />}
      {tab === 'costs' && <CostPanel costs={costs} onReload={load} />}
      {tab === 'workflow' && <WorkflowPanel settings={settings} setSettings={setSettings} />}
      {tab === 'alerts' && <AlertsPanel settings={settings} setSettings={setSettings} paymentOrders={paymentOrders} budgets={budgets} fy={fyNow} />}
      {tab === 'settings' && (
        <>
          <FyLockCard />
          <SettingsPanel settings={settings} setSettings={setSettings} keys={[...COMPANY_KEYS, ...RULE_KEYS]} />
        </>
      )}
      {tab === 'mail' && <SettingsPanel settings={settings} setSettings={setSettings} keys={[...MAIL_KEYS]} mail />}
    </div>
  )
}

function OverviewPanel({
  loading, vendorCount, missingEmails, matrixCount, costCount, fy, budgetTotal, actual, onOpen,
}: {
  loading: boolean
  vendorCount: number
  missingEmails: number
  matrixCount: number
  costCount: number
  fy: string
  budgetTotal: number
  actual: number
  onOpen: (id: string) => void
}) {
  const util = budgetTotal > 0 ? (actual / budgetTotal) * 100 : 0
  return (
    <>
      <GlassCard className="flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]">
          <CalendarRange size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Running fiscal year</div>
          <div className="text-2xl font-black tracking-tight">{fy} <span className="text-sm font-semibold text-[var(--text-dim)]">{fiscalShortRange(fy)}</span></div>
          <p className="mt-0.5 text-xs text-[var(--text-dim)]">Set by today's date. Pakistan FY runs 1 July - 30 June, labelled by the starting year (2026-27 = FY26).</p>
        </div>
        <span className="badge badge-info">Auto</span>
      </GlassCard>
      <SummaryCards
        items={[
          { label: `${fy} budget`, value: `Rs ${formatMoney(budgetTotal)}`, sub: budgetTotal === 0 ? 'Not entered yet' : `${util.toFixed(0)}% used`, icon: <Wallet size={16} />, tone: budgetTotal === 0 ? 'warn' : 'primary' },
          { label: 'Vendors', value: String(vendorCount), sub: missingEmails > 0 ? `${missingEmails} without email` : 'All have email', icon: <Building2 size={16} />, tone: missingEmails > 0 ? 'warn' : 'ok' },
          { label: 'Service rows', value: String(matrixCount), sub: 'T1 / T2 / T3 catalog', icon: <Layers size={16} />, tone: 'purple' },
          { label: 'Cost elements', value: String(costCount), sub: 'Codes used on invoices', icon: <Hash size={16} />, tone: 'ok' },
        ]}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <GlassCard className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Needs attention</div>
          <ul className="mt-3 space-y-2 text-sm">
            {budgetTotal === 0 && (
              <li>
                <button type="button" className="flex items-start gap-2 text-left text-[var(--warn)] hover:underline" onClick={() => onOpen('budgets')}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Enter {fy} budget amounts so Reports can track burn.
                </button>
              </li>
            )}
            {missingEmails > 0 && (
              <li>
                <button type="button" className="flex items-start gap-2 text-left hover:underline" onClick={() => onOpen('vendors')}>
                  <Mail size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" /> {missingEmails} vendor{missingEmails === 1 ? '' : 's'} missing a surveyor email.
                </button>
              </li>
            )}
            {matrixCount === 0 && (
              <li>
                <button type="button" className="flex items-start gap-2 text-left hover:underline" onClick={() => onOpen('catalog')}>
                  <Layers size={14} className="mt-0.5 shrink-0" /> Service catalog is empty.
                </button>
              </li>
            )}
            {budgetTotal > 0 && missingEmails === 0 && matrixCount > 0 && (
              <li className="text-[var(--text-dim)]">Master data looks complete for {fy}.</li>
            )}
          </ul>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">People</div>
          <p className="mt-3 text-sm text-[var(--text-dim)]">Users, roles and permissions stay on their own page.</p>
          <Link to="/users" className="btn btn-ghost mt-4 inline-flex">
            <UsersIcon size={15} /> Users & Roles
          </Link>
        </GlassCard>
      </div>
      {loading && <p className="text-xs text-[var(--text-muted)]">Loading administration data…</p>}
    </>
  )
}

function BudgetPanel({
  costs, paymentOrders, saved, onSaved,
}: {
  costs: CostElement[]
  paymentOrders: AdminPo[]
  saved: BudgetLine[]
  onSaved: (rows: BudgetLine[]) => void
}) {
  const [fy, setFy] = useState(currentFiscalYear())
  const [extraYears, setExtraYears] = useState<string[]>([])
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const { guardFy } = useFyLock()
  const running = currentFiscalYear()
  const years = useMemo(() => {
    const set = new Set<string>([...nearbyFiscalYears(), ...saved.map((b) => b.fy), ...extraYears])
    return [...set].sort()
  }, [saved, extraYears])

  useEffect(() => {
    const existing = saved.filter((b) => b.fy === fy)
    if (existing.length > 0) {
      setDraft(existing.map((b) => ({ id: b.id, cost_element: b.cost_element, amount: String(b.amount), notes: b.notes })))
      return
    }
    setDraft(costs.map((c) => ({ id: newDraftId(), cost_element: c.code, amount: '', notes: '' })))
  }, [fy, saved, costs])

  const actuals = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of paymentOrders) {
      if (fiscalOf(p.invoices?.invoice_date)?.fy !== fy) continue
      const code = p.invoices?.cost_element || ''
      if (!code) continue
      map.set(code, (map.get(code) ?? 0) + poReleasedAmount(p))
    }
    return map
  }, [paymentOrders, fy])

  const totalBudget = draft.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const totalActual = [...actuals.values()].reduce((s, n) => s + n, 0)

  const save = async () => {
    const lines = draft
      .filter((d) => d.cost_element.trim())
      .map((d) => ({
        id: d.id,
        cost_element: d.cost_element.trim(),
        amount: Math.max(0, Number(d.amount) || 0),
        notes: d.notes.trim(),
      }))
    if (lines.length === 0) {
      toast.error('Add at least one cost element')
      return
    }
    if (!(await guardFy(fy))) return
    setSaving(true)
    try {
      const res = await apiPut<{ budgets: BudgetLine[] }>('/api/budgets', { fy, lines })
      const others = saved.filter((b) => b.fy !== fy)
       onSaved([...others, ...res.budgets])
       toast.success(`${fy} budget saved`)
       emitCrossModule('budget', 'update', fy)
     } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const setLine = (id: string, patch: Partial<DraftLine>) => {
    setDraft((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Fiscal year</div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Select fiscal year">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className={`chip ${fy === y ? 'active' : ''}`}
                onClick={() => setFy(y)}
                aria-pressed={fy === y}
              >
                {isClosedFiscalYear(y) ? <Lock size={11} /> : null}
                {y}{y === running ? ' · now' : ''}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={() => {
                const next = shiftFiscalYear(years[years.length - 1] ?? running, 1)
                setExtraYears((prev) => (prev.includes(next) ? prev : [...prev, next]))
                setFy(next)
              }}
            >
              <Plus size={12} /> Add FY
            </button>
          </div>
          <div className="mt-1.5 text-xs text-[var(--text-dim)]">{fy} covers {fiscalShortRange(fy)}. Running year is {running} and cannot be switched here.</div>
        </div>
        <div className="text-right text-sm">
          <div className="font-bold tabular-nums">Rs {formatMoney(totalBudget)}</div>
          <div className="text-xs text-[var(--text-muted)]">Released Rs {formatMoney(totalActual)}</div>
        </div>
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>
          <Save size={14} /> {saving ? 'Saving…' : `Save ${fy}`}
        </Button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cost element</th>
              <th className="text-right">Budget (Rs)</th>
              <th className="text-right">Released</th>
              <th className="text-right">Remaining</th>
              <th>Notes</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {draft.map((d) => {
              const budget = Number(d.amount) || 0
              const actual = actuals.get(d.cost_element) ?? 0
              const remaining = budget - actual
              const over = budget > 0 && actual > budget
              return (
                <tr key={d.id}>
                  <td>
                    <select className="input min-w-[10rem]" value={d.cost_element} onChange={(e) => setLine(d.id, { cost_element: e.target.value })}>
                      <option value="">Select…</option>
                      {costs.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name ?? 'unnamed'}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input text-right tabular-nums"
                      inputMode="numeric"
                      value={d.amount}
                      onChange={(e) => setLine(d.id, { amount: e.target.value })}
                      placeholder="0"
                    />
                  </td>
                  <td className="text-right tabular-nums">Rs {formatMoney(actual)}</td>
                  <td className={`text-right tabular-nums ${over ? 'font-bold text-[var(--danger)]' : ''}`}>
                    Rs {formatMoney(remaining)}
                  </td>
                  <td>
                    <input className="input" value={d.notes} onChange={(e) => setLine(d.id, { notes: e.target.value })} placeholder="Optional" />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem' }} aria-label="Remove line" onClick={() => setDraft((prev) => prev.filter((x) => x.id !== d.id))}>
                      <Trash2 size={14} className="text-[var(--danger)]" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {draft.length === 0 && (
        <EmptyState title={`No ${fy} lines yet`} description="Add a cost element or save after cost elements exist." />
      )}
      <div className="border-t border-[var(--border)] px-5 py-3">
        <Button size="sm" variant="ghost" onClick={() => setDraft((prev) => [...prev, { id: newDraftId(), cost_element: '', amount: '', notes: '' }])}>
          <Plus size={14} /> Add line
        </Button>
      </div>
    </GlassCard>
  )
}

function VendorPanel({ vendors, onReload }: { vendors: Vendor[]; onReload: () => void }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()
  const filtered = vendors.filter((v) => `${v.name} ${v.email ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  const remove = async (v: Vendor) => {
    if (!window.confirm(`Delete vendor ${v.name}?`)) return
    try {
      await apiDelete(`/api/vendors/${v.id}`)
      toast.success('Vendor deleted')
      onReload()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors…" />
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> Add vendor</Button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Email</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id}>
                <td className="font-semibold">{v.name}</td>
                <td className={v.email ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}>{v.email ?? 'No email'}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem' }} aria-label={`Edit ${v.name}`} onClick={() => setEditing(v)}><Pencil size={14} /></button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem' }} aria-label={`Delete ${v.name}`} onClick={() => remove(v)}><Trash2 size={14} className="text-[var(--danger)]" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <EmptyState title="No vendors" description="Add a surveyor company to start." />}
      {(creating || editing) && (
        <VendorForm
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); onReload() }}
        />
      )}
    </GlassCard>
  )
}

function CatalogPanel({ matrix, costs, onReload }: { matrix: ServiceMatrix[]; costs: CostElement[]; onReload: () => void }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ServiceMatrix | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()
  const filtered = matrix.filter((m) => `${m.t1} ${m.t2 ?? ''} ${m.t3 ?? ''} ${m.cost_element ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  const remove = async (row: ServiceMatrix) => {
    if (!window.confirm('Delete this service catalog row?')) return
    try {
      await apiDelete(`/api/service-matrix/${row.id}`)
      toast.success('Row deleted')
      onReload()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search T1 / T2 / T3…" />
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> Add row</Button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>T1</th>
              <th>T2</th>
              <th>T3</th>
              <th>Cost element</th>
              <th>Tanker</th>
              <th>Trips</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td className="font-semibold">{m.t1}</td>
                <td>{m.t2 ?? '—'}</td>
                <td>{m.t3 ?? '—'}</td>
                <td className="text-xs">{m.cost_element ?? '—'}</td>
                <td>{m.tanker_required ? 'Yes' : 'No'}</td>
                <td>{m.trips ? 'Yes' : 'No'}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem' }} aria-label="Edit row" onClick={() => setEditing(m)}><Pencil size={14} /></button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem' }} aria-label="Delete row" onClick={() => remove(m)}><Trash2 size={14} className="text-[var(--danger)]" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <EmptyState title="No catalog rows" />}
      {(creating || editing) && (
        <ServiceForm
          initial={editing}
          costs={costs}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); onReload() }}
        />
      )}
    </GlassCard>
  )
}

function CostPanel({ costs, onReload }: { costs: CostElement[]; onReload: () => void }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CostElement | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()
  const filtered = costs.filter((c) => `${c.code} ${c.name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  const remove = async (c: CostElement) => {
    if (!window.confirm(`Delete cost element ${c.code}?`)) return
    try {
      await apiDelete(`/api/cost-elements/${encodeURIComponent(c.code)}`)
      toast.success('Cost element deleted')
      onReload()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search codes…" />
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> Add element</Button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.code}>
                <td className="font-semibold">{c.code}</td>
                <td>{c.name ?? '—'}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem' }} aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)}><Pencil size={14} /></button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem' }} aria-label={`Delete ${c.code}`} onClick={() => remove(c)}><Trash2 size={14} className="text-[var(--danger)]" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <EmptyState title="No cost elements" />}
      {(creating || editing) && (
        <CostForm
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); onReload() }}
        />
      )}
    </GlassCard>
  )
}

function WorkflowPanel({ settings, setSettings }: { settings: Setting[]; setSettings: Dispatch<SetStateAction<Setting[]>> }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const keys = ['auto_approve_limit', 'require_second_approval', 'approval_sla_hours', 'po_auto_generate', 'notify_on_submit']
  const meta: Record<string, { label: string; hint: string; numeric?: boolean; toggle?: boolean }> = {
    auto_approve_limit: { label: 'Auto-approve below (Rs)', hint: 'Invoices under this amount skip manual approval', numeric: true },
    require_second_approval: { label: 'Require second approval above limit', hint: 'High-value invoices need two sign-offs', toggle: true },
    approval_sla_hours: { label: 'Approval SLA (hours)', hint: 'Target turnaround before an invoice is flagged overdue', numeric: true },
    po_auto_generate: { label: 'Auto-generate payment order on approval', hint: 'Create a PO the moment an invoice is approved', toggle: true },
    notify_on_submit: { label: 'Notify approvers on submit', hint: 'Push a notification when an invoice enters the queue', toggle: true },
  }
  const defaults: Record<string, string> = {
    auto_approve_limit: '50000',
    require_second_approval: 'true',
    approval_sla_hours: '48',
    po_auto_generate: 'true',
    notify_on_submit: 'true',
  }
  const merged = useMemo(() => {
    const map = new Map(settings.map((s) => [s.key, s.value]))
    return keys.map((k) => ({ key: k, value: map.get(k) ?? defaults[k] }))
  }, [settings])

  const setSetting = (key: string, value: string) =>
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))

  const save = async () => {
    setSaving(true)
    try {
      await apiPut('/api/settings', { settings: merged })
      toast.success('Workflow configuration saved')
      emitCrossModule('setting', 'update')
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold">
        <Workflow size={16} className="text-[var(--accent)]" /> Approval workflow
      </div>
      <div className="space-y-4">
        {merged.map((s) => {
          const m = meta[s.key]
          if (m.toggle) {
            return (
              <div key={s.key} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{m.label}</div>
                  <div className="text-xs text-[var(--text-muted)]">{m.hint}</div>
                </div>
                <Toggle checked={s.value === 'true'} onChange={(v) => setSetting(s.key, v ? 'true' : 'false')} />
              </div>
            )
          }
          return (
            <Field key={s.key} label={m.label} hint={m.hint}>
              <input className="input" inputMode="numeric" value={s.value} onChange={(e) => setSetting(s.key, e.target.value)} />
            </Field>
          )
        })}
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? 'Saving…' : 'Save workflow'}
        </Button>
      </div>
    </GlassCard>
  )
}

function AlertsPanel({
  settings, setSettings, paymentOrders, budgets, fy,
}: {
  settings: Setting[]
  setSettings: Dispatch<SetStateAction<Setting[]>>
  paymentOrders: AdminPo[]
  budgets: BudgetLine[]
  fy: string
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const keys = ['alert_budget_breach', 'alert_pending_aging', 'alert_contract_expiry', 'alert_threshold_pct', 'digest_email']
  const meta: Record<string, { label: string; hint: string; numeric?: boolean; toggle?: boolean }> = {
    alert_budget_breach: { label: 'Budget breach alerts', hint: 'Warn when a cost element passes its budget', toggle: true },
    alert_pending_aging: { label: 'Pending invoice aging alerts', hint: 'Flag invoices stuck in the queue', toggle: true },
    alert_contract_expiry: { label: 'Contract expiry alerts', hint: 'Notify before a contract lapses', toggle: true },
    alert_threshold_pct: { label: 'Alert threshold (%)', hint: 'Utilization level that triggers a warning', numeric: true },
    digest_email: { label: 'Weekly digest email', hint: 'Send a finance summary every Monday', toggle: true },
  }
  const defaults: Record<string, string> = {
    alert_budget_breach: 'true',
    alert_pending_aging: 'true',
    alert_contract_expiry: 'true',
    alert_threshold_pct: '90',
    digest_email: 'true',
  }
  const merged = useMemo(() => {
    const map = new Map(settings.map((s) => [s.key, s.value]))
    return keys.map((k) => ({ key: k, value: map.get(k) ?? defaults[k] }))
  }, [settings])

  const setSetting = (key: string, value: string) =>
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))

  const save = async () => {
    setSaving(true)
    try {
      await apiPut('/api/settings', { settings: merged })
      toast.success('Alert rules saved')
      emitCrossModule('setting', 'update')
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const fyBudget = budgets.filter((b) => b.fy === fy)
  const totalBudget = fyBudget.reduce((s, b) => s + b.amount, 0)
  const fyActual = paymentOrders.reduce((s, p) => {
    if (fiscalOf(p.invoices?.invoice_date)?.fy !== fy) return s
    return s + poReleasedAmount(p)
  }, 0)
  const util = totalBudget > 0 ? (fyActual / totalBudget) * 100 : 0
  const threshold = Number(merged.find((m) => m.key === 'alert_threshold_pct')?.value ?? '90')
  const breach = util >= threshold

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Bell size={16} className="text-[var(--accent)]" /> Notification rules
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {merged.map((s) => {
            const m = meta[s.key]
            return (
              <div key={s.key} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{m.label}</div>
                  <div className="text-xs text-[var(--text-muted)]">{m.hint}</div>
                </div>
                {m.numeric ? (
                  <input
                    className="input w-20 text-right tabular-nums"
                    inputMode="numeric"
                    value={s.value}
                    onChange={(e) => setSetting(s.key, e.target.value)}
                  />
                ) : (
                  <Toggle checked={s.value === 'true'} onChange={(v) => setSetting(s.key, v ? 'true' : 'false')} />
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save alerts'}
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Live alert preview</div>
        {breach ? (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] p-3 text-sm text-[var(--danger)]">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            {fy} utilization is at {util.toFixed(0)}% — above the {threshold}% threshold. Budget breach alert would fire.
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--accent-3)] bg-[color-mix(in_srgb,var(--accent-3)_12%,transparent)] p-3 text-sm text-[var(--accent-3)]">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            {fy} utilization is at {util.toFixed(0)}% — within the {threshold}% threshold.
          </div>
        )}
      </GlassCard>
    </div>
  )
}

function SettingsPanel({
  settings, setSettings, keys, mail = false,
}: {
  settings: Setting[]
  setSettings: Dispatch<SetStateAction<Setting[]>>
  keys: string[]
  mail?: boolean
}) {
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const visible = mail ? settings.filter((s) => keys.includes(s.key)) : [
    ...settings.filter((s) => keys.includes(s.key)),
    ...settings.filter((s) => !COMPANY_KEYS.includes(s.key as typeof COMPANY_KEYS[number]) && !RULE_KEYS.includes(s.key as typeof RULE_KEYS[number]) && !MAIL_KEYS.includes(s.key as typeof MAIL_KEYS[number]) && s.key !== 'yearly_budgets' && s.key !== 'financial_year'),
  ]

  const setSetting = (key: string, value: string) =>
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))

  const save = async () => {
    setSaving(true)
    try {
      await apiPut('/api/settings', { settings: visible })
      toast.success(mail ? 'Templates saved' : 'Rules saved')
      emitCrossModule('setting', 'update')
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="space-y-5">
        {visible.map((s) => {
          const meta = SETTING_META[s.key] ?? { label: s.key }
          if (RULE_KEYS.includes(s.key as typeof RULE_KEYS[number])) {
            return (
              <div key={s.key} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{meta.label}</div>
                  {meta.hint && <div className="text-xs text-[var(--text-muted)]">{meta.hint}</div>}
                </div>
                <Toggle checked={s.value === 'true'} onChange={(v) => setSetting(s.key, v ? 'true' : 'false')} />
              </div>
            )
          }
          const numeric = s.key === 'maximum_invoice_amount' || s.key === 'expiring_threshold_days'
          return (
            <Field key={s.key} label={meta.label} hint={meta.hint}>
              {mail || meta.rows ? (
                <textarea className="input min-h-16 font-mono text-xs" rows={meta.rows ?? 3} value={s.value} onChange={(e) => setSetting(s.key, e.target.value)} />
              ) : (
                <input className="input" inputMode={numeric ? 'numeric' : undefined} value={s.value} onChange={(e) => setSetting(s.key, e.target.value)} />
              )}
            </Field>
          )
        })}
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </GlassCard>
  )
}

function VendorForm({ initial, onClose, onSaved }: { initial: Vendor | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Vendor name is required')
      return
    }
    setSaving(true)
    try {
      if (initial) await apiPut(`/api/vendors/${initial.id}`, { name: name.trim(), email: email.trim() || null })
      else await apiPost('/api/vendors', { name: name.trim(), email: email.trim() || null })
       toast.success(initial ? 'Vendor updated' : 'Vendor added')
       onSaved()
       emitCrossModule('vendor', initial ? 'update' : 'create', initial?.id)
     } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit vendor' : 'Add vendor'} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </>
    }>
      <div className="grid grid-cols-1 gap-4">
        <Field label="Name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Surveyor email"><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="surveyor@vendor.com" /></Field>
      </div>
    </Modal>
  )
}

function FyLockCard() {
  const { status, unlocked, relock, refreshStatus } = useFyLock()
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const running = currentFiscalYear()

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const save = async () => {
    if (password.trim().length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/fy-lock/password', {
        password: password.trim(),
        currentPassword: status.passwordSet ? currentPassword : undefined,
      })
      setPassword('')
      setCurrentPassword('')
      toast.success(status.passwordSet ? 'Unlock password updated' : 'Unlock password set')
      await refreshStatus()
    } catch (e) {
      toast.error('Could not save password', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]">
          <Lock size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Closed fiscal years</div>
          <p className="mt-1 text-sm text-[var(--text-dim)]">
            After a year closes, invoices, contracts, approvals, payment orders and budgets for that year lock.
            Editing or deleting them requires this password. Running year is {running}.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={status.passwordSet ? 'badge badge-ok' : 'badge badge-warn'}>
              {status.passwordSet ? 'Password set' : 'No password yet'}
            </span>
            {unlocked && (
              <span className="badge badge-purple">Session unlocked</span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {status.passwordSet && (
              <Field label="Current password">
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </Field>
            )}
            <Field label={status.passwordSet ? 'New password' : 'Set unlock password'} hint="Minimum 8 characters. Stored as a PBKDF2 hash.">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {unlocked && (
              <Button variant="ghost" onClick={() => void relock()}>
                Relock session
              </Button>
            )}
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              <KeyRound size={15} /> {saving ? 'Saving…' : status.passwordSet ? 'Update password' : 'Set password'}
            </Button>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}

function ServiceForm({ initial, costs, onClose, onSaved }: { initial: ServiceMatrix | null; costs: CostElement[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    t1: initial?.t1 ?? '',
    t2: initial?.t2 ?? '',
    t3: initial?.t3 ?? '',
    cost_element: initial?.cost_element ?? '',
    tanker_required: initial?.tanker_required ?? false,
    trips: initial?.trips ?? false,
  })
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const submit = async () => {
    if (!form.t1.trim()) {
      toast.error('T1 is required')
      return
    }
    setSaving(true)
    const payload = {
      t1: form.t1.trim(),
      t2: form.t2.trim() || null,
      t3: form.t3.trim() || null,
      cost_element: form.cost_element || null,
      tanker_required: form.tanker_required,
      trips: form.trips,
    }
    try {
      if (initial) await apiPut(`/api/service-matrix/${initial.id}`, payload)
      else await apiPost('/api/service-matrix', payload)
       toast.success(initial ? 'Catalog row updated' : 'Catalog row added')
       onSaved()
       emitCrossModule('serviceMatrix', initial ? 'update' : 'create', initial?.id)
     } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit catalog row' : 'Add catalog row'} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </>
    }>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="T1" required><input className="input" value={form.t1} onChange={(e) => setForm({ ...form, t1: e.target.value })} /></Field>
        <Field label="T2"><input className="input" value={form.t2} onChange={(e) => setForm({ ...form, t2: e.target.value })} /></Field>
        <Field label="T3"><input className="input" value={form.t3} onChange={(e) => setForm({ ...form, t3: e.target.value })} /></Field>
        <div className="sm:col-span-3">
          <Field label="Cost element">
            <select className="input" value={form.cost_element} onChange={(e) => setForm({ ...form, cost_element: e.target.value })}>
              <option value="">None</option>
              {costs.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name ?? ''}</option>)}
            </select>
          </Field>
        </div>
        <label className="col-span-3 flex items-center gap-6 text-sm text-[var(--text-dim)]">
          <span className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form.tanker_required} onChange={(e) => setForm({ ...form, tanker_required: e.target.checked })} />
            Tanker required
          </span>
          <span className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form.trips} onChange={(e) => setForm({ ...form, trips: e.target.checked })} />
            Uses trips
          </span>
        </label>
      </div>
    </Modal>
  )
}

function CostForm({ initial, onClose, onSaved }: { initial: CostElement | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const submit = async () => {
    if (!code.trim()) {
      toast.error('Code is required')
      return
    }
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      if (initial) await apiPut(`/api/cost-elements/${encodeURIComponent(initial.code)}`, { name: name.trim() })
      else await apiPost('/api/cost-elements', { code: code.trim(), name: name.trim() })
       toast.success(initial ? 'Cost element updated' : 'Cost element added')
       onSaved()
       emitCrossModule('costElement', initial ? 'update' : 'create', initial?.code)
     } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit cost element' : 'Add cost element'} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </>
    }>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Code" required>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} disabled={!!initial} />
        </Field>
        <Field label="Name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
