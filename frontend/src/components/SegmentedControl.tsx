import { useRef } from 'react'
import styles from './SegmentedControl.module.css'

export interface Segment<T extends string> {
  value: T
  label: string
  detail?: string
}

interface Props<T extends string> {
  label: string
  segments: readonly Segment<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'regular' | 'compact'
}

/** An iOS-style segmented control with radio-group semantics and arrow-key navigation. */
export function SegmentedControl<T extends string>({ label, segments, value, onChange, size = 'regular' }: Props<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const selected = Math.max(
    segments.findIndex((s) => s.value === value),
    0,
  )

  const move = (delta: number) => {
    const next = (selected + delta + segments.length) % segments.length
    const segment = segments[next]
    if (segment === undefined) return
    onChange(segment.value)
    buttons.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={styles.control}
      data-size={size}
      style={{ '--count': segments.length, '--index': selected } as React.CSSProperties}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault()
          move(1)
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault()
          move(-1)
        }
      }}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {segments.map((segment, index) => (
        <button
          key={segment.value}
          ref={(node) => {
            buttons.current[index] = node
          }}
          type="button"
          role="radio"
          aria-checked={index === selected}
          tabIndex={index === selected ? 0 : -1}
          className={styles.segment}
          onClick={() => {
            onChange(segment.value)
          }}
        >
          <span className={styles.text}>{segment.label}</span>
          {segment.detail !== undefined && <span className={styles.detail}>{segment.detail}</span>}
        </button>
      ))}
    </div>
  )
}
