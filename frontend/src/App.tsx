import { useEffect, useState } from 'react'
import { endpoints } from './api/client'
import type { Accuracy, Decision, Horizon, Meta, Series, Timing } from './api/types'
import { ErrorPanel, Skeleton } from './components/Status'
import { useApi } from './hooks/useApi'
import { readViewState, writeViewState } from './lib/urlState'
import { AccuracySection } from './sections/AccuracySection'
import { DecisionSection } from './sections/DecisionSection'
import { Footer } from './sections/Footer'
import { Hero } from './sections/Hero'
import { MethodSection } from './sections/MethodSection'
import { Nav } from './sections/Nav'
import { TimingSection } from './sections/TimingSection'
import styles from './sections/layout.module.css'

const DEFAULT_DATE = '2026-01-15'
const DEFAULT_GATE = '09:20'

interface Gate {
  time: string
  custom: boolean
}

export function App() {
  const initial = readViewState(window.location.search)
  const [date, setDate] = useState(initial.date ?? DEFAULT_DATE)
  const [gate, setGate] = useState<Gate>({ time: initial.gate ?? DEFAULT_GATE, custom: false })

  const meta = useApi<Meta>(endpoints.meta())
  const presets = meta.data?.presets ?? []
  const inScope =
    meta.data !== undefined && date >= meta.data.first_delivery_date && date <= meta.data.last_delivery_date
  const deliveryDate = inScope ? date : (meta.data?.first_delivery_date ?? null)

  const accuracy = useApi<Accuracy>(endpoints.accuracy(gate.time))
  const series = useApi<Series>(endpoints.series(gate.time))
  const decision = useApi<Decision>(deliveryDate === null ? null : endpoints.decision(deliveryDate, gate.time))
  const horizon = useApi<Horizon>(endpoints.horizon())
  const timing = useApi<Timing>(endpoints.timing())
  const [early, late] = presets
  const earlyReport = useApi<Accuracy>(early === undefined ? null : endpoints.accuracy(early.decision_time))
  const lateReport = useApi<Accuracy>(late === undefined ? null : endpoints.accuracy(late.decision_time))

  const preset = gate.custom ? undefined : presets.find((p) => p.decision_time === gate.time)
  const gateName =
    preset === undefined ? `${gate.time} UK` : `${preset.exchange.replace(' SPOT', '')}’s ${preset.decision_time} gate`

  const openDay = (day: string) => {
    setDate(day)
    document.getElementById('forecast')?.scrollIntoView({ block: 'start' })
  }

  useEffect(() => {
    if (deliveryDate !== null) {
      window.history.replaceState(null, '', writeViewState({ date: deliveryDate, gate: gate.time }))
    }
  }, [deliveryDate, gate.time])

  return (
    <>
      <a className="skip-link" href="#forecast">
        Skip to the forecast
      </a>
      <Nav
        presets={presets}
        gate={gate.time}
        custom={gate.custom}
        onGateChange={(time, custom) => {
          setGate({ time, custom })
        }}
      />
      <main>
        <Hero
          accuracy={accuracy.data}
          series={series.data}
          gateName={gateName}
          stale={accuracy.loading}
          seriesStale={series.loading}
          failed={accuracy.error !== undefined}
          selected={deliveryDate}
          onOpenDay={openDay}
        />
        {meta.error !== undefined && meta.data === undefined ? (
          <div className="container">
            <div className={styles.section}>
              <article className={styles.card}>
                <ErrorPanel message={meta.error.message} onRetry={meta.retry} />
              </article>
            </div>
          </div>
        ) : meta.data === undefined || deliveryDate === null ? (
          <div className="container">
            <div className={styles.section}>
              <Skeleton height="32rem" label="Loading January 2026 from Elexon" />
            </div>
          </div>
        ) : (
          <>
            <DecisionSection
              meta={meta.data}
              date={deliveryDate}
              onDateChange={setDate}
              decision={decision.data}
              loading={decision.loading}
              error={decision.error}
              onRetry={decision.retry}
            />
            <AccuracySection
              gateName={gateName}
              accuracy={accuracy.data}
              loading={accuracy.loading}
              error={accuracy.error}
              onRetry={accuracy.retry}
              horizon={horizon.data}
              decision={decision.data}
            />
            <TimingSection
              meta={meta.data}
              presets={presets}
              reports={[earlyReport.data, lateReport.data]}
              sweep={timing.data}
              error={timing.error ?? earlyReport.error ?? lateReport.error}
              onRetry={() => {
                timing.retry()
                earlyReport.retry()
                lateReport.retry()
              }}
            />
            <MethodSection meta={meta.data} />
          </>
        )}
      </main>
      <Footer loadedAt={meta.data?.loaded_at} />
    </>
  )
}
