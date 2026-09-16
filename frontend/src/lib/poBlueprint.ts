import { formatAmountWords, formatDate, formatMoney, formatServicePeriod } from './format'
import { releasedViaLabel } from './accrual'

export interface PoPrintInvoice {
  invoice_no: string | null
  invoice_date: string | null
  processing_date?: string | null
  service_from?: string | null
  service_to?: string | null
  amount: number
  approved_amount?: number | null
  cost_element?: string | null
  t1?: string | null
  t2?: string | null
  t3?: string | null
  location?: string | null
  tanker_name?: string | null
  trips?: number | null
  item_no?: string | null
  remarks?: string | null
}

export interface PoPrintOrder {
  serial_no: string | null
  generated_at: string | null
  released_via?: string | null
  release_reference?: string | null
  invoices: PoPrintInvoice | null
}

export interface PoPrintExtras {
  vendor: string
  amount: number
  logoUrl: string
  costCenter?: string
}

export interface PoTemplateToken {
  token: string
  description: string
}

/** Every value the admin can drop into a slot. */
export const PO_PLACEHOLDERS: PoTemplateToken[] = [
  { token: 'poNo', description: 'Payment-order serial number' },
  { token: 'vendorName', description: 'Payee / vendor name' },
  { token: 'amount', description: 'Amount being paid (formatted)' },
  { token: 'amountWords', description: 'Amount in words' },
  { token: 'processingDate', description: 'Processing date (11-Sep-2026)' },
  { token: 'processingDateShort', description: 'Processing date, short year (11-Sep-26)' },
  { token: 'costCenter', description: 'Cost centre from company settings' },
  { token: 'costElement', description: 'Invoice cost element' },
  { token: 'chequeNo', description: 'Cheque / release reference' },
  { token: 'releasedVia', description: 'Release mode when it is not a cheque' },
  { token: 'releaseReference', description: 'Raw release reference' },
  { token: 'invoiceNo', description: 'Invoice number' },
  { token: 'invoiceDate', description: 'Invoice date' },
  { token: 'invoiceLine', description: 'Invoice number and date' },
  { token: 'type', description: 'Service Type (t1)' },
  { token: 'service', description: 'Service (t2)' },
  { token: 'detail', description: 'Detail (t3)' },
  { token: 'serviceChain', description: 'Type · Service · Detail' },
  { token: 'location', description: 'Invoice location' },
  { token: 'itemNo', description: 'Item number' },
  { token: 'tankerName', description: 'Tanker / vessel name' },
  { token: 'trips', description: 'Trip count' },
  { token: 'tankerTrips', description: 'Tanker name with trip count' },
  { token: 'serviceFrom', description: 'Service start date' },
  { token: 'serviceTo', description: 'Service end date' },
  { token: 'servicePeriod', description: 'Service from – to' },
  { token: 'remarks', description: 'Invoice remarks' },
  { token: 'logoUrl', description: 'Company logo URL' },
]

export interface PoTemplateRow {
  caption: string
  placeholder: string
  enabled: boolean
}

export interface PoTemplateConfig {
  title: string
  company: string
  docLabel: string
  docPlaceholder: string
  poLabel: string
  poPlaceholder: string
  payLabel: string
  cashLabel: string
  chequeLabel: string
  notePlaceholder: string
  toLabel: string
  vendorPlaceholder: string
  dateLabel: string
  datePlaceholder: string
  sumLabel: string
  sumPlaceholder: string
  columns: {
    lead: string
    orderNumber: string
    vendorNo: string
    costCenter: string
    costElement: string
    chequeNo: string
    amount: string
  }
  orderNumberField: string
  costCenterField: string
  costElementField: string
  amountField: string
  rows: PoTemplateRow[]
  signatories: string[]
  totalLabel: string
  totalPlaceholder: string
  receivedText: string
  payeeLabel: string
  remarksLabel: string
  remarksText: string
  fdLabel: string
  rowHeight: number
  fontSize: number
}

