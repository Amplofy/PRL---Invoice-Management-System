import { formatAmountWords, formatDate, formatMoney } from './format'
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
  chequeNoField: string
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
  dateLabel: 'Date :',
  datePlaceholder: 'processingDateShort',
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
  orderNumberField: 'poNo',
  costCenterField: 'costCenter',
  costElementField: 'costElement',
  chequeNoField: 'chequeNo',
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
  const fromText = formattedDay(inv.service_from)
  const toText = formattedDay(inv.service_to)
  if (fromText && toText) return `${fromText} – ${toText}`
  if (fromText) return `From ${fromText}`
  if (toText) return `To ${toText}`
  return ''
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
    payCashChecked: byCheque || otherMode ? '' : 'X',
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

  const rows = config.rows.filter((row) => row.enabled !== false)
  const rowsHtml =
    rows
      .map((row, index) => {
        const content = value(row.placeholder)
        const codes =
          index === 0
            ? `<td class="code">${value(config.orderNumberField) || '&nbsp;'}</td>
          <td class="code">${value(config.costCenterField) || '&nbsp;'}</td>
          <td class="code">${value(config.costElementField) || '&nbsp;'}</td>
          <td class="code">${value(config.chequeNoField) || '&nbsp;'}</td>
          <td class="num">${value(config.amountField) || '&nbsp;'}</td>`
            : '<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>'
        return `<tr>
          <td class="lead"><span class="cap">${esc(row.caption)}</span>${content ? `<span class="val">${content}</span>` : ''}</td>
          ${codes}
        </tr>`
      })
      .join('\n        ') || '<tr><td class="lead">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'

  const signatories = config.signatories.slice(0, 4)
  const heads = signatories.map((label) => `<th class="foot-head">${esc(label)}</th>`).join('\n          ')

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
  <style>
    @page { size: A4 portrait; margin: 14mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0;
      color: #0f172a;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      font-variant-numeric: tabular-nums;
    }
    .sheet { width: 186mm; max-width: 100%; margin: 0 auto; }
    .rule { border-bottom: 1px solid #0f172a; }
    .cap {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.11em;
      text-transform: uppercase;
      color: #475569;
    }
    .title {
      margin: 0 0 14px;
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .mast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 11px;
      border-bottom: 1.5px solid #0f172a;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand img { height: 34px; width: auto; }
    .brand h1 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.05em; }
    .doc { display: grid; grid-template-columns: auto 42mm; gap: 7px 10px; align-items: end; }
    .doc .rule { height: 15px; }
    .doc .rule.strong { font-weight: 700; }
    .strip {
      display: grid;
      grid-template-columns: 26mm 1fr 38mm;
      align-items: end;
      gap: 18px;
      margin: 15px 0 4px;
    }
    .pay-modes { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .pay-modes .cap { margin-bottom: 1px; }
    .opt { display: inline-flex; align-items: center; gap: 6px; }
    .box {
      width: 11px;
      height: 11px;
      flex: 0 0 auto;
      border: 1px solid #0f172a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: 700;
      line-height: 1;
    }
    .mode-note { font-size: 8.5px; color: #475569; letter-spacing: 0.04em; }
    .field { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: end; }
    .field .rule { min-height: 17px; font-weight: 600; padding: 0 3px 1px; }
    .sum {
      display: grid;
      grid-template-columns: 30mm 1fr;
      gap: 8px;
      align-items: end;
      margin: 9px 0 14px;
    }
    .sum .rule { min-height: 18px; font-weight: 700; padding: 0 3px 1px; }
    table.grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    table.grid th,
    table.grid td {
      border: 1px solid #0f172a;
      padding: 6px 7px;
      vertical-align: middle;
    }
    table.grid thead th {
      text-align: center;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      line-height: 1.25;
      padding: 7px 5px;
    }
    .lead { text-align: left; }
    .lead .cap { display: block; margin-bottom: 2px; }
    .lead .val { font-weight: 600; }
    .code { text-align: center; }
    .num { text-align: right; font-weight: 700; }
    .foot-gap { margin-top: -1px; }
    .foot-head {
      text-align: center;
      vertical-align: top;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      line-height: 1.3;
    }
    .foot-total { text-align: center; vertical-align: middle; font-size: 9px; }
    .foot-value { text-align: right; vertical-align: middle; font-size: 12px; font-weight: 700; }
    .sig-cell { height: 96px; }
    .recv-cell { font-size: 9.5px; line-height: 1.4; vertical-align: top; }
    .payee-cell { text-align: center; vertical-align: bottom; height: 42px; }
    .payee {
      display: block;
      padding-top: 3px;
      border-top: 1px solid #0f172a;
      font-size: 9px;
      letter-spacing: 0.03em;
    }
    .remarks {
      margin-top: 13px;
      padding-top: 8px;
      border-top: 1px solid #0f172a;
      font-size: 9.5px;
      line-height: 1.5;
      color: #334155;
    }
    .remarks .cap { display: block; margin-bottom: 3px; color: #0f172a; letter-spacing: 0.12em; }
    .remarks .note { margin-top: 5px; color: #0f172a; font-weight: 600; }
    .fd { margin-top: 11px; font-size: 9px; letter-spacing: 0.08em; color: #475569; }
    @media print { .sheet { width: auto; } }
    ${spacing}
  </style>
</head>
<body>
  <div class="sheet">
    <div class="title">${esc(config.title)}</div>

    <div class="mast">
      <div class="brand">
        <img src="${value('logoUrl')}" alt="logo" />
        <h1>${esc(config.company)}</h1>
      </div>
      <div class="doc">
        <span class="cap">${esc(config.docLabel)}</span>
        <div class="rule">${value(config.docPlaceholder)}</div>
        <span class="cap">${esc(config.poLabel)}</span>
        <div class="rule strong">${value(config.poPlaceholder)}</div>
      </div>
    </div>

    <div class="strip">
      <div class="pay-modes">
        <span class="cap">${esc(config.payLabel)}</span>
        <span class="opt"><span class="box">${value('payCashChecked')}</span> ${esc(config.cashLabel)}</span>
        <span class="opt"><span class="box">${value('payChequeChecked')}</span> ${esc(config.chequeLabel)}</span>
        ${value(config.notePlaceholder) ? `<span class="mode-note">${value(config.notePlaceholder)}</span>` : ''}
      </div>
      <div class="field">
        <span class="cap">${esc(config.toLabel)}</span>
        <div class="rule">${value(config.vendorPlaceholder)}</div>
      </div>
      <div class="field">
        <span class="cap">${esc(config.dateLabel)}</span>
        <div class="rule">${value(config.datePlaceholder)}</div>
      </div>
    </div>

    <div class="sum">
      <span class="cap">${esc(config.sumLabel)}</span>
      <div class="rule">${value(config.sumPlaceholder)}</div>
    </div>

    <table class="grid">
      <colgroup>
        <col style="width:39%" />
        <col style="width:17%" />
        <col style="width:11%" />
        <col style="width:11.5%" />
        <col style="width:10%" />
        <col style="width:11.5%" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2" class="lead">${esc(config.columns.lead)}</th>
          <th rowspan="2">${esc(config.columns.orderNumber)}</th>
          <th colspan="2">${esc(config.columns.vendorNo)}</th>
          <th rowspan="2">${esc(config.columns.chequeNo)}</th>
          <th rowspan="2">${esc(config.columns.amount)}</th>
        </tr>
        <tr>
          <th>${esc(config.columns.costCenter)}</th>
          <th>${esc(config.columns.costElement)}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <table class="grid foot-gap">
      <colgroup>
        <col style="width:39%" />
        <col style="width:17%" />
        <col style="width:11%" />
        <col style="width:11.5%" />
        <col style="width:10%" />
        <col style="width:11.5%" />
      </colgroup>
      <tbody>
        <tr>
          ${heads}
          <th class="foot-total">${esc(config.totalLabel)}</th>
          <th class="foot-value">${value(config.totalPlaceholder)}</th>
        </tr>
        <tr>
          <td class="sig-cell" colspan="4" rowspan="2"></td>
          <td class="recv-cell" colspan="2">${esc(config.receivedText)}</td>
        </tr>
        <tr>
          <td class="payee-cell" colspan="2"><span class="payee">${esc(config.payeeLabel)}</span></td>
        </tr>
      </tbody>
    </table>

    <div class="remarks">
      <span class="cap">${esc(config.remarksLabel)}</span>
      ${esc(config.remarksText)}
      ${value('remarks') ? `<div class="note">${value('remarks')}</div>` : ''}
    </div>
    <div class="fd">${esc(config.fdLabel)}</div>
  </div>
  <script>window.print()</script>
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
