import { useId, useState } from 'react'
import type { Accuracy } from '../api/types'
import { ErrorHistogram } from '../components/charts/ErrorHistogram'
import { formatInt, formatPercent, toGw } from '../lib/format'
import { bufferAt } from '../lib/series'
import layout from './layout.module.css'
import styles from './BufferPanel.module.css'

interface Props {
  accuracy: Accuracy
  stale: boolean
}

const DEFAULT_CONFIDENCE = 90

/** The money feature: pick a confidence level, read off how far below the forecast to plan. */
export function BufferPanel({ accuracy, stale }: Props) {
  const [confidence, setConfidence] = useState(DEFAULT_CONFIDENCE)
  const sliderId = useId()
  const level = bufferAt(accuracy.buffer, confidence)
  const scored = accuracy.metrics?.n ?? 0
  if (level === undefined) return null
  const below = level.buffer_mw >= 0

  return (
    <article className={`${layout.card} ${styles.panel}`} aria-labelledby={`${sliderId}-title`}>
      <div className={styles.copy}>
        <p className="label">Decision rule</p>
        <h3 id={`${sliderId}-title`} className={styles.sentence}>
          Plan{' '}
          <span className={styles.figure}>
            {toGw(Math.abs(level.buffer_mw))}
            <span className={styles.unit}>GW</span>
          </span>{' '}
          {below ? 'below' : 'above'} the wind forecast to be covered{' '}
          <span className={styles.figure}>
            {confidence}
            <span className={styles.unit}>%</span>
          </span>{' '}
          of hours.
        </h3>

        <div className={styles.slider}>
          <label htmlFor={sliderId} className="label">
            Confidence
          </label>
          <input
            id={sliderId}
            type="range"
            min={50}
            max={99}
            step={1}
            value={confidence}
            aria-valuetext={`${confidence}% of hours covered, buffer ${toGw(level.buffer_mw)} gigawatts`}
            style={{ '--fill': `${((confidence - 50) / 49) * 100}%` } as React.CSSProperties}
            onChange={(event) => {
              setConfidence(Number(event.target.value))
            }}
          />
          <div className={styles.scale} aria-hidden="true">
            <span>50%</span>
            <span>99%</span>
          </div>
        </div>

        <dl className={styles.facts}>
          <div>
            <dt>Breached in January</dt>
            <dd>
              <span className={layout.inlineFigure}>
                {formatInt(level.breaches)} of {formatInt(scored)} h
              </span>{' '}
              · {formatPercent(level.breach_share, 1)}
            </dd>
          </div>
          <div>
            <dt>Shortfall beyond the buffer</dt>
            <dd>
              <span className={layout.inlineFigure}>{formatInt(level.shortfall_mwh / 1000)} GWh</span> over the month
            </dd>
          </div>
          <div>
            <dt>Tested on unseen days</dt>
            <dd>
              <span className={layout.inlineFigure}>{formatPercent(level.out_of_sample_breach_share, 1)}</span> breached
              when each day’s buffer is set without it
            </dd>
          </div>
        </dl>
      </div>
      <div className={styles.chart}>
        <ErrorHistogram distribution={accuracy.distribution} bufferMw={level.buffer_mw} stale={stale} />
      </div>
    </article>
  )
}
