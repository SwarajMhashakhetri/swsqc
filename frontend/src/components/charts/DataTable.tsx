import styles from './Chart.module.css'

export interface Column<Row> {
  label: string
  value: (row: Row) => string
}

interface Props<Row> {
  caption: string
  columns: Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
}

/** "View data": the accessible, chart-free twin of every figure. */
export function DataTable<Row>({ caption, columns, rows, rowKey }: Props<Row>) {
  return (
    <details className={styles.table}>
      <summary>View data</summary>
      <div className={styles.tableScroll}>
        <table>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.label}>{column.value(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
