const R_ADMIN = '00000000-0000-0000-0000-000000000001'
const R_APPROVER = '00000000-0000-0000-0000-000000000002'
const R_PROCESSOR = '00000000-0000-0000-0000-000000000003'
const R_VIEWER = '00000000-0000-0000-0000-000000000004'
const R_AUDITOR = '00000000-0000-0000-0000-000000000005'

const V_ABDUL = '00000000-0000-0000-0000-000000000101'
const V_KARACHI = '00000000-0000-0000-0000-000000000102'
const V_DELTA = '00000000-0000-0000-0000-000000000103'

const C_BH = '00000000-0000-0000-0000-000000000201'
const C_TH = '00000000-0000-0000-0000-000000000202'
const C_SM = '00000000-0000-0000-0000-000000000203'

const PERMISSION_IDS = [
  'invoice.view', 'invoice.create', 'invoice.update', 'invoice.delete', 'invoice.approve',
  'invoice.reject', 'po.generate', 'contract.view', 'contract.create', 'contract.update',
  'contract.delete', 'vendor.manage', 'import.data', 'compare.data', 'followup.send',
  'reports.view', 'users.manage', 'roles.manage', 'settings.manage',
]

interface Permission { id: string; name: string; category: string }
interface Role { id: string; name: string; description: string; color: string; role_permissions: { permission_id: string }[] }
interface UserRow { id: string; username: string; full_name: string; email: string; role_id: string | null; status: string; roles: { name: string; color: string } | null }
interface Vendor { id: string; name: string; email: string | null; created_at: string; updated_at: string }
interface Contract { id: string; contract_no: string; vendor_id: string | null; service: string | null; start_date: string | null; end_date: string | null; value: number; status: string; vendors: { name: string; email: string | null }[] | null }
interface ServiceRow { id: string; t1: string; t2: string | null; t3: string | null; cost_element: string | null; tanker_required: boolean; trips: boolean }
interface CostRow { code: string; name: string | null }
interface Setting { key: string; value: string }
interface Invoice {
  id: string
  serial_no: string | null
  processing_date: string | null
  contract_id: string | null
  invoice_no: string
  invoice_date: string | null
  t1: string | null
  t2: string | null
  t3: string | null
  tanker_name: string | null
  trips: number | null
  item_no: string | null
  cost_element: string | null
  service_from: string | null
  service_to: string | null
  amount: number
  status: string
  approved_by: string | null
  approved_date: string | null
  approved_amount: number | null
  remarks: string | null
  row_version: number
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  contracts: unknown
}
interface PoVersion { id: string; invoice_id: string; serial_no: string; generated_at: string; generated_by: string | null }
interface AuditEntry { id: string; timestamp: string; user_email: string | null; action: string; entity_type: string | null; entity_id: string | null; summary: string | null; entity: string | null; description: string | null }

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function iso(d: string): string {
  return new Date(d).toISOString()
}

function nowIso(): string {
  return new Date().toISOString()
}

function daysFromNow(d: string): number {
  return Math.round((new Date(d).getTime() - Date.now()) / 86400000)
}

const permissions: Permission[] = PERMISSION_IDS.map((id) => {
  const names: Record<string, [string, string]> = {
    'invoice.view': ['View Invoices', 'Invoices'],
    'invoice.create': ['Create Invoices', 'Invoices'],
    'invoice.update': ['Update Invoices', 'Invoices'],
    'invoice.delete': ['Delete Invoices', 'Invoices'],
    'invoice.approve': ['Approve Invoices', 'Invoices'],
    'invoice.reject': ['Reject Invoices', 'Invoices'],
    'po.generate': ['Generate Payment Orders', 'Invoices'],
    'contract.view': ['View Contracts', 'Contracts'],
    'contract.create': ['Create Contracts', 'Contracts'],
    'contract.update': ['Update Contracts', 'Contracts'],
    'contract.delete': ['Delete Contracts', 'Contracts'],
    'vendor.manage': ['Manage Vendors', 'Contracts'],
    'import.data': ['Import Data', 'Data'],
    'compare.data': ['Compare Documents', 'Data'],
    'followup.send': ['Send Follow-up Emails', 'Data'],
    'reports.view': ['View Reports', 'Reports'],
    'users.manage': ['Manage Users', 'Administration'],
    'roles.manage': ['Manage Roles', 'Administration'],
    'settings.manage': ['Manage Settings', 'Administration'],
  }
  const [name, category] = names[id]
  return { id, name, category }
})

const rolePerms: Record<string, string[]> = {
  [R_ADMIN]: PERMISSION_IDS,
  [R_APPROVER]: ['invoice.view', 'invoice.approve', 'invoice.reject', 'contract.view', 'reports.view'],
  [R_PROCESSOR]: ['invoice.view', 'invoice.create', 'invoice.update', 'contract.view', 'reports.view'],
  [R_VIEWER]: ['invoice.view', 'contract.view'],
  [R_AUDITOR]: ['invoice.view', 'contract.view', 'reports.view'],
}

const roles: Role[] = [
  { id: R_ADMIN, name: 'admin', description: 'Full system access', color: '#60a5fa', role_permissions: rolePerms[R_ADMIN].map((permission_id) => ({ permission_id })) },
  { id: R_APPROVER, name: 'approver', description: 'Review and approve invoices', color: '#34d399', role_permissions: rolePerms[R_APPROVER].map((permission_id) => ({ permission_id })) },
  { id: R_PROCESSOR, name: 'processor', description: 'Create and process invoices', color: '#f472b6', role_permissions: rolePerms[R_PROCESSOR].map((permission_id) => ({ permission_id })) },
  { id: R_VIEWER, name: 'viewer', description: 'Read-only access', color: '#94a3b8', role_permissions: rolePerms[R_VIEWER].map((permission_id) => ({ permission_id })) },
  { id: R_AUDITOR, name: 'auditor', description: 'Reports and audit access', color: '#fbbf24', role_permissions: rolePerms[R_AUDITOR].map((permission_id) => ({ permission_id })) },
]

const roleById = (id: string | null): { name: string; color: string } | null => {
  const r = roles.find((x) => x.id === id)
  return r ? { name: r.name, color: r.color } : null
}

