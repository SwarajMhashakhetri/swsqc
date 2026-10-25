import type { ReactNode } from 'react'
import styles from './Stat.module.css'

interface Props {
  label: string
  value: string
  unit?: string
  note?: ReactNode
  tone?: 'default' | 'signal' | 'accent'
  size?: 'regular' | 'large'
}

/** One number, set large, with its unit in grey: "2.0 GW". */
export function Stat({ label, value, unit, note, tone = 'default', size = 'regular' }: Props) {
  return (
    <div className={styles.stat} data-size={size}>
      <dt className="label">{label}</dt>
      <dd className={styles.figure} data-tone={tone}>
        <span className={styles.value}>{value}</span>
        {unit !== undefined && <span className={styles.unit}>{unit}</span>}
      </dd>
      {note !== undefined && <dd className={styles.note}>{note}</dd>}
    </div>
  )
}
