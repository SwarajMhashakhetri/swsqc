import { scaleLinear } from 'd3-scale'
import { curveStepAfter, line } from 'd3-shape'
import type { DecisionPreset, TimingRow } from '../../api/types'
import { useElementWidth } from '../../hooks/useElementWidth'
import { formatInt, formatMinutes, signed } from '../../lib/format'
import { placeLabels, textWidth } from '../../lib/labels'
import { hhmmOf, minutesOf } from '../../lib/series'
import { DataTable } from './DataTable'
import { Legend } from './Legend'
import { Tooltip } from './Tooltip'
import { useCrosshair } from './useCrosshair'
import styles from './Chart.module.css'

interface Props {
  rows: TimingRow[]
  presets: DecisionPreset[]
  publishSlots: string[]
}

const MARGIN = { top: 34, right: 16, bottom: 34, left: 44 }
const DAY_END = 23 * 60

interface Scored {
  minute: number
  row: TimingRow
  mae: number
}

/** MAE of the forecast you would hold, for every decision time on D-1: it only moves when a run lands. */
export function TimingChart({ rows, presets, publishSlots }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = width < 560 ? 240 : 300
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10)
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const scored: Scored[] = rows.flatMap((row) =>
    row.metrics === null ? [] : [{ minute: minutesOf(row.decision_time), row, mae: row.metrics.mae_mw }],
  )
  const values = scored.map((s) => s.mae)
  const low = Math.floor((Math.min(...values) - 60) / 100) * 100
  const high = Math.ceil((Math.max(...values) + 60) / 100) * 100
  const x = scaleLinear().domain([0, DAY_END]).range([0, innerWidth])
  const y = scaleLinear().domain([low, high]).range([innerHeight, 0])
  const stepLine = line<Scored>()
    .x((s) => x(s.minute))
    .y((s) => y(s.mae))
    .curve(curveStepAfter)
  const lastPoint = scored.at(-1)
  const path = stepLine(lastPoint === undefined ? scored : [...scored, { ...lastPoint, minute: DAY_END }]) ?? ''
  const { index, handlers } = useCrosshair(scored.map((s) => x(s.minute)), MARGIN.left)
  const hovered = index === null ? undefined : scored[index]
  const hourTicks = width < 560 ? [0, 360, 720, 1080] : [0, 180, 360, 540, 720, 900, 1080, 1260]
  const presetPoints = presets.flatMap((preset) => {
    const match = scored.find((s) => s.row.decision_time === preset.decision_time)
    return match === undefined ? [] : [{ preset, point: match }]
  })
  // The gates are 30 minutes apart: the first label sits left of its marker, the next right, and they give way rather than overlap.
  const presetLabels = placeLabels(
    presetPoints.map(({ preset, point }, i) => {
      const text = `${preset.exchange.replace(' SPOT', '')} ${preset.decision_time}`
      const align = i === 0 ? ('end' as const) : ('start' as const)
      return { key: preset.id, text, anchor: x(point.minute), width: textWidth(text), priority: -i, align }
    }),
    { start: 0, end: innerWidth },
  )

  return (
    <figure className={styles.figure}>
      <Legend
        items={[
          { label: 'MAE of the forecast held at that moment', kind: 'forecast' },
          { label: 'Regular publish times', kind: 'vintage' },
        ]}
      />
      <div
        ref={ref}
        className={styles.plot}
        tabIndex={0}
        role="group"
        aria-label="Accuracy by decision time on the day before delivery. Use left and right arrow keys to step through the day."
        {...handlers}
      >
        <svg width={width} height={height} className={styles.svg} role="img" aria-label="MAE by decision time">
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {y.ticks(4).map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line className={styles.grid} x1={0} x2={innerWidth} />
                <text className={styles.tick} x={-10} dy="0.32em" textAnchor="end">
                  {(tick / 1000).toFixed(1)}
                </text>
              </g>
            ))}
            <text className={styles.unit} x={-10} y={-18} textAnchor="end">
              GW
            </text>
            <line className={styles.baseline} x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} />
            {publishSlots.map((slot) => (
              <line
                key={slot}
                className={styles.lineVintage}
                x1={x(minutesOf(slot))}
                x2={x(minutesOf(slot))}
                y1={innerHeight}
                y2={innerHeight - 8}
              />
            ))}
            {hourTicks.map((minute) => (
              <text key={minute} className={styles.tick} x={x(minute)} y={innerHeight + 20} textAnchor="middle">
                {hhmmOf(minute)}
              </text>
            ))}
            <path className={styles.lineForecast} d={path} />
            {presetPoints.map(({ preset, point }) => (
              <g key={preset.id}>
                <line className={styles.marker} x1={x(point.minute)} x2={x(point.minute)} y1={y(point.mae)} y2={-14} />
                <circle className={`${styles.dot} ${styles.dotActual}`} cx={x(point.minute)} cy={y(point.mae)} r={4.5} />
              </g>
            ))}
            {presetLabels.map((label) => (
              <text key={label.key} className={styles.annotationStrong} x={label.x} y={-20}>
                {label.text}
              </text>
            ))}
            {hovered !== undefined && (
              <g>
                <line className={styles.crosshair} x1={x(hovered.minute)} x2={x(hovered.minute)} y1={0} y2={innerHeight} />
                <circle className={`${styles.dot} ${styles.dotForecast}`} cx={x(hovered.minute)} cy={y(hovered.mae)} r={4.5} />
              </g>
            )}
          </g>
        </svg>
        {hovered?.row.metrics != null && (
          <Tooltip
            title={`Decide at ${hovered.row.decision_time} on D-1`}
            x={MARGIN.left + x(hovered.minute)}
            width={width}
            rows={[
              { key: 'm', label: 'MAE', value: `${formatInt(hovered.row.metrics.mae_mw)} MW`, swatch: 'forecast' },
              { key: 'r', label: 'RMSE', value: `${formatInt(hovered.row.metrics.rmse_mw)} MW` },
              { key: 'b', label: 'Bias', value: `${signed(hovered.row.metrics.bias_mw, 0)} MW` },
              ...(hovered.row.median_forecast_age_minutes === null
                ? []
                : [{ key: 'a', label: 'Forecast age', value: formatMinutes(hovered.row.median_forecast_age_minutes) }]),
              { key: 'n', label: 'Hours scored', value: formatInt(hovered.row.metrics.n) },
            ]}
          />
        )}
      </div>
      <DataTable
        caption="Accuracy by decision time"
        rows={rows}
        rowKey={(r) => r.decision_time}
        columns={[
          { label: 'Decision (UK, D-1)', value: (r) => r.decision_time },
          { label: 'MAE MW', value: (r) => (r.metrics === null ? '—' : formatInt(r.metrics.mae_mw)) },
          { label: 'RMSE MW', value: (r) => (r.metrics === null ? '—' : formatInt(r.metrics.rmse_mw)) },
          { label: 'Bias MW', value: (r) => (r.metrics === null ? '—' : signed(r.metrics.bias_mw, 0)) },
          {
            label: 'Forecast age',
            value: (r) => (r.median_forecast_age_minutes === null ? '—' : formatMinutes(r.median_forecast_age_minutes)),
          },
          { label: 'Hours', value: (r) => (r.metrics === null ? '0' : String(r.metrics.n)) },
        ]}
      />
    </figure>
  )
}