const users: UserRow[] = [
  { id: '00000000-0000-0000-0000-000000000301', username: 'a.malik', full_name: 'Abdul Moiz', email: 'a.malik@prl.com.pk', role_id: R_ADMIN, status: 'active', roles: roleById(R_ADMIN) },
  { id: '00000000-0000-0000-0000-000000000302', username: 'approver', full_name: 'S. Khan', email: 's.khan@prl.com.pk', role_id: R_APPROVER, status: 'active', roles: roleById(R_APPROVER) },
  { id: '00000000-0000-0000-0000-000000000303', username: 'processor', full_name: 'R. Ahmed', email: 'r.ahmed@prl.com.pk', role_id: R_PROCESSOR, status: 'active', roles: roleById(R_PROCESSOR) },
]

const vendors: Vendor[] = [
  { id: V_ABDUL, name: 'M/s Abdul Moiz Enterprises', email: 'surveyor1@example.com', created_at: iso('2026-01-05'), updated_at: iso('2026-01-05') },
  { id: V_KARACHI, name: 'M/s Karachi Surveyors', email: 'surveyor2@example.com', created_at: iso('2026-01-05'), updated_at: iso('2026-01-05') },
  { id: V_DELTA, name: 'M/s Delta Marine Services', email: 'surveyor3@example.com', created_at: iso('2026-01-05'), updated_at: iso('2026-01-05') },
]

const contracts: Contract[] = [
  { id: C_BH, contract_no: 'BH-LD-26', vendor_id: V_ABDUL, service: 'Surveying', start_date: '2026-01-01', end_date: '2026-12-31', value: 5000000, status: 'Open', vendors: [{ name: 'M/s Abdul Moiz Enterprises', email: 'surveyor1@example.com' }] },
  { id: C_TH, contract_no: 'TH-14-26', vendor_id: V_KARACHI, service: 'Tanker Handling', start_date: '2026-01-01', end_date: '2026-12-31', value: 8000000, status: 'Open', vendors: [{ name: 'M/s Karachi Surveyors', email: 'surveyor2@example.com' }] },
  { id: C_SM, contract_no: 'SM-09-26', vendor_id: V_DELTA, service: 'Stock Measurement', start_date: '2026-01-01', end_date: '2026-12-31', value: 3500000, status: 'Open', vendors: [{ name: 'M/s Delta Marine Services', email: 'surveyor3@example.com' }] },
]

const contractById = (id: string | null): Contract | null => contracts.find((c) => c.id === id) ?? null

function embedContract(c: Contract | null): { contract_no: string; service: string; vendors: { name: string; email: string | null }[] } | null {
  if (!c) return null
  const v = vendors.find((x) => x.id === c.vendor_id)
  return { contract_no: c.contract_no, service: c.service ?? '', vendors: v ? [{ name: v.name, email: v.email }] : [] }
}

const serviceMatrix: ServiceRow[] = [
  { id: uid(), t1: 'Inward', t2: 'Surveying', t3: 'Draft Survey', cost_element: 'SUR', tanker_required: true, trips: false },
  { id: uid(), t1: 'Inward', t2: 'Surveying', t3: 'Quantity Survey', cost_element: 'SUR', tanker_required: false, trips: false },
  { id: uid(), t1: 'Outward', t2: 'Tanker Handling', t3: 'Loading', cost_element: 'THL', tanker_required: true, trips: true },
  { id: uid(), t1: 'Outward', t2: 'Tanker Handling', t3: 'Unloading', cost_element: 'THL', tanker_required: true, trips: true },
  { id: uid(), t1: 'Storage', t2: 'Stock Measurement', t3: 'Tank Dipping', cost_element: 'SM', tanker_required: false, trips: false },
  { id: uid(), t1: 'Storage', t2: 'Stock Measurement', t3: 'Line Survey', cost_element: 'SM', tanker_required: false, trips: false },
]

const costElements: CostRow[] = [
  { code: 'SUR', name: 'Surveying' },
  { code: 'THL', name: 'Tanker Handling' },
  { code: 'SM', name: 'Stock Measurement' },
]

const settings: Setting[] = [
  { key: 'followup_template', value: 'Dear {{vendorName}},\n\nThis is a courteous reminder that the following invoice(s) against contract {{contractNo}} are currently pending with Pakistan Refinery Limited:\n\n{{invoiceList}}\n\nWe would appreciate your prompt attention so that processing may continue. Please do not hesitate to contact us should you require any clarification.\n\nKind regards,\nPRL Finance Department' },
  { key: 'discrepancy_template', value: 'Dear {{vendorName}},\n\nDuring reconciliation of {{baseFileName}} against {{compareFileName}}, the following discrepancy was identified for key {{keyValue}}:\n\n{{discrepancyList}}\n\nWe request you to review and confirm the correct figures at your earliest convenience.\n\nKind regards,\nPRL Finance Department' },
  { key: 'maximum_invoice_amount', value: '2500000' },
  { key: 'expiring_threshold_days', value: '60' },
  { key: 'financial_year', value: '2026-27' },
  { key: 'cost_center', value: '11369' },
  { key: 'duplicate_check', value: 'true' },
  { key: 'future_date_allowed', value: 'false' },
  { key: 'enable_audit', value: 'true' },
]

function makeInvoice(partial: Partial<Invoice>): Invoice {
  const base: Invoice = {
    id: uid(),
    serial_no: null,
    processing_date: null,
    contract_id: null,
    invoice_no: '',
    invoice_date: null,
    t1: null,
    t2: null,
    t3: null,
    tanker_name: null,
    trips: null,
    item_no: null,
    cost_element: null,
    service_from: null,
    service_to: null,
    amount: 0,
    status: 'Pending',
    approved_by: null,
    approved_date: null,
    approved_amount: null,
    remarks: null,
    row_version: 1,
    created_at: nowIso(),
    created_by: 'admin@prl.com.pk',
    updated_at: nowIso(),
    updated_by: 'admin@prl.com.pk',
    contracts: null,
  }
  return { ...base, ...partial }
}

