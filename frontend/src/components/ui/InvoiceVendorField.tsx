import { Field } from './Field'
import SelectMenu from './SelectMenu'

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
      <SelectMenu
        value={vendorId}
        placeholder="Choose vendor"
        options={vendors.map((v) => ({ value: v.id, label: v.name }))}
        onChange={onChange}
      />
    </Field>
  )
}
