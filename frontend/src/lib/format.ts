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

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below100(n: number): string {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`
}

function below1000(n: number): string {
  if (n < 100) return below100(n)
  const h = Math.floor(n / 100)
  const rest = n % 100
  return rest === 0 ? `${ONES[h]} Hundred` : `${ONES[h]} Hundred ${below100(rest)}`
}

/**
 * South-Asian numbering (lakh / crore) as used in Pakistan.
 * Recursion keeps the crore segment correct for values beyond 99 crore.
 */
export function numberToWords(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (value === 0) return 'Zero'
  const sign = value < 0 ? 'Minus ' : ''
  let num = Math.abs(Math.floor(value))
  if (num === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(num / 1_00_00_000)
  num %= 1_00_00_000
  const lakh = Math.floor(num / 1_00_000)
  num %= 1_00_000
  const thousand = Math.floor(num / 1000)
  const rest = num % 1000
  if (crore > 0) parts.push(`${numberToWords(crore)} Crore`)
  if (lakh > 0) parts.push(`${below100(lakh)} Lakh`)
  if (thousand > 0) parts.push(`${below100(thousand)} Thousand`)
  if (rest > 0) parts.push(below1000(rest))
  return sign + parts.join(' ')
}

export function formatAmountWords(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const num = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(num)) return ''
  const whole = Math.floor(Math.abs(num))
  const paise = Math.round((Math.abs(num) - whole) * 100)
  const sign = num < 0 ? 'Minus ' : ''
  let text = `Rupees ${sign}${numberToWords(whole)}`
  if (paise > 0) text += ` and ${below100(paise)} Paise`
  return `${text} only`
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