export const DEFAULT_PO_CONFIG: PoTemplateConfig = {
  title: 'Payment Order',
  company: 'PAKISTAN REFINERY LTD.',
  docLabel: 'Doc. No.',
  docPlaceholder: '',
  poLabel: 'PO No.',
  poPlaceholder: 'poNo',
  payLabel: 'Pay',
  cashLabel: 'In cash',
  chequeLabel: 'By Cheque',
  notePlaceholder: 'chequeNo',
  toLabel: 'To',
  vendorPlaceholder: 'vendorName',
  dateLabel: 'Date',
  datePlaceholder: 'processingDate',
  sumLabel: 'The sum of Rupees',
  sumPlaceholder: 'amountWords',
  columns: {
    lead: 'On account of payment in respect of',
    orderNumber: 'Order Number',
    vendorNo: 'Vendor No.',
    costCenter: 'Cost Center',
    costElement: 'Cost Element',
    chequeNo: 'Cheque No.',
    amount: 'Amount',
  },
  orderNumberField: '',
  costCenterField: 'costCenter',
  costElementField: 'costElement',
  amountField: 'amount',
  rows: [
    { caption: 'Invoice No. & Date', placeholder: 'invoiceLine', enabled: true },
    { caption: 'Type 2 or Type 3', placeholder: 'serviceChain', enabled: true },
    { caption: 'Location', placeholder: 'location', enabled: true },
    { caption: 'Item No.', placeholder: 'itemNo', enabled: true },
    { caption: 'Tanker Name / Trips', placeholder: 'tankerTrips', enabled: true },
    { caption: 'Service Period', placeholder: 'servicePeriod', enabled: true },
  ],
  signatories: ['Origination Dept.', 'Approved by Authorised Signatory', 'Entered in AP System', 'Passed for Payment by Finance'],
  totalLabel: 'TOTAL',
  totalPlaceholder: 'amount',
  receivedText: 'Received from Pakistan Refinery Ltd. the above amount',
  payeeLabel: 'Signature of Payee',
  remarksLabel: 'Remarks',
  remarksText:
    'Any comments / clarification / objections relevant to payment, receipt / quality of goods, jobs / contracts in progress / completed etc. must be made in the Remarks Section of this Payment Order.',
  fdLabel: 'F.D. 310 (R.2)',
  rowHeight: 0,
  fontSize: 0,
}

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/** Civil YYYY-MM-DD without a timezone round-trip. */
function civilYmd(value: string | null | undefined): string {
  const raw = clean(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function formattedDay(value: string | null | undefined): string {
  const ymd = civilYmd(value)
  if (!ymd) return ''
  const text = formatDate(ymd)
  return text === '—' ? '' : text
}

function wordsAfterRupees(amount: number): string {
  return formatAmountWords(amount).replace(/^Rupees\s+/i, '')
}

/** Join the Type → Service → Detail chain, dropping a level already contained in the next. */
function joinChain(...levels: Array<string | null | undefined>): string {
  const parts: string[] = []
  for (const level of levels) {
    const value = clean(level)
    if (!value) continue
    const alreadyCovered = parts.some((existing) => existing.toLowerCase().includes(value.toLowerCase()))
    if (alreadyCovered) continue
    parts.push(value)
  }
  return parts.join(' · ')
}

function serviceLine(inv: PoPrintInvoice | null): string {
  if (!inv) return ''
  return joinChain(inv.t1, inv.t2, inv.t3)
}

function invoiceLine(inv: PoPrintInvoice | null): string {
  if (!inv) return ''
  const no = clean(inv.invoice_no)
  const date = formattedDay(inv.invoice_date)
  const dated = date ? `dated ${date}` : ''
  return [no, dated].filter(Boolean).join(' · ')
}

function vesselLine(inv: PoPrintInvoice | null): string {
  if (!inv) return ''
  const name = clean(inv.tanker_name)
  const trips = inv.trips == null ? null : Number(inv.trips)
  const tripText = trips && Number.isFinite(trips) ? `${trips} trip${trips === 1 ? '' : 's'}` : ''
  if (name && tripText) return `${name} (${tripText})`
  return name || tripText
}

function servicePeriod(inv: PoPrintInvoice | null): string {
  if (!inv) return ''
  return formatServicePeriod(inv.service_from, inv.service_to) ?? ''
}

function processingDate(order: PoPrintOrder): string {
  const inv = order.invoices
  const raw = inv?.processing_date || inv?.invoice_date || order.generated_at
  const formatted = formatDate(raw)
  return formatted === '—' ? '' : formatted
}

/** "11-Sep-2026" → "11-Sep-26", the two-digit year used in the form's date box. */
function shortDate(value: string): string {
  const match = /^(\d{2}-[A-Za-z]{3})-(\d{2})(\d{2})$/.exec(value)
  return match ? `${match[1]}-${match[3]}` : value
}

function isByCheque(order: PoPrintOrder): boolean {
  return clean(order.released_via).toLowerCase() === 'cheque'
}

function buildContext(order: PoPrintOrder, extras: PoPrintExtras): Record<string, string> {
  const inv = order.invoices
  const amount = extras.amount
  const byCheque = isByCheque(order)
  const otherMode = clean(order.released_via) && !byCheque ? releasedViaLabel(order.released_via) : ''
  const chequeNo = byCheque ? clean(order.release_reference) : ''
  const money = formatMoney(amount, 2)
  return {
    poNo: esc(clean(order.serial_no)),
    vendorName: esc(extras.vendor),
    amount: esc(money),
    amountWords: esc(wordsAfterRupees(amount)),
    processingDate: esc(processingDate(order)),
    processingDateShort: esc(shortDate(processingDate(order))),
    costCenter: esc(clean(extras.costCenter)),
    costElement: esc(clean(inv?.cost_element)),
    chequeNo: esc(chequeNo),
    releasedVia: esc(otherMode),
    releaseReference: esc(clean(order.release_reference)),
    invoiceNo: esc(clean(inv?.invoice_no)),
    invoiceDate: esc(formattedDay(inv?.invoice_date)),
    invoiceLine: esc(invoiceLine(inv)),
    type: esc(clean(inv?.t1)),
    service: esc(clean(inv?.t2)),
    detail: esc(clean(inv?.t3)),
    serviceChain: esc(serviceLine(inv)),
    location: esc(clean(inv?.location)),
    itemNo: esc(clean(inv?.item_no)),
    tankerName: esc(clean(inv?.tanker_name)),
    trips: esc(inv?.trips == null ? '' : String(inv.trips)),
    tankerTrips: esc(vesselLine(inv)),
    serviceFrom: esc(formattedDay(inv?.service_from)),
    serviceTo: esc(formattedDay(inv?.service_to)),
    servicePeriod: esc(servicePeriod(inv)),
    remarks: esc(clean(inv?.remarks)),
    logoUrl: esc(extras.logoUrl),
    payCashChecked: !byCheque && clean(order.released_via) ? 'X' : '',
    payChequeChecked: byCheque ? 'X' : '',
  }
}

/** Merge a stored template onto the defaults so older or partial configs stay valid. */
export function parsePoTemplate(raw: string | null | undefined): PoTemplateConfig {
  if (!raw || !raw.trim()) return DEFAULT_PO_CONFIG
  try {
    const parsed = JSON.parse(raw) as Partial<PoTemplateConfig>
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rows)) return DEFAULT_PO_CONFIG
    return {
      ...DEFAULT_PO_CONFIG,
      ...parsed,
      columns: { ...DEFAULT_PO_CONFIG.columns, ...(parsed.columns ?? {}) },
      signatories:
        Array.isArray(parsed.signatories) && parsed.signatories.length ? parsed.signatories : DEFAULT_PO_CONFIG.signatories,
      rows: parsed.rows.length ? parsed.rows : DEFAULT_PO_CONFIG.rows,
    }
  } catch {
    return DEFAULT_PO_CONFIG
  }
}

