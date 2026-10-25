import { scaleLinear } from 'd3-scale'
import { area, curveMonotoneX, line } from 'd3-shape'
import type { HorizonRow } from '../../api/types'
import { useElementWidth } from '../../hooks/useElementWidth'
import { formatHours, formatInt, signed } from '../../lib/format'
import { placeLabels, textWidth } from '../../lib/labels'
import { niceCeil } from '../../lib/series'
import { DataTable } from './DataTable'
import { Legend } from './Legend'
import { Tooltip } from './Tooltip'
import { useCrosshair } from './useCrosshair'
import styles from './Chart.module.css'

interface Props {
  rows: HorizonRow[]
  /** Lead-time range of the forecast used at the chosen gate (hours). */
  zone: [number, number] | null
}

const MARGIN = { top: 34, right: 12, bottom: 34, left: 40 }

/** How error grows with forecast horizon, across every January run, with the desk's window shaded. */
export function HorizonChart({ rows, zone }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = width < 560 ? 240 : 300
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10)
  const innerHeight = height - MARGIN.top - MARGIN.bottom
  const maxLead = Math.max(1, ...rows.map((r) => r.lead_hour + 1))

  const x = scaleLinear().domain([0, maxLead]).range([0, innerWidth])
  const top = niceCeil(Math.max(1000, ...rows.map((r) => Math.max(r.mae_mw, r.p90_error_mw))))
  const bottom = Math.min(0, ...rows.map((r) => r.p10_error_mw))
  const y = scaleLinear()
    .domain([bottom < 0 ? -niceCeil(-bottom) : 0, top])
    .range([innerHeight, 0])
  const mid = (r: HorizonRow) => x(r.lead_hour + 0.5)
  const mae = line<HorizonRow>().x(mid).y((r) => y(r.mae_mw)).curve(curveMonotoneX)
  const bias = line<HorizonRow>().x(mid).y((r) => y(r.bias_mw)).curve(curveMonotoneX)
  const band = area<HorizonRow>()
    .x(mid)
    .y0((r) => y(r.p10_error_mw))
    .y1((r) => y(r.p90_error_mw))
    .curve(curveMonotoneX)
  const { index, handlers } = useCrosshair(rows.map(mid), MARGIN.left)
  const hovered = index === null ? undefined : rows[index]
  const ticks = x.ticks(width < 560 ? 4 : 8).filter((t) => Number.isInteger(t))
  // Centred over the shaded zone, free to slide anywhere above it, never past the plot edge.
  const [zoneLabel] =
    zone === null
      ? []
      : placeLabels(
          [{ key: 'zone', text: 'Your gate', anchor: (x(zone[0]) + x(zone[1])) / 2, width: textWidth('Your gate'), priority: 1 }],
          { start: 0, end: innerWidth, reach: (x(zone[1]) - x(zone[0])) / 2 },
        )

  return (
    <figure className={styles.figure}>
      <Legend
        items={[
          { label: 'MAE', kind: 'forecast' },
          { label: 'Bias', kind: 'signal' },
          { label: 'P10–P90 error', kind: 'band' },
        ]}
      />
      <div
        ref={ref}
        className={styles.plot}
        tabIndex={0}
        role="group"
        aria-label="Forecast error by lead time. Use left and right arrow keys to read each hour of lead time."
        {...handlers}
      >
        <svg width={width} height={height} className={styles.svg} role="img" aria-label="Forecast error against lead time">
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {zone !== null && (
              <g>
                <rect className={styles.zone} x={x(zone[0])} width={x(zone[1]) - x(zone[0])} y={-8} height={innerHeight + 8} rx={6} />
                {zoneLabel !== undefined && (
                  <text className={styles.annotation} x={zoneLabel.x} y={-14}>
                    {zoneLabel.text}
                  </text>
                )}
              </g>
            )}
            {y.ticks(5).map((tick) => (
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
            {ticks.map((tick) => (
              <text key={tick} className={styles.tick} x={x(tick)} y={innerHeight + 20} textAnchor="middle">
                {tick} h
              </text>
            ))}
            <path className={styles.band} d={band(rows) ?? ''} />
            <path className={styles.lineSignal} d={bias(rows) ?? ''} />
            <path className={styles.lineForecast} d={mae(rows) ?? ''} />
            {hovered !== undefined && (
              <g>
                <line className={styles.crosshair} x1={mid(hovered)} x2={mid(hovered)} y1={0} y2={innerHeight} />
                <circle className={`${styles.dot} ${styles.dotSignal}`} cx={mid(hovered)} cy={y(hovered.bias_mw)} r={4.5} />
                <circle className={`${styles.dot} ${styles.dotForecast}`} cx={mid(hovered)} cy={y(hovered.mae_mw)} r={4.5} />
              </g>
            )}
          </g>
        </svg>
        {hovered !== undefined && (
          <Tooltip
            title={`${hovered.lead_hour}–${hovered.lead_hour + 1} h ahead`}
            x={MARGIN.left + mid(hovered)}
            width={width}
            rows={[
              { key: 'm', label: 'MAE', value: `${formatInt(hovered.mae_mw)} MW`, swatch: 'forecast' },
              { key: 'b', label: 'Bias', value: `${signed(hovered.bias_mw, 0)} MW`, swatch: 'signal' },
              {
                key: 'r',
                label: 'P10–P90',
                value: `${signed(hovered.p10_error_mw, 0)} to ${signed(hovered.p90_error_mw, 0)}`,
                swatch: 'band',
              },
              { key: 'n', label: 'Forecasts scored', value: formatInt(hovered.n) },
            ]}
          />
        )}
      </div>
      <DataTable
        caption="Forecast error by lead time"
        rows={rows}
        rowKey={(r) => String(r.lead_hour)}
        columns={[
          { label: 'Lead (h)', value: (r) => `${formatHours(r.lead_hour)}–${formatHours(r.lead_hour + 1)}` },
          { label: 'MAE MW', value: (r) => formatInt(r.mae_mw) },
          { label: 'Bias MW', value: (r) => signed(r.bias_mw, 0) },
          { label: 'P10 MW', value: (r) => signed(r.p10_error_mw, 0) },
          { label: 'P90 MW', value: (r) => signed(r.p90_error_mw, 0) },
          { label: 'n', value: (r) => formatInt(r.n) },
        ]}
      />
    </figure>
  )
}
