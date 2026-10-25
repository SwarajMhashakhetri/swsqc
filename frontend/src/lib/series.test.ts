import { describe, expect, it } from 'vitest'
import type { BufferRow, DayRow, Decision, Metrics, SeriesDay } from '../api/types'
import {
  barPath,
  bufferAt,
  decisionSeries,
  glancePoints,
  hhmmOf,
  hourTicks,
  minutesOf,
  nearestIndex,
  niceCeil,
  worstDays,
} from './series'
import { easeOut, interpolateSeries } from './tween'

const metrics = (mae: number): Metrics => ({
  n: 24,
  mae_mw: mae,
  rmse_mw: mae,
  bias_mw: mae,
  nmae_pct: 10,
  mean_actual_mw: 10_000,
  mean_forecast_mw: 10_000,
  p50_abs_error_mw: mae,
  p90_abs_error_mw: mae,
})

describe('decisionSeries', () => {
  it('centres each hourly value in its hour', () => {
    const decision = {
      points: [
        {
          start_time: '2026-01-14T23:00:00Z',
          forecast_mw: 1000,
          publish_time: '2026-01-14T07:30:00Z',
          lead_hours: 15.5,
          band_low_mw: 800,
          band_high_mw: 1050,
          actual_mw: null,
          error_mw: null,
        },
      ],
    } as unknown as Decision
    const [first] = decisionSeries(decision)
    expect(first?.x).toBe(Date.parse('2026-01-14T23:30:00Z'))
    expect(first?.actual).toBeNull()
    expect(first?.lead).toBe(15.5)
  })
})

describe('glancePoints', () => {
  const day = (date: string, start: string, forecast: (number | null)[], actual: (number | null)[]): SeriesDay => ({
    delivery_date: date,
    start_time: start,
    forecast_mw: forecast,
    actual_mw: actual,
  })

  it('keeps hourly values centred in their hour', () => {
    const [first, second] = glancePoints([day('2026-01-15', '2026-01-14T23:00:00Z', [1, 2], [3, null])], 1)
    expect(first).toEqual({ x: Date.parse('2026-01-14T23:30:00Z'), day: 0, forecast: 1, actual: 3 })
    expect(second?.actual).toBeNull()
  })

  it('averages the hours present in each span and never crosses into the next day', () => {
    const days = [
      day('2026-01-15', '2026-01-14T23:00:00Z', [10, 20, null, 30, 40], [null, null, null, 6, 2]),
      day('2026-01-16', '2026-01-15T04:00:00Z', [5], [7]),
    ]
    const points = glancePoints(days, 3)
    expect(points.map((p) => [p.day, p.forecast, p.actual])).toEqual([
      [0, 15, null],
      [0, 35, 4],
      [1, 5, 7],
    ])
    // The short final span of a day is centred on the two hours it covers.
    expect(points[1]?.x).toBe(Date.parse('2026-01-15T03:00:00Z'))
  })
})

describe('nearestIndex', () => {
  it('snaps to the closest x', () => {
    const xs = [0, 10, 20, 30]
    expect(nearestIndex(xs, -5)).toBe(0)
    expect(nearestIndex(xs, 14)).toBe(1)
    expect(nearestIndex(xs, 16)).toBe(2)
    expect(nearestIndex(xs, 99)).toBe(3)
    expect(nearestIndex([], 1)).toBe(-1)
  })
})

describe('hourTicks', () => {
  it('ticks on UK clock hours across a delivery day', () => {
    const ticks = hourTicks('2026-01-14T23:00:00Z', '2026-01-15T23:00:00Z', 6)
    expect(ticks.map((t) => new Date(t).toISOString().slice(11, 16))).toEqual([
      '00:00',
      '06:00',
      '12:00',
      '18:00',
    ])
  })
})

describe('buffer and ranking helpers', () => {
  const rows: BufferRow[] = [50, 90].map((p) => ({
    confidence: p / 100,
    buffer_mw: p * 10,
    breaches: 1,
    breach_share: 0.1,
    shortfall_mwh: 1,
    out_of_sample_breaches: 1,
    out_of_sample_breach_share: 0.1,
  }))

  it('finds a buffer level by whole percent', () => {
    expect(bufferAt(rows, 90)?.buffer_mw).toBe(900)
    expect(bufferAt(rows, 75)).toBeUndefined()
  })

  it('ranks days by MAE and skips unscored days', () => {
    const days = [
      { delivery_date: 'a', metrics: metrics(100) },
      { delivery_date: 'b', metrics: null },
      { delivery_date: 'c', metrics: metrics(300) },
    ] as DayRow[]
    expect(worstDays(days, 2).map((d) => d.delivery_date)).toEqual(['c', 'a'])
  })

  it('rounds up to nice axis maxima', () => {
    expect(niceCeil(17_805)).toBe(20_000)
    expect(niceCeil(2_400)).toBe(2_500)
    expect(niceCeil(0)).toBe(0)
  })

  it('converts clock strings', () => {
    expect(minutesOf('09:50')).toBe(590)
    expect(hhmmOf(590)).toBe('09:50')
  })
})

describe('tweening', () => {
  it('interpolates only where both ends exist', () => {
    expect(interpolateSeries([0, null, 10], [10, 5, null], 0.5)).toEqual([5, 5, null])
    expect(interpolateSeries([1], [2, 3], 0.5)).toEqual([2, 3])
  })

  it('eases out and clamps', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(2)).toBe(1)
    expect(easeOut(0.5)).toBeCloseTo(0.875)
  })
})

describe('barPath', () => {
  it('rounds the data end of an upward bar and keeps the base square', () => {
    expect(barPath(0, 10, 100, 60)).toBe('M0,100V64Q0,60 4,60H6Q10,60 10,64V100Z')
  })

  it('rounds the bottom of a downward bar', () => {
    expect(barPath(0, 10, 50, 80)).toBe('M0,50V76Q0,80 4,80H6Q10,80 10,76V50Z')
  })

  it('draws nothing for zero-height bars', () => {
    expect(barPath(0, 10, 50, 50)).toBe('')
  })
})
