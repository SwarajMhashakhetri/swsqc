import { useMemo, useState } from 'react'
import type { Decision, Meta } from '../api/types'
import { ForecastChart, type VintageLine } from '../components/charts/ForecastChart'
import { DateStepper } from '../components/DateStepper'
import { SectionHeader } from '../components/SectionHeader'
import { Stat } from '../components/Stat'
import { ErrorPanel, Skeleton } from '../components/Status'
import { Switch } from '../components/Switch'
import {
  formatCalendarDate,
  formatClock,
  formatDayShort,
  formatHours,
  formatMinutes,
  signed,
  toGw,
} from '../lib/format'
import { decisionSeries } from '../lib/series'
import styles from './layout.module.css'

interface Props {
  meta: Meta
  date: string
  onDateChange: (date: string) => void
  decision: Decision | undefined
  loading: boolean
  error: Error | undefined
  onRetry: () => void
}

const HOUR_MS = 3_600_000

const weekday = (iso: string) => formatDayShort(iso).split(' ')[0] ?? ''

export function DecisionSection({ meta, date, onDateChange, decision, loading, error, onRetry }: Props) {
  const [showActual, setShowActual] = useState(true)
  const [showVintages, setShowVintages] = useState(true)

  const series = useMemo(() => (decision === undefined ? [] : decisionSeries(decision)), [decision])
  const vintages: VintageLine[] = useMemo(
    () =>
      decision?.vintages.map((v) => ({
        publishTime: v.publish_time,
        points: v.points.map((p) => ({ x: Date.parse(p.start_time) + HOUR_MS / 2, mw: p.forecast_mw })),
      })) ?? [],
    [decision],
  )

  return (
    <section className={styles.section} aria-labelledby="forecast">
      <div className="container">
        <SectionHeader
          id="forecast"
          index="01"
          eyebrow="Gate-closure view"
          intro={
            <>
              Pick a delivery day. Gale finds the newest WINDFOR run published <strong>before your gate closed</strong>,
              never after, and wraps it in the error January actually delivered.
            </>
          }
        >
          What the desk saw <span className="muted">when the book closed.</span>
        </SectionHeader>

        <div className={styles.controls}>
          <DateStepper value={date} min={meta.first_delivery_date} max={meta.last_delivery_date} onChange={onDateChange} />
          <div className={styles.toggles}>
            <Switch label="Actuals" swatch="actual" checked={showActual} onChange={setShowActual} />
            <Switch label="Earlier runs" swatch="vintage" checked={showVintages} onChange={setShowVintages} />
          </div>
        </div>

        <article className={styles.card} aria-busy={loading}>
          {error !== undefined && decision === undefined ? (
            <ErrorPanel message={error.message} onRetry={onRetry} />
          ) : decision === undefined ? (
            <Skeleton height="30rem" label="Loading the forecast for this delivery day" />
          ) : (
            <>
              {error !== undefined && <ErrorPanel title="Couldn’t refresh this day." message={error.message} onRetry={onRetry} />}
              <Provenance decision={decision} />
              <ForecastChart
                data={series}
                vintages={vintages}
                windowStart={decision.window_start}
                windowEnd={decision.window_end}
                showActual={showActual}
                showVintages={showVintages}
                stale={loading}
                label={`Wind forecast for delivery ${formatCalendarDate(decision.delivery_date)}, as held at ${decision.decision_time} the day before`}
              />
              <Kpis decision={decision} showActual={showActual} />
            </>
          )}
        </article>
      </div>
    </section>
  )
}

function Provenance({ decision }: { decision: Decision }) {
  const p = decision.provenance
  const partial = p.hours_forecast < p.hours_total
  return (
    <p className={`label ${styles.provenance}`}>
      <span>
        Delivery{' '}
        <strong>
          {weekday(decision.window_start)} {formatClock(decision.window_start)} → {weekday(decision.window_end)}{' '}
          {formatClock(decision.window_end)}
        </strong>
      </span>
      {p.publish_time === null ? (
        <span>No run published before {decision.decision_time}</span>
      ) : (
        <>
          <span>
            Run <strong>{formatClock(p.publish_time)}</strong>
            {p.publishes_used.length > 1 && ` + ${p.publishes_used.length - 1} older`}
          </span>
          {p.minutes_before_decision !== null && (
            <span>
              <strong>{formatMinutes(p.minutes_before_decision)}</strong> before gate {decision.decision_time}
            </span>
          )}
          {p.lead_hours_min !== null && p.lead_hours_max !== null && (
            <span>
              <strong>
                {formatHours(p.lead_hours_min)}–{formatHours(p.lead_hours_max)}h
              </strong>{' '}
              ahead
            </span>
          )}
        </>
      )}
      {partial && (
        <span>
          <strong>
            {p.hours_forecast}/{p.hours_total}
          </strong>{' '}
          hours forecast at gate
        </span>
      )}
    </p>
  )
}

function Kpis({ decision, showActual }: { decision: Decision; showActual: boolean }) {
  const k = decision.kpis
  const errorPct =
    k.energy_error_gwh !== null && k.actual_gwh !== null && k.actual_gwh > 0
      ? (100 * k.energy_error_gwh) / k.actual_gwh
      : null
  return (
    <dl className={styles.kpis}>
      <Stat
        label="Forecast energy"
        value={k.forecast_gwh === null ? '—' : k.forecast_gwh.toFixed(1)}
        unit="GWh"
        note={
          k.forecast_p10_gwh !== null && k.forecast_p90_gwh !== null
            ? `80% range ${k.forecast_p10_gwh.toFixed(0)}–${k.forecast_p90_gwh.toFixed(0)} GWh`
            : 'Range needs a full day of forecast'
        }
      />
      <Stat
        label="Peak"
        value={k.peak === null ? '—' : toGw(k.peak.mw)}
        unit="GW"
        note={k.peak === null ? undefined : `${formatDayShort(k.peak.start_time)} · ${formatClock(k.peak.start_time)}`}
      />
      <Stat
        label="Trough"
        value={k.trough === null ? '—' : toGw(k.trough.mw)}
        unit="GW"
        note={k.trough === null ? undefined : `${formatDayShort(k.trough.start_time)} · ${formatClock(k.trough.start_time)}`}
      />
      {showActual && (
        <Stat
          label="In hindsight"
          value={k.actual_gwh === null ? '—' : k.actual_gwh.toFixed(1)}
          unit="GWh"
          note={
            k.energy_error_gwh === null || errorPct === null
              ? 'Outturn incomplete for this day'
              : `Forecast ${signed(k.energy_error_gwh, 1)} GWh (${signed(errorPct, 1)}%)${
                  decision.metrics === null ? '' : ` · MAE ${toGw(decision.metrics.mae_mw, 2)} GW`
                }`
          }
        />
      )}
    </dl>
  )
}
