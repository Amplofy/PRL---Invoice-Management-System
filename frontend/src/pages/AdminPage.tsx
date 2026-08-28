import { useCallback, useEffect, useState } from 'react'
import { Save, Plus, Trash2, Pencil, ShieldCheck } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Tabs, { useTab } from '../components/ui/Tabs'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { Field } from '../components/ui/Field'
import EmptyState from '../components/ui/EmptyState'

interface Setting {
  key: string
  value: string
}
interface Vendor {
  id: string
  name: string
  email: string | null
}
interface ServiceMatrix {
  id: string
  t1: string
  t2: string | null
  t3: string | null
  cost_element: string | null
  tanker_required: boolean
  trips: boolean
}
interface CostElement {
  code: string
  name: string | null
}

const SETTING_LABELS: Record<string, { label: string; hint?: string; rows?: number }> = {
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
  max_invoice_amount: {
    label: 'Maximum invoice amount (Rs)',
    hint: 'Invoices above this value fail validation on import',
  },
  company_name: { label: 'Company name' },
}

export default function AdminPage() {
  const [tab, setTab] = useTab('settings')
  const [settings, setSettings] = useState<Setting[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [matrix, setMatrix] = useState<ServiceMatrix[]>([])
  const [costs, setCosts] = useState<CostElement[]>([])
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [creatingService, setCreatingService] = useState(false)
  const [creatingCost, setCreatingCost] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const [s, v, m, c] = await Promise.all([
        apiGet<{ settings: Setting[] }>('/api/settings'),
        apiGet<{ vendors: Vendor[] }>('/api/vendors'),
        apiGet<{ serviceMatrix: ServiceMatrix[] }>('/api/service-matrix'),
        apiGet<{ costElements: CostElement[] }>('/api/cost-elements'),
      ])
      setSettings(s.settings)
      setVendors(v.vendors)
      setMatrix(m.serviceMatrix)
      setCosts(c.costElements)
    } catch (e) {
      toast.error('Failed to load admin data', (e as Error).message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      await apiPut('/api/settings', { settings })
      toast.success('Settings saved')
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSavingSettings(false)
    }
  }

  const setSetting = (key: string, value: string) =>
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))

  const saveVendorEmail = async () => {
    if (!editingVendor) return
    try {
      await apiPut(`/api/vendors/${editingVendor.id}/email`, { email: editingVendor.email })
      toast.success('Vendor email updated')
      setEditingVendor(null)
      load()
    } catch (e) {
      toast.error('Update failed', (e as Error).message)
    }
  }

  const deleteService = async (id: string) => {
    if (!window.confirm('Delete this service matrix row?')) return
    try {
      await apiDelete(`/api/service-matrix/${id}`)
      toast.success('Service row deleted')
      load()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  const deleteCost = async (code: string) => {
    if (!window.confirm(`Delete cost element ${code}?`)) return
    try {
      await apiDelete(`/api/cost-elements/${encodeURIComponent(code)}`)
      toast.success('Cost element deleted')
      load()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin Panel"
        description="Email templates, vendor emails, service matrix and cost elements. The audit trail lives under Insights."
        actions={
          <span className="badge badge-purple">
            <ShieldCheck size={13} /> Admin only
          </span>
        }
      />

      <Tabs
        tabs={[
          { id: 'settings', label: 'Email Templates' },
          { id: 'vendors', label: 'Vendor Emails' },
          { id: 'matrix', label: 'Service Matrix' },
          { id: 'costs', label: 'Cost Elements' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'settings' && (
        <GlassCard className="p-6">
          <div className="space-y-5">
            {settings.map((s) => {
              const meta = SETTING_LABELS[s.key] ?? { label: s.key, hint: '' }
              return (
                <Field key={s.key} label={meta.label} hint={meta.hint}>
                  <textarea
                    className="input min-h-16 font-mono text-xs"
                    rows={meta.rows ?? 3}
                    value={s.value}
                    onChange={(e) => setSetting(s.key, e.target.value)}
                  />
                </Field>
              )
            })}
          </div>
          <div className="mt-6 flex justify-end">
            <Button variant="primary" onClick={saveSettings} disabled={savingSettings}>
              <Save size={15} /> {savingSettings ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </GlassCard>
      )}

      {tab === 'vendors' && (
        <GlassCard className="overflow-hidden">
          <div className="px-5 py-4">
            <div className="text-xs text-[var(--text-muted)]">
              Surveyor email addresses are used for follow-up and discrepancy emails. Admin can edit; other users see
              them read-only.
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Email</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <td className="font-semibold">{v.name}</td>
                    <td className={v.email ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}>
                      {v.email ?? 'No email set'}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          className="btn btn-ghost !px-2.5 !py-1.5"
                          title="Edit vendor email"
                          onClick={() => setEditingVendor(v)}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {tab === 'matrix' && (
        <GlassCard className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="text-xs text-[var(--text-muted)]">
              T1 → T2 → T3 hierarchy used by the invoice workspace.
            </div>
            <Button size="sm" onClick={() => setCreatingService(true)}>
              <Plus size={14} /> Add row
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>T1</th>
                  <th>T2</th>
                  <th>T3</th>
                  <th>Cost Element</th>
                  <th>Tanker</th>
                  <th>Trips</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.id}>
                    <td className="font-semibold">{m.t1}</td>
                    <td>{m.t2 ?? '—'}</td>
                    <td>{m.t3 ?? '—'}</td>
                    <td className="text-xs">{m.cost_element ?? '—'}</td>
                    <td>{m.tanker_required ? 'Yes' : 'No'}</td>
                    <td>{m.trips ? 'Yes' : 'No'}</td>
                    <td>
                      <div className="flex justify-end">
                        <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => deleteService(m.id)}>
                          <Trash2 size={14} className="text-[var(--danger)]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matrix.length === 0 && <EmptyState title="No service matrix rows" />}
        </GlassCard>
      )}

      {tab === 'costs' && (
        <GlassCard className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="text-xs text-[var(--text-muted)]">Cost element codes referenced by invoices.</div>
            <Button size="sm" onClick={() => setCreatingCost(true)}>
              <Plus size={14} /> Add element
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.code}>
                    <td className="font-semibold">{c.code}</td>
                    <td>{c.name ?? '—'}</td>
                    <td>
                      <div className="flex justify-end">
                        <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => deleteCost(c.code)}>
                          <Trash2 size={14} className="text-[var(--danger)]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <Modal
        open={!!editingVendor}
        onClose={() => setEditingVendor(null)}
        title={`Vendor email — ${editingVendor?.name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingVendor(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveVendorEmail}>Save email</Button>
          </>
        }
      >
        <Field label="Email address" required>
          <input
            type="email"
            className="input"
            value={editingVendor?.email ?? ''}
            onChange={(e) => setEditingVendor((v) => (v ? { ...v, email: e.target.value } : v))}
            placeholder="surveyor@vendor.com"
          />
        </Field>
      </Modal>

      {creatingService && (
        <ServiceFormModal
          onClose={() => setCreatingService(false)}
          onSaved={() => {
            setCreatingService(false)
            load()
          }}
        />
      )}
      {creatingCost && (
        <CostFormModal
          onClose={() => setCreatingCost(false)}
          onSaved={() => {
            setCreatingCost(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function ServiceFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ t1: '', t2: '', t3: '', cost_element: '', tanker_required: false, trips: false })
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const submit = async () => {
    if (!form.t1.trim()) {
      toast.error('T1 is required')
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/service-matrix', { ...form, t1: form.t1.trim(), t2: form.t2 || null, t3: form.t3 || null, cost_element: form.cost_element || null })
      toast.success('Service row added')
      onSaved()
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add service matrix row"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="T1" required><input className="input" value={form.t1} onChange={(e) => setForm({ ...form, t1: e.target.value })} /></Field>
        <Field label="T2"><input className="input" value={form.t2} onChange={(e) => setForm({ ...form, t2: e.target.value })} /></Field>
        <Field label="T3"><input className="input" value={form.t3} onChange={(e) => setForm({ ...form, t3: e.target.value })} /></Field>
        <div className="sm:col-span-3">
          <Field label="Cost Element"><input className="input" value={form.cost_element} onChange={(e) => setForm({ ...form, cost_element: e.target.value })} /></Field>
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

function CostFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const submit = async () => {
    if (!code.trim()) {
      toast.error('Code is required')
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/cost-elements', { code: code.trim(), name: name.trim() || null })
      toast.success('Cost element added')
      onSaved()
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add cost element"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Code" required><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
