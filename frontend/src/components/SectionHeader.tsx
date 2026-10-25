import type { ReactNode } from 'react'
import { useReveal } from '../hooks/useReveal'
import styles from './SectionHeader.module.css'

interface Props {
  id: string
  index: string
  eyebrow: string
  children: ReactNode
  intro?: ReactNode
}

/** Numbered Swiss-grid section opener: "01 / EYEBROW" over a two-tone headline. */
export function SectionHeader({ id, index, eyebrow, children, intro }: Props) {
  const [ref, visible] = useReveal<HTMLElement>()
  return (
    <header ref={ref} className={`${styles.header} reveal`} data-visible={visible}>
      <p className={`label ${styles.meta}`}>
        <span className={styles.index}>{index}</span>
        <span aria-hidden="true" className={styles.rule} />
        <span>{eyebrow}</span>
      </p>
      <h2 id={id} className={styles.headline}>
        {children}
      </h2>
      {intro !== undefined && <p className={styles.intro}>{intro}</p>}
    </header>
  )
}