const invoices: Invoice[] = [
  makeInvoice({ serial_no: 'S-1001', processing_date: '2026-06-10', contract_id: C_BH, invoice_no: 'INV-2026-0011', invoice_date: '2026-06-10', t1: 'Inward', t2: 'Surveying', t3: 'Draft Survey', tanker_name: 'MT Dawn', trips: 1, item_no: 'IT-1', cost_element: 'SUR', service_from: '2026-06-01', service_to: '2026-06-10', amount: 850000, status: 'Pending' }),
  makeInvoice({ serial_no: 'S-1002', processing_date: '2026-06-18', contract_id: C_BH, invoice_no: 'INV-2026-0012', invoice_date: '2026-06-18', t1: 'Inward', t2: 'Surveying', t3: 'Quantity Survey', item_no: 'IT-2', cost_element: 'SUR', service_from: '2026-06-08', service_to: '2026-06-18', amount: 640000, status: 'Pending' }),
  makeInvoice({ serial_no: 'S-2001', processing_date: '2026-07-05', contract_id: C_TH, invoice_no: 'INV-2026-0021', invoice_date: '2026-07-05', t1: 'Outward', t2: 'Tanker Handling', t3: 'Loading', tanker_name: 'MT Star', trips: 3, item_no: 'IT-3', cost_element: 'THL', service_from: '2026-06-28', service_to: '2026-07-05', amount: 1200000, status: 'Pending' }),
  makeInvoice({ serial_no: 'S-2002', processing_date: '2026-07-22', contract_id: C_TH, invoice_no: 'INV-2026-0022', invoice_date: '2026-07-22', t1: 'Outward', t2: 'Tanker Handling', t3: 'Unloading', tanker_name: 'MT Star', trips: 3, item_no: 'IT-4', cost_element: 'THL', service_from: '2026-07-12', service_to: '2026-07-22', amount: 980000, status: 'Approved', approved_by: 'admin@prl.com.pk', approved_date: iso('2026-07-23'), approved_amount: 980000 }),
  makeInvoice({ serial_no: 'S-3001', processing_date: '2026-05-12', contract_id: C_SM, invoice_no: 'INV-2026-0031', invoice_date: '2026-05-12', t1: 'Storage', t2: 'Stock Measurement', t3: 'Tank Dipping', item_no: 'IT-5', cost_element: 'SM', service_from: '2026-05-01', service_to: '2026-05-12', amount: 410000, status: 'Approved', approved_by: 'admin@prl.com.pk', approved_date: iso('2026-05-14'), approved_amount: 410000 }),
  makeInvoice({ serial_no: 'S-1003', processing_date: '2026-04-20', contract_id: C_BH, invoice_no: 'INV-2026-0013', invoice_date: '2026-04-20', t1: 'Inward', t2: 'Surveying', t3: 'Draft Survey', tanker_name: 'MT Dawn', trips: 1, item_no: 'IT-6', cost_element: 'SUR', service_from: '2026-04-10', service_to: '2026-04-20', amount: 520000, status: 'Rejected', approved_by: 'admin@prl.com.pk', approved_date: iso('2026-04-22'), remarks: 'Duplicate entry — same survey as INV-2026-0011' }),
  makeInvoice({ serial_no: 'S-2003', processing_date: '2026-08-02', contract_id: C_TH, invoice_no: 'INV-2026-0023', invoice_date: '2026-08-02', t1: 'Outward', t2: 'Tanker Handling', t3: 'Loading', tanker_name: 'MT Moon', trips: 2, item_no: 'IT-7', cost_element: 'THL', service_from: '2026-07-25', service_to: '2026-08-02', amount: 1130000, status: 'Pending' }),
  makeInvoice({ serial_no: 'S-3002', processing_date: '2026-08-15', contract_id: C_SM, invoice_no: 'INV-2026-0032', invoice_date: '2026-08-15', t1: 'Storage', t2: 'Stock Measurement', t3: 'Line Survey', item_no: 'IT-8', cost_element: 'SM', service_from: '2026-08-05', service_to: '2026-08-15', amount: 275000, status: 'Pending' }),
]

for (const inv of invoices) {
  const rel = contractById(inv.contract_id)
  inv.contracts = embedContract(rel)
}

const pos: PoVersion[] = [
  { id: uid(), invoice_id: invoices[3].id, serial_no: 'PO-20260723001', generated_at: iso('2026-07-23'), generated_by: 'admin@prl.com.pk' },
  { id: uid(), invoice_id: invoices[4].id, serial_no: 'PO-20260514001', generated_at: iso('2026-05-14'), generated_by: 'admin@prl.com.pk' },
]

const auditLog: AuditEntry[] = [
  { id: uid(), timestamp: iso('2026-08-20'), user_email: 'admin@prl.com.pk', action: 'Login', entity_type: 'Session', entity_id: null, summary: 'Admin signed in', entity: 'Session', description: 'Admin signed in' },
  { id: uid(), timestamp: iso('2026-07-23'), user_email: 'admin@prl.com.pk', action: 'GeneratePO', entity_type: 'PaymentOrder', entity_id: pos[0].id, summary: `PO ${pos[0].serial_no} generated for invoice INV-2026-0022`, entity: 'PaymentOrder', description: `PO ${pos[0].serial_no} generated for invoice INV-2026-0022` },
  { id: uid(), timestamp: iso('2026-07-23'), user_email: 'admin@prl.com.pk', action: 'Approve', entity_type: 'Invoice', entity_id: invoices[3].id, summary: 'Invoice INV-2026-0022 approved', entity: 'Invoice', description: 'Invoice INV-2026-0022 approved' },
  { id: uid(), timestamp: iso('2026-04-22'), user_email: 'admin@prl.com.pk', action: 'Reject', entity_type: 'Invoice', entity_id: invoices[5].id, summary: 'Invoice INV-2026-0013 rejected: Duplicate entry', entity: 'Invoice', description: 'Invoice INV-2026-0013 rejected: Duplicate entry' },
]

const uploadedFiles = new Map<string, string>()

function audit(action: string, entity_type: string, entity_id: string | null, summary: string): void {
  auditLog.unshift({
    id: uid(),
    timestamp: nowIso(),
    user_email: 'admin@prl.com.pk',
    action,
    entity_type,
    entity_id,
    summary,
    entity: entity_type,
    description: summary,
  })
}

function fail(message: string): never {
  throw new Error(message)
}

function toMoney(v: unknown): number {
  return Number(v ?? 0) || 0
}

function listInvoice(partial: Invoice): Invoice {
  return { ...partial, contracts: embedContract(contractById(partial.contract_id)) }
}

function makePoForInvoice(inv: Invoice): PoVersion {
  const existing = pos.find((p) => p.invoice_id === inv.id)
  if (existing) return existing
  const po: PoVersion = { id: uid(), invoice_id: inv.id, serial_no: `PO-${Date.now()}`, generated_at: nowIso(), generated_by: 'admin@prl.com.pk' }
  pos.unshift(po)
  audit('GeneratePO', 'PaymentOrder', po.id, `PO ${po.serial_no} generated for invoice ${inv.invoice_no}`)
  return po
}

