import { useId, useRef } from 'react'
import { addDays, formatCalendarDate } from '../lib/format'
import styles from './DateStepper.module.css'

interface Props {
  value: string
  min: string
  max: string
  onChange: (date: string) => void
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Delivery-day picker: step a day at a time, or jump with the native date picker. */
export function DateStepper({ value, min, max, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const step = (days: number) => {
    const next = addDays(value, days)
    if (next >= min && next <= max) onChange(next)
  }

  return (
    <div className={styles.stepper} role="group" aria-label="Delivery day">
      <button
        type="button"
        className={styles.arrow}
        onClick={() => {
          step(-1)
        }}
        disabled={value <= min}
        aria-label="Previous delivery day"
      >
        <Chevron direction="left" />
      </button>
      <label className={styles.date} htmlFor={id}>
        <span className={styles.long}>{formatCalendarDate(value)}</span>
        <span className={styles.short}>{formatCalendarDate(value, 'short')}</span>
        <input
          ref={input}
          id={id}
          className={styles.native}
          type="date"
          min={min}
          max={max}
          value={value}
          aria-label="Choose delivery day"
          onClick={() => {
            try {
              input.current?.showPicker()
            } catch {
              // Not every browser allows showPicker here; the native input still works.
            }
          }}
          onChange={(event) => {
            const next = event.target.value
            if (next >= min && next <= max) onChange(next)
          }}
        />
      </label>
      <button
        type="button"
        className={styles.arrow}
        onClick={() => {
          step(1)
        }}
        disabled={value >= max}
        aria-label="Next delivery day"
      >
        <Chevron direction="right" />
      </button>
    </div>
  )
}
