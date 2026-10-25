/** One-dimensional label layout for chart annotations: keep inside the plot, nudge, stack, or drop. */

export interface LabelSpec {
  key: string
  /** Pixel x of the thing the label annotates. */
  anchor: number
  /** Rendered width in px (see ``textWidth``). */
  width: number
  /** Higher keeps its ideal spot; lower is nudged, stacked or dropped first. */
  priority: number
  /** Ideal position relative to the anchor, as SVG ``text-anchor``; ``start``/``end`` sit beside it. */
  align?: 'middle' | 'start' | 'end'
}

/** A spec with its position: ``x`` is the left edge (render with ``textAnchor="start"``), ``row`` 0 the preferred line. */
export type Placed<T extends LabelSpec> = T & { x: number; row: number }

export interface LabelBounds {
  start: number
  end: number
  /** Rows available for stacking (default 1: collide means nudge or drop). */
  rows?: number
  /** Minimum clear space between labels in px. */
  gap?: number
  /** How far a label may slide off its anchor, in px, and still read as attached to it. */
  reach?: number
  /** Distance from the anchor for ``start``/``end`` alignment. */
  offset?: number
}

const EPSILON = 1e-6

/** Width of a label set in Inter / SF at ``fontSize`` px: a slightly generous per-character estimate. */
export function textWidth(text: string, fontSize = 11): number {
  return Math.ceil(text.length * fontSize * 0.6)
}

/**
 * Places labels in priority order. Each label takes the free spot nearest its
 * ideal position on the first row where one exists, staying inside
 * ``[start, end]`` and within ``reach`` of its anchor. A label with no such
 * spot on any row is dropped, so a crowded chart shows fewer labels, never
 * overlapping ones. Returns the placed labels in input order.
 */
export function placeLabels<T extends LabelSpec>(specs: readonly T[], bounds: LabelBounds): Placed<T>[] {
  const { start, end, rows = 1, gap = 6, reach = 0, offset = 6 } = bounds
  const occupied: [number, number][][] = Array.from({ length: rows }, () => [])
  const placed = new Map<string, { x: number; row: number }>()
  const order = specs
    .map((spec, index) => ({ spec, index }))
    .sort((a, b) => b.spec.priority - a.spec.priority || a.index - b.index)

  for (const { spec } of order) {
    const { anchor, width } = spec
    const ideal =
      spec.align === 'start' ? anchor + offset : spec.align === 'end' ? anchor - offset - width : anchor - width / 2
    // Inside the plot, and still touching (within reach of) the anchor it labels.
    const lo = Math.max(start, anchor - width - Math.max(reach, spec.align === 'end' ? offset : 0))
    const hi = Math.min(end - width, anchor + Math.max(reach, spec.align === 'start' ? offset : 0))
    if (lo > hi + EPSILON) continue
    for (let row = 0; row < rows; row++) {
      const taken = occupied[row] ?? []
      const fits = (x: number) =>
        x >= lo - EPSILON &&
        x <= hi + EPSILON &&
        taken.every(([a, b]) => x + width + gap <= a + EPSILON || x >= b + gap - EPSILON)
      // The nearest free spot is the clamped ideal, a bound, or flush against a label already placed.
      const candidates = [Math.min(Math.max(ideal, lo), hi), lo, hi, ...taken.flatMap(([a, b]) => [a - gap - width, b + gap])]
      const best = candidates.filter(fits).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0]
      if (best !== undefined) {
        taken.push([best, best + width])
        placed.set(spec.key, { x: best, row })
        break
      }
    }
  }
  return specs.flatMap((spec) => {
    const position = placed.get(spec.key)
    return position === undefined ? [] : [{ ...spec, ...position }]
  })
}
