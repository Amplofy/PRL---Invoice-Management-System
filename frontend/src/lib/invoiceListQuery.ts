import { fiscalBounds } from './fiscal'
import type { SortDirection } from './export'

export type InvoiceListMix = 'opex' | 'misc'

export interface InvoiceListQuery {
  fy?: string
  q?: string
  status?: string
  vendor?: string
  contract?: string
  month?: string
  fyMonth?: number
  quarter?: string
  mix?: InvoiceListMix
  sort?: string
  dir?: SortDirection
}

const MIX = new Set<InvoiceListMix>(['opex', 'misc'])

export function fyMonthKey(fy: string, idx: number): string | null {
  const bounds = fiscalBounds(fy)
  if (!bounds || idx < 0 || idx > 11) return null
  const d = new Date(bounds.start.getFullYear(), bounds.start.getMonth() + idx, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function buildInvoiceListSearch(query: InvoiceListQuery): string {
  const p = new URLSearchParams()
  if (query.fy) p.set('fy', query.fy)
  if (query.q?.trim()) p.set('q', query.q.trim())
  if (query.status) p.set('status', query.status)
  if (query.vendor) p.set('vendor', query.vendor)
  if (query.contract) p.set('contract', query.contract)
  if (query.month) p.set('month', query.month)
  if (query.fyMonth != null && Number.isFinite(query.fyMonth)) p.set('fyMonth', String(query.fyMonth))
  if (query.quarter) p.set('quarter', query.quarter)
  if (query.mix) p.set('mix', query.mix)
  if (query.sort) p.set('sort', query.sort)
  if (query.dir) p.set('dir', query.dir)
  return p.toString()
}

export function invoicesListPath(query: InvoiceListQuery = {}): string {
  const s = buildInvoiceListSearch(query)
  return s ? `/invoices?${s}` : '/invoices'
}

export function invoiceListQueryHasValues(query: InvoiceListQuery): boolean {
  return Boolean(
    query.fy
      || query.q
      || query.status
      || query.vendor
      || query.contract
      || query.month
      || query.fyMonth != null
      || query.quarter
      || query.mix
      || query.sort
      || query.dir,
  )
}

export function parseInvoiceListSearch(search: string | URLSearchParams): InvoiceListQuery {
  const p = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search
  const fyMonthRaw = p.get('fyMonth')
  const fyMonth = fyMonthRaw == null || fyMonthRaw === '' ? undefined : Number(fyMonthRaw)
  const mixRaw = p.get('mix')
  const dirRaw = p.get('dir')
  return {
    fy: p.get('fy') || undefined,
    q: p.get('q') || undefined,
    status: p.get('status') || undefined,
    vendor: p.get('vendor') || undefined,
    contract: p.get('contract') || undefined,
    month: p.get('month') || undefined,
    fyMonth: fyMonth != null && Number.isFinite(fyMonth) ? Math.max(0, Math.min(11, Math.round(fyMonth))) : undefined,
    quarter: p.get('quarter') || undefined,
    mix: mixRaw && MIX.has(mixRaw as InvoiceListMix) ? (mixRaw as InvoiceListMix) : undefined,
    sort: p.get('sort') || undefined,
    dir: dirRaw === 'asc' || dirRaw === 'desc' ? dirRaw : undefined,
  }
}
