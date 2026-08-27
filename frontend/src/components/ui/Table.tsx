import type { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}

interface TableProps<T> {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  empty?: ReactNode
  loading?: boolean
}

export default function Table<T>({ columns, rows, rowKey, onRowClick, empty, loading }: TableProps<T>) {
  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-[var(--text-muted)]">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-[var(--text-muted)]">
                {empty ?? 'No records found'}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer' : ''}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`${c.className ?? ''} ${
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
                    }`}
                  >
                    {c.render ? c.render(row) : (row as Record<string, unknown>)[c.key] as ReactNode}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
