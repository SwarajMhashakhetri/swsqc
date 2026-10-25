import { useEffect, useRef, useState } from 'react'

/** Marks an element visible the first time it scrolls into view (pairs with the `.reveal` class). */
export function useReveal<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (element === null || visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [visible])

  return [ref, visible]
}
