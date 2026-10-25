import styles from './Status.module.css'

export function Skeleton({ height, label }: { height: number | string; label: string }) {
  return (
    <div className={styles.skeleton} style={{ height }} role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
    </div>
  )
}

interface ErrorProps {
  title?: string
  message: string
  onRetry: () => void
}

export function ErrorPanel({ title = 'We couldn’t load this view.', message, onRetry }: ErrorProps) {
  return (
    <div className={styles.error} role="alert">
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" className={styles.icon}>
        <circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7v6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16.75" r="1.1" fill="currentColor" />
      </svg>
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>
}
