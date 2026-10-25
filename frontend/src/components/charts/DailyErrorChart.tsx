import { scaleBand, scaleLinear } from 'd3-scale'
import type { DayRow } from '../../api/types'
import { useElementWidth } from '../../hooks/useElementWidth'
import { formatCalendarDate, formatClock, formatInt, signed } from '../../lib/format'
import { placeLabels, textWidth } from '../../lib/labels'
import { barPath, niceCeil } from '../../lib/series'
import { DataTable } from './DataTable'
import { Legend } from './Legend'
import { Tooltip } from './Tooltip'
import { useCrosshair } from './useCrosshair'
import styles from './Chart.module.css'

interface Props {
  days: DayRow[]
  stale: boolean
}

const MARGIN = { top: 26, right: 8, bottom: 30, left: 40 }
const LABELLED = 3

const errorGwh = (day: DayRow) => day.forecast_gwh - day.actual_gwh

/** Daily energy error: up = forecast too high (short), down = too low (long). */
export function DailyErrorChart({ days, stale }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = width < 560 ? 240 : 300
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10)
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const errors = days.map(errorGwh)
  const top = niceCeil(Math.max(10, ...errors))
  const bottom = -niceCeil(Math.max(10, ...errors.map((e) => -e)))
  const x = scaleBand<number>()
    .domain(days.map((_, i) => i))
    .range([0, innerWidth])
    .paddingInner(0.28)
    .paddingOuter(0.1)
  const y = scaleLinear().domain([bottom, top]).range([innerHeight, 0]).nice()
  const barWidth = Math.min(x.bandwidth(), 24)
  const offset = (x.bandwidth() - barWidth) / 2
  const tickEvery = width < 560 ? 7 : 3
  const centre = (i: number) => (x(i) ?? 0) + x.bandwidth() / 2
  // The biggest misses get a date, biggest first. Labels above the zero line never meet those below it.
  const peaks = days
    .map((day, i) => ({ day, i, e: errorGwh(day) }))
    .sort((a, b) => Math.abs(b.e) - Math.abs(a.e))
    .slice(0, LABELLED)
    .map(({ day, i, e }) => {
      const text = formatCalendarDate(day.delivery_date, 'short').replace(/^\w+ /, '')
      return { key: day.delivery_date, text, anchor: centre(i), width: textWidth(text), priority: Math.abs(e), e }
    })
  const peakLabels = [peaks.filter((p) => p.e >= 0), peaks.filter((p) => p.e < 0)].flatMap((side) =>
    placeLabels(side, { start: 0, end: innerWidth }),
  )
  const { index: active, handlers } = useCrosshair(days.map((_, i) => centre(i)), MARGIN.left)
  const hoveredDay = active === null ? undefined : days[active]

  return (
    <figure className={styles.figure}>
      <Legend
        items={[
          { label: 'Over-forecast · desk short', kind: 'bar-signal' },
          { label: 'Under-forecast · desk long', kind: 'bar-accent' },
        ]}
      />
      <div
        ref={ref}
        className={styles.plot}
        tabIndex={0}
        role="group"
        aria-label="Daily energy error by delivery day. Use left and right arrow keys to read each day."
        {...handlers}
      >
        <svg
          width={width}
          height={height}
          className={`${styles.svg} ${active === null ? '' : styles.dimmed}`}
          data-stale={stale}
          role="img"
          aria-label="Daily energy error for each January delivery day"
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {y.ticks(5).map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line className={tick === 0 ? styles.baseline : styles.grid} x1={0} x2={innerWidth} />
                <text className={styles.tick} x={-10} dy="0.32em" textAnchor="end">
                  {tick > 0 ? `+${tick}` : tick < 0 ? `−${-tick}` : 0}
                </text>
              </g>
            ))}
            <text className={styles.unit} x={-10} y={-14} textAnchor="end">
              GWh
            </text>
            {days.map((day, i) => {
              const e = errorGwh(day)
              const left = (x(i) ?? 0) + offset
              return (
                <g key={day.delivery_date}>
                  <path
                    className={`${styles.bar} ${e >= 0 ? styles.barSignal : styles.barAccent}`}
                    data-active={active === i}
                    d={barPath(left, barWidth, y(0), y(e))}
                  />
                  {i % tickEvery === 0 && (
                    <text className={styles.tick} x={centre(i)} y={innerHeight + 20} textAnchor="middle">
                      {Number(day.delivery_date.slice(8))}
                    </text>
                  )}
                </g>
              )
            })}
            {peakLabels.map((label) => (
              <text key={label.key} className={styles.annotation} x={label.x} y={label.e >= 0 ? y(label.e) - 8 : y(label.e) + 16}>
                {label.text}
              </text>
            ))}
          </g>
        </svg>
        {hoveredDay !== undefined && active !== null && (
          <Tooltip
            title={formatCalendarDate(hoveredDay.delivery_date, 'short')}
            x={MARGIN.left + centre(active)}
            width={width}
            rows={[
              { key: 'f', label: 'Forecast', value: `${formatInt(hoveredDay.forecast_gwh)} GWh` },
              { key: 'a', label: 'Actual', value: `${formatInt(hoveredDay.actual_gwh)} GWh` },
              { key: 'e', label: 'Error', value: `${signed(errorGwh(hoveredDay), 1)} GWh` },
              ...(hoveredDay.metrics === null
                ? []
                : [{ key: 'm', label: 'MAE', value: `${formatInt(hoveredDay.metrics.mae_mw)} MW` }]),
              ...hoveredDay.publish_times.slice(-1).map((p) => ({ key: 'p', label: 'Run used', value: formatClock(p) })),
            ]}
          />
        )}
      </div>
      <DataTable
        caption="Daily energy error by delivery day"
        rows={days}
        rowKey={(d) => d.delivery_date}
        columns={[
          { label: 'Delivery day', value: (d) => formatCalendarDate(d.delivery_date, 'short') },
          { label: 'Run used (UK)', value: (d) => d.publish_times.map((p) => formatClock(p)).join(', ') },
          { label: 'Forecast GWh', value: (d) => d.forecast_gwh.toFixed(1) },
          { label: 'Actual GWh', value: (d) => d.actual_gwh.toFixed(1) },
          { label: 'Error GWh', value: (d) => signed(errorGwh(d), 1) },
          { label: 'MAE MW', value: (d) => (d.metrics === null ? '—' : formatInt(d.metrics.mae_mw)) },
          { label: 'Bias MW', value: (d) => (d.metrics === null ? '—' : signed(d.metrics.bias_mw, 0)) },
        ]}
      />
    </figure>
  )
}
