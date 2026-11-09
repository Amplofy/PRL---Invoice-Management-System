import {
  t2Options,
  t3Options,
  matrixRowFor,
  resolveCostElement,
  catalogLocations,
  type ServiceMatrixRow,
} from '../../lib/invoice'
import DateField from './DateField'
import LockedAutoField from './LockedAutoField'
import SelectMenu from './SelectMenu'

export interface ServiceSelectsValue {
  t1: string
  t2: string
  t3: string
  location?: string
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
  /** Invoice shows tanker/dates/location/cost; catalog is T1/T2/T3 only. */
  mode?: 'invoice' | 'catalog'
}

function opts(values: string[]): { value: string; label: string }[] {
  return values.map((o) => ({ value: o, label: o }))
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
  const locations = catalog ? [] : catalogLocations(row)

  const t1Locked = disabled || (requireContract && !contractId)
  const t2Locked = disabled || !value.t1
  const t3Locked = disabled || !value.t2
  const locationLocked = disabled || !value.t3
  const t1Placeholder = t1Locked ? 'Select a contract first' : 'Select…'

  const pickType = (t1: string) =>
    onChange({ t1, t2: '', t3: '', location: '', tanker_name: '', trips: '', cost_element: '' })
  const pickService = (t2: string) =>
    onChange({ t2, t3: '', location: '', tanker_name: '', trips: '', cost_element: '' })
  const pickDetail = (t3: string) => {
    const locs = catalogLocations(matrixRowFor(matrix, value.t1, value.t2, t3))
    onChange({ t3, location: locs.length === 1 ? locs[0] : '', tanker_name: '', trips: '', cost_element: '' })
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
          Service Type 1<span className="ml-0.5 text-[var(--danger)]">*</span>
        </span>
        <SelectMenu
          value={value.t1}
          disabled={t1Locked}
          invalid={Boolean(issues.t1)}
          placeholder={t1Placeholder}
          options={opts(Array.from(new Set(matrix.map((m) => m.t1))).sort())}
          onChange={pickType}
        />
        {issues.t1 && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.t1}</span>}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
          Service Type 2<span className="ml-0.5 text-[var(--danger)]">*</span>
        </span>
        <SelectMenu
          value={value.t2}
          disabled={t2Locked}
          invalid={Boolean(issues.t2)}
          placeholder={t2Locked ? 'Select type 1 first' : 'Select…'}
          options={opts(t2Options(matrix, value.t1))}
          onChange={pickService}
        />
        {issues.t2 && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.t2}</span>}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
          Service Type 3<span className="ml-0.5 text-[var(--danger)]">*</span>
        </span>
        <SelectMenu
          value={value.t3}
          disabled={t3Locked}
          invalid={Boolean(issues.t3)}
          placeholder={t3Locked ? 'Select type 2 first' : 'Select…'}
          options={opts(t3Options(matrix, value.t1, value.t2))}
          onChange={pickDetail}
        />
        {issues.t3 && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.t3}</span>}
      </label>

      {!catalog && locations.length > 0 && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">
            Location<span className="ml-0.5 text-[var(--danger)]">*</span>
          </span>
          <SelectMenu
            value={value.location ?? ''}
            disabled={locationLocked}
            invalid={Boolean(issues.location)}
            placeholder={locationLocked ? 'Select type 3 first' : 'Select…'}
            options={opts(locations)}
            onChange={(location) => onChange({ location })}
          />
          {issues.location && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.location}</span>}
        </label>
      )}

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
          <DateField
            value={value.service_from ?? ''}
            disabled={disabled}
            invalid={Boolean(issues.service_from)}
            onChange={(service_from) => onChange({ service_from })}
          />
          {issues.service_from && <span className="mt-1 block text-xs text-[var(--danger)]">{issues.service_from}</span>}
        </label>
      )}

      {!catalog && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Service To</span>
          <DateField
            value={value.service_to ?? ''}
            disabled={disabled}
            invalid={Boolean(issues.service_to)}
            onChange={(service_to) => onChange({ service_to })}
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
          placeholder="From service matrix"
        />
      )}
    </div>
  )
}
