const numberFmt = new Intl.NumberFormat('en-PK', {
  maximumFractionDigits: 0,
})

export function formatMoney(value: number | string | null | undefined, digits = 0): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(num)) return '—'
  return `${numberFmt.format(Number(num.toFixed(digits)))}`
}

const percentFmt = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 1 })
export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(num)) return '—'
  return `${percentFmt.format(num)}%`
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDate(d)} ${hh}:${mm}`
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

const units: Array<[number, string]> = [
  [1_00_00_000, 'crore'],
  [1_00_000, 'lakh'],
  [1_000, 'thousand'],
  [1, ''],
]

export function numberToWords(value: number): string {
  if (value === 0) return 'Zero'
  const sign = value < 0 ? 'Minus ' : ''
  let num = Math.abs(Math.floor(value))
  const parts: string[] = []
  for (const [div, suffix] of units) {
    if (num >= div) {
      const whole = Math.floor(num / div)
      const remainder = num % div
      parts.push(`${whole}${suffix ? ` ${suffix}` : ''}`)
      num = remainder
      if (remainder > 0 && div === 1_000) parts.push(`${remainder}`)
    }
  }
  return sign + parts.join(' and ').replace(/\s+/g, ' ').trim()
}

export function formatAmountWords(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const num = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(num)) return ''
  return `Rupees ${numberToWords(num)} only`
}

export function truncate(text: string, len = 40): string {
  if (text.length <= len) return text
  return `${text.slice(0, len - 1)}…`
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
