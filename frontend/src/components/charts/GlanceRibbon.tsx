import { scaleLinear } from 'd3-scale'
import { area, curveMonotoneX, line } from 'd3-shape'
import { useId, useMemo } from 'react'
import type { DayRow, SeriesDay } from '../../api/types'
import { useElementWidth } from '../../hooks/useElementWidth'
import { useTweened } from '../../hooks/useTweened'
import { formatCalendarDate, formatInt } from '../../lib/format'
import { placeLabels, textWidth } from '../../lib/labels'
import { glancePoints, nearestIndex, niceCeil } from '../../lib/series'
import { Legend } from './Legend'
import { useCrosshair } from './useCrosshair'
import styles from './Chart.module.css'

interface Props {
  days: SeriesDay[]
  /** Daily energy at the same gate, for the readout. */
  energy: DayRow[] | undefined
  /** Delivery day open in the decision view. */
  selected: string | null
  gateName: string
  stale: boolean
  onOpen: (date: string) => void
}

const HOUR_MS = 3_600_000
const MARGIN = { top: 16, right: 0, bottom: 30, left: 34 }
const WEEK = 7

interface Row {
  x: number
  f: number | null
  a: number | null
}

const shortDate = (date: string) => formatCalendarDate(date, 'short').replace(/^\w+ /, '')

/**
 * The hero's product shot: every January delivery hour, forecast at the gate
 * against what the wind delivered, with the gap shaded by direction. A day is
 * picked by pointer, tap or arrow keys, and opens in the decision view.
 */
