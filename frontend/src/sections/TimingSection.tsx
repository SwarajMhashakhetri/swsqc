import type { Accuracy, DecisionPreset, Meta, Timing } from '../api/types'
import { TimingChart } from '../components/charts/TimingChart'
import { SectionHeader } from '../components/SectionHeader'
import { ErrorPanel, Skeleton } from '../components/Status'
import { formatClock, formatInt, formatPercent, signed, toGw } from '../lib/format'
import { bufferAt } from '../lib/series'
import styles from './layout.module.css'
import timing from './TimingSection.module.css'

interface Props {
  meta: Meta
  presets: DecisionPreset[]
  reports: (Accuracy | undefined)[]
  sweep: Timing | undefined
  error: Error | undefined
  onRetry: () => void
}

/** Most common UK time of the run used across delivery days, e.g. "07:30". */
function usualRun(report: Accuracy): string {
  const counts = new Map<string, number>()
  for (const day of report.by_day) {
    const latest = day.publish_times.at(-1)
    if (latest !== undefined) {
      const clock = formatClock(latest)
      counts.set(clock, (counts.get(clock) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
}

export function TimingSection({ meta, presets, reports, sweep, error, onRetry }: Props) {
  const [first, second] = reports
  const [early, late] = presets
  const ready = first?.metrics != null && second?.metrics != null && early !== undefined && late !== undefined
  const slots = meta.coverage.publish_times_of_day.filter((slot) => slot.count > 1).map((slot) => slot.time)

  return (
    <section className={styles.section} aria-labelledby="timing">
      <div className="container">
        <SectionHeader
          id="timing"
          index="03"
          eyebrow="Timing"
          intro={
            ready ? (
              <TimingVerdict early={early} late={late} first={first} second={second} />
            ) : (
              'Two GB auctions, thirty minutes apart, each seeing a different forecast run.'
            )
          }
        >
          09:20 or 09:50? <span className="muted">Half an hour buys a newer run.</span>
        </SectionHeader>

        {!ready ? (
          <Skeleton height="16rem" label="Loading the gate comparison" />
        ) : (
          <div className={styles.stack}>
            <div className={timing.compare}>
              {[
                { preset: early, report: first },
                { preset: late, report: second },
              ].map(({ preset, report }) => {
                const m = report.metrics
                const buffer = bufferAt(report.buffer, 90)
                if (m === null) return null
                return (
                  <article key={preset.id} className={`${styles.card} ${timing.gate}`}>
                    <p className="label">{preset.auction}</p>
                    <h3 className={timing.gateTitle}>
                      {preset.exchange} <span className="muted">{preset.decision_time}</span>
                    </h3>
                    <dl className={timing.rows}>
                      <div>
                        <dt>Run on the desk</dt>
                        <dd>{usualRun(report)}</dd>
                      </div>
                      <div>
                        <dt>MAE</dt>
                        <dd>{formatInt(m.mae_mw)} MW</dd>
                      </div>
                      <div>
                        <dt>RMSE</dt>
                        <dd>{formatInt(m.rmse_mw)} MW</dd>
                      </div>
                      <div>
                        <dt>Mean bias</dt>
                        <dd>{signed(m.bias_mw, 0)} MW</dd>
                      </div>
                      <div>
                        <dt>P90 |error|</dt>
                        <dd>{formatInt(m.p90_abs_error_mw)} MW</dd>
                      </div>
                      {buffer !== undefined && (
                        <div>
                          <dt>Buffer for 90% cover</dt>
                          <dd>{toGw(buffer.buffer_mw, 2)} GW</dd>
                        </div>
                      )}
                    </dl>
                    <a className={timing.source} href={preset.source_url} target="_blank" rel="noreferrer">
                      Gate closure source
                    </a>
                  </article>
                )
              })}
            </div>

            <article className={styles.card}>
              <h3 className={styles.cardTitle}>If the gate closed at any other time</h3>
              <p className={styles.cardLead}>
                MAE of the forecast you would have held, for each ten-minute decision time on the day before
                delivery. It only moves when a new run lands.
              </p>
              {error !== undefined && sweep === undefined ? (
                <ErrorPanel message={error.message} onRetry={onRetry} />
              ) : sweep === undefined ? (
                <Skeleton height="18rem" label="Loading accuracy by decision time" />
              ) : (
                <TimingChart rows={sweep.rows} presets={presets} publishSlots={slots} />
              )}
            </article>
          </div>
        )}
      </div>
    </section>
  )
}

interface VerdictProps {
  early: DecisionPreset
  late: DecisionPreset
  first: Accuracy
  second: Accuracy
}

function TimingVerdict({ early, late, first, second }: VerdictProps) {
  const a = first.metrics
  const b = second.metrics
  if (a === null || b === null) return null
  const delta = b.mae_mw - a.mae_mw
  const share = Math.abs(delta) / a.mae_mw
  return (
    <>
      At {early.exchange.replace(' SPOT', '')}’s {early.decision_time} gate the newest run is the {usualRun(first)};{' '}
      {late.exchange.replace('Nord Pool', 'N2EX')}’s {late.decision_time} gate catches the {usualRun(second)}. In
      January that {delta <= 0 ? 'cut' : 'added to'} MAE by{' '}
      <strong>
        {formatInt(Math.abs(delta))} MW ({formatPercent(share, 1)})
      </strong>
      {share < 0.05 ? `: real, but small next to a ${toGw(Math.abs(a.bias_mw))} GW bias.` : '.'}
    </>
  )
}