function dashboardPayload(): unknown {
  const inv = invoices
  const totalInv = inv.length
  const totalVal = inv.reduce((s, i) => s + i.amount, 0)
  const approved = inv.filter((i) => i.status === 'Approved')
  const pending = inv.filter((i) => i.status === 'Pending')
  const rejected = inv.filter((i) => i.status === 'Rejected')
  const approvedVal = approved.reduce((s, i) => s + i.amount, 0)
  const pendingVal = pending.reduce((s, i) => s + i.amount, 0)
  const rejectedVal = rejected.reduce((s, i) => s + i.amount, 0)

  const today = new Date()
  const openContracts = contracts.filter((c) => !c.end_date || new Date(c.end_date) >= today).length
  const expiring = contracts.filter((c) => {
    if (!c.end_date) return false
    const d = daysFromNow(c.end_date)
    return d >= 0 && d <= 60
  }).length

  const monthly: Record<string, { month: string; total: number; count: number }> = {}
  for (const i of inv) {
    if (!i.invoice_date) continue
    const key = i.invoice_date.slice(0, 7)
    monthly[key] ??= { month: key, total: 0, count: 0 }
    monthly[key].total += i.amount
    monthly[key].count += 1
  }
  const trend = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month))

  const utilization = contracts.map((c) => {
    const used = inv
      .filter((i) => i.contract_id === c.id && ['Approved', 'Accepted'].includes(i.status))
      .reduce((s, i) => s + i.amount, 0)
    const value = toMoney(c.value)
    return {
      contractId: c.id,
      contractNo: c.contract_no,
      value,
      used,
      remaining: Math.max(0, value - used),
      pct: value > 0 ? Math.min(100, (used / value) * 100) : 0,
    }
  })

  return {
    kpis: {
      totalInvoices: totalInv,
      totalValue: totalVal,
      approvedValue: approvedVal,
      approvedCount: approved.length,
      pendingValue: pendingVal,
      pendingCount: pending.length,
      rejectedValue: rejectedVal,
      rejectedCount: rejected.length,
      openContracts,
      activeUsers: users.filter((u) => u.status === 'active').length,
      expiringContracts: expiring,
      avgInvoice: totalInv ? totalVal / totalInv : 0,
    },
    trend,
    statusBreakdown: { approved: approved.length, pending: pending.length, rejected: rejected.length },
    utilization,
  }
}

function summaryPayload(): unknown {
  const inv = invoices
  const byVendor: Record<string, { vendor: string; total: number; count: number; approved: number }> = {}
  const byService: Record<string, number> = {}
  for (const i of inv) {
    const rel = embedContract(contractById(i.contract_id))
    const vendorName = rel?.vendors?.[0]?.name ?? 'Unknown'
    const service = rel?.service ?? 'Unknown'
    byVendor[vendorName] ??= { vendor: vendorName, total: 0, count: 0, approved: 0 }
    byVendor[vendorName].total += i.amount
    byVendor[vendorName].count += 1
    if (i.status === 'Approved') byVendor[vendorName].approved += i.amount
    byService[service] = (byService[service] ?? 0) + i.amount
  }
  return {
    byVendor: Object.values(byVendor).sort((a, b) => b.total - a.total),
    byService: Object.entries(byService).map(([service, total]) => ({ service, total })),
    approvalSummary: {
      total: inv.length,
      approved: inv.filter((i) => i.status === 'Approved').length,
      pending: inv.filter((i) => i.status === 'Pending').length,
      rejected: inv.filter((i) => i.status === 'Rejected').length,
      approvedValue: inv.filter((i) => i.status === 'Approved').reduce((s, i) => s + i.amount, 0),
      pendingValue: inv.filter((i) => i.status === 'Pending').reduce((s, i) => s + i.amount, 0),
      rejectedValue: inv.filter((i) => i.status === 'Rejected').reduce((s, i) => s + i.amount, 0),
    },
  }
}

function pendingFollowups(): { pending: unknown[]; total: number } {
  const list = invoices
    .filter((i) => i.status === 'Pending')
    .map((inv) => {
      const rel = embedContract(contractById(inv.contract_id))
      const vendor = vendors.find((v) => v.id === contractById(inv.contract_id)?.vendor_id) ?? null
      return {
        invoiceId: inv.id,
        invoiceNo: inv.invoice_no,
        invoiceDate: inv.invoice_date,
        amount: Number(inv.amount || 0),
        contractNo: rel?.contract_no ?? '',
        vendorId: contractById(inv.contract_id)?.vendor_id ?? '',
        vendorName: vendor?.name ?? 'Unknown',
        email: vendor?.email ?? '',
      }
    })
    .filter((f) => f.email)
  return { pending: list, total: list.length }
}

/**
 * Rows arrive already mapped + normalized by the client wizard:
 * canonical schema keys (see lib/importMapping.ts IMPORT_SCHEMAS).
 */
interface DemoImportBatch {
  id: string
  import_type: string
  file_name: string
  total_rows: number
  duplicate_rows: number
  status: 'pending' | 'approved' | 'rejected'
  mode: 'append' | 'overwrite'
  rows: Record<string, unknown>[]
  conflicts: string[]
  submitted_by: string
  decided_by: string | null
  decided_at: string | null
  created_at: string
}
const importBatches: DemoImportBatch[] = []

function detectDemoConflicts(type: string, rows: Record<string, unknown>[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    if (type === 'invoices') {
      const no = String(r.invoice_no ?? '').trim()
      if (no && invoices.some((i) => i.invoice_no === no)) out.push(`invoice no "${no}" already exists in system`)
    } else if (type === 'contracts') {
      const no = String(r.contract_no ?? '').trim()
      if (no && contracts.some((c) => c.contract_no === no)) out.push(`contract no "${no}" already exists in system`)
    } else {
      const name = String(r.name ?? '').trim()
      if (name && vendors.some((v) => v.name.toLowerCase() === name.toLowerCase())) out.push(`vendor name "${name}" already exists in system`)
    }
  }
  return out
}

