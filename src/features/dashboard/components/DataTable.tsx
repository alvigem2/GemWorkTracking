import type { Key, ReactNode } from 'react'
import LoadingState from './LoadingState'

interface DataTableProps<Row> {
  labelledBy: string
  columns: readonly { id: string; label: string; render: (row: Row) => ReactNode }[]
  rows: readonly Row[]
  getRowKey: (row: Row) => Key
  empty: ReactNode
  loading?: boolean
}

export default function DataTable<Row>({
  labelledBy, columns, rows, getRowKey, empty, loading = false,
}: DataTableProps<Row>) {
  return (
    <>
      <div className="admin-table-scroll" tabIndex={0} role="region" aria-labelledby={labelledBy}>
        <table className="admin-table" aria-labelledby={labelledBy}>
          <thead>
            <tr>{columns.map(column => <th key={column.id} scope="col">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={getRowKey(row)}>
                {columns.map(column => <td key={column.id}>{column.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading ? <LoadingState message="Cargando datos…" /> : rows.length === 0 && empty}
    </>
  )
}
