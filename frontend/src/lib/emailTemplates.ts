export type EmailKind = 'followup' | 'discrepancy' | 'general'

export interface EmailTemplate {
  id: string
  kind: EmailKind
  label: string
  subject: string
  body: string
}

export const MERGE_FIELDS = [
  { key: 'vendorName', label: 'Vendor name' },
  { key: 'contractNo', label: 'Contract no' },
  { key: 'invoiceNo', label: 'Invoice no' },
  { key: 'invoiceDate', label: 'Invoice date' },
  { key: 'amount', label: 'Amount' },
  { key: 'invoiceList', label: 'Invoice list' },
  { key: 'daysPending', label: 'Days pending' },
  { key: 'department', label: 'Department' },
  { key: 'baseFileName', label: 'Base file' },
  { key: 'compareFileName', label: 'Compare file' },
  { key: 'discrepancyList', label: 'Discrepancy list' },
  { key: 'keyValue', label: 'Key value' },
] as const

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'followup-standard',
    kind: 'followup',
    label: 'Standard reminder',
    subject: 'PRL — pending invoice follow-up ({{invoiceNo}})',
    body: `Dear {{vendorName}},

Please advise the status of the following pending invoice(s) under contract {{contractNo}}:

{{invoiceList}}

Kindly share supporting documents or a revised invoice if required.

Regards,
{{department}}
Pakistan Refinery Limited`,
  },
  {
    id: 'followup-urgent',
    kind: 'followup',
    label: 'Urgent reminder',
    subject: 'URGENT — pending invoice {{invoiceNo}} ({{daysPending}} days)',
    body: `Dear {{vendorName}},

Invoice {{invoiceNo}} dated {{invoiceDate}} for {{amount}} has been pending for {{daysPending}} day(s).

Please treat this as urgent and revert with status or a corrected invoice.

{{invoiceList}}

Regards,
{{department}}
Pakistan Refinery Limited`,
  },
  {
    id: 'followup-escalation',
    kind: 'followup',
    label: 'Escalation',
    subject: 'Escalation — outstanding invoices ({{contractNo}})',
    body: `Dear {{vendorName}},

The invoices below remain outstanding under contract {{contractNo}}. Please escalate internally and confirm a resolution date.

{{invoiceList}}

Regards,
{{department}}
Pakistan Refinery Limited`,
  },
  {
    id: 'followup-statement',
    kind: 'followup',
    label: 'Statement of account',
    subject: 'PRL — statement of pending invoices ({{contractNo}})',
    body: `Dear {{vendorName}},

Please find a statement of pending invoices under contract {{contractNo}}:

{{invoiceList}}

Total outstanding: {{amount}}

Regards,
{{department}}
Pakistan Refinery Limited`,
  },
  {
    id: 'followup-documents',
    kind: 'followup',
    label: 'Documents requested',
    subject: 'PRL — supporting documents required ({{invoiceNo}})',
    body: `Dear {{vendorName}},

We require supporting documents for invoice {{invoiceNo}} dated {{invoiceDate}} ({{amount}}).

{{invoiceList}}

Please attach the relevant backup and resend.

Regards,
{{department}}
Pakistan Refinery Limited`,
  },
  {
    id: 'discrepancy-standard',
    kind: 'discrepancy',
    label: 'Standard discrepancy',
    subject: 'PRL — discrepancy identified ({{baseFileName}} vs {{compareFileName}})',
    body: `Dear {{vendorName}},

A discrepancy was identified while comparing {{baseFileName}} with {{compareFileName}}.

{{discrepancyList}}

Please review and confirm.

Regards,
{{department}}
Pakistan Refinery Limited`,
  },
  {
    id: 'discrepancy-missing',
    kind: 'discrepancy',
    label: 'Missing rows',
    subject: 'PRL — missing rows ({{baseFileName}} vs {{compareFileName}})',
    body: `Dear {{vendorName}},

Rows are missing between {{baseFileName}} and {{compareFileName}}.

{{discrepancyList}}

Please advise.

Regards,
{{department}}
Pakistan Refinery Limited`,
  },
  {
    id: 'discrepancy-summary',
    kind: 'discrepancy',
    label: 'Summary report',
    subject: 'PRL — comparison summary ({{keyValue}})',
    body: `Dear {{vendorName}},

Comparison of {{baseFileName}} vs {{compareFileName}} (key {{keyValue}}):

{{discrepancyList}}

Regards,
{{department}}
Pakistan Refinery Limited`,
  },
  {
    id: 'general-blank',
    kind: 'general',
    label: 'Blank',
    subject: '',
    body: '',
  },
]

export function templateById(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id)
}

export function templatesFor(kind: EmailKind): EmailTemplate[] {
  return EMAIL_TEMPLATES.filter((t) => t.kind === kind)
}

export function renderMerge(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const value = data[key]
    return value == null ? '' : String(value)
  })
}

export function renderTemplateSubject(tpl: EmailTemplate, data: Record<string, unknown>): string {
  return renderMerge(tpl.subject, data).trim()
}

export function renderTemplateBody(tpl: EmailTemplate, data: Record<string, unknown>): string {
  return renderMerge(tpl.body, data)
}
