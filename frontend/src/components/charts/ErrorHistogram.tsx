import { scaleLinear } from 'd3-scale'
import type { Accuracy } from '../../api/types'
import { useElementWidth } from '../../hooks/useElementWidth'
import { formatInt, formatPercent, signed, toSignedGw } from '../../lib/format'
import { placeLabels, textWidth } from '../../lib/labels'
import { barPath } from '../../lib/series'
import { DataTable } from './DataTable'
import { Legend } from './Legend'
import { Tooltip } from './Tooltip'
import { useCrosshair } from './useCrosshair'
import styles from './Chart.module.css'

interface Props {
  distribution: Accuracy['distribution']
  bufferMw: number
  stale: boolean
}

const MARGIN = { top: 30, right: 12, bottom: 50, left: 36 }

/** Distribution of hourly errors; bins beyond the buffer are the hours that would have breached it. */
export function ErrorHistogram({ distribution, bufferMw, stale }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = width < 560 ? 220 : 260
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10)
  const innerHeight = height - MARGIN.top - MARGIN.bottom
  const { bins } = distribution
  const total = bins.reduce((sum, b) => sum + b.count, 0)

  const first = bins[0]?.lower_mw ?? -1000
  const last = bins.at(-1)?.upper_mw ?? 1000
  const x = scaleLinear().domain([first, last]).range([0, innerWidth])
  const y = scaleLinear()
    .domain([0, Math.max(1, ...bins.map((b) => b.count))])
    .range([innerHeight, 0])
    .nice()
  const gap = 2
  const centres = bins.map((b) => x((b.lower_mw + b.upper_mw) / 2))
  const { index, handlers } = useCrosshair(centres, MARGIN.left)
  const hovered = index === null ? undefined : bins[index]
  const ticks = x.ticks(width < 560 ? 5 : 9).filter((t) => t % 1000 === 0)
  const median = distribution.p50_mw
  // The buffer is the point of the chart: its label keeps its place, the median's moves aside or gives way.
  const annotations = placeLabels(
    [
      { key: 'buffer', text: `Buffer ${toSignedGw(bufferMw)} GW`, anchor: x(bufferMw), priority: 2, strong: true },
      ...(median === null
        ? []
        : [{ key: 'median', text: `Median ${toSignedGw(median)} GW`, anchor: x(median), priority: 1, strong: false }]),
    ].map((label) => ({ ...label, width: textWidth(label.text) })),
    { start: 0, end: innerWidth },
  )

  return (
    <figure className={styles.figure}>
      <Legend
        items={[
          { label: 'Hours covered by the buffer', kind: 'bar-muted' },
          { label: 'Hours that breach it', kind: 'bar-signal' },
        ]}
      />
      <div
        ref={ref}
        className={styles.plot}
        tabIndex={0}
        role="group"
        aria-label="Distribution of hourly forecast errors. Use left and right arrow keys to read each bin."
        {...handlers}
      >
        <svg
          width={width}
          height={height}
          className={`${styles.svg} ${index === null ? '' : styles.dimmed}`}
          data-stale={stale}
          role="img"
          aria-label="Histogram of hourly forecast errors with the planning buffer marked"
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {y.ticks(4).map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line className={tick === 0 ? styles.baseline : styles.grid} x1={0} x2={innerWidth} />
                <text className={styles.tick} x={-10} dy="0.32em" textAnchor="end">
                  {tick}
                </text>
              </g>
            ))}
            <text className={styles.unit} x={-MARGIN.left} y={-16}>
              Hours
            </text>
            {bins.map((bin, i) => {
              const left = x(bin.lower_mw) + gap / 2
              const breach = (bin.lower_mw + bin.upper_mw) / 2 > bufferMw
              return (
                <path
                  key={bin.lower_mw}
                  className={`${styles.bar} ${breach ? styles.barSignal : styles.barMuted}`}
                  data-active={index === i}
                  d={barPath(left, x(bin.upper_mw) - x(bin.lower_mw) - gap, y(0), y(bin.count), 3)}
                />
              )
            })}
            <line className={styles.markerSoft} x1={x(0)} x2={x(0)} y1={-6} y2={innerHeight} />
            {median !== null && <line className={styles.marker} x1={x(median)} x2={x(median)} y1={-6} y2={innerHeight} />}
            <line className={styles.threshold} x1={x(bufferMw)} x2={x(bufferMw)} y1={-6} y2={innerHeight} />
            {annotations.map((label) => (
              <text key={label.key} className={label.strong ? styles.annotationStrong : styles.annotation} x={label.x} y={-12}>
                {label.text}
              </text>
            ))}
            {ticks.map((tick) => (
              <text key={tick} className={styles.tick} x={x(tick)} y={innerHeight + 20} textAnchor="middle">
                {tick === 0 ? '0' : toSignedGw(tick, 0)}
              </text>
            ))}
            <text className={styles.unit} x={innerWidth} y={innerHeight + 42} textAnchor="end">
              Hourly error, forecast − actual (GW)
            </text>
          </g>
        </svg>
        {hovered !== undefined && index !== null && (
          <Tooltip
            title={`Error ${signed(hovered.lower_mw / 1000, 1)} to ${signed(hovered.upper_mw / 1000, 1)} GW`}
            x={MARGIN.left + (centres[index] ?? 0)}
            width={width}
            rows={[
              { key: 'c', label: 'Hours', value: formatInt(hovered.count) },
              { key: 's', label: 'Share', value: formatPercent(total === 0 ? 0 : hovered.count / total, 1) },
            ]}
          />
        )}
      </div>
      <DataTable
        caption="Hourly forecast error distribution"
        rows={bins}
        rowKey={(b) => String(b.lower_mw)}
        columns={[
          { label: 'Error from MW', value: (b) => signed(b.lower_mw, 0) },
          { label: 'to MW', value: (b) => signed(b.upper_mw, 0) },
          { label: 'Hours', value: (b) => formatInt(b.count) },
        ]}
      />
    </figure>
  )
}
