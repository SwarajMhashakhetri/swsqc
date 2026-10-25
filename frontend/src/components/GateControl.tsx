import { useId } from 'react'
import type { DecisionPreset } from '../api/types'
import { SegmentedControl, type Segment } from './SegmentedControl'
import styles from './GateControl.module.css'

export const LATEST_DECISION = '22:59'

interface Props {
  presets: readonly DecisionPreset[]
  value: string
  custom: boolean
  onChange: (time: string, custom: boolean) => void
  compact?: boolean
}

const CUSTOM = 'custom'

/** Decision-time picker: the two GB day-ahead gate closures, or any time on D-1 before 23:00. */
export function GateControl({ presets, value, custom, onChange, compact = false }: Props) {
  const inputId = useId()
  const segments: Segment<string>[] = [
    ...presets.map((p) => ({
      value: p.id,
      label: compact ? p.decision_time : p.exchange.replace(' SPOT', ''),
      ...(compact ? {} : { detail: p.decision_time }),
    })),
    { value: CUSTOM, label: 'Custom' },
  ]
  const active = custom ? CUSTOM : (presets.find((p) => p.decision_time === value)?.id ?? CUSTOM)

  return (
    <div className={styles.gate}>
      <SegmentedControl
        label="Decision time (gate closure, UK time on the day before delivery)"
        segments={segments}
        value={active}
        size={compact ? 'compact' : 'regular'}
        onChange={(id) => {
          const preset = presets.find((p) => p.id === id)
          if (preset === undefined) onChange(value, true)
          else onChange(preset.decision_time, false)
        }}
      />
      {active === CUSTOM && (
        <label className={styles.custom} htmlFor={inputId}>
          <span className="visually-hidden">Custom decision time, UK, day before delivery</span>
          <input
            id={inputId}
            type="time"
            className={styles.time}
            min="00:00"
            max={LATEST_DECISION}
            step={60}
            value={value}
            required
            onChange={(event) => {
              const next = event.target.value
              if (/^([01]\d|2[0-2]):[0-5]\d$/.test(next)) onChange(next, true)
            }}
          />
        </label>
      )}
    </div>
  )
}
