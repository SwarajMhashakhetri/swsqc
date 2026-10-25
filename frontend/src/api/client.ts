export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface ErrorEnvelope {
  error?: { message?: string }
}

const cache = new Map<string, Promise<unknown>>()

/** GET a JSON resource. Successful responses are memoised: the data is historical. */
export function getJson<T>(path: string): Promise<T> {
  let request = cache.get(path)
  if (request === undefined) {
    request = load(path)
    cache.set(path, request)
    request.catch(() => cache.delete(path))
  }
  return request as Promise<T>
}

async function load(path: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(0, 'Network unavailable. Check your connection and try again.')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorEnvelope
    throw new ApiError(
      response.status,
      body.error?.message ?? `The Gale API did not respond properly (HTTP ${String(response.status)}).`,
    )
  }
  return response.json()
}

export const endpoints = {
  meta: () => '/api/v1/meta',
  decision: (deliveryDate: string, decisionTime: string) =>
    `/api/v1/decision?${new URLSearchParams({ delivery_date: deliveryDate, decision_time: decisionTime }).toString()}`,
  series: (decisionTime: string) =>
    `/api/v1/series?${new URLSearchParams({ decision_time: decisionTime }).toString()}`,
  accuracy: (decisionTime: string) =>
    `/api/v1/accuracy?${new URLSearchParams({ decision_time: decisionTime }).toString()}`,
  horizon: () => '/api/v1/horizon',
  timing: () => '/api/v1/timing',
}
