import { apiGet } from './api'
import { currentFiscalYear } from './fiscal'

export interface InvoiceWindow<T> {
  invoices: T[]
  fy: string
  total: number
  hasMore: boolean
}

interface CacheEntry {
  at: number
  data: InvoiceWindow<unknown>
}

const TTL_MS = 20_000
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<InvoiceWindow<unknown>>>()

export function invoiceListPath(
  opts: { fy?: string; status?: string; limit?: number; search?: string; contract?: string } = {},
): string {
  const q = new URLSearchParams()
  if (opts.fy && opts.fy !== 'all') q.set('fy', opts.fy)
  if (opts.status && opts.status !== 'all') q.set('status', opts.status)
  if (opts.contract && opts.contract !== 'all') q.set('contract', opts.contract)
  if (opts.search) q.set('search', opts.search)
  if (opts.limit && opts.limit > 0) q.set('limit', String(opts.limit))
  const s = q.toString()
  return s ? `/api/invoices?${s}` : '/api/invoices'
}

export function invalidateInvoiceWindow(): void {
  cache.clear()
}

export async function fetchInvoiceWindow<T>(
  opts: { fy?: string; status?: string; limit?: number } = {},
): Promise<InvoiceWindow<T>> {
  const fy = opts.fy ?? currentFiscalYear()
  const path = invoiceListPath({ ...opts, fy })
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as InvoiceWindow<T>

  const pending = inflight.get(path)
  if (pending) return pending as Promise<InvoiceWindow<T>>

  const task = (async () => {
    const raw = await apiGet<{ invoices: T[]; total?: number; hasMore?: boolean; fy?: string }>(path)
    const invoices = raw.invoices ?? []
    const data: InvoiceWindow<T> = {
      invoices,
      fy: raw.fy ?? fy,
      total: raw.total ?? invoices.length,
      hasMore: Boolean(raw.hasMore),
    }
    cache.set(path, { at: Date.now(), data: data as InvoiceWindow<unknown> })
    return data as InvoiceWindow<unknown>
  })()

  inflight.set(path, task)
  try {
    return (await task) as InvoiceWindow<T>
  } finally {
    inflight.delete(path)
  }
}
