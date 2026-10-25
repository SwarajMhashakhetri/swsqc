import { scaleBand, scaleLinear } from 'd3-scale'
import type { Accuracy } from '../../api/types'
import { useElementWidth } from '../../hooks/useElementWidth'
import { formatInt, signed } from '../../lib/format'
import { barPath, niceCeil } from '../../lib/series'
import { DataTable } from './DataTable'
import { Legend } from './Legend'
import { Tooltip } from './Tooltip'
import { useCrosshair } from './useCrosshair'
import styles from './Chart.module.css'

interface Props {
  hours: Accuracy['by_hour']
  stale: boolean
}

const MARGIN = { top: 26, right: 8, bottom: 30, left: 40 }
const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/** MAE (bars) and mean error (dots) for each delivery hour, in delivery order from 23:00. */
export function HourlyErrorChart({ hours, stale }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = width < 560 ? 220 : 260
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10)
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const maes = hours.map((h) => h.metrics?.mae_mw ?? 0)
  const biases = hours.map((h) => h.metrics?.bias_mw ?? 0)
  const top = niceCeil(Math.max(500, ...maes, ...biases))
  const bottom = Math.min(0, ...biases)
  const x = scaleBand<number>()
    .domain(hours.map((_, i) => i))
    .range([0, innerWidth])
    .paddingInner(0.5)
    .paddingOuter(0.1)
  const y = scaleLinear().domain([bottom < 0 ? -niceCeil(-bottom) : 0, top]).range([innerHeight, 0])
  const barWidth = Math.min(x.bandwidth(), 14)
  const centre = (i: number) => (x(i) ?? 0) + x.bandwidth() / 2
  const { index: active, handlers } = useCrosshair(hours.map((_, i) => centre(i)), MARGIN.left)
  const hovered = active === null ? undefined : hours[active]
  const tickEvery = width < 560 ? 6 : 3

  return (
    <figure className={styles.figure}>
      <Legend
        items={[
          { label: 'Mean absolute error', kind: 'bar-accent' },
          { label: 'Mean error (bias)', kind: 'dot-signal' },
        ]}
      />
      <div
        ref={ref}
        className={styles.plot}
        tabIndex={0}
        role="group"
        aria-label="Error by delivery hour. Use left and right arrow keys to read each hour."
        {...handlers}
      >
        <svg
          width={width}
          height={height}
          className={`${styles.svg} ${active === null ? '' : styles.dimmed}`}
          data-stale={stale}
          role="img"
          aria-label="Mean absolute error and bias by hour of the delivery day"
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {y.ticks(4).map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line className={tick === 0 ? styles.baseline : styles.grid} x1={0} x2={innerWidth} />
                <text className={styles.tick} x={-10} dy="0.32em" textAnchor="end">
                  {(tick / 1000).toLocaleString('en-GB')}
                </text>
              </g>
            ))}
            <text className={styles.unit} x={-10} y={-14} textAnchor="end">
              GW
            </text>
            {hours.map((hour, i) => (
              <g key={hour.hour}>
                <path
                  className={`${styles.bar} ${styles.barAccent}`}
                  data-active={active === i}
                  d={barPath((x(i) ?? 0) + (x.bandwidth() - barWidth) / 2, barWidth, y(0), y(maes[i] ?? 0))}
                />
                {hour.metrics !== null && (
                  <circle className={`${styles.dot} ${styles.dotSignal}`} cx={centre(i)} cy={y(hour.metrics.bias_mw)} r={4} />
                )}
                {hour.hour % tickEvery === 0 && (
                  <text className={styles.tick} x={centre(i)} y={innerHeight + 20} textAnchor="middle">
                    {pad(hour.hour)}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
        {hovered !== undefined && active !== null && hovered.metrics !== null && (
          <Tooltip
            title={`${pad(hovered.hour)}–${pad((hovered.hour + 1) % 24)} UK`}
            x={MARGIN.left + centre(active)}
            width={width}
            rows={[
              { key: 'm', label: 'MAE', value: `${formatInt(hovered.metrics.mae_mw)} MW`, swatch: 'bar-accent' },
              { key: 'b', label: 'Bias', value: `${signed(hovered.metrics.bias_mw, 0)} MW`, swatch: 'dot-signal' },
              { key: 'p', label: 'P90 |error|', value: `${formatInt(hovered.metrics.p90_abs_error_mw)} MW` },
              { key: 'n', label: 'Hours scored', value: String(hovered.metrics.n) },
            ]}
          />
        )}
      </div>
      <DataTable
        caption="Error by delivery hour"
        rows={hours}
        rowKey={(h) => String(h.hour)}
        columns={[
          { label: 'Hour (UK)', value: (h) => pad(h.hour) },
          { label: 'MAE MW', value: (h) => (h.metrics === null ? '—' : formatInt(h.metrics.mae_mw)) },
          { label: 'Bias MW', value: (h) => (h.metrics === null ? '—' : signed(h.metrics.bias_mw, 0)) },
          { label: 'RMSE MW', value: (h) => (h.metrics === null ? '—' : formatInt(h.metrics.rmse_mw)) },
          { label: 'n', value: (h) => (h.metrics === null ? '0' : String(h.metrics.n)) },
        ]}
      />
    </figure>
  )
}