function renderPoHtml(config: PoTemplateConfig, ctx: Record<string, string>): string {
  const value = (key: string): string => (key && ctx[key] ? ctx[key] : '')

  const rows = config.rows.filter((row) => row.enabled !== false && value(row.placeholder))
  const rowsHtml =
    rows
      .map((row, index) => {
        const content = value(row.placeholder)
        const codes =
          index === 0
            ? `<td class="code">${value(config.orderNumberField) || '&nbsp;'}</td>
          <td class="code">${value(config.costCenterField) || '&nbsp;'}</td>
          <td class="code">${value(config.costElementField) || '&nbsp;'}</td>
          <td class="num">${value(config.amountField) || '&nbsp;'}</td>`
            : '<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>'
        return `<tr>
          <td class="lead"><span class="cap">${esc(row.caption)}</span><span class="val">${content}</span></td>
          ${codes}
        </tr>`
      })
      .join('\n        ')

  const signatories = config.signatories.filter((label) => clean(label)).slice(0, 4)
  const sigHtml = signatories
    .map(
      (label) =>
        `<div class="sig"><div class="sig-role">${esc(label)}</div><div class="sig-space"></div><div class="sig-line">Signature &amp; Date</div></div>`,
    )
    .join('\n        ')

  const rowHeight = Number(config.rowHeight)
  const fontSize = Number(config.fontSize)
  const spacing = [
    Number.isFinite(rowHeight) && rowHeight > 0 ? `table.grid td { height: ${rowHeight}px; }` : '',
    Number.isFinite(fontSize) && fontSize > 0 ? `body { font-size: ${fontSize}px; }` : '',
  ]
    .filter(Boolean)
    .join('\n    ')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(config.title)} ${value('poNo')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #1f2937;
      --ink-strong: #111827;
      --soft: #4b5563;
      --muted: #64748b;
      --faint: #94a3b8;
      --line: #cbd5e1;
      --line-soft: #e2e8f0;
      --brand: #1e3a8a;
      --brand-ink: #16295f;
      --brand-tint: #eef2fb;
      --brand-tint-2: #dfe6f5;
      --brand-line: #b8c6e3;
    }
    @page { size: A4 portrait; margin: 14mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0;
      color: var(--ink);
      background: #fff;
      font-family: 'Inter', 'Helvetica Neue', Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.45;
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
    }
    .sheet { width: 186mm; max-width: 100%; margin: 0 auto; }
    .cap {
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--brand);
    }

    /* masthead */
    .masthead {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--brand);
    }
    .brand { display: flex; align-items: center; gap: 11px; }
    .brand img { height: 36px; width: auto; }
    .brand .company { font-size: 15px; font-weight: 600; letter-spacing: 0.03em; color: var(--brand-ink); }
    .doc { text-align: right; }
    .doc .title { font-size: 18px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--brand); }
    .doc .fd { margin-top: 3px; font-size: 8px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--faint); }

    /* references */
    .refs { display: flex; justify-content: space-between; gap: 18px; padding: 10px 0 11px; }
    .ref { display: flex; flex-direction: column; gap: 3px; min-width: 46mm; text-align: left; }
    .ref.right { align-items: flex-end; text-align: right; }
    .ref .cap { color: var(--muted); }
    .ref .val { min-height: 14px; font-weight: 600; }
    .ref .val.write { min-width: 46mm; padding-bottom: 2px; border-bottom: 1px solid var(--brand-line); }
    .ref .val.strong { font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em; color: var(--brand-ink); }

    /* summary block */
    .summary { border: 1px solid var(--brand-line); border-radius: 6px; overflow: hidden; }
    .sum-top { display: grid; grid-template-columns: auto 1fr 42mm; align-items: stretch; }
    .sum-top .cell { padding: 7px 12px 8px; }
    .sum-top .cell + .cell { border-left: 1px solid var(--line-soft); }
    .sum-top .cap { display: block; margin-bottom: 4px; }
    .modes { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 16px; }
    .opt { display: inline-flex; align-items: center; gap: 6px; }
    .box {
      width: 12px;
      height: 12px;
      flex: 0 0 auto;
      border: 1px solid var(--brand);
      border-radius: 2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 600;
      line-height: 1;
      color: var(--brand);
    }
    .box:not(:empty) { background: var(--brand); color: #fff; }
    .mode-note { font-size: 9px; color: var(--muted); }
    .val { font-size: 11.5px; font-weight: 600; }
    .val.strong { font-size: 11.5px; font-weight: 600; }
    .sum-words {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 8px 12px;
      border-top: 1px solid var(--brand-line);
      background: var(--brand-tint);
    }
    .sum-words .cap { flex: 0 0 auto; }
    .sum-words .val { font-size: 11.5px; font-weight: 600; color: var(--brand-ink); }

    /* particulars grid */
    table.grid {
      width: 100%;
      margin-top: 12px;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1px solid var(--brand-line);
    }
    table.grid th,
    table.grid td {
      padding: 6px 9px;
      vertical-align: middle;
      border: 1px solid var(--line);
    }
    table.grid thead th {
      background: var(--brand);
      text-align: center;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      line-height: 1.3;
      color: #fff;
    }
    .lead { text-align: left; }
    .lead .cap { display: block; margin-bottom: 3px; }
    .lead .val { font-weight: 600; font-size: 11.5px; }
    .code { text-align: center; color: var(--soft); font-size: 11.5px; }
    .num { text-align: right; font-weight: 600; font-size: 11.5px; }
    .total-row td { background: var(--brand-tint-2); border-top: 1.5px solid var(--brand); }
    .total-label {
      text-align: right;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--brand-ink);
    }
    .total-amt { font-size: 11.5px; font-weight: 600; color: var(--brand-ink); }

    /* authorisation */
    .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
    .sig {
      display: flex;
      flex-direction: column;
      min-height: 32mm;
      border: 1px solid var(--brand-line);
      border-top: 2px solid var(--brand);
      border-radius: 6px;
      overflow: hidden;
    }
    .sig-role {
      padding: 9px 11px 0;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--brand-ink);
      line-height: 1.4;
    }
    .sig-space { flex: 1 1 auto; }
    .sig-line {
      margin: 0 11px;
      padding: 4px 0 7px;
      border-top: 1px solid var(--line);
      font-size: 7.5px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--faint);
      text-align: center;
    }

    /* receipt */
    .receipt {
      display: grid;
      grid-template-columns: 1fr 62mm;
      gap: 22px;
      align-items: end;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
    .receipt .cap { display: block; margin-bottom: 5px; }
    .recv { font-size: 10.5px; line-height: 1.5; color: var(--soft); }
    .payee-block { text-align: center; }
    .payee-block .cap { color: var(--muted); }
    .payee-rule { height: 68px; border-bottom: 1px solid var(--brand); margin-bottom: 5px; }

    /* remarks */
    .remarks {
      margin-top: 12px;
      padding: 9px 12px;
      border: 1px solid var(--line-soft);
      border-left: 3px solid var(--brand);
      border-radius: 4px;
      background: var(--brand-tint);
      font-size: 9.5px;
      line-height: 1.55;
      color: var(--muted);
    }
    .remarks .cap { display: block; margin-bottom: 3px; color: var(--brand-ink); }
    .remarks .note { margin-top: 4px; color: var(--ink-strong); font-weight: 600; }
    .fd { margin-top: 10px; font-size: 8px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
    @media print { .sheet { width: auto; } }
    ${spacing}
  </style>
</head>
<body>
  <div class="sheet">
    <header class="masthead">
      <div class="brand">
        ${value('logoUrl') ? `<img src="${value('logoUrl')}" alt="" />` : ''}
        <div class="company">${esc(config.company)}</div>
      </div>
      <div class="doc">
        <div class="title">${esc(config.title)}</div>
        <div class="fd">${esc(config.fdLabel)}</div>
      </div>
    </header>

    <section class="refs">
      <div class="ref"><span class="cap">${esc(config.docLabel)}</span><span class="val write">${value(config.docPlaceholder)}</span></div>
      <div class="ref right"><span class="cap">${esc(config.poLabel)}</span><span class="val strong">${value(config.poPlaceholder)}</span></div>
    </section>

    <section class="summary">
      <div class="sum-top">
        <div class="cell">
          <span class="cap">${esc(config.payLabel)}</span>
          <div class="modes">
            <span class="opt"><span class="box">${value('payCashChecked')}</span>${esc(config.cashLabel)}</span>
            <span class="opt"><span class="box">${value('payChequeChecked')}</span>${esc(config.chequeLabel)}</span>
            ${value(config.notePlaceholder) ? `<span class="mode-note">${value(config.notePlaceholder)}</span>` : ''}
          </div>
        </div>
        <div class="cell">
          <span class="cap">${esc(config.toLabel)}</span>
          <span class="val strong">${value(config.vendorPlaceholder)}</span>
        </div>
        <div class="cell">
          <span class="cap">${esc(config.dateLabel)}</span>
          <span class="val">${value(config.datePlaceholder)}</span>
        </div>
      </div>
      <div class="sum-words">
        <span class="cap">${esc(config.sumLabel)}</span>
        <span class="val">${value(config.sumPlaceholder)}</span>
      </div>
    </section>

    <table class="grid">
      <colgroup>
        <col style="width:42%" />
        <col style="width:15%" />
        <col style="width:15%" />
        <col style="width:14%" />
        <col style="width:14%" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2" class="lead">${esc(config.columns.lead)}</th>
          <th rowspan="2">${esc(config.columns.orderNumber)}</th>
          <th colspan="2">${esc(config.columns.vendorNo)}</th>
          <th>${esc(config.columns.chequeNo)}</th>
        </tr>
        <tr>
          <th>${esc(config.columns.costCenter)}</th>
          <th>${esc(config.columns.costElement)}</th>
          <th>${esc(config.columns.amount)}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td class="total-label" colspan="4">${esc(config.totalLabel)}</td>
          <td class="num total-amt">${value(config.totalPlaceholder)}</td>
        </tr>
      </tbody>
    </table>

    <section class="signatures">
      ${sigHtml}
    </section>

    <section class="receipt">
      <div class="recv">${esc(config.receivedText)}</div>
      <div class="payee-block">
        <div class="payee-rule"></div>
        <span class="cap">${esc(config.payeeLabel)}</span>
      </div>
    </section>

    <div class="remarks">
      <span class="cap">${esc(config.remarksLabel)}</span>
      ${esc(config.remarksText)}
      ${value('remarks') ? `<div class="note">${value('remarks')}</div>` : ''}
    </div>
  </div>
  <script>
    (function () {
      var go = function () { window.print(); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
      else go();
    })();
  </script>
</body>
</html>`
}

export function paymentOrderBlueprintHtml(order: PoPrintOrder, extras: PoPrintExtras, template?: string | null): string {
  return renderPoHtml(parsePoTemplate(template), buildContext(order, extras))
}

export function openPaymentOrderPrint(order: PoPrintOrder, extras: PoPrintExtras, template?: string | null): void {
  const win = window.open('', '_blank', 'width=900,height=1200')
  if (!win) return
  win.document.write(paymentOrderBlueprintHtml(order, extras, template))
  win.document.close()
}

/** Sample data so the admin can preview a template without leaving Administration. */
export function samplePoPrint(): { order: PoPrintOrder; extras: PoPrintExtras } {
  return {
    order: {
      serial_no: 'PO-2026073001',
      generated_at: '2026-07-30',
      released_via: 'cheque',
      release_reference: 'CHQ-22',
      invoices: {
        invoice_no: 'INV-2026-0022',
        invoice_date: '2026-07-27',
        processing_date: '2026-07-30',
        service_from: '2026-07-01',
        service_to: '2026-07-31',
        amount: 980000,
        cost_element: '51201',
        t1: 'Outward',
        t2: 'Tanker Handling',
        t3: '',
        location: 'Keamari',
        tanker_name: 'Al-Noor',
        trips: 2,
        item_no: 'IT-01',
        remarks: 'Verified against contract schedule.',
      },
    },
    extras: {
      vendor: 'M/s Karachi Surveyors',
      amount: 980000,
      logoUrl: `${typeof window === 'undefined' ? '' : window.location.origin}/brand/prl-logo.png`,
      costCenter: '11369',
    },
  }
}
