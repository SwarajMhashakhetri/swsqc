import { useCallback, useState } from 'react'

/**
 * Tracks an element's content width so SVG charts render at true pixel size.
 *
 * The first measurement is taken synchronously when the element attaches (during
 * commit, before paint), so a chart never shows a frame at ``fallback``; a
 * ResizeObserver then follows every later resize, including orientation changes.
 * The element must take its width from layout, never from its content (see `.plot`).
 */
export function useElementWidth<T extends HTMLElement>(fallback = 640): [React.RefCallback<T>, number] {
  const [width, setWidth] = useState(fallback)

  const ref = useCallback((element: T | null) => {
    if (element === null) return
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  return [ref, width]
}