function applyImportRowsDemo(
  type: string,
  rows: Record<string, unknown>[],
  overwrite = false,
): { imported: number; skipped: number; updated: number } {
  let imported = 0
  let skipped = 0
  let updated = 0
  if (type === 'vendors') {
    for (const r of rows) {
      const name = String(r.name ?? '').trim()
      if (!name) { skipped += 1; continue }
      const existing = vendors.find((v) => v.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        if (overwrite) {
          if (r.email) existing.email = String(r.email)
          updated += 1
        } else skipped += 1
        continue
      }
      vendors.push({ id: uid(), name, email: (r.email as string) ?? null, created_at: nowIso(), updated_at: nowIso() })
      imported += 1
    }
  } else if (type === 'contracts') {
    for (const r of rows) {
      const contractNo = String(r.contract_no ?? '').trim()
      const vendorName = String(r.vendor ?? '').trim()
      if (!contractNo || !vendorName) { skipped += 1; continue }
      let vendor = vendors.find((x) => x.name.toLowerCase() === vendorName.toLowerCase())
      if (!vendor) {
        vendor = { id: uid(), name: vendorName, email: null, created_at: nowIso(), updated_at: nowIso() }
        vendors.push(vendor)
      }
      const st = String(r.status ?? 'Open').toLowerCase()
      const status = ['open', 'closed', 'expiring'].includes(st) ? st.charAt(0).toUpperCase() + st.slice(1) : 'Open'
      const payload = {
        contract_no: contractNo,
        vendor_id: vendor.id,
        service: (r.service as string) ?? null,
        start_date: (r.start_date as string) ?? null,
        end_date: (r.end_date as string) ?? null,
        value: Number(r.value ?? 0),
        status,
        vendors: [{ name: vendor.name, email: vendor.email }],
      }
      const idx = contracts.findIndex((c) => c.contract_no === contractNo)
      if (idx >= 0) {
        if (overwrite) {
          contracts[idx] = { ...contracts[idx]!, ...payload }
          updated += 1
        } else skipped += 1
        continue
      }
      contracts.push({ id: uid(), ...payload })
      imported += 1
    }
  } else {
    for (const r of rows) {
      const invoiceNo = String(r.invoice_no ?? '').trim()
      if (!invoiceNo) { skipped += 1; continue }
      const contractNo = String(r.contract_no ?? '').trim()
      const contract = contractNo ? contracts.find((c) => c.contract_no === contractNo) : undefined
      const existingIdx = invoices.findIndex((i) => i.invoice_no === invoiceNo)
      if (existingIdx >= 0 && overwrite) {
        const inv = invoices[existingIdx]!
        if (r.amount !== null && r.amount !== undefined) inv.amount = Number(r.amount)
        if (r.invoice_date) inv.invoice_date = String(r.invoice_date)
        if (r.serial_no) inv.serial_no = String(r.serial_no)
        if (r.t1) inv.t1 = String(r.t1)
        if (r.t2) inv.t2 = String(r.t2)
        if (r.t3) inv.t3 = String(r.t3)
        if (r.tanker_name) inv.tanker_name = String(r.tanker_name)
        if (r.remarks) inv.remarks = String(r.remarks)
        const st = String(r.status ?? '').toLowerCase()
        if (st && ['pending', 'approved', 'rejected', 'draft', 'void'].includes(st)) {
          inv.status = st.charAt(0).toUpperCase() + st.slice(1)
        }
        updated += 1
        continue
      }
      if (existingIdx >= 0) { skipped += 1; continue }
      const inv = makeInvoice({
        serial_no: (r.serial_no as string) ?? null,
        invoice_no: invoiceNo,
        invoice_date: (r.invoice_date as string) ?? null,
        contract_id: contract?.id ?? null,
        t1: (r.t1 as string) ?? null,
        t2: (r.t2 as string) ?? null,
        t3: (r.t3 as string) ?? null,
        amount: Number(r.amount ?? 0),
      })
      if (r.processing_date) inv.processing_date = String(r.processing_date)
      if (r.tanker_name) inv.tanker_name = String(r.tanker_name)
      const st = String(r.status ?? 'Pending').toLowerCase()
      inv.status = ['pending', 'approved', 'rejected', 'draft', 'void'].includes(st)
        ? st.charAt(0).toUpperCase() + st.slice(1)
        : 'Pending'
      const trips = Number(r.trips)
      if (Number.isFinite(trips)) (inv as unknown as Record<string, unknown>).trips = Math.trunc(trips)
      for (const k of ['item_no', 'cost_element', 'service_from', 'service_to', 'approved_by', 'approved_amount', 'remarks'] as const) {
        if (r[k] !== null && r[k] !== undefined && r[k] !== '') (inv as unknown as Record<string, unknown>)[k] = r[k]
      }
      if (r.approved_date) (inv as unknown as Record<string, unknown>).approved_date = r.approved_date
      inv.contracts = embedContract(contractById(inv.contract_id))
      invoices.unshift(inv)
      imported += 1
    }
  }
  if (imported + updated > 0) audit('Import', 'Data', null, `Imported ${imported} / updated ${updated} ${type} rows`)
  return { imported, skipped, updated }
}

function matchPath(path: string): string {
  return path.split('?')[0].replace(/\/+$/, '')
}

function seg(path: string): string[] {
  return matchPath(path).split('/').filter(Boolean)
}

