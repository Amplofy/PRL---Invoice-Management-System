import { Field } from './Field'

export interface InvoiceVendorOption {
  id: string
  name: string
}

interface InvoiceVendorFieldProps {
  vendorId: string
  vendors: InvoiceVendorOption[]
  displayName?: string
  masterOn: boolean
  onChange: (vendorId: string) => void
}

export default function InvoiceVendorField({
  vendorId,
  vendors,
  displayName = '',
  masterOn,
  onChange,
}: InvoiceVendorFieldProps) {
  const selectedName = vendors.find((v) => v.id === vendorId)?.name || displayName
  if (!masterOn) {
    return (
      <Field label="Vendor" hint="Taken from the contract">
        <input className="input" value={selectedName || '—'} readOnly disabled />
      </Field>
    )
  }
  return (
    <Field label="Vendor" hint="Master Access: reassigns this contract's vendor">
      <select className="input" value={vendorId} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose vendor</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </Field>
  )
}
