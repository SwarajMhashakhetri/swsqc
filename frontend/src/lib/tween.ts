export type NumericSeries = readonly (number | null)[]

/** easeOutCubic: fast start, gentle settle. */
export function easeOut(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1)
  return 1 - (1 - clamped) ** 3
}

/**
 * Interpolate two equally long series at progress ``t`` (0..1).
 * Gaps never animate into numbers: a value is interpolated only when both ends exist.
 */
export function interpolateSeries(from: NumericSeries, to: NumericSeries, t: number): (number | null)[] {
  if (from.length !== to.length) return [...to]
  return to.map((target, i) => {
    const start = from[i]
    if (target === null || start === null || start === undefined) return target
    return start + (target - start) * t
  })
}
