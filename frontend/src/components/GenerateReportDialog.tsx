import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { QUARTERS, currentFiscalYear } from '../lib/fiscal'
import {
  REPORT_GROUP_BY,
  REPORT_STATUSES,
  REPORT_TEMPLATES,
  downloadGeneratedReport,
  type ReportExportData,
  type ReportTemplate,
} from '../lib/reportWorkbook'
import { vendorNameOf } from '../lib/relations'

interface Props {
  open: boolean
  onClose: () => void
  data: ReportExportData
  fyChoices: string[]
  initialFy: string
  initialTemplate?: ReportTemplate
  onGenerated?: (filenameHint: string) => void
}

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export default function GenerateReportDialog({
  open,
  onClose,
  data,
  fyChoices,
  initialFy,
  initialTemplate = 'overview',
  onGenerated,
}: Props) {
  const [template, setTemplate] = useState<ReportTemplate>(initialTemplate)
  const [fys, setFys] = useState<string[]>(() => (initialFy === 'all' ? [...fyChoices] : [initialFy || currentFiscalYear()]))
  const [quarter, setQuarter] = useState('all')
  const [vendors, setVendors] = useState<string[]>([])
  const [contractIds, setContractIds] = useState<string[]>([])
  const [costElements, setCostElements] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [includeAccruals, setIncludeAccruals] = useState(false)
  const [metric, setMetric] = useState<'spend' | 'invoices' | 'approved'>('spend')
  const [groupBy, setGroupBy] = useState('Vendor')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTemplate(initialTemplate)
    setFys(initialFy === 'all' ? [...fyChoices] : [initialFy || currentFiscalYear()])
    setQuarter('all')
    setVendors([])
    setContractIds([])
    setCostElements([])
    setStatuses([])
    setIncludeAccruals(false)
    setMetric('spend')
    setGroupBy('Vendor')
  }, [open, initialTemplate, initialFy, fyChoices])

  const vendorOptions = useMemo(() => {
    const names = new Set<string>()
    for (const inv of data.invoices) {
      const name = vendorNameOf(inv, '')
      if (name) names.add(name)
    }
    return [...names].sort()
  }, [data.invoices])

  const costOptions = useMemo(
    () => Array.from(new Set(data.invoices.map((i) => i.cost_element ?? '').filter(Boolean))).sort(),
    [data.invoices],
  )

  const generate = async () => {
    setBusy(true)
    try {
      const selectedFys = fys.length ? fys : [...fyChoices]
      await downloadGeneratedReport(data, {
        template,
        fys: selectedFys,
        quarter,
        vendors,
        contractIds,
        costElements,
        statuses,
        includeAccruals,
        metric,
        groupBy,
      })
      onGenerated?.(`${template} · ${selectedFys.join(', ')}`)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate report"
      maxWidth="48rem"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={generate} disabled={busy}>
            <FileSpreadsheet size={16} />
            {busy ? 'Building…' : 'Generate Excel'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Template</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REPORT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${template === t.id ? 'active' : ''}`}
                onClick={() => setTemplate(t.id)}
                aria-pressed={template === t.id}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Fiscal year</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {fyChoices.map((fy) => (
              <button
                key={fy}
                type="button"
                className={`chip ${fys.includes(fy) ? 'active' : ''}`}
                onClick={() => setFys((prev) => toggleValue(prev, fy))}
                aria-pressed={fys.includes(fy)}
              >
                {fy}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Quarter
            <select className="input mt-2" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              <option value="all">All quarters</option>
              {QUARTERS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Metric
            <select className="input mt-2" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
              <option value="spend">Spend</option>
              <option value="invoices">Volume</option>
              <option value="approved">Approved</option>
            </select>
          </label>
          <label className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Ledger subtotals
            <select className="input mt-2" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              {REPORT_GROUP_BY.map((g) => (
                <option key={g.id || 'none'} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Vendor
          <select
            className="input mt-2"
            value={vendors[0] ?? ''}
            onChange={(e) => setVendors(e.target.value ? [e.target.value] : [])}
          >
            <option value="">All vendors</option>
            {vendorOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Contract
          <select
            className="input mt-2"
            value={contractIds[0] ?? ''}
            onChange={(e) => setContractIds(e.target.value ? [e.target.value] : [])}
          >
            <option value="">All contracts</option>
            {data.contracts.map((cn) => (
              <option key={cn.id} value={cn.id}>
                {cn.contract_no}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Cost element
          <select
            className="input mt-2"
            value={costElements[0] ?? ''}
            onChange={(e) => setCostElements(e.target.value ? [e.target.value] : [])}
          >
            <option value="">All cost elements</option>
            {costOptions.map((ce) => (
              <option key={ce} value={ce}>
                {ce}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REPORT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${statuses.includes(s) ? 'active' : ''}`}
                onClick={() => setStatuses((prev) => toggleValue(prev, s))}
                aria-pressed={statuses.includes(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.72rem] text-[var(--text-dim)]">Leave empty to include every status.</p>
        </fieldset>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={includeAccruals}
            onChange={(e) => setIncludeAccruals(e.target.checked)}
          />
          Include closed-year unpaid invoices (accruals)
        </label>
      </div>
    </Modal>
  )
}