export function GlanceRibbon({ days, energy, selected, gateName, stale, onOpen }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const narrow = width < 560
  const height = narrow ? 180 : 260
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10)
  const innerHeight = height - MARGIN.top - MARGIN.bottom
  const id = useId().replace(/[^\w-]/g, '')

  // On a phone an hour is under a pixel wide, so the simplified form plots six-hour means.
  const points = useMemo(() => glancePoints(days, narrow ? 6 : 1), [days, narrow])
  const tweened = useTweened({ forecast: points.map((p) => p.forecast), actual: points.map((p) => p.actual) })
  const { spans, first, last } = useMemo(() => {
    const ranges = days.map((day) => {
      const start = Date.parse(day.start_time)
      return { date: day.delivery_date, start, end: start + day.forecast_mw.length * HOUR_MS }
    })
    return { spans: ranges, first: ranges[0]?.start ?? 0, last: ranges.at(-1)?.end ?? HOUR_MS }
  }, [days])
  const yMax = useMemo(
    () => niceCeil(Math.max(1000, ...points.flatMap((p) => [p.forecast ?? 0, p.actual ?? 0])) * 1.04),
    [points],
  )
  const x = useMemo(() => scaleLinear().domain([first, last]).range([0, innerWidth]), [first, last, innerWidth])
  const y = useMemo(() => scaleLinear().domain([0, yMax]).range([innerHeight, 0]), [yMax, innerHeight])

  // Hovering re-renders the ribbon; the 744-point paths are rebuilt only when data, size or tween change.
  const paths = useMemo(() => {
    const rows: Row[] = points.map((p, i) => ({ x: x(p.x), f: tweened.forecast[i] ?? null, a: tweened.actual[i] ?? null }))
    const both = (r: Row) => r.f !== null && r.a !== null
    const trace = (key: 'f' | 'a') =>
      line<Row>()
        .defined((r) => r[key] !== null)
        .x((r) => r.x)
        .y((r) => y(r[key] ?? 0))
        .curve(curveMonotoneX)(rows) ?? ''
    // Region between a line and one edge of the plot; intersecting two of them isolates the gap.
    const region = (key: 'f' | 'a', edge: number) =>
      area<Row>()
        .defined(both)
        .x((r) => r.x)
        .y0(edge)
        .y1((r) => y(r[key] ?? 0))
        .curve(curveMonotoneX)(rows) ?? ''
    return {
      forecast: trace('f'),
      actual: trace('a'),
      belowForecast: region('f', innerHeight),
      belowActual: region('a', innerHeight),
      aboveForecast: region('f', 0),
      aboveActual: region('a', 0),
    }
  }, [points, tweened, x, y, innerHeight])

  const centres = spans.map((s) => x((s.start + s.end) / 2))
  const selectedIndex = spans.findIndex((s) => s.date === selected)
  const { index: hovered, handlers } = useCrosshair(centres, MARGIN.left, Math.max(selectedIndex, 0))
  const focus = hovered ?? (selectedIndex >= 0 ? selectedIndex : null)
  const focusSpan = focus === null ? undefined : spans[focus]
  const focusEnergy = focusSpan === undefined ? undefined : energy?.find((d) => d.delivery_date === focusSpan.date)

  const open = (i: number) => {
    const span = spans[i]
    if (span !== undefined) onOpen(span.date)
  }

  // Weekly dates by default; the day under the pointer and the open day outrank them.
  const dayLabels = placeLabels(
    spans.flatMap((span, i) => {
      const emphasis = i === hovered ? 3 : i === selectedIndex ? 2 : 0
      if (emphasis === 0 && i % WEEK !== 0) return []
      const text = emphasis > 0 ? formatCalendarDate(span.date, 'short') : shortDate(span.date)
      return [{ key: span.date, text, anchor: centres[i] ?? 0, width: textWidth(text), priority: emphasis || 1, strong: emphasis > 0 }]
    }),
    { start: 0, end: innerWidth },
  )

  const hours = days.reduce((sum, d) => sum + d.forecast_mw.length, 0)
  const over = days.reduce(
    (sum, d) => sum + d.forecast_mw.filter((f, i) => f !== null && f > (d.actual_mw[i] ?? Infinity)).length,
    0,
  )
  const column = (i: number) => {
    const span = spans[i]
    return span === undefined ? null : { x: x(span.start), width: x(span.end) - x(span.start) }
  }
  const selectedColumn = selectedIndex >= 0 ? column(selectedIndex) : null
  const hoveredColumn = hovered === null || hovered === selectedIndex ? null : column(hovered)

  return (
    <figure className={`${styles.figure} ${styles.glance}`}>
      <figcaption className={styles.glanceHead}>
        <span className="label">January at a glance · {formatInt(hours)} delivery hours</span>
        <span className={styles.readout} aria-live="polite">
          {focusSpan !== undefined && (
            <>
              <span className={styles.readoutDay}>{formatCalendarDate(focusSpan.date, 'short')}</span>
              {focusEnergy !== undefined && (
                <>
                  <span>
                    Forecast <strong>{focusEnergy.forecast_gwh.toFixed(1)}</strong> GWh
                  </span>
                  <span>
                    Actual <strong>{focusEnergy.actual_gwh.toFixed(1)}</strong> GWh
                  </span>
                </>
              )}
            </>
          )}
        </span>
      </figcaption>
      <div
        ref={ref}
        className={`${styles.plot} ${styles.glancePlot}`}
        tabIndex={0}
        role="group"
        aria-label="January at a glance. Use left and right arrow keys to pick a delivery day, and Enter to open it below."
        {...handlers}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && hovered !== null) {
            event.preventDefault()
            open(hovered)
            return
          }
          handlers.onKeyDown(event)
        }}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          open(nearestIndex(centres, event.clientX - box.left - MARGIN.left))
        }}
      >
        <svg
          width={width}
          height={height}
          className={styles.svg}
          data-stale={stale}
          role="img"
          aria-label={`Wind forecast at ${gateName} against actual outturn for all ${formatInt(hours)} January delivery hours. The forecast was above the outturn in ${formatInt(over)} of them.`}
        >
          <defs>
            <clipPath id={`${id}-above-actual`}>
              <path d={paths.aboveActual} />
            </clipPath>
            <clipPath id={`${id}-above-forecast`}>
              <path d={paths.aboveForecast} />
            </clipPath>
            <pattern id={`${id}-hatch`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line className={styles.hatch} x1={0} x2={0} y1={0} y2={4} />
            </pattern>
          </defs>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {y.ticks(narrow ? 2 : 3).map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line className={tick === 0 ? styles.baseline : styles.grid} x1={0} x2={innerWidth} />
                <text className={styles.tick} x={-10} dy="0.32em" textAnchor="end">
                  {tick / 1000}
                </text>
              </g>
            ))}
            <text className={styles.unit} x={-10} y={-4} textAnchor="end">
              GW
            </text>
            {selectedColumn !== null && (
              <rect className={styles.zone} x={selectedColumn.x} width={selectedColumn.width} y={0} height={innerHeight} />
            )}
            {hoveredColumn !== null && (
              <rect className={styles.glanceHover} x={hoveredColumn.x} width={hoveredColumn.width} y={0} height={innerHeight} />
            )}
            <g className={styles.glanceData}>
              <path className={styles.fillOver} d={paths.belowForecast} clipPath={`url(#${id}-above-actual)`} />
              <path className={styles.fillUnder} d={paths.belowActual} clipPath={`url(#${id}-above-forecast)`} />
              <path fill={`url(#${id}-hatch)`} d={paths.belowActual} clipPath={`url(#${id}-above-forecast)`} />
              <path className={styles.glanceActual} d={paths.actual} />
              <path className={styles.glanceForecast} d={paths.forecast} />
            </g>
            {spans.map((span, i) => (
              <line
                key={span.date}
                className={styles.markerSoft}
                x1={x(span.start)}
                x2={x(span.start)}
                y1={innerHeight}
                y2={innerHeight + (i % WEEK === 0 ? 6 : 3)}
              />
            ))}
            {selectedColumn !== null && (
              <rect
                className={styles.glanceSelected}
                x={selectedColumn.x + 1}
                width={Math.max(selectedColumn.width - 2, 2)}
                y={innerHeight + 1}
                height={2}
                rx={1}
              />
            )}
            {dayLabels.map((label) => (
              <text
                key={label.key}
                className={label.strong ? styles.annotationStrong : styles.tick}
                x={label.x}
                y={innerHeight + 21}
              >
                {label.text}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <div className={styles.glanceFoot}>
        <Legend
          items={[
            { label: `Forecast at ${gateName}`, kind: 'forecast' },
            { label: 'Actual', kind: 'actual-hairline' },
            { label: 'Over-forecast · desk short', kind: 'fill-signal' },
            { label: 'Under-forecast · desk long', kind: 'hatch-accent' },
          ]}
        />
        <p className={styles.glanceHint}>Pick a day to open it below.</p>
      </div>
    </figure>
  )
}
