import styles from './Switch.module.css'

interface Props {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  swatch?: 'actual' | 'vintage'
}

export function Switch({ label, checked, onChange, swatch }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.switch}
      onClick={() => {
        onChange(!checked)
      }}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
      {swatch !== undefined && <span className={styles.swatch} data-kind={swatch} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  )
}
