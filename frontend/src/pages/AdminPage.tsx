import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import {
  Save, Plus, Trash2, Pencil, ShieldCheck, Building2, Mail,
  Users as UsersIcon, Layers, Hash, Wallet, AlertTriangle, Search,
  Bell, ShieldAlert, Workflow, CheckCircle2, CalendarRange,
  Lock, KeyRound, FileText, Eye, RotateCcw, ArrowUp, ArrowDown,
} from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { formatDate, formatMoney } from '../lib/format'
import { currentFiscalYear, fiscalShortRange, invoiceBudgetFy, isClosedFiscalYear, isMiscCostElement, nearbyFiscalYears, shiftFiscalYear, MISC_COST_ELEMENT } from '../lib/fiscal'
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
import { useMasterAccess } from '../lib/masterAccess'
import { isBudgetIncrease } from '../lib/accrual'
import { normalizeLocations } from '../lib/invoice'
import { DEFAULT_PO_CONFIG, PO_PLACEHOLDERS, parsePoTemplate, openPaymentOrderPrint, samplePoPrint, type PoTemplateConfig } from '../lib/poBlueprint'

interface Setting { key: string; value: string }
interface VendorEmail {
  id?: string
  email: string
  label?: string
  is_primary?: boolean
}
interface Vendor { id: string; name: string; email: string | null; emails?: VendorEmail[] }

const EMAIL_LABELS = ['surveyor', 'billing', 'ops', 'other'] as const

function vendorEmailList(v: Vendor): string[] {
  const fromRows = (v.emails ?? []).map((e) => e.email.trim()).filter(Boolean)
  if (fromRows.length) return Array.from(new Set(fromRows))
  return v.email?.trim() ? [v.email.trim()] : []
}
interface ServiceMatrix {
  id: string
  t1: string
  t2: string | null
  t3: string | null
  cost_element: string | null
  tanker_required: boolean
  trips: boolean
  locations?: string[] | null
}
interface CostElement { code: string; name: string | null }
interface BudgetLine { id: string; fy: string; cost_element: string; amount: number; notes: string }
interface AdminPo {
  id: string
  invoice_id?: string | null
  status: string | null
  amount?: number | null
  released_amount?: number | null
  invoices?: { cost_element?: string | null; invoice_date?: string | null; service_from?: string | null; service_to?: string | null } | null
}

interface DraftLine {
  id: string
  cost_element: string
  amount: string
  notes: string
}

interface AccrualView {
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
    status: string | null
    amount: number
  }>
}

const COMPANY_KEYS = ['cost_center', 'maximum_invoice_amount', 'expiring_threshold_days'] as const
const RULE_KEYS = ['duplicate_check', 'future_date_allowed', 'enable_audit'] as const
const MAIL_KEYS = ['followup_template', 'discrepancy_template'] as const
const PO_KEYS = ['po_template'] as const

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
  po_template: JSON.stringify(DEFAULT_PO_CONFIG),
}

