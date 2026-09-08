import {
  t2Options,
  t3Options,
  matrixRowFor,
  resolveCostElement,
  type ServiceMatrixRow,
} from '../../lib/invoice'
import LockedAutoField from './LockedAutoField'

export interface ServiceSelectsValue {
  t1: string
  t2: string
  t3: string
  tanker_name: string
  trips: string
  cost_element: string
  service_from?: string
  service_to?: string
}

interface ServiceSelectsProps {
  matrix: ServiceMatrixRow[]
  value: ServiceSelectsValue
  onChange: (patch: Partial<ServiceSelectsValue>) => void
  disabled?: boolean
  issues?: Record<string, string>
  /** When true (default), Type 1 stays locked until a contract is selected. */
  contractId?: string
  requireContract?: boolean
  /** Invoice shows tanker/dates/cost; catalog is T1/T2/T3 only. */
  mode?: 'invoice' | 'catalog'
}

export default function ServiceSelects({
  matrix,
  value,
  onChange,
  disabled = false,
  issues = {},
  contractId,
  requireContract = true,
  mode = 'invoice',
}: ServiceSelectsProps) {
  const row = matrixRowFor(matrix, value.t1, value.t2, value.t3)
  const showTanker = Boolean(row?.tanker_required)
  const showTrips = Boolean(row?.trips)
  const costElement = value.cost_element || resolveCostElement(matrix, value.t1, value.t2, value.t3) || ''
  const catalog = mode === 'catalog'
  const t1Locked = disabled || (requireContract && !contractId)
  const t1Placeholder = t1Locked ? 'Select a contract first' : 'Select…'

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
          Service Type 1<span className="ml-0.5 text-[var(--danger)]">*</span>
        </span>
        <select
          className={`input ${issues.t1 ? 'invalid' : ''}`}
          value={value.t1}
          disabled={t1Locked}
          onChange={(e) => onChange({ t1: e.target.value, t2: '', t3: '', tanker_name: '', trips: '', cost_element: '' })}
        >
          <option value="">{t1Placeholder}</option>
          {Array.from(new Set(matrix.map((m) => m.t1))).sort().map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {issues.t1 && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.t1}</span>}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
          Service Type 2<span className="ml-0.5 text-[var(--danger)]">*</span>
        </span>
        <select
          className={`input ${issues.t2 ? 'invalid' : ''}`}
          value={value.t2}
          disabled={disabled || !value.t1}
          onChange={(e) => onChange({ t2: e.target.value, t3: '', tanker_name: '', trips: '', cost_element: '' })}
        >
          <option value="">Select…</option>
          {t2Options(matrix, value.t1).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {issues.t2 && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.t2}</span>}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
          Service Type 3<span className="ml-0.5 text-[var(--danger)]">*</span>
        </span>
        <select
          className={`input ${issues.t3 ? 'invalid' : ''}`}
          value={value.t3}
          disabled={disabled || !value.t2}
          onChange={(e) => onChange({ t3: e.target.value, tanker_name: '', trips: '', cost_element: '' })}
        >
          <option value="">{value.t2 ? 'Select…' : 'Select type 2 first'}</option>
          {t3Options(matrix, value.t1, value.t2).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {issues.t3 && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.t3}</span>}
      </label>

      {!catalog && showTanker && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
            Tanker Name<span className="ml-0.5 text-[var(--danger)]">*</span>
          </span>
          <input
            className={`input ${issues.tanker_name ? 'invalid' : ''}`}
            value={value.tanker_name}
            disabled={disabled}
            onChange={(e) => onChange({ tanker_name: e.target.value })}
          />
          {issues.tanker_name && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.tanker_name}</span>}
        </label>
      )}

      {!catalog && showTrips && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">No. of Trips</span>
          <input
            type="number"
            min={1}
            className="input"
            value={value.trips}
            disabled={disabled}
            onChange={(e) => onChange({ trips: e.target.value })}
          />
        </label>
      )}

      {!catalog && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Service From</span>
          <input
            type="date"
            className={`input ${issues.service_from ? 'invalid' : ''}`}
            value={value.service_from ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ service_from: e.target.value })}
          />
          {issues.service_from && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.service_from}</span>}
        </label>
      )}

      {!catalog && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Service To</span>
          <input
            type="date"
            className={`input ${issues.service_to ? 'invalid' : ''}`}
            value={value.service_to ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ service_to: e.target.value })}
          />
          {issues.service_to && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.service_to}</span>}
        </label>
      )}

      {!catalog && (
        <LockedAutoField
          label="Cost Element"
          value={costElement}
          onCommit={(next) => onChange({ cost_element: next })}
          hint="Resolved from service matrix"
          placeholder="Resolved from service matrix"
        />
      )}
    </div>
  )
}
