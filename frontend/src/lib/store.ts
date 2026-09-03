import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from './api'
import { emitDomain, subscribeDomain, type DomainEntity, type DomainEvent } from './notify'
import { currentFiscalYear } from './fiscal'
import { invoiceListPath, invalidateInvoiceWindow } from './invoiceWindow'

export interface InvoiceLite {
  id: string
  invoice_no: string | null
  invoice_date: string | null
  contract_id: string | null
  cost_element: string | null
  amount: number
  status: string
  contracts: { contract_no: string | null; vendors: Array<{ name: string | null }> | null } | null
}

export interface ContractLite {
  id: string
  contract_no: string
  value: number | null
  status: string | null
  vendors: Array<{ name: string | null }> | null
}

export interface VendorLite {
  id: string
  name: string
  email: string | null
}

export interface BudgetLine {
  id: string
  fy: string
  cost_element: string
  amount: number
  notes: string
}

export interface SettingLite {
  key: string
  value: string
}

export interface FollowupLite {
  invoiceId: string
  invoiceNo: string | null
  vendorName: string
  amount: number
  status: string
}

export interface PaymentOrderLite {
  id: string
  serial_no: string
  invoice_no: string | null
  amount: number
  generated_at: string
  status: string
  released_amount?: number | null
  released_at?: string | null
  released_by?: string | null
}

export interface DomainSnapshot {
  invoices: InvoiceLite[]
  contracts: ContractLite[]
  vendors: VendorLite[]
  budgets: BudgetLine[]
  settings: SettingLite[]
  followups: FollowupLite[]
  paymentOrders: PaymentOrderLite[]
}

interface CacheState extends DomainSnapshot {}

const cache: CacheState = {
  invoices: [],
  contracts: [],
  vendors: [],
  budgets: [],
  settings: [],
  followups: [],
  paymentOrders: [],
}

async function loadDomain<K extends keyof CacheState>(
  key: K,
  path: string,
  map: (raw: Record<string, unknown>) => CacheState[K],
) {
  try {
    const raw = (await apiGet<Record<string, unknown>>(path)) as Record<string, unknown>
    ;(cache[key] as CacheState[K]) = map(raw)
    notifyConsumers(key)
  } catch {
    /* network errors are surfaced by the page that triggered the action */
  }
}

function notifyConsumers(key: keyof CacheState) {
  const set = consumers.get(key)
  if (set) for (const fn of set) fn()
}

const consumers = new Map<keyof CacheState, Set<() => void>>()

function register(key: keyof CacheState, fn: () => void) {
  let set = consumers.get(key)
  if (!set) {
    set = new Set()
    consumers.set(key, set)
  }
  set.add(fn)
  return () => {
    set!.delete(fn)
  }
}

export const domain = {
  refreshInvoices: () =>
    loadDomain('invoices', invoiceListPath({ fy: currentFiscalYear() }), (r) => r.invoices as unknown as InvoiceLite[]),
  refreshContracts: () =>
    loadDomain('contracts', '/api/contracts', (r) => r.contracts as unknown as ContractLite[]),
  refreshVendors: () =>
    loadDomain('vendors', '/api/vendors', (r) => r.vendors as unknown as VendorLite[]),
  refreshBudgets: () =>
    loadDomain('budgets', '/api/budgets', (r) => r.budgets as unknown as BudgetLine[]),
  refreshSettings: () =>
    loadDomain('settings', '/api/settings', (r) => r.settings as unknown as SettingLite[]),
  refreshFollowups: () =>
    loadDomain('followups', '/api/followups/pending', (r) => (r.pending as unknown as FollowupLite[]) ?? []),
  refreshPaymentOrders: () =>
    loadDomain('paymentOrders', '/api/payment-orders', (r) => r.paymentOrders as unknown as PaymentOrderLite[]),
}

export function getSnapshot(): DomainSnapshot {
  return { ...cache }
}

/**
 * Subscribe a page to any mutation that touches the listed domains. The returned
 * `refresh` re-pulls the relevant domains from the source of truth so the page
 * reflects changes made in another module without a full reload.
 */
export function useLiveDomain(domains: (keyof DomainSnapshot)[]): [() => Promise<void>, number] {
  const [version, bump] = useState(0)
  const versionRef = useRef(0)

  useEffect(() => {
    const unsubs = domains.map((d) =>
      register(d, () => {
        versionRef.current += 1
        bump(versionRef.current)
      }),
    )
    const unsubDomain = subscribeDomain((e: DomainEvent) => {
      const key = domainForEvent(e.entity)
      if (key && domains.includes(key)) {
        versionRef.current += 1
        bump(versionRef.current)
      }
    })
    return () => {
      unsubs.forEach((u) => u())
      unsubDomain()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains.join(',')])

  const refresh = useCallback(async () => {
    await Promise.all(domains.map((d) => ensureLoaded(d)))
  }, [domains.join(',')])

  return [refresh, version]
}

function ensureLoaded(key: keyof DomainSnapshot): Promise<void> {
  switch (key) {
    case 'invoices':
      return domain.refreshInvoices()
    case 'contracts':
      return domain.refreshContracts()
    case 'vendors':
      return domain.refreshVendors()
    case 'budgets':
      return domain.refreshBudgets()
    case 'settings':
      return domain.refreshSettings()
    case 'followups':
      return domain.refreshFollowups()
    case 'paymentOrders':
      return domain.refreshPaymentOrders()
    default:
      return Promise.resolve()
  }
}

function domainForEvent(entity: DomainEntity): keyof DomainSnapshot | null {
  switch (entity) {
    case 'invoice':
      return 'invoices'
    case 'contract':
      return 'contracts'
    case 'vendor':
      return 'vendors'
    case 'budget':
      return 'budgets'
    case 'setting':
      return 'settings'
    case 'followup':
      return 'followups'
    case 'paymentOrder':
      return 'paymentOrders'
    default:
      return null
  }
}

/**
 * Best-effort: when any write happens, also refresh the domains that feed the
 * dashboards so the whole app feels connected. Pages that are mounted will pick
 * up the new snapshot through their subscription.
 */
export function emitCrossModule(entity: DomainEntity, action: DomainEvent['action'], id?: string) {
  emitDomain(entity, action, id)
  switch (entity) {
    case 'invoice':
      invalidateInvoiceWindow()
      void domain.refreshInvoices()
      void domain.refreshFollowups()
      void domain.refreshPaymentOrders()
      break
    case 'contract':
      void domain.refreshContracts()
      break
    case 'vendor':
      void domain.refreshVendors()
      break
    case 'budget':
      void domain.refreshBudgets()
      break
    case 'setting':
      void domain.refreshSettings()
      break
    case 'paymentOrder':
      void domain.refreshPaymentOrders()
      void domain.refreshBudgets()
      invalidateInvoiceWindow()
      void domain.refreshInvoices()
      break
    default:
      break
  }
}