function mergeSettings(loaded: Setting[]): Setting[] {
  const map = new Map(loaded.map((s) => [s.key, s.value]))
  const known: string[] = [...COMPANY_KEYS, ...RULE_KEYS, ...MAIL_KEYS, ...PO_KEYS]
  const out: Setting[] = known.map((key) => ({ key, value: map.get(key) ?? SETTING_DEFAULTS[key] ?? '' }))
  for (const s of loaded) {
    if (s.key === 'yearly_budgets') continue
    if (s.key === 'financial_year') continue
    if (s.key === 'fy_accrual_overrides') continue
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
  const [budgetFocusFy, setBudgetFocusFy] = useState<string | null>(null)
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
  const missingEmails = vendors.filter((v) => !vendorEmailList(v).length).length
  const fyBudget = budgets.filter((b) => b.fy === fyNow)
  const fyBudgetTotal = fyBudget.reduce((s, b) => s + b.amount, 0)
  const fyActual = paymentOrders.reduce((s, p) => {
    if (invoiceBudgetFy(p.invoices ?? {}) !== fyNow) return s
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
           { id: 'po', label: 'PO template' },
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
          onOpenClosedFy={(year) => {
            setBudgetFocusFy(year)
            setTab('budgets')
          }}
        />
      )}
      {tab === 'budgets' && (
        <BudgetPanel costs={costs} paymentOrders={paymentOrders} saved={budgets} onSaved={setBudgets} focusFy={budgetFocusFy} />
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
      {tab === 'po' && <PoTemplatePanel settings={settings} setSettings={setSettings} />}
    </div>
  )
}

function OverviewPanel({
  loading, vendorCount, missingEmails, matrixCount, costCount, fy, budgetTotal, actual, onOpen, onOpenClosedFy,
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
  onOpenClosedFy: (year: string) => void
}) {
  const util = budgetTotal > 0 ? (actual / budgetTotal) * 100 : 0
  const priorFy = shiftFiscalYear(fy, -1)
  const [prior, setPrior] = useState<AccrualView | null>(null)
  useEffect(() => {
    let cancelled = false
    void apiGet<AccrualView>(`/api/accruals?fy=${encodeURIComponent(priorFy)}`)
      .then((d) => {
        if (!cancelled) setPrior(d)
      })
      .catch(() => {
        if (!cancelled) setPrior(null)
      })
    return () => { cancelled = true }
  }, [priorFy])
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
      {prior && isClosedFiscalYear(priorFy) && (
        <GlassCard className="flex flex-wrap items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]">
            <Lock size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{priorFy} Sundry Accrual</div>
            <div className="text-2xl font-black tracking-tight">Rs {formatMoney(prior.secured)}</div>
            <p className="mt-0.5 text-xs text-[var(--text-dim)]">
              Accrual Balance Rs {formatMoney(prior.balance)} · {prior.invoices?.length ?? 0} unpaid invoice{(prior.invoices?.length ?? 0) === 1 ? '' : 's'}. Closed-year payments do not reduce {fy} remaining.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenClosedFy(priorFy)}>
            Open {priorFy} budgets
          </Button>
        </GlassCard>
      )}
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
            {prior && (prior.unpaid > 0 || (prior.invoices?.length ?? 0) > 0) && (
              <li>
                <button type="button" className="flex items-start gap-2 text-left text-[var(--warn)] hover:underline" onClick={() => onOpenClosedFy(priorFy)}>
                  <Wallet size={14} className="mt-0.5 shrink-0" /> {priorFy} still has unpaid invoices feeding Sundry Accrual.
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
  costs, paymentOrders, saved, onSaved, focusFy,
}: {
  costs: CostElement[]
  paymentOrders: AdminPo[]
  saved: BudgetLine[]
  onSaved: (rows: BudgetLine[]) => void
  focusFy?: string | null
}) {
  const [fy, setFy] = useState(focusFy || currentFiscalYear())
  const [extraYears, setExtraYears] = useState<string[]>([])
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const { guardFy } = useFyLock()
  const { unlocked: masterOn, requestUnlock } = useMasterAccess()
  const [accrual, setAccrual] = useState<AccrualView | null>(null)
  const [overrideDraft, setOverrideDraft] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)
  const running = currentFiscalYear()
  const priorFy = shiftFiscalYear(running, -1)
  const [priorAccrual, setPriorAccrual] = useState<AccrualView | null>(null)
  const years = useMemo(() => {
    const set = new Set<string>([...nearbyFiscalYears(), ...saved.map((b) => b.fy), ...extraYears])
    return [...set].sort()
  }, [saved, extraYears])

  useEffect(() => {
    if (focusFy) setFy(focusFy)
  }, [focusFy])

  useEffect(() => {
    const existing = saved.filter((b) => b.fy === fy)
    const rows = existing.length > 0
      ? existing.map((b) => ({ id: b.id, cost_element: b.cost_element, amount: String(b.amount), notes: b.notes }))
      : costs.map((c) => ({ id: newDraftId(), cost_element: c.code, amount: '', notes: '' }))
    if (!rows.some((r) => isMiscCostElement(r.cost_element))) {
      rows.push({ id: newDraftId(), cost_element: MISC_COST_ELEMENT, amount: '', notes: 'Admin miscellaneous' })
    }
    setDraft(rows)
  }, [fy, saved, costs])

  useEffect(() => {
    let cancelled = false
    void apiGet<AccrualView>(`/api/accruals?fy=${encodeURIComponent(fy)}`)
      .then((d) => {
        if (cancelled) return
        setAccrual(d)
        setOverrideDraft(d.override != null ? String(d.override) : '')
      })
      .catch(() => {
        if (!cancelled) setAccrual(null)
      })
    return () => { cancelled = true }
  }, [fy, paymentOrders])

  useEffect(() => {
    if (fy !== running) {
      setPriorAccrual(null)
      return
    }
    let cancelled = false
    void apiGet<AccrualView>(`/api/accruals?fy=${encodeURIComponent(priorFy)}`)
      .then((d) => {
        if (!cancelled) setPriorAccrual(d)
      })
      .catch(() => {
        if (!cancelled) setPriorAccrual(null)
      })
    return () => { cancelled = true }
  }, [fy, running, priorFy, paymentOrders])

  const actuals = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of paymentOrders) {
      if (invoiceBudgetFy(p.invoices ?? {}) !== fy) continue
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
    const previous = new Map(
      saved.filter((b) => b.fy === fy).map((b) => [b.cost_element.toUpperCase(), b.amount]),
    )
    const increasing = lines.some((l) => isBudgetIncrease(previous.get(l.cost_element.toUpperCase()), l.amount))
    if (increasing && !masterOn) {
      toast.error('Budget increase requires Master Access')
      requestUnlock()
      return
    }
    if (!(increasing && masterOn && isClosedFiscalYear(fy))) {
      if (!(await guardFy(fy))) return
    }
    setSaving(true)
    try {
      const res = await apiPut<{ budgets: BudgetLine[] }>('/api/budgets', { fy, lines, masterAccess: masterOn })
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

  const saveOverride = async (raw = overrideDraft) => {
    if (!masterOn) {
      requestUnlock()
      return
    }
    const trimmed = raw.trim()
    const override = trimmed === '' ? null : Number(trimmed)
    if (override != null && (!Number.isFinite(override) || override < 0)) {
      toast.error('Enter a non-negative amount, or leave blank to use the computed accrual')
      return
    }
    setSavingOverride(true)
    try {
      const d = await apiPut<AccrualView>('/api/accruals', { fy, override, masterAccess: true })
      setAccrual(d)
      setOverrideDraft(d.override != null ? String(d.override) : '')
      toast.success(override == null ? `${fy} accrual uses computed sum` : `${fy} accrual override saved`)
      emitCrossModule('budget', 'update', fy)
    } catch (e) {
      toast.error('Accrual save failed', (e as Error).message)
    } finally {
      setSavingOverride(false)
    }
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
      {fy === running && priorAccrual && isClosedFiscalYear(priorFy) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] px-5 py-3">
          <div className="text-sm">
            <span className="font-semibold">{priorFy} is closed.</span>{' '}
            Sundry Accrual Rs {formatMoney(priorAccrual.secured)} · Accrual Balance Rs {formatMoney(priorAccrual.balance)} · {priorAccrual.invoices?.length ?? 0} unpaid
          </div>
          <Button size="sm" variant="ghost" onClick={() => setFy(priorFy)}>
            Open {priorFy}
          </Button>
        </div>
      )}
      {accrual && (
        <>
        <div className="grid gap-3 border-b border-[var(--border)] px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Yearly Budget</div>
            <div className="mt-1 text-lg font-bold tabular-nums">Rs {formatMoney(totalBudget)}</div>
            <div className="text-xs text-[var(--text-dim)]">{fy} entered lines</div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Released</div>
            <div className="mt-1 text-lg font-bold tabular-nums">Rs {formatMoney(totalActual)}</div>
            <div className="text-xs text-[var(--text-dim)]">Against {fy} invoices · remaining Rs {formatMoney(totalBudget - totalActual)}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Sundry Accrual</div>
            <div className="mt-1 text-lg font-bold tabular-nums">Rs {formatMoney(accrual.secured)}</div>
            <div className="text-xs text-[var(--text-dim)]">
              {accrual.override != null
                ? 'Master Access override'
                : isClosedFiscalYear(fy)
                  ? 'Computed unpaid + released'
                  : 'Unpaid invoices of this year (secures at close)'}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Accrual Balance</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${accrual.balance < 0 ? 'text-[var(--danger)]' : ''}`}>
              Rs {formatMoney(accrual.balance)}
            </div>
            <div className="text-xs text-[var(--text-dim)]">
              Unpaid Rs {formatMoney(accrual.unpaid)} · released Rs {formatMoney(accrual.consumed)}
              {accrual.balance < 0 ? ' · below zero' : ''}
            </div>
          </div>
        </div>
        {isClosedFiscalYear(fy) && (
          <div className="border-b border-[var(--border)] px-5 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Override (Master Access)</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="input max-w-[12rem] text-right tabular-nums"
                inputMode="decimal"
                value={overrideDraft}
                onChange={(e) => setOverrideDraft(e.target.value)}
                placeholder={String(accrual.computed)}
                disabled={!masterOn}
              />
              <Button size="sm" variant="ghost" onClick={() => void saveOverride()} disabled={savingOverride || !masterOn}>
                {savingOverride ? 'Saving…' : 'Save'}
              </Button>
              {!masterOn && (
                <button type="button" className="text-xs text-[var(--accent)] underline-offset-2 hover:underline" onClick={requestUnlock}>
                  Unlock Master Access to override
                </button>
              )}
              {masterOn && (
                <button type="button" className="text-xs text-[var(--text-muted)] underline-offset-2 hover:underline" onClick={() => void saveOverride('')}>
                  Clear override
                </button>
              )}
            </div>
          </div>
        )}
        {(accrual.invoices ?? []).length > 0 && (
          <div className="border-b border-[var(--border)] px-5 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {isClosedFiscalYear(fy) ? 'Unpaid prior-year invoices' : 'Unpaid invoices'}
            </div>
            <div className="mt-2 table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className="text-right">Amount (Rs)</th>
                  </tr>
                </thead>
                <tbody>
                  {(accrual.invoices ?? []).map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-semibold">{inv.invoice_no ?? '—'}</td>
                      <td className="text-xs">{formatDate(inv.invoice_date)}</td>
                      <td className="text-xs">{inv.status ?? '—'}</td>
                      <td className="text-right tabular-nums">{formatMoney(inv.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
      )}
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
                    <select
                      className="input min-w-[10rem]"
                      value={d.cost_element}
                      onChange={(e) => setLine(d.id, { cost_element: e.target.value })}
                      disabled={isMiscCostElement(d.cost_element)}
                    >
                      <option value="">Select…</option>
                      {costs.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name ?? 'unnamed'}</option>
                      ))}
                      {!costs.some((c) => isMiscCostElement(c.code)) && (
                        <option value={MISC_COST_ELEMENT}>MISC — Miscellaneous</option>
                      )}
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
                    {isMiscCostElement(d.cost_element) ? (
                      <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-dim)]">Misc.</span>
                    ) : (
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem' }} aria-label="Remove line" onClick={() => setDraft((prev) => prev.filter((x) => x.id !== d.id))}>
                        <Trash2 size={14} className="text-[var(--danger)]" />
                      </button>
                    )}
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
  const filtered = vendors.filter((v) => `${v.name} ${vendorEmailList(v).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))

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
              <th>Emails</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id}>
                <td className="font-semibold">{v.name}</td>
                <td className={vendorEmailList(v).length ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}>
                  {vendorEmailList(v).length ? vendorEmailList(v).join(', ') : 'No email'}
                </td>
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
  const filtered = matrix.filter((m) => `${m.t1} ${m.t2 ?? ''} ${m.t3 ?? ''} ${m.cost_element ?? ''} ${(m.locations ?? []).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))

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
              <th>Locations</th>
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
                <td className="text-xs">{(m.locations ?? []).length ? (m.locations ?? []).join(', ') : '—'}</td>
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
    if (invoiceBudgetFy(p.invoices ?? {}) !== fy) return s
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
    ...settings.filter((s) => !COMPANY_KEYS.includes(s.key as typeof COMPANY_KEYS[number]) && !RULE_KEYS.includes(s.key as typeof RULE_KEYS[number]) && !MAIL_KEYS.includes(s.key as typeof MAIL_KEYS[number]) && !PO_KEYS.includes(s.key as typeof PO_KEYS[number]) && s.key !== 'yearly_budgets' && s.key !== 'financial_year' && s.key !== 'fy_accrual_overrides'),
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

function PoTextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

function PoSlot({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— none —</option>
        {PO_PLACEHOLDERS.map((t) => (
          <option key={t.token} value={t.token}>{`${t.description} — {{${t.token}}}`}</option>
        ))}
      </select>
    </Field>
  )
}

function PoTemplatePanel({ settings, setSettings }: { settings: Setting[]; setSettings: Dispatch<SetStateAction<Setting[]>> }) {
  const toast = useToast()
  const stored = settings.find((s) => s.key === 'po_template')?.value
  const [config, setConfig] = useState<PoTemplateConfig>(() => parsePoTemplate(stored))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setConfig(parsePoTemplate(stored))
  }, [stored])

  const patch = (p: Partial<PoTemplateConfig>) => setConfig((c) => ({ ...c, ...p }))
  const patchColumns = (p: Partial<PoTemplateConfig['columns']>) => setConfig((c) => ({ ...c, columns: { ...c.columns, ...p } }))
  const setRow = (i: number, p: Partial<PoTemplateConfig['rows'][number]>) =>
    setConfig((c) => ({ ...c, rows: c.rows.map((row, idx) => (idx === i ? { ...row, ...p } : row)) }))
  const addRow = () => setConfig((c) => ({ ...c, rows: [...c.rows, { caption: 'New line', placeholder: 'invoiceLine', enabled: true }] }))
  const removeRow = (i: number) => setConfig((c) => ({ ...c, rows: c.rows.filter((_, idx) => idx !== i) }))
  const moveRow = (i: number, dir: -1 | 1) =>
    setConfig((c) => {
      const j = i + dir
      if (j < 0 || j >= c.rows.length) return c
      const rows = [...c.rows]
      ;[rows[i], rows[j]] = [rows[j], rows[i]]
      return { ...c, rows }
    })
  const setSignatory = (i: number, v: string) =>
    setConfig((c) => {
      const signatories = [...c.signatories]
      while (signatories.length < 4) signatories.push('')
      signatories[i] = v
      return { ...c, signatories }
    })

  const save = async () => {
    setSaving(true)
    const value = JSON.stringify(config)
    try {
      await apiPut('/api/settings', { settings: [{ key: 'po_template', value }] })
      setSettings((prev) => {
        const exists = prev.some((s) => s.key === 'po_template')
        return exists
          ? prev.map((s) => (s.key === 'po_template' ? { ...s, value } : s))
          : [...prev, { key: 'po_template', value }]
      })
      toast.success('PO template saved')
      emitCrossModule('setting', 'update')
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const preview = () => {
    const { order, extras } = samplePoPrint()
    openPaymentOrderPrint(order, extras, JSON.stringify(config))
  }

  const dirty = JSON.stringify(config) !== JSON.stringify(parsePoTemplate(stored))

  return (
    <div className="space-y-5">
      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <FileText size={16} className="text-[var(--accent)]" /> Payment order blueprint
          </div>
          {dirty && <span className="badge badge-warn">Unsaved changes</span>}
        </div>
        <p className="mb-5 text-xs text-[var(--text-muted)]">
          One universal form is used for every payment order. Choose which value prints in each slot — no code required.
        </p>

        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-dim)]">Header</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PoTextInput label="Title" value={config.title} onChange={(v) => patch({ title: v })} />
          <PoTextInput label="Company name" value={config.company} onChange={(v) => patch({ company: v })} />
          <PoTextInput label="Doc. label" value={config.docLabel} onChange={(v) => patch({ docLabel: v })} />
          <PoSlot label="Doc. value" value={config.docPlaceholder} onChange={(v) => patch({ docPlaceholder: v })} />
          <PoTextInput label="PO label" value={config.poLabel} onChange={(v) => patch({ poLabel: v })} />
          <PoSlot label="PO value" value={config.poPlaceholder} onChange={(v) => patch({ poPlaceholder: v })} />
        </div>

        <div className="mt-6 mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-dim)]">Payment &amp; party</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PoTextInput label="Pay label" value={config.payLabel} onChange={(v) => patch({ payLabel: v })} />
          <PoTextInput label="Cash label" value={config.cashLabel} onChange={(v) => patch({ cashLabel: v })} />
          <PoTextInput label="Cheque label" value={config.chequeLabel} onChange={(v) => patch({ chequeLabel: v })} />
          <PoSlot label="Payment note" value={config.notePlaceholder} onChange={(v) => patch({ notePlaceholder: v })} />
          <PoTextInput label="To label" value={config.toLabel} onChange={(v) => patch({ toLabel: v })} />
          <PoSlot label="Payee" value={config.vendorPlaceholder} onChange={(v) => patch({ vendorPlaceholder: v })} />
          <PoTextInput label="Date label" value={config.dateLabel} onChange={(v) => patch({ dateLabel: v })} />
          <PoSlot label="Date value" value={config.datePlaceholder} onChange={(v) => patch({ datePlaceholder: v })} />
          <PoTextInput label="Sum label" value={config.sumLabel} onChange={(v) => patch({ sumLabel: v })} />
          <PoSlot label="Sum value" value={config.sumPlaceholder} onChange={(v) => patch({ sumPlaceholder: v })} />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-dim)]">Description lines</div>
        <p className="mb-3 text-xs text-[var(--text-muted)]">Each line prints a caption plus the chosen value, in order. Reorder with the arrows.</p>
        <div className="space-y-2">
          {config.rows.map((row, i) => (
            <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  className="cursor-pointer accent-[var(--accent)]"
                  checked={row.enabled !== false}
                  onChange={(e) => setRow(i, { enabled: e.target.checked })}
                />
                Show
              </label>
              <input className="input" value={row.caption} placeholder="Caption" onChange={(e) => setRow(i, { caption: e.target.value })} />
              <select className="input" value={row.placeholder} onChange={(e) => setRow(i, { placeholder: e.target.value })}>
                {PO_PLACEHOLDERS.map((t) => (
                  <option key={t.token} value={t.token}>{t.description}</option>
                ))}
              </select>
              <div className="flex justify-end gap-1">
                <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => moveRow(i, -1)} aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={i === config.rows.length - 1} onClick={() => moveRow(i, 1)} aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(i)} aria-label="Remove line">
                  <Trash2 size={14} className="text-[var(--danger)]" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="mt-3" onClick={addRow}>
          <Plus size={14} /> Add line
        </Button>

        <div className="mt-6 mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-dim)]">Grid headings</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PoTextInput label="Description heading" value={config.columns.lead} onChange={(v) => patchColumns({ lead: v })} />
          <PoTextInput label="Order Number heading" value={config.columns.orderNumber} onChange={(v) => patchColumns({ orderNumber: v })} />
          <PoTextInput label="Vendor No. heading" value={config.columns.vendorNo} onChange={(v) => patchColumns({ vendorNo: v })} />
          <PoTextInput label="Cost Center heading" value={config.columns.costCenter} onChange={(v) => patchColumns({ costCenter: v })} />
          <PoTextInput label="Cost Element heading" value={config.columns.costElement} onChange={(v) => patchColumns({ costElement: v })} />
          <PoTextInput label="Cheque No. heading" value={config.columns.chequeNo} onChange={(v) => patchColumns({ chequeNo: v })} />
          <PoTextInput label="Amount heading" value={config.columns.amount} onChange={(v) => patchColumns({ amount: v })} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PoSlot label="Order Number value" value={config.orderNumberField} onChange={(v) => patch({ orderNumberField: v })} />
          <PoSlot label="Cost Center value" value={config.costCenterField} onChange={(v) => patch({ costCenterField: v })} />
          <PoSlot label="Cost Element value" value={config.costElementField} onChange={(v) => patch({ costElementField: v })} />
          <PoSlot label="Cheque No. value" value={config.chequeNoField} onChange={(v) => patch({ chequeNoField: v })} />
          <PoSlot label="Amount value" value={config.amountField} onChange={(v) => patch({ amountField: v })} />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-dim)]">Footer &amp; remarks</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <PoTextInput key={i} label={`Signatory ${i + 1}`} value={config.signatories[i] ?? ''} onChange={(v) => setSignatory(i, v)} />
          ))}
          <PoTextInput label="TOTAL label" value={config.totalLabel} onChange={(v) => patch({ totalLabel: v })} />
          <PoSlot label="TOTAL value" value={config.totalPlaceholder} onChange={(v) => patch({ totalPlaceholder: v })} />
          <PoTextInput label="Received text" value={config.receivedText} onChange={(v) => patch({ receivedText: v })} />
          <PoTextInput label="Payee label" value={config.payeeLabel} onChange={(v) => patch({ payeeLabel: v })} />
          <PoTextInput label="Remarks label" value={config.remarksLabel} onChange={(v) => patch({ remarksLabel: v })} />
          <PoTextInput label="Form code" value={config.fdLabel} onChange={(v) => patch({ fdLabel: v })} />
          <Field label="Row height (px, 0 = auto)">
            <input
              className="input"
              inputMode="numeric"
              value={config.rowHeight ? String(config.rowHeight) : ''}
              onChange={(e) => patch({ rowHeight: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
            />
          </Field>
          <Field label="Font size (px, 0 = default)">
            <input
              className="input"
              inputMode="numeric"
              value={config.fontSize ? String(config.fontSize) : ''}
              onChange={(e) => patch({ fontSize: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Remarks text">
            <textarea className="input min-h-16 text-xs" value={config.remarksText} onChange={(e) => patch({ remarksText: e.target.value })} />
          </Field>
        </div>
      </GlassCard>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => setConfig(DEFAULT_PO_CONFIG)}>
          <RotateCcw size={15} /> Restore default
        </Button>
        <Button variant="ghost" onClick={preview}>
          <Eye size={15} /> Preview
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? 'Saving…' : 'Save template'}
        </Button>
      </div>
    </div>
  )
}

function emptyEmailRow(isPrimary = false): VendorEmail {
  return { email: '', label: 'surveyor', is_primary: isPrimary }
}

function emailsFromVendor(v: Vendor | null): VendorEmail[] {
  if (!v) return [emptyEmailRow(true)]
  const rows = (v.emails ?? []).map((e) => ({
    email: e.email,
    label: e.label || 'surveyor',
    is_primary: Boolean(e.is_primary),
  }))
  if (rows.length) {
    if (!rows.some((r) => r.is_primary)) rows[0].is_primary = true
    return rows
  }
  if (v.email) return [{ email: v.email, label: 'surveyor', is_primary: true }]
  return [emptyEmailRow(true)]
}

function VendorForm({ initial, onClose, onSaved }: { initial: Vendor | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [emails, setEmails] = useState<VendorEmail[]>(() => emailsFromVendor(initial))
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const setRow = (idx: number, patch: Partial<VendorEmail>) => {
    setEmails((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const setPrimary = (idx: number) => {
    setEmails((prev) => prev.map((row, i) => ({ ...row, is_primary: i === idx })))
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Vendor name is required')
      return
    }
    const cleaned = emails
      .map((row, idx) => ({
        email: row.email.trim(),
        label: row.label || 'surveyor',
        is_primary: Boolean(row.is_primary) || idx === 0,
      }))
      .filter((row) => row.email)
    if (cleaned.length && !cleaned.some((row) => row.is_primary)) cleaned[0].is_primary = true
    let seen = false
    for (const row of cleaned) {
      if (row.is_primary && seen) row.is_primary = false
      else if (row.is_primary) seen = true
    }
    const primary = cleaned.find((row) => row.is_primary)?.email ?? cleaned[0]?.email ?? null
    setSaving(true)
    try {
      const body = { name: name.trim(), email: primary, emails: cleaned }
      if (initial) await apiPut(`/api/vendors/${initial.id}`, body)
      else await apiPost('/api/vendors', body)
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
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Emails</span>
          <div className="space-y-2">
            {emails.map((row, idx) => (
              <div key={`email-${idx}`} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_7.5rem_auto_auto]">
                <input
                  type="email"
                  className="input"
                  value={row.email}
                  onChange={(e) => setRow(idx, { email: e.target.value })}
                  placeholder="surveyor@vendor.com"
                />
                <select className="input" value={row.label || 'surveyor'} onChange={(e) => setRow(idx, { label: e.target.value })}>
                  {EMAIL_LABELS.map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  <input type="radio" name="vendor-primary-email" checked={Boolean(row.is_primary)} onChange={() => setPrimary(idx)} />
                  Primary
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label="Remove email"
                  disabled={emails.length === 1}
                  onClick={() => setEmails((prev) => {
                    const next = prev.filter((_, i) => i !== idx)
                    if (next.length && !next.some((r) => r.is_primary)) next[0].is_primary = true
                    return next
                  })}
                >
                  <Trash2 size={14} className="text-[var(--danger)]" />
                </button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setEmails((prev) => [...prev, emptyEmailRow(prev.length === 0)])}
          >
            <Plus size={14} /> Add email
          </Button>
        </div>
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
    locations: normalizeLocations(initial?.locations),
  })
  const [locationDraft, setLocationDraft] = useState('')
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
      locations: normalizeLocations([...form.locations, locationDraft]),
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
        <div className="sm:col-span-3">
          <Field
            label="Locations"
            hint="Invoice entry shows these as a dropdown for this Type / Service / Detail combo. Leave empty if location is not used."
          >
            {form.locations.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.locations.map((loc) => (
                  <span key={loc} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-medium">
                    {loc}
                    <button
                      type="button"
                      className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                      aria-label={`Remove ${loc}`}
                      onClick={() => setForm({ ...form, locations: form.locations.filter((x) => x !== loc) })}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="input"
                value={locationDraft}
                placeholder="Add a location…"
                onChange={(e) => setLocationDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    const next = normalizeLocations([...form.locations, locationDraft])
                    setForm({ ...form, locations: next })
                    setLocationDraft('')
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = normalizeLocations([...form.locations, locationDraft])
                  setForm({ ...form, locations: next })
                  setLocationDraft('')
                }}
              >
                Add
              </Button>
            </div>
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
