export interface GroupBucket<T> {
  key: string
  rows: T[]
  sum: number
  count: number
}

/**
 * Group rows by a computed value. Returns null when groupKey is null so the
 * caller can fall back to the flat table rendering.
 */
export function groupRows<T>(
  rows: T[],
  groupKey: string | null,
  getValue: (row: T, key: string) => string | number | null,
  sumOf: (row: T) => number,
): GroupBucket<T>[] | null {
  if (!groupKey) return null
  const buckets = new Map<string, GroupBucket<T>>()
  for (const row of rows) {
    const raw = getValue(row, groupKey)
    const key = raw === null || raw === undefined || String(raw).trim() === '' ? '—' : String(raw)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, rows: [], sum: 0, count: 0 }
      buckets.set(key, bucket)
    }
    bucket.rows.push(row)
    bucket.sum += sumOf(row)
    bucket.count += 1
  }
  // Largest subtotal first: subtotal scanning matches how reviewers look for the
  // biggest cost drivers.
  return [...buckets.values()].sort((a, b) => b.sum - a.sum)
}