export async function mockRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 180))

  const parts = seg(path)
  const m = method.toUpperCase()

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const formType = isForm ? String((body as FormData).get('type') ?? '') : ''

  if (m === 'GET' && path === '/api/reports/dashboard') return dashboardPayload() as T
  if (m === 'GET' && path === '/api/reports/summary') return summaryPayload() as T

  if (m === 'GET' && parts[0] === 'api' && parts[1] === 'invoices') {
    if (parts.length === 2) {
      const qs = new URLSearchParams(path.split('?')[1] ?? '')
      const status = qs.get('status') ?? 'all'
      const contract = qs.get('contract') ?? 'all'
      const search = (qs.get('search') ?? '').toLowerCase()
      let list = invoices
      if (status && status !== 'all') list = list.filter((i) => i.status === status)
      if (contract && contract !== 'all') list = list.filter((i) => i.contract_id === contract)
      if (search) list = list.filter((i) => `${i.invoice_no} ${i.serial_no ?? ''}`.toLowerCase().includes(search))
      return { invoices: [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(listInvoice) } as T
    }
    if (parts.length === 4 && parts[3] === 'po') {
      const list = pos.filter((p) => p.invoice_id === parts[2])
      return { poVersions: list } as T
    }
    const inv = invoices.find((i) => i.id === parts[2])
    if (!inv) fail('Invoice not found')
    return { invoice: { ...inv, contracts: contractById(inv.contract_id) } } as T
  }

  if (m === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'invoices') {
    const b = (body ?? {}) as Record<string, unknown>
    if (!b.invoice_no) fail('Invoice number is required')
    const inv = makeInvoice({
      serial_no: (b.serial_no as string) ?? null,
      processing_date: (b.processing_date as string) ?? (b.invoice_date as string) ?? null,
      contract_id: (b.contract_id as string) ?? null,
      invoice_no: String(b.invoice_no),
      invoice_date: (b.invoice_date as string) ?? null,
      t1: (b.t1 as string) ?? null,
      t2: (b.t2 as string) ?? null,
      t3: (b.t3 as string) ?? null,
      tanker_name: (b.tanker_name as string) ?? null,
      trips: b.trips ? Number(b.trips) : null,
      item_no: (b.item_no as string) ?? null,
      cost_element: (b.cost_element as string) ?? null,
      service_from: (b.service_from as string) ?? null,
      service_to: (b.service_to as string) ?? null,
      amount: Number(b.amount ?? 0),
      status: (b.status as string) ?? 'Pending',
      remarks: (b.remarks as string) ?? null,
    })
    inv.contracts = embedContract(contractById(inv.contract_id))
    invoices.unshift(inv)
    audit('Create', 'Invoice', inv.id, `Invoice ${inv.invoice_no} created`)
    return { invoice: listInvoice(inv) } as T
  }

  if (m === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'invoices' && parts[3] === 'approve') {
    const inv = invoices.find((i) => i.id === parts[2])
    if (!inv) fail('Invoice not found')
    inv.status = 'Approved'
    inv.approved_by = 'admin@prl.com.pk'
    inv.approved_date = nowIso()
    inv.approved_amount = (body as Record<string, unknown>)?.approvedAmount ? Number((body as Record<string, unknown>).approvedAmount) : null
    inv.updated_at = nowIso()
    audit('Approve', 'Invoice', inv.id, `Invoice ${inv.invoice_no} approved`)
    const po = makePoForInvoice(inv)
    return { invoice: listInvoice(inv), po } as T
  }

  if (m === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'invoices' && parts[3] === 'reject') {
    const reason = String((body as Record<string, unknown>)?.reason ?? '').trim()
    if (!reason) fail('Rejection reason is required')
    const inv = invoices.find((i) => i.id === parts[2])
    if (!inv) fail('Invoice not found')
    inv.status = 'Rejected'
    inv.approved_by = 'admin@prl.com.pk'
    inv.approved_date = nowIso()
    inv.remarks = reason
    inv.updated_at = nowIso()
    audit('Reject', 'Invoice', inv.id, `Invoice ${inv.invoice_no} rejected: ${reason}`)
    return { invoice: listInvoice(inv) } as T
  }

  if (m === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'invoices' && parts[3] === 'po') {
    const inv = invoices.find((i) => i.id === parts[2])
    if (!inv) fail('Invoice not found')
    if (inv.status !== 'Approved') fail('Payment order requires an approved invoice')
    const po = makePoForInvoice(inv)
    return { po } as T
  }

  if (m === 'PUT' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'invoices') {
    const inv = invoices.find((i) => i.id === parts[2])
    if (!inv) fail('Invoice not found')
    const updates = (body ?? {}) as Record<string, unknown>
    const fields: (keyof Invoice)[] = ['serial_no', 'processing_date', 'contract_id', 'invoice_no', 'invoice_date', 't1', 't2', 't3', 'tanker_name', 'trips', 'item_no', 'cost_element', 'service_from', 'service_to', 'amount', 'status', 'remarks']
    for (const f of fields) if (f in updates) inv[f] = updates[f] as never
    inv.updated_at = nowIso()
    inv.updated_by = 'admin@prl.com.pk'
    audit('Update', 'Invoice', inv.id, `Invoice ${inv.invoice_no} updated`)
    return { invoice: listInvoice(inv) } as T
  }

  if (m === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'invoices') {
    const idx = invoices.findIndex((i) => i.id === parts[2])
    if (idx === -1) fail('Invoice not found')
    if (pos.some((p) => p.invoice_id === parts[2])) fail('Cannot delete invoice with generated payment orders')
    invoices.splice(idx, 1)
    audit('Delete', 'Invoice', parts[2], 'Invoice deleted')
    return { ok: true } as T
  }

  if (m === 'GET' && path === '/api/contracts') {
    return { contracts: [...contracts].sort((a, b) => a.contract_no.localeCompare(b.contract_no)) } as T
  }
  if (m === 'POST' && path === '/api/contracts') {
    const b = (body ?? {}) as Record<string, unknown>
    if (!b.contract_no || !b.vendor_id) fail('Contract number and vendor are required')
    const c: Contract = {
      id: uid(),
      contract_no: String(b.contract_no),
      vendor_id: String(b.vendor_id),
      service: (b.service as string) ?? null,
      start_date: (b.start_date as string) ?? null,
      end_date: (b.end_date as string) ?? null,
      value: Number(b.value ?? 0),
      status: (b.status as string) ?? 'Open',
      vendors: (() => {
        const v = vendors.find((x) => x.id === b.vendor_id)
        return v ? [{ name: v.name, email: v.email }] : null
      })(),
    }
    contracts.push(c)
    return { contract: c } as T
  }
  if (m === 'PUT' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'contracts') {
    const c = contracts.find((x) => x.id === parts[2])
    if (!c) fail('Contract not found')
    const b = (body ?? {}) as Record<string, unknown>
    const fields: (keyof Contract)[] = ['contract_no', 'vendor_id', 'service', 'start_date', 'end_date', 'value', 'status']
    for (const f of fields) if (f in b) c[f] = b[f] as never
    const v = vendors.find((x) => x.id === c.vendor_id)
    c.vendors = v ? [{ name: v.name, email: v.email }] : null
    return { contract: c } as T
  }
  if (m === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'contracts') {
    const idx = contracts.findIndex((x) => x.id === parts[2])
    if (idx === -1) fail('Contract not found')
    if (invoices.some((i) => i.contract_id === parts[2])) fail('Cannot delete contract with linked invoices')
    contracts.splice(idx, 1)
    return { ok: true } as T
  }

  if (m === 'GET' && path === '/api/vendors') return { vendors: [...vendors].sort((a, b) => a.name.localeCompare(b.name)) } as T
  if (m === 'POST' && path === '/api/vendors') {
    const b = (body ?? {}) as Record<string, unknown>
    if (!b.name) fail('Vendor name is required')
    const v: Vendor = { id: uid(), name: String(b.name), email: (b.email as string) ?? null, created_at: nowIso(), updated_at: nowIso() }
    vendors.push(v)
    return { vendor: v } as T
  }
  if (m === 'PUT' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'vendors') {
    const v = vendors.find((x) => x.id === parts[2])
    if (!v) fail('Vendor not found')
    const b = (body ?? {}) as Record<string, unknown>
    if (b.name !== undefined) v.name = String(b.name)
    if (b.email !== undefined) v.email = (b.email as string) ?? null
    v.updated_at = nowIso()
    return { vendor: v } as T
  }
  if (m === 'PUT' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'vendors' && parts[3] === 'email') {
    const v = vendors.find((x) => x.id === parts[2])
    if (!v) fail('Vendor not found')
    v.email = ((body ?? {}) as Record<string, unknown>).email as string ?? null
    v.updated_at = nowIso()
    return { vendor: v } as T
  }
  if (m === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'vendors') {
    const idx = vendors.findIndex((x) => x.id === parts[2])
    if (idx === -1) fail('Vendor not found')
    if (contracts.some((c) => c.vendor_id === parts[2])) fail('Cannot delete vendor with linked contracts')
    vendors.splice(idx, 1)
    return { ok: true } as T
  }

  if (m === 'GET' && path === '/api/service-matrix') return { serviceMatrix: [...serviceMatrix].sort((a, b) => a.t1.localeCompare(b.t1)) } as T
  if (m === 'POST' && path === '/api/service-matrix') {
    const b = (body ?? {}) as Record<string, unknown>
    if (!b.t1) fail('T1 is required')
    const row: ServiceRow = { id: uid(), t1: String(b.t1), t2: (b.t2 as string) ?? null, t3: (b.t3 as string) ?? null, cost_element: (b.cost_element as string) ?? null, tanker_required: Boolean(b.tanker_required), trips: Boolean(b.trips) }
    serviceMatrix.push(row)
    return { service: row } as T
  }
  if (m === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'service-matrix') {
    const idx = serviceMatrix.findIndex((x) => x.id === parts[2])
    if (idx === -1) fail('Service row not found')
    serviceMatrix.splice(idx, 1)
    return { ok: true } as T
  }

  if (m === 'GET' && path === '/api/cost-elements') return { costElements } as T
  if (m === 'POST' && path === '/api/cost-elements') {
    const b = (body ?? {}) as Record<string, unknown>
    if (!b.code) fail('Code is required')
    const row: CostRow = { code: String(b.code), name: (b.name as string) ?? null }
    costElements.push(row)
    return { costElement: row } as T
  }
  if (m === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'cost-elements') {
    const code = decodeURIComponent(parts[2])
    const idx = costElements.findIndex((x) => x.code === code)
    if (idx === -1) fail('Cost element not found')
    costElements.splice(idx, 1)
    return { ok: true } as T
  }

  if (m === 'GET' && path === '/api/users') return { users } as T
  if (m === 'POST' && path === '/api/users') {
    const b = (body ?? {}) as Record<string, unknown>
    if (!b.username) fail('Username is required')
    const u: UserRow = { id: uid(), username: String(b.username), full_name: (b.full_name as string) ?? '', email: (b.email as string) ?? '', role_id: (b.role_id as string) ?? null, status: (b.status as string) ?? 'active', roles: roleById((b.role_id as string) ?? null) }
    users.push(u)
    return { user: u } as T
  }
  if (m === 'PUT' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'users') {
    const u = users.find((x) => x.id === parts[2])
    if (!u) fail('User not found')
    const b = (body ?? {}) as Record<string, unknown>
    const fields: (keyof UserRow)[] = ['username', 'full_name', 'email', 'role_id', 'status']
    for (const f of fields) if (f in b) u[f] = b[f] as never
    u.roles = roleById(u.role_id)
    return { user: u } as T
  }
  if (m === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'users') {
    const idx = users.findIndex((x) => x.id === parts[2])
    if (idx === -1) fail('User not found')
    users.splice(idx, 1)
    return { ok: true } as T
  }

  if (m === 'GET' && path === '/api/roles') return { roles } as T
  if (m === 'GET' && path === '/api/permissions') return { permissions } as T
  if (m === 'GET' && path === '/api/audit-log') return { auditLog: auditLog.slice(0, 200) } as T

  if (m === 'GET' && path === '/api/settings') return { settings } as T
  if (m === 'PUT' && path === '/api/settings') {
    const entries = (body as { settings?: { key: string; value: string }[] })?.settings ?? []
    if (!Array.isArray(entries) || !entries.length) fail('settings array is required')
    for (const entry of entries) {
      const s = settings.find((x) => x.key === entry.key)
      if (s) s.value = String(entry.value ?? '')
      else settings.push({ key: entry.key, value: String(entry.value ?? '') })
    }
    return { ok: true, updated: entries.length } as T
  }

  if (m === 'GET' && path === '/api/followups/pending') return pendingFollowups() as T
  if (m === 'POST' && path === '/api/followups/send') {
    const ids = (body as { invoiceIds?: string[] })?.invoiceIds ?? []
    if (!Array.isArray(ids) || !ids.length) fail('invoiceIds array is required')
    audit('SendFollowups', 'Email', null, `Sent ${ids.length} follow-up email(s)`)
    return { sent: ids, failed: [] } as T
  }

  if (m === 'GET' && path === '/api/payment-orders') {
    const paymentOrders = pos.map((p) => {
      const inv = invoices.find((i) => i.id === p.invoice_id)
      const rel = embedContract(contractById(inv?.contract_id ?? null))
      return {
        id: p.id,
        serial_no: p.serial_no,
        generated_by: p.generated_by,
        generated_at: p.generated_at,
        status: 'Generated',
        invoices: inv
          ? {
              invoice_no: inv.invoice_no,
              invoice_date: inv.invoice_date,
              amount: inv.amount,
              status: inv.status,
              contracts: { contract_no: rel?.contract_no ?? null, vendors: rel?.vendors ?? null },
            }
          : null,
      }
    })
    return { paymentOrders } as T
  }

  if (m === 'POST' && path === '/api/uploads') {
    const file = isForm ? (body as FormData).get('file') : null
    const name = file instanceof File ? file.name : 'demo-file.xlsx'
    const fileId = uid()
    uploadedFiles.set(fileId, name)
    return { fileId, fileName: name } as T
  }

  if (m === 'POST' && path === '/api/import/parse') {
    return { type: formType || 'invoices', fileName: 'upload.xlsx', preview: [], issues: [], totalRows: 0, validRows: 0 } as T
  }
  if (m === 'POST' && path === '/api/import/confirm') {
    const b = (body ?? {}) as { type?: string; rows?: Record<string, unknown>[]; fileName?: string; mode?: string }
    const type = b.type ?? 'invoices'
    const rows = b.rows ?? []
    const mode = b.mode === 'overwrite' ? 'overwrite' : 'append'
    const conflicts = detectDemoConflicts(type, rows)
    if (mode === 'overwrite' || conflicts.length === 0) {
      const { imported, skipped, updated } = applyImportRowsDemo(type, rows, mode === 'overwrite')
      return { status: 'approved', imported, skipped, updated, duplicates: conflicts.length, type } as T
    }
    const batch: DemoImportBatch = {
      id: uid(),
      import_type: type,
      file_name: b.fileName ?? 'upload.xlsx',
      total_rows: rows.length,
      duplicate_rows: conflicts.length,
      status: 'pending',
      mode,
      rows,
      conflicts,
      submitted_by: 'you (demo)',
      decided_by: null,
      decided_at: null,
      created_at: nowIso(),
    }
    importBatches.unshift(batch)
    return { status: 'pending', imported: 0, skipped: 0, updated: 0, batchId: batch.id, duplicates: conflicts.length, type } as T
  }
  if (m === 'GET' && path === '/api/import/batches') {
    return { batches: importBatches } as T
  }
  if (m === 'POST' && parts.length === 5 && parts[1] === 'import' && parts[2] === 'batches' && parts[4] === 'decide') {
    const batch = importBatches.find((x) => x.id === parts[3])
    if (!batch) fail('Batch not found')
    if (batch.status !== 'pending') fail(`Batch already ${batch.status}`)
    const decision = String((body as { decision?: string } | null)?.decision ?? 'approve')
    const overwrite = (body as { overwrite?: boolean } | null)?.overwrite === true
    if (decision === 'approve') {
      const { imported, skipped, updated } = applyImportRowsDemo(batch.import_type, batch.rows, overwrite)
      batch.decided_by = 'you (demo)'
      batch.decided_at = nowIso()
      batch.status = 'approved'
      return { batch: { ...batch, imported, skipped, updated } } as T
    }
    batch.decided_by = 'you (demo)'
    batch.decided_at = nowIso()
    batch.status = 'rejected'
    return { batch } as T
  }

  if (m === 'POST' && path === '/api/invoices/bulk-approve') {
    const ids = ((body as { ids?: string[] } | null)?.ids ?? []).map(String)
    let approved = 0
    let poCreated = 0
    for (const id of ids) {
      const inv = invoices.find((x) => x.id === id)
      if (!inv) continue
      inv.status = 'Approved'
      approved++
      poCreated++
    }
    if (approved > 0) audit('BulkApprove', 'Invoice', null, `${approved} invoices bulk-approved`)
    return { approved, poCreated, failed: [] } as T
  }
  if (m === 'POST' && path === '/api/invoices/bulk-reject') {
    const b = (body ?? {}) as { ids?: string[]; reason?: string }
    const reason = String(b.reason ?? '').trim()
    if (!reason) fail('Rejection reason is required')
    let rejected = 0
    for (const id of (b.ids ?? []).map(String)) {
      const inv = invoices.find((x) => x.id === id)
      if (!inv) continue
      inv.status = 'Rejected'
      inv.remarks = reason
      rejected++
    }
    if (rejected > 0) audit('BulkReject', 'Invoice', null, `${rejected} invoices bulk-rejected: ${reason}`)
    return { rejected } as T
  }

  if (m === 'POST' && parts.length === 3 && parts[1] === 'compare' && parts[2] === 'parse') {
    const which = isForm ? String((body as FormData).get('which') ?? 'base') : 'base'
    const file = isForm ? (body as FormData).get('file') : null
    const name = file instanceof File ? file.name : 'demo-file.pdf'
    if (which === 'base') {
      return {
        fileName: name,
        format: 'pdf',
        columns: ['invoice_no', 'quantity', 'temp', 'amount'],
        rows: [
          { invoice_no: 'INV-2026-0011', quantity: '1,900 L', temp: '25.4 °C', amount: '850,000' },
          { invoice_no: 'INV-2026-0012', quantity: '2,400 L', temp: '26.1 °C', amount: '1,120,000' },
          { invoice_no: 'INV-2026-0013', quantity: '980 L', temp: '24.8 °C', amount: '430,500' },
          { invoice_no: 'INV-2026-0014', quantity: '3,150 L', temp: '27.0 °C', amount: '1,502,250' },
        ],
      } as T
    }
    return {
      fileName: name,
      format: 'csv',
      columns: ['invoice_no', 'quantity', 'temp', 'amount'],
      rows: [
        { invoice_no: 'INV-2026-0011', quantity: '501.9 gal', temp: '77.7 °F', amount: '850,000' },
        { invoice_no: 'INV-2026-0012', quantity: '634 gal', temp: '78.9 °F', amount: '1,120,000' },
        { invoice_no: 'INV-2026-0013', quantity: '258.8 gal', temp: '76.6 °F', amount: '455,500' },
        { invoice_no: 'INV-2026-0015', quantity: '410 gal', temp: '80.2 °F', amount: '620,000' },
      ],
    } as T
  }
  if (m === 'POST' && path === '/api/compare') {
    const b = (body ?? {}) as { baseFileName?: string; compareFileName?: string; mismatches?: unknown[] }
    return {
      comparisonId: uid(),
      baseFileName: b.baseFileName ?? 'demo-file.pdf',
      compareFileName: b.compareFileName ?? 'demo-file.csv',
      summary: { totalRows: 4, matchedRows: 2 },
    } as T
  }
  if (m === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'compare' && parts[3] === 'send-discrepancy') {
    const vendorId = (body as { vendorId?: string })?.vendorId
    const v = vendors.find((x) => x.id === vendorId)
    if (!v?.email) fail('No surveyor email available. Add an email to the vendor first.')
    audit('SendDiscrepancy', 'Email', null, `Discrepancy email sent to ${v.name}`)
    return { ok: true, recipient: v.email } as T
  }

  fail(`Unhandled demo endpoint: ${method} ${path}`)
}
