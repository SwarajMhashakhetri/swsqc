import type { DecisionPreset } from '../api/types'
import { GateControl } from '../components/GateControl'
import styles from './Nav.module.css'

interface Props {
  presets: DecisionPreset[]
  gate: string
  custom: boolean
  onGateChange: (time: string, custom: boolean) => void
}

const LINKS = [
  { href: '#forecast', label: 'Forecast' },
  { href: '#accuracy', label: 'Accuracy' },
  { href: '#timing', label: 'Timing' },
  { href: '#method', label: 'Method' },
]

export function Mark() {
  return (
    <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="currentColor" />
      <path d="M13 27h23a6.5 6.5 0 1 0-6.5-6.5" fill="none" stroke="var(--page)" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M13 38h31a6.5 6.5 0 1 1-6.5 6.5" fill="none" stroke="var(--accent)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  )
}

/** Frosted sticky bar: product name, section links and the one control that scopes the whole page. */
export function Nav({ presets, gate, custom, onGateChange }: Props) {
  return (
    <nav className={styles.nav} aria-label="Primary">
      <div className={`container ${styles.inner}`}>
        <a className={styles.brand} href="#top" aria-label="Gale, back to top">
          <Mark />
          <span>Gale</span>
        </a>
        <ul className={styles.links}>
          {LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>
        {presets.length > 0 && (
          <div className={styles.gate}>
            <span className={`label ${styles.gateLabel}`}>Gate</span>
            <div className={styles.full}>
              <GateControl presets={presets} value={gate} custom={custom} onChange={onGateChange} />
            </div>
            <div className={styles.compact}>
              <GateControl presets={presets} value={gate} custom={custom} onChange={onGateChange} compact />
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
