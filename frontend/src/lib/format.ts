/** Display formatting. Every clock time is shown in UK time, whatever the viewer's zone. */

export const UK_TIME_ZONE = 'Europe/London'

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const weekdayDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const longDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const ukHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
})

const integer = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

/** "07:30" for an ISO instant, in UK time. */
export function formatClock(iso: string | Date): string {
  return clock.format(typeof iso === 'string' ? new Date(iso) : iso)
}

/** "Thu 15 Jan" for an ISO instant, in UK time. */
export function formatDayShort(iso: string | Date): string {
  return joinParts(weekdayDate, typeof iso === 'string' ? new Date(iso) : iso)
}

/** UK clock hour (0-23) of an instant. */
export function ukHourOf(iso: string | Date): number {
  return Number(ukHour.format(typeof iso === 'string' ? new Date(iso) : iso))
}

/** A calendar date ("2026-01-15") shown as "Thursday 15 January 2026". */
export function formatCalendarDate(isoDate: string, style: 'long' | 'short' = 'long'): string {
  const noonUtc = new Date(`${isoDate}T12:00:00Z`)
  return joinParts(style === 'long' ? longDate : weekdayDate, noonUtc)
}

/** ICU versions disagree on the comma after the weekday, so assemble the parts ourselves. */
function joinParts(formatter: Intl.DateTimeFormat, date: Date): string {
  return formatter
    .formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value)
    .join(' ')
}

/** Shift a "YYYY-MM-DD" date by whole days. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 12,430 */
export function formatInt(value: number): string {
  return integer.format(value)
}

/** MW to GW with a fixed number of decimals: 2035.1 -> "2.0". */
export function toGw(mw: number, digits = 1): string {
  return (mw / 1000).toFixed(digits)
}

/** Signed GW: +1.7 / −0.4 (true minus sign). */
export function toSignedGw(mw: number, digits = 1): string {
  const text = toGw(Math.abs(mw), digits)
  if (Number(text) === 0) return text
  return `${mw > 0 ? '+' : '−'}${text}`
}

/** Signed, grouped number with a true minus sign: +1,749 / −0.4. Zero is never signed. */
export function signed(value: number, digits = 1): string {
  const rounded = Number(Math.abs(value).toFixed(digits))
  const text = rounded.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  if (rounded === 0) return text
  return `${value > 0 ? '+' : '−'}${text}`
}

/** 110 -> "1h 50m"; 30 -> "30m"; 120 -> "2h". */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** 15.5 -> "15.5", 16 -> "16". */
export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/** 0.9 -> "90%"; 0.1008 -> "10.1%" when digits = 1. */
export function formatPercent(share: number, digits = 0): string {
  return `${(share * 100).toFixed(digits)}%`
}
