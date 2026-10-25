import { useCallback, useState } from 'react'
import { nearestIndex } from '../../lib/series'

/**
 * Pointer, touch and keyboard tracking for a crosshair that snaps to the
 * nearest data position. ``positions`` are pixel x-coordinates, ascending;
 * keyboard reading starts at ``focusIndex``.
 */
export function useCrosshair(positions: readonly number[], marginLeft: number, focusIndex = 0) {
  const [index, setIndex] = useState<number | null>(null)
  const count = positions.length
  const start = Math.min(focusIndex, count - 1)

  const fromPointer = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const box = event.currentTarget.getBoundingClientRect()
      setIndex(nearestIndex(positions, event.clientX - box.left - marginLeft))
    },
    [positions, marginLeft],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (count === 0) return
      const keys: Record<string, (current: number) => number> = {
        ArrowRight: (i) => Math.min(i + 1, count - 1),
        ArrowLeft: (i) => Math.max(i - 1, 0),
        Home: () => 0,
        End: () => count - 1,
      }
      if (event.key === 'Escape') {
        setIndex(null)
        return
      }
      const move = keys[event.key]
      if (move === undefined) return
      event.preventDefault()
      setIndex((current) => move(current ?? start))
    },
    [count, start],
  )

  const active = index !== null && index < count ? index : null
  return {
    index: active,
    handlers: {
      onPointerMove: fromPointer,
      onPointerDown: fromPointer,
      onPointerLeave: () => {
        setIndex(null)
      },
      onKeyDown,
      onFocus: () => {
        setIndex((current) => current ?? start)
      },
      onBlur: () => {
        setIndex(null)
      },
    },
  }
}
