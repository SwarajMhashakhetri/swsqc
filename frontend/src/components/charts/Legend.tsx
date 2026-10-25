import styles from './Chart.module.css'

export interface LegendItem {
  label: string
  kind: string
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label}>
          <span className={styles.key} data-kind={item.kind} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
