import type { Accuracy, Series } from '../api/types'
import { GlanceRibbon } from '../components/charts/GlanceRibbon'
import { Stat } from '../components/Stat'
import { Skeleton } from '../components/Status'
import { useReveal } from '../hooks/useReveal'
import { formatInt, toGw, toSignedGw } from '../lib/format'
import { bufferAt } from '../lib/series'
import styles from './Hero.module.css'

interface Props {
  accuracy: Accuracy | undefined
  series: Series | undefined
  gateName: string
  stale: boolean
  seriesStale: boolean
  failed: boolean
  /** Delivery day open in the decision view. */
  selected: string | null
  onOpenDay: (date: string) => void
}

const HERO_CONFIDENCE = 90

export function Hero({ accuracy, series, gateName, stale, seriesStale, failed, selected, onOpenDay }: Props) {
  const [ref, visible] = useReveal<HTMLDivElement>()
  const metrics = accuracy?.metrics ?? null
  const buffer = accuracy === undefined ? undefined : bufferAt(accuracy.buffer, HERO_CONFIDENCE)

  return (
    <header className={styles.hero} id="top">
      <div ref={ref} className={`container reveal ${styles.inner}`} data-visible={visible}>
        <p className="label">GB day-ahead · Wind · January 2026</p>
        <h1 className={styles.title}>
          Wind, <span className={styles.soft}>priced in.</span>
        </h1>
        <p className={styles.lead}>
          The wind forecast your desk held at day-ahead gate closure,{' '}
          <span className="muted">and a hard number on how far to trust it.</span>
        </p>

        {/* The product shot. It is navigation, not the only route to the data, so a failed load simply leaves it out. */}
        <div className={styles.glance} hidden={series === undefined && !seriesStale}>
          {series === undefined ? (
            <Skeleton height="21rem" label="Loading January hour by hour" />
          ) : (
            <GlanceRibbon
              days={series.days}
              energy={accuracy?.by_day}
              selected={selected}
              gateName={gateName}
              stale={seriesStale}
              onOpen={onOpenDay}
            />
          )}
        </div>

        <div className={styles.insight} data-stale={stale} aria-live="polite" hidden={failed && metrics === null}>
          {metrics === null || buffer === undefined ? (
            <Skeleton height="9rem" label="Loading January's headline numbers" />
          ) : (
            <>
              <p className={styles.statement}>
                In January, the forecast on the desk at {gateName} missed by{' '}
                <strong>{toGw(metrics.mae_mw)} GW</strong> in a typical hour and ran{' '}
                <strong>{toGw(Math.abs(metrics.bias_mw))} GW {metrics.bias_mw >= 0 ? 'high' : 'low'}</strong> on
                average. Planning <strong>{toGw(buffer.buffer_mw)} GW</strong> below it would have kept wind
                ahead of the plan in {formatInt(metrics.n - buffer.breaches)} of {formatInt(metrics.n)} hours.
              </p>
              <dl className={styles.stats}>
                <Stat size="large" label="Typical miss · MAE" value={toGw(metrics.mae_mw)} unit="GW" note="Mean absolute error per hour" />
                <Stat
                  size="large"
                  label="Bias · forecast − actual"
                  value={toSignedGw(metrics.bias_mw)}
                  unit="GW"
                  tone="signal"
                  note={metrics.bias_mw >= 0 ? 'Over-forecast: the desk ran short' : 'Under-forecast: the desk ran long'}
                />
                <Stat
                  size="large"
                  label={`Buffer · ${HERO_CONFIDENCE}% cover`}
                  value={toGw(buffer.buffer_mw)}
                  unit="GW"
                  tone="accent"
                  note="Plan this far below the forecast"
                />
              </dl>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
