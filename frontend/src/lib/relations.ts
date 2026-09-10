/** First row of a PostgREST embed (object or array). */
export function firstRel<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function walkName(source: unknown, key: 'name' | 'contract_no', depth = 0): string {
  if (source == null || depth > 5) return ''
  if (Array.isArray(source)) return walkName(source[0], key, depth + 1)
  if (typeof source !== 'object') return ''
  const o = source as Record<string, unknown>
  if (key === 'name' && o.vendors != null) {
    const nested = walkName(o.vendors, key, depth + 1)
    if (nested) return nested
  }
  const direct = String(o[key] ?? '').trim()
  if (direct && (key === 'contract_no' || o.vendors == null)) return direct
  if (o.contracts != null) {
    const nested = walkName(o.contracts, key, depth + 1)
    if (nested) return nested
  }
  if (o.invoices != null) {
    const nested = walkName(o.invoices, key, depth + 1)
    if (nested) return nested
  }
  return direct
}

/** Vendor name from invoice/contract/PO embeds. Handles object or array relations. */
export function vendorNameOf(source: unknown, empty = '—'): string {
  return walkName(source, 'name') || empty
}

export function contractNoOf(source: unknown, empty = '—'): string {
  return walkName(source, 'contract_no') || empty
}
