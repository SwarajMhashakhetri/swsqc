import { useCallback, useEffect, useState } from 'react'
import { getJson } from '../api/client'

export interface ApiState<T> {
  /** Latest data; kept from the previous request while a new one loads, so charts hold their frame. */
  data: T | undefined
  error: Error | undefined
  loading: boolean
  retry: () => void
}

interface Settled<T> {
  path: string
  attempt: number
  data?: T
  error?: Error
}

export function useApi<T>(path: string | null): ApiState<T> {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T>>({ path: '', attempt: -1 })

  useEffect(() => {
    if (path === null) return
    let active = true
    getJson<T>(path).then(
      (data) => {
        if (active) setSettled({ path, attempt, data })
      },
      (error: unknown) => {
        if (active) {
          setSettled((previous) => ({
            path,
            attempt,
            ...(previous.data === undefined ? {} : { data: previous.data }),
            error: error instanceof Error ? error : new Error(String(error)),
          }))
        }
      },
    )
    return () => {
      active = false
    }
  }, [path, attempt])

  const retry = useCallback(() => {
    setAttempt((n) => n + 1)
  }, [])
  const current = settled.path === path && settled.attempt === attempt
  return {
    data: settled.data,
    error: current ? settled.error : undefined,
    loading: path !== null && !current,
    retry,
  }
}
