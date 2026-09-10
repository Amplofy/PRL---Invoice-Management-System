export function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export function vendorsAsList(vendors: unknown): Array<Record<string, unknown>> {
  if (vendors == null) return []
  if (Array.isArray(vendors)) return vendors.filter(Boolean) as Array<Record<string, unknown>>
  if (typeof vendors === 'object') return [vendors as Record<string, unknown>]
  return []
}

export function normalizeContractEmbed(contracts: unknown): Record<string, unknown> | null {
  const c = firstEmbed(contracts as Record<string, unknown> | Record<string, unknown>[] | null)
  if (!c) return null
  return { ...c, vendors: vendorsAsList(c.vendors) }
}

export function normalizeInvoiceEmbed(invoices: unknown): Record<string, unknown> | null {
  const inv = firstEmbed(invoices as Record<string, unknown> | Record<string, unknown>[] | null)
  if (!inv) return null
  return { ...inv, contracts: normalizeContractEmbed(inv.contracts) }
}

export function vendorNameOf(source: unknown, empty = 'Unknown'): string {
  const contract = normalizeContractEmbed(
    (source as { contracts?: unknown } | null)?.contracts ?? source,
  )
  const name = String(vendorsAsList(contract?.vendors)[0]?.name ?? '').trim()
  return name || empty
}
