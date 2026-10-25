import styles from './Chart.module.css'

export interface TooltipRow {
  key: string
  label: string
  value: string
  swatch?: string
}

interface Props {
  title: string
  rows: TooltipRow[]
  /** Anchor x in px, relative to the plot container. */
  x: number
  width: number
}

const TOOLTIP_WIDTH = 210
const OFFSET = 16

/** Frosted readout that sits beside the crosshair and flips sides near the right edge. */
export function Tooltip({ title, rows, x, width }: Props) {
  const flip = x + OFFSET + TOOLTIP_WIDTH > width
  const left = flip ? Math.max(x - OFFSET - TOOLTIP_WIDTH, 0) : x + OFFSET
  return (
    <div className={styles.tooltip} style={{ left, width: TOOLTIP_WIDTH }} aria-hidden="true">
      <div className={styles.tooltipTitle}>{title}</div>
      <dl className={styles.tooltipRows}>
        {rows.map((row) => (
          <div key={row.key} style={{ display: 'contents' }}>
            <dt>
              {row.swatch !== undefined && <span className={styles.key} data-kind={row.swatch} />}
              {row.label}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
