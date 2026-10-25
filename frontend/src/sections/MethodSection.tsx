import type { Meta } from '../api/types'
import { SectionHeader } from '../components/SectionHeader'
import { formatInt } from '../lib/format'
import styles from './MethodSection.module.css'

interface Props {
  meta: Meta
}

export function MethodSection({ meta }: Props) {
  const c = meta.coverage
  const irregular = c.publish_times_of_day.filter((slot) => slot.count === 1)
  const items: { term: string; body: React.ReactNode }[] = [
    {
      term: 'Data',
      body: (
        <>
          Elexon BMRS only. Forecasts: <code>WINDFOR</code>, national wind, hourly, published about eight times a
          day. Actuals: <code>FUELHH</code> with fuel type <code>WIND</code>, half-hourly average MW. Both cover
          transmission-metered wind farms.
        </>
      ),
    },
    {
      term: 'Scope',
      body: (
        <>
          Purchase decisions taken on 1–31 January 2026, which buy delivery days 2 January to 1 February. Gale
          fetches only the runs that could have been on the desk for those decisions, plus 24 hours of earlier runs
          for context.
        </>
      ),
    },
    {
      term: 'Delivery day',
      body: (
        <>
          23:00 UK on the day before to 23:00 UK on the day, the contract day of both the EPEX SPOT GB 60-minute
          auction and the Nord Pool N2EX GB auction. All times are UK local time; clock changes are handled by the
          time-zone database, not fixed offsets.
        </>
      ),
    },
    {
      term: 'Which forecast counts',
      body: (
        <>
          For each delivery hour: the most recent run whose publish time is at or before the decision time, and at
          or before the hour starts. No schedule is assumed, so irregular runs are picked up as they happened.
          {irregular.length > 0 &&
            ` January had ${String(irregular.length)} off-schedule run${irregular.length > 1 ? 's' : ''} (${irregular.map((slot) => slot.time).join(', ')}).`}
        </>
      ),
    },
    {
      term: 'Hindcasts excluded',
      body: (
        <>
          Each run also restates hours that had already begun when it was published. Those{' '}
          {formatInt(c.hindcast_rows_excluded)} rows are not forecasts and are never shown or scored.
        </>
      ),
    },
    {
      term: 'Alignment',
      body: (
        <>
          Forecasts are hourly, outturn half-hourly. Each hour’s actual is the mean of its two settlement periods,
          which is the energy delivered in that hour: exactly what an hourly day-ahead product buys. An hour missing
          either half is a gap, never a zero.
        </>
      ),
    },
    {
      term: 'Metrics',
      body: (
        <>
          Error = forecast − actual. MAE is the typical miss; RMSE weights large misses; bias is the mean error.
          Normalised MAE divides MAE by mean outturn. We avoid MAPE: it explodes when wind is near zero and punishes
          over- and under-forecasts unequally.
        </>
      ),
    },
    {
      term: 'Uncertainty band',
      body: (
        <>
          P10–P90 of January’s errors for every run at a similar lead time (±3 h), applied to the forecast. The daily
          energy range uses the spread of January’s whole-day energy errors. Both are calibrated on January itself,
          so they describe the month rather than predict it.
        </>
      ),
    },
    {
      term: 'Buffer',
      body: (
        <>
          The confidence-level quantile of hourly errors: plan that far below the forecast and wind met the plan in
          that share of January hours. The out-of-sample figure re-estimates the buffer without each day in turn and
          counts that day’s breaches.
        </>
      ),
    },
    {
      term: 'Coverage',
      body: (
        <>
          {formatInt(c.publishes)} runs and {formatInt(c.forecast_rows)} forecast rows; {formatInt(c.actual_periods)}{' '}
          of {formatInt(c.expected_periods)} settlement periods of outturn
          {c.missing_periods.length === 0 ? ', with none missing.' : `, ${String(c.missing_periods.length)} missing (shown as gaps).`}
        </>
      ),
    },
    {
      term: 'Caveats',
      body: (
        <>
          The persistent positive bias is consistent with outturn being metered after constraint curtailment while
          the forecast describes available wind; these two datasets cannot separate the causes. January 2026 is one
          winter month; the numbers are a measurement, not a guarantee.
        </>
      ),
    },
  ]

  return (
    <section className={styles.section} aria-labelledby="method">
      <div className="container">
        <SectionHeader id="method" index="04" eyebrow="Method">
          How the numbers are made. <span className="muted">No black boxes.</span>
        </SectionHeader>
        <dl className={styles.list}>
          {items.map((item) => (
            <div key={item.term} className={styles.item}>
              <dt>{item.term}</dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
