import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatCalendarDate,
  formatClock,
  formatDayShort,
  formatHours,
  formatMinutes,
  formatPercent,
  signed,
  toGw,
  toSignedGw,
  ukHourOf,
} from './format'

describe('UK time formatting', () => {
  it('shows GMT instants unchanged in winter', () => {
    expect(formatClock('2026-01-14T07:30:00Z')).toBe('07:30')
    expect(formatDayShort('2026-01-14T23:00:00Z')).toBe('Wed 14 Jan')
  })

  it('shifts to BST in summer regardless of the viewer time zone', () => {
    expect(formatClock('2026-07-14T08:20:00Z')).toBe('09:20')
    expect(ukHourOf('2026-07-14T22:00:00Z')).toBe(23)
  })

  it('formats calendar dates without time-zone drift', () => {
    expect(formatCalendarDate('2026-01-15')).toBe('Thursday 15 January 2026')
    expect(formatCalendarDate('2026-02-01', 'short')).toBe('Sun 1 Feb')
  })

  it('steps dates across month ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-02', -1)).toBe('2026-01-01')
  })
})

describe('numbers', () => {
  it('converts MW to GW', () => {
    expect(toGw(2035.1)).toBe('2.0')
    expect(toGw(4095.45, 2)).toBe('4.10')
  })

  it('signs with a true minus and never signs zero', () => {
    expect(toSignedGw(1748.7)).toBe('+1.7')
    expect(toSignedGw(-420)).toBe('−0.4')
    expect(toSignedGw(20)).toBe('0.0')
    expect(signed(-2.45, 1)).toBe('−2.5')
    expect(signed(0.01, 1)).toBe('0.0')
    expect(signed(1749.4, 0)).toBe('+1,749')
  })

  it('formats durations and shares', () => {
    expect(formatMinutes(110)).toBe('1h 50m')
    expect(formatMinutes(30)).toBe('30m')
    expect(formatMinutes(120)).toBe('2h')
    expect(formatHours(15.5)).toBe('15.5')
    expect(formatHours(16)).toBe('16')
    expect(formatPercent(0.9)).toBe('90%')
    expect(formatPercent(0.1008, 1)).toBe('10.1%')
  })
})
