import type { BufferRow, DayRow, Decision, SeriesDay } from '../api/types'
import { ukHourOf } from './format'

const HOUR_MS = 3_600_000

export interface HourDatum {
  /** Middle of the delivery hour (ms), so an hourly mean sits in the centre of its hour. */
  x: number
  start: string
  forecast: number | null
  low: number | null
  high: number | null
  actual: number | null
  error: number | null
  lead: number | null
}

export function decisionSeries(decision: Decision): HourDatum[] {
  return decision.points.map((p) => ({
    x: Date.parse(p.start_time) + HOUR_MS / 2,
    start: p.start_time,
    forecast: p.forecast_mw,
    low: p.band_low_mw,
    high: p.band_high_mw,
    actual: p.actual_mw,
    error: p.error_mw,
    lead: p.lead_hours,
  }))
}

export interface GlancePoint {
  /** Middle of the hours the point covers (ms). */
  x: number
  /** Index of its delivery day. */
  day: number
  forecast: number | null
  actual: number | null
}

/** Mean of the values present; ``null`` when none are, so a gap stays a gap. */
function meanOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  return present.length === 0 ? null : present.reduce((sum, v) => sum + v, 0) / present.length
}

/**
 * The month as one series: a point per ``size`` hours, each the mean of the
 * hours present and centred in the span it covers. Spans never straddle two
 * delivery days, so day boundaries stay exact on 23- and 25-hour days.
 */
export function glancePoints(days: readonly SeriesDay[], size: number): GlancePoint[] {
  return days.flatMap((day, index) => {
    const start = Date.parse(day.start_time)
    const points: GlancePoint[] = []
    for (let i = 0; i < day.forecast_mw.length; i += size) {
      const span = Math.min(size, day.forecast_mw.length - i)
      points.push({
        x: start + (i + span / 2) * HOUR_MS,
        day: index,
        forecast: meanOf(day.forecast_mw.slice(i, i + span)),
        actual: meanOf(day.actual_mw.slice(i, i + span)),
      })
    }
    return points
  })
}

/** Index of the value in ascending ``xs`` closest to ``x``. */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1
  let lo = 0
  let hi = xs.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if ((xs[mid] ?? 0) <= x) lo = mid
    else hi = mid
  }
  const loValue = xs[lo] ?? 0
  const hiValue = xs[hi] ?? 0
  return Math.abs(x - loValue) <= Math.abs(hiValue - x) ? lo : hi
}

/** Hour boundaries inside [start, end] whose UK clock hour is a multiple of ``every``. */
export function hourTicks(startIso: string, endIso: string, every: number): number[] {
  const ticks: number[] = []
  for (let t = Date.parse(startIso); t <= Date.parse(endIso); t += HOUR_MS) {
    if (ukHourOf(new Date(t)) % every === 0) ticks.push(t)
  }
  return ticks
}

/** The buffer row for a confidence level given in whole percent (50-99). */
export function bufferAt(rows: readonly BufferRow[], percent: number): BufferRow | undefined {
  return rows.find((row) => Math.round(row.confidence * 100) === percent)
}

/** Delivery days ranked by mean absolute error, worst first. */
export function worstDays(rows: readonly DayRow[], count: number): DayRow[] {
  return [...rows]
    .filter((row) => row.metrics !== null)
    .sort((a, b) => (b.metrics?.mae_mw ?? 0) - (a.metrics?.mae_mw ?? 0))
    .slice(0, count)
}

/** Smallest "nice" number (1, 2, 2.5, 5 x 10^k) at or above ``value``. */
export function niceCeil(value: number): number {
  if (value <= 0) return 0
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude
  }
  return 10 * magnitude
}

/** Minutes since midnight for "HH:MM". */
export function minutesOf(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** "HH:MM" for minutes since midnight. */
export function hhmmOf(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * SVG path for a bar from ``base`` to ``end`` (pixel y), rounded only at the data end
 * and square at the baseline, so bars read as growing from a shared zero line.
 */
export function barPath(x: number, width: number, base: number, end: number, radius = 4): string {
  const height = Math.abs(end - base)
  if (height < 0.5 || width <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  const right = x + width
  if (end < base) {
    return `M${x},${base}V${end + r}Q${x},${end} ${x + r},${end}H${right - r}Q${right},${end} ${right},${end + r}V${base}Z`
  }
  return `M${x},${base}V${end - r}Q${x},${end} ${x + r},${end}H${right - r}Q${right},${end} ${right},${end - r}V${base}Z`
}
