import { scaleLinear } from 'd3-scale'
import { area, curveMonotoneX, line } from 'd3-shape'
import { useMemo } from 'react'
import { useElementWidth } from '../../hooks/useElementWidth'
import { useTweened } from '../../hooks/useTweened'
import { formatClock, formatDayShort, formatHours, formatInt, signed, ukHourOf } from '../../lib/format'
import { hourTicks, niceCeil, type HourDatum } from '../../lib/series'
import { DataTable } from './DataTable'
import { Legend, type LegendItem } from './Legend'
import { Tooltip, type TooltipRow } from './Tooltip'
import { useCrosshair } from './useCrosshair'
import styles from './Chart.module.css'

export interface VintageLine {
  publishTime: string
  points: { x: number; mw: number }[]
}

interface Props {
  data: HourDatum[]
  vintages: VintageLine[]
  windowStart: string
  windowEnd: string
  showActual: boolean
  showVintages: boolean
  stale: boolean
  label: string
}

const HOUR_MS = 3_600_000
const MARGIN = { top: 22, right: 12, bottom: 30, left: 40 }

type Point = [number, number | null]

const defined = (d: Point) => d[1] !== null

export function ForecastChart({ data, vintages, windowStart, windowEnd, showActual, showVintages, stale, label }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const narrow = width < 560
  const height = narrow ? 280 : 380
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10)
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const tweened = useTweened({
    forecast: data.map((d) => d.forecast),
    low: data.map((d) => d.low),
    high: data.map((d) => d.high),
    actual: data.map((d) => d.actual),
  })

  const yMax = useMemo(() => {
    const values = data.flatMap((d) => [d.high, d.forecast, d.actual])
    const vintageValues = vintages.flatMap((v) => v.points.map((p) => p.mw))
    const max = Math.max(1000, ...values.filter((v): v is number => v !== null), ...vintageValues)
    return niceCeil(max * 1.05)
  }, [data, vintages])

  const x = scaleLinear()
    .domain([Date.parse(windowStart), Date.parse(windowEnd)])
    .range([0, innerWidth])
  const y = scaleLinear().domain([0, yMax]).range([innerHeight, 0])
  const yTicks = y.ticks(narrow ? 4 : 5)
  const xTicks = hourTicks(windowStart, windowEnd, narrow ? 6 : 3)

  const pointsOf = (values: readonly (number | null)[]): Point[] => data.map((d, i) => [d.x, values[i] ?? null])
  const path = line<Point>()
    .defined(defined)
    .x((d) => x(d[0]))
    .y((d) => y(d[1] ?? 0))
    .curve(curveMonotoneX)
  const bandPath = area<[number, number | null, number | null]>()
    .defined((d) => d[1] !== null && d[2] !== null)
    .x((d) => x(d[0]))
    .y0((d) => y(d[1] ?? 0))
    .y1((d) => y(d[2] ?? 0))
    .curve(curveMonotoneX)
  const vintagePath = line<{ x: number; mw: number }>()
    .x((d) => x(d.x))
    .y((d) => y(d.mw))
    .curve(curveMonotoneX)

  const { index, handlers } = useCrosshair(
    data.map((d) => x(d.x)),
    MARGIN.left,
  )
  const hovered = index === null ? undefined : data[index]

  const legend: LegendItem[] = [
    { label: 'Forecast at gate closure', kind: 'forecast' },
    { label: 'P10–P90 January error band', kind: 'band' },
    ...(showActual ? [{ label: 'Actual (hindsight)', kind: 'actual' }] : []),
    ...(showVintages && vintages.length > 0 ? [{ label: 'Earlier runs, last 24 h', kind: 'vintage' }] : []),
  ]

  const tooltipRows = (d: HourDatum): TooltipRow[] => {
    const rows: TooltipRow[] = []
    if (d.forecast !== null) rows.push({ key: 'f', label: 'Forecast', value: `${formatInt(d.forecast)} MW`, swatch: 'forecast' })
    if (d.low !== null && d.high !== null)
      rows.push({ key: 'b', label: 'P10–P90', value: `${formatInt(d.low)}–${formatInt(d.high)}`, swatch: 'band' })
    if (showActual && d.actual !== null) rows.push({ key: 'a', label: 'Actual', value: `${formatInt(d.actual)} MW`, swatch: 'actual' })
    if (showActual && d.error !== null) rows.push({ key: 'e', label: 'Error', value: `${signed(d.error, 0)} MW` })
    if (d.lead !== null) rows.push({ key: 'l', label: 'Lead time', value: `${formatHours(d.lead)} h` })
    if (d.forecast === null) rows.push({ key: 'n', label: 'Forecast', value: 'not yet published' })
    return rows
  }

  const hourLabel = (d: HourDatum) =>
    `${formatDayShort(d.start)} · ${formatClock(d.start)}–${formatClock(new Date(Date.parse(d.start) + HOUR_MS))}`

  const newestVintage = vintages.length
  return (
    <figure className={styles.figure}>
      <Legend items={legend} />
      <div
        ref={ref}
        className={styles.plot}
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use left and right arrow keys to read each hour.`}
        {...handlers}
      >
        <svg width={width} height={height} className={styles.svg} data-stale={stale} role="img" aria-label={label}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {yTicks.map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line className={tick === 0 ? styles.baseline : styles.grid} x1={0} x2={innerWidth} />
                <text className={styles.tick} x={-10} dy="0.32em" textAnchor="end">
                  {tick / 1000}
                </text>
              </g>
            ))}
            <text className={styles.unit} x={-10} y={-10} textAnchor="end">
              GW
            </text>
            {xTicks.map((tick) => {
              const midnight = ukHourOf(new Date(tick)) === 0
              return (
                <text
                  key={tick}
                  className={midnight ? styles.annotationStrong : styles.tick}
                  x={x(tick)}
                  y={innerHeight + 20}
                  textAnchor="middle"
                >
                  {midnight ? formatDayShort(new Date(tick)) : formatClock(new Date(tick))}
                </text>
              )
            })}

            <path className={styles.band} d={bandPath(data.map((d, i) => [d.x, tweened.low[i] ?? null, tweened.high[i] ?? null])) ?? ''} />
            {showVintages &&
              vintages.map((v, i) => (
                <path
                  key={v.publishTime}
                  className={styles.lineVintage}
                  style={{ opacity: 0.35 + (0.5 * (i + 1)) / newestVintage }}
                  d={vintagePath(v.points) ?? ''}
                />
              ))}
            {showActual && <path className={styles.lineActual} d={path(pointsOf(tweened.actual)) ?? ''} />}
            <path className={styles.lineForecast} d={path(pointsOf(tweened.forecast)) ?? ''} />

            {hovered !== undefined && (
              <g>
                <line className={styles.crosshair} x1={x(hovered.x)} x2={x(hovered.x)} y1={0} y2={innerHeight} />
                {showActual && hovered.actual !== null && (
                  <circle className={`${styles.dot} ${styles.dotActual}`} cx={x(hovered.x)} cy={y(hovered.actual)} r={4.5} />
                )}
                {hovered.forecast !== null && (
                  <circle className={`${styles.dot} ${styles.dotForecast}`} cx={x(hovered.x)} cy={y(hovered.forecast)} r={4.5} />
                )}
              </g>
            )}
          </g>
        </svg>
        {hovered !== undefined && (
          <Tooltip title={hourLabel(hovered)} rows={tooltipRows(hovered)} x={MARGIN.left + x(hovered.x)} width={width} />
        )}
      </div>
      <DataTable
        caption={label}
        rows={data}
        rowKey={(d) => d.start}
        columns={[
          { label: 'Hour (UK)', value: (d) => hourLabel(d) },
          { label: 'Forecast MW', value: (d) => (d.forecast === null ? '—' : formatInt(d.forecast)) },
          { label: 'P10 MW', value: (d) => (d.low === null ? '—' : formatInt(d.low)) },
          { label: 'P90 MW', value: (d) => (d.high === null ? '—' : formatInt(d.high)) },
          { label: 'Actual MW', value: (d) => (d.actual === null ? '—' : formatInt(d.actual)) },
          { label: 'Error MW', value: (d) => (d.error === null ? '—' : signed(d.error, 0)) },
          { label: 'Lead h', value: (d) => (d.lead === null ? '—' : formatHours(d.lead)) },
        ]}
      />
    </figure>
  )
}
