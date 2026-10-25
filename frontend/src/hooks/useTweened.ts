import { useEffect, useRef, useState } from 'react'
import { easeOut, interpolateSeries, type NumericSeries } from '../lib/tween'
import { useReducedMotion } from './useReducedMotion'

const DURATION_MS = 520

type Series<K extends string> = Record<K, NumericSeries>

/**
 * Animates every series in ``target`` from what is currently on screen, so
 * charts glide between delivery days instead of jumping. A series only
 * animates when its length is unchanged; gaps never animate.
 */
export function useTweened<K extends string>(target: Series<K>): Series<K> {
  const reduced = useReducedMotion()
  const [current, setCurrent] = useState(target)
  const shown = useRef(target)
  // Content key: the caller builds a new object every render.
  const signature = JSON.stringify(target)

  useEffect(() => {
    const goal = JSON.parse(signature) as Series<K>
    const from: Partial<Series<K>> = shown.current
    const keys = Object.keys(goal) as K[]
    let frame = 0
    const started = performance.now()
    const step = (now: number) => {
      const t = reduced ? 1 : easeOut((now - started) / DURATION_MS)
      const next = {} as Series<K>
      for (const key of keys) next[key] = interpolateSeries(from[key] ?? goal[key], goal[key], t)
      shown.current = next
      setCurrent(next)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [signature, reduced])

  return current
}
