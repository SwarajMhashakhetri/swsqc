import { describe, expect, it } from 'vitest'
import { placeLabels as place, textWidth, type LabelBounds, type LabelSpec } from './labels'

const label = (key: string, anchor: number, priority = 1, width = 40, align?: LabelSpec['align']): LabelSpec => ({
  key,
  anchor,
  width,
  priority,
  ...(align === undefined ? {} : { align }),
})

/** Positions only, so expectations stay short. */
const placeLabels = (specs: LabelSpec[], bounds: LabelBounds) => place(specs, bounds).map(({ key, x, row }) => ({ key, x, row }))

describe('placeLabels', () => {
  it('centres a lone label on its anchor', () => {
    expect(placeLabels([label('a', 100)], { start: 0, end: 300 })).toEqual([{ key: 'a', x: 80, row: 0 }])
  })

  it('nudges labels inside the plot at either edge', () => {
    const placed = placeLabels([label('left', 5), label('right', 298)], { start: 0, end: 300 })
    expect(placed).toEqual([
      { key: 'left', x: 0, row: 0 },
      { key: 'right', x: 260, row: 0 },
    ])
  })

  it('keeps the higher-priority label in place and slides the other beside it, still over its anchor', () => {
    // The 390 px histogram: median at +1.6 GW and buffer at +4.1 GW sit 60 px apart.
    const placed = placeLabels([label('median', 133, 1, 86), label('buffer', 193, 2, 80)], { start: 0, end: 262 })
    const median = placed.find((p) => p.key === 'median')
    expect(placed.find((p) => p.key === 'buffer')).toEqual({ key: 'buffer', x: 153, row: 0 })
    expect(median).toEqual({ key: 'median', x: 153 - 6 - 86, row: 0 })
    // Still attached: the slid label covers its anchor.
    expect(median !== undefined && median.x <= 133 && median.x + 86 >= 133).toBe(true)
  })

  it('stacks onto the next row when sliding cannot clear a collision', () => {
    const placed = placeLabels([label('a', 100, 2), label('b', 104, 1)], { start: 0, end: 300, rows: 2 })
    expect(placed).toEqual([
      { key: 'a', x: 80, row: 0 },
      { key: 'b', x: 84, row: 1 },
    ])
  })

  it('drops the lower-priority label when there is no room', () => {
    const placed = placeLabels([label('minor', 100, 1), label('major', 104, 5)], { start: 0, end: 300 })
    expect(placed.map((p) => p.key)).toEqual(['major'])
  })

  it('carries the caller’s own fields through', () => {
    const [placed] = place([{ ...label('a', 100), text: 'Median' }], { start: 0, end: 300 })
    expect(placed?.text).toBe('Median')
  })

  it('drops a label wider than the plot', () => {
    expect(placeLabels([label('wide', 50, 1, 120)], { start: 0, end: 100 })).toEqual([])
  })

  it('places start and end alignments beside the anchor, and pulls them back inside the bounds', () => {
    const bounds = { start: 0, end: 200, offset: 6 }
    expect(placeLabels([label('epex', 100, 2, 60, 'end'), label('n2ex', 105, 1, 80, 'start')], bounds)).toEqual([
      { key: 'epex', x: 34, row: 0 },
      { key: 'n2ex', x: 111, row: 0 },
    ])
    // Near the right edge the start-aligned label slides left, but never off its anchor.
    expect(placeLabels([label('n2ex', 150, 1, 80, 'start')], bounds)).toEqual([{ key: 'n2ex', x: 120, row: 0 }])
    expect(placeLabels([label('n2ex', 196, 1, 80, 'start')], bounds)).toEqual([{ key: 'n2ex', x: 120, row: 0 }])
  })

  it('lets priority, not input order, decide who moves', () => {
    const forward = placeLabels([label('a', 100, 1), label('b', 110, 2)], { start: 0, end: 300, reach: 30 })
    const backward = placeLabels([label('b', 110, 2), label('a', 100, 1)], { start: 0, end: 300, reach: 30 })
    expect(forward.find((p) => p.key === 'b')?.x).toBe(90)
    expect(backward.find((p) => p.key === 'b')?.x).toBe(90)
    expect(forward.find((p) => p.key === 'a')?.x).toBe(44)
  })
})

describe('textWidth', () => {
  it('estimates generously from the character count', () => {
    expect(textWidth('28 Jan')).toBe(40)
    expect(textWidth('Median +1.6 GW', 11)).toBeGreaterThan(86)
  })
})
