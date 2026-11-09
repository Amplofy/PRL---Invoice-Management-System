export interface MailDraft {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
}

export type BulkMode = 'combined' | 'individual'

export interface BulkPlan {
  mode: BulkMode
  drafts: MailDraft[]
}

export const MAILTO_SAFE_LENGTH = 1900

function encode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '%20')
}

export function buildMailto(draft: MailDraft): string {
  const to = draft.to.filter(Boolean).join(',')
  const params: string[] = []
  if (draft.cc?.length) params.push(`cc=${encode(draft.cc.join(','))}`)
  if (draft.bcc?.length) params.push(`bcc=${encode(draft.bcc.join(','))}`)
  if (draft.subject) params.push(`subject=${encode(draft.subject)}`)
  const body = draft.body.replace(/\r?\n/g, '\r\n')
  if (body) params.push(`body=${encode(body)}`)
  const qs = params.join('&')
  return qs ? `mailto:${to}?${qs}` : `mailto:${to}`
}

export function draftFits(draft: MailDraft, max = MAILTO_SAFE_LENGTH): boolean {
  return buildMailto(draft).length <= max
}

export function openMailto(href: string): void {
  const a = document.createElement('a')
  a.href = href
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function openDraft(draft: MailDraft): void {
  openMailto(buildMailto(draft))
}

export async function dispatchDrafts(drafts: MailDraft[], gapMs = 700): Promise<number> {
  let n = 0
  for (const d of drafts) {
    openDraft(d)
    n += 1
    if (n < drafts.length) await new Promise((r) => setTimeout(r, gapMs))
  }
  return n
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function uniqueRecipients(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = raw.trim().toLowerCase()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(raw.trim())
  }
  return out
}
