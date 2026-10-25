import { describe, expect, it } from 'vitest'
import { readViewState, writeViewState } from './urlState'

describe('shareable view state', () => {
  it('round-trips a valid view', () => {
    const search = writeViewState({ date: '2026-01-28', gate: '09:50' })
    expect(readViewState(search)).toEqual({ date: '2026-01-28', gate: '09:50' })
  })

  it('ignores malformed or out-of-range values', () => {
    expect(readViewState('?date=28-01-2026&gate=23:30')).toEqual({ date: null, gate: null })
    expect(readViewState('')).toEqual({ date: null, gate: null })
  })
})
