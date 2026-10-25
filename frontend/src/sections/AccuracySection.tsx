import type { Accuracy, Decision, Horizon } from '../api/types'
import { DailyErrorChart } from '../components/charts/DailyErrorChart'
import { HorizonChart } from '../components/charts/HorizonChart'
import { HourlyErrorChart } from '../components/charts/HourlyErrorChart'
import { SectionHeader } from '../components/SectionHeader'
import { Stat } from '../components/Stat'
import { ErrorPanel, Skeleton } from '../components/Status'
import { formatCalendarDate, formatInt, toGw, toSignedGw } from '../lib/format'
import { worstDays } from '../lib/series'
import { BufferPanel } from './BufferPanel'
import styles from './layout.module.css'

interface Props {
  gateName: string
  accuracy: Accuracy | undefined
  loading: boolean
  error: Error | undefined
  onRetry: () => void
  horizon: Horizon | undefined
  decision: Decision | undefined
}

export function AccuracySection({ gateName, accuracy, loading, error, onRetry, horizon, decision }: Props) {
  const metrics = accuracy?.metrics ?? null
  const worst = accuracy === undefined ? [] : worstDays(accuracy.by_day, 1)
  const zone: [number, number] | null =
    decision?.provenance.lead_hours_min != null && decision.provenance.lead_hours_max != null
      ? [decision.provenance.lead_hours_min, decision.provenance.lead_hours_max]
      : null

  return (
    <section className={styles.section} aria-labelledby="accuracy">
      <div className="container">
        <SectionHeader
          id="accuracy"
          index="02"
          eyebrow="Accuracy"
          intro={
            <>
              Every hour of every January delivery day, scored against metered outturn using only the run that
              was public at <strong>{gateName}</strong>. Error is forecast minus actual: positive means the wind
              under-delivered and the desk was short.
            </>
          }
        >
          {metrics === null ? (
            'How far to trust it.'
          ) : (
            <>
              Off by {toGw(metrics.mae_mw)} GW <span className="muted">in a typical hour.</span>
            </>
          )}
        </SectionHeader>

        {error !== undefined && accuracy === undefined ? (
          <article className={styles.card}>
            <ErrorPanel message={error.message} onRetry={onRetry} />
          </article>
        ) : accuracy === undefined || metrics === null ? (
          <Skeleton height="24rem" label="Loading January accuracy" />
        ) : (
          <div className={styles.stack} aria-busy={loading}>
            <dl className={styles.tiles}>
              <div className={styles.tile}>
                <Stat label="MAE" value={toGw(metrics.mae_mw, 2)} unit="GW" note="Mean absolute error: the typical miss" />
              </div>
              <div className={styles.tile}>
                <Stat label="RMSE" value={toGw(metrics.rmse_mw, 2)} unit="GW" note="Weights big misses more heavily" />
              </div>
              <div className={styles.tile}>
                <Stat
                  label="Mean bias"
                  value={toSignedGw(metrics.bias_mw, 2)}
                  unit="GW"
                  tone="signal"
                  note={metrics.bias_mw >= 0 ? 'Forecast ran high: shortfall risk' : 'Forecast ran low: surplus risk'}
                />
              </div>
              <div className={styles.tile}>
                <Stat
                  label="Normalised MAE"
                  value={metrics.nmae_pct.toFixed(1)}
                  unit="%"
                  note={`MAE ÷ mean outturn of ${toGw(metrics.mean_actual_mw)} GW`}
                />
              </div>
              <div className={styles.tile}>
                <Stat label="P50 |error|" value={toGw(metrics.p50_abs_error_mw, 2)} unit="GW" note="Half of all hours missed by less" />
              </div>
              <div className={styles.tile}>
                <Stat label="P90 |error|" value={toGw(metrics.p90_abs_error_mw, 2)} unit="GW" note="Nine hours in ten missed by less" />
              </div>
            </dl>

            <BufferPanel accuracy={accuracy} stale={loading} />

            <article className={styles.card}>
              <h3 className={styles.cardTitle}>Day by day</h3>
              <p className={styles.cardLead}>
                Energy the forecast promised minus energy that arrived, per delivery day.
                {worst[0]?.metrics != null && (
                  <>
                    {' '}
                    The worst was {formatCalendarDate(worst[0].delivery_date)}: forecast{' '}
                    {formatInt(worst[0].forecast_gwh)} GWh, delivered {formatInt(worst[0].actual_gwh)} GWh.
                  </>
                )}
              </p>
              <DailyErrorChart days={accuracy.by_day} stale={loading} />
            </article>

            <div className={styles.split}>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>By hour of the delivery day</h3>
                <p className={styles.cardLead}>Delivery runs 23:00 to 23:00 UK. Later hours sit further from the run.</p>
                <HourlyErrorChart hours={accuracy.by_hour} stale={loading} />
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>By forecast horizon</h3>
                <p className={styles.cardLead}>
                  Every January run, scored at every lead time. The shaded band is where your gate puts you.
                </p>
                {horizon === undefined ? (
                  <Skeleton height="18rem" label="Loading error by horizon" />
                ) : (
                  <HorizonChart rows={horizon.rows} zone={zone} />
                )}
              </article>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
