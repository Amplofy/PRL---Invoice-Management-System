import { civilDayDiff, todayCalendarYmd } from './calendarDate'
import { formatDate, formatMoney } from './format'
import {
  renderTemplateBody,
  renderTemplateSubject,
  templateById,
  type EmailTemplate,
} from './emailTemplates'
import { uniqueRecipients, type BulkMode, type BulkPlan, type MailDraft } from './mailer'

export interface FollowupRecord {
  invoiceId: string
  invoiceNo: string
  invoiceDate: string | null
  amount: number
  contractNo: string
  vendorName: string
  email: string
}

function money(n: number): string {
  return `Rs ${formatMoney(n)}`
}

export function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const diff = civilDayDiff(dateStr, todayCalendarYmd())
  return diff == null ? 0 : Math.max(0, diff)
}

function invoiceLine(p: FollowupRecord): string {
  return `- ${p.invoiceNo} (${formatDate(p.invoiceDate)}): ${money(p.amount)}`
}

function followupData(rows: FollowupRecord[], department: string): Record<string, unknown> {
  const first = rows[0]
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  return {
    vendorName: first?.vendorName ?? '',
    contractNo: first?.contractNo ?? '',
    invoiceNo: first?.invoiceNo ?? '',
    invoiceDate: formatDate(first?.invoiceDate ?? null),
    amount: money(rows.length === 1 ? Number(first?.amount ?? 0) : total),
    invoiceList: rows.map(invoiceLine).join('\n'),
    daysPending: String(daysSince(first?.invoiceDate ?? null)),
    department: department || 'Finance',
  }
}

export function buildFollowupDraft(
  rows: FollowupRecord[],
  tpl: EmailTemplate,
  department: string,
  to: string[],
  extras?: { bcc?: string[] },
): MailDraft {
  const data = followupData(rows, department)
  return {
    to,
    bcc: extras?.bcc,
    subject: renderTemplateSubject(tpl, data),
    body: renderTemplateBody(tpl, data),
  }
}

export function buildFollowupPlan(
  rows: FollowupRecord[],
  templateId: string,
  department: string,
  mode: BulkMode,
): BulkPlan {
  const tpl = templateById(templateId) ?? templateById('followup-standard')!
  if (mode === 'combined') {
    const emails = uniqueRecipients(rows.map((r) => r.email).filter(Boolean))
    const draft = buildFollowupDraft(rows, tpl, department, [], { bcc: emails })
    return { mode, drafts: emails.length ? [draft] : [] }
  }
  const byVendor = new Map<string, FollowupRecord[]>()
  for (const r of rows) {
    const key = r.email.trim().toLowerCase()
    if (!key) continue
    const list = byVendor.get(key) ?? []
    list.push(r)
    byVendor.set(key, list)
  }
  const drafts: MailDraft[] = []
  for (const group of byVendor.values()) {
    const email = group[0]!.email
    drafts.push(buildFollowupDraft(group, tpl, department, [email]))
  }
  return { mode, drafts }
}

export function buildDiscrepancyDraft(opts: {
  templateId: string
  vendorEmail: string
  vendorName: string
  department: string
  baseFileName: string
  compareFileName: string
  keyValue: string
  discrepancyList: string
  notes?: string
}): MailDraft {
  const tpl = templateById(opts.templateId) ?? templateById('discrepancy-standard')!
  let list = opts.discrepancyList
  if (opts.notes?.trim()) list += `\n\nAdditional notes:\n${opts.notes.trim()}`
  const data = {
    vendorName: opts.vendorName,
    department: opts.department || 'Finance',
    baseFileName: opts.baseFileName,
    compareFileName: opts.compareFileName,
    keyValue: opts.keyValue,
    discrepancyList: list,
  }
  return {
    to: [opts.vendorEmail],
    subject: renderTemplateSubject(tpl, data),
    body: renderTemplateBody(tpl, data),
  }
}
