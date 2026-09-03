import { ArrowDown, ArrowUp } from 'lucide-react'
import type { SortDirection } from '../../lib/export'

interface SortableThProps {
  label: string
  columnKey: string
  sortKey: string
  direction: SortDirection
  onSort: (key: string, dir: SortDirection) => void
  preferDesc?: boolean
  align?: 'left' | 'right'
  className?: string
}

export default function SortableTh({
  label,
  columnKey,
  sortKey,
  direction,
  onSort,
  preferDesc = false,
  align = 'left',
  className = '',
}: SortableThProps) {
  const active = sortKey === columnKey
  const handle = () => {
    if (active) onSort(columnKey, direction === 'asc' ? 'desc' : 'asc')
    else onSort(columnKey, preferDesc ? 'desc' : 'asc')
  }

  return (
    <th className={`${align === 'right' ? 'text-right' : ''} ${className}`.trim()}>
      <button
        type="button"
        className={`th-sort ${active ? 'is-active' : ''} ${align === 'right' ? 'ml-auto' : ''}`}
        onClick={handle}
        title={active ? `Sorted ${direction === 'asc' ? 'ascending' : 'descending'}. Click to reverse.` : `Sort by ${label}`}
        aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span>{label}</span>
        <span className="th-sort-icon" aria-hidden>
          {active && direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
        </span>
      </button>
    </th>
  )
}
