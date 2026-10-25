import { Mark } from './Nav'
import styles from './Footer.module.css'

export function Footer({ loadedAt }: { loadedAt: string | undefined }) {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>
          <Mark />
          <span>Gale</span>
        </div>
        <p className={styles.fineprint}>
          Data: Elexon BMRS Insights, datasets{' '}
          <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream">WINDFOR</a> and{' '}
          <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream">FUELHH</a>. Gate
          closures: <a href="https://www.epexspot.com/en/tradingproducts">EPEX SPOT</a> and{' '}
          <a href="https://www.nordpoolgroup.com/4ab3f9/globalassets/download-center/rules-and-regulations/day-ahead-market-regulations---gb-market.pdf">
            Nord Pool
          </a>
          . <a href="/api/docs">API reference</a>.
        </p>
        {loadedAt !== undefined && (
          <p className={`label ${styles.loaded}`}>
            Dataset loaded {new Date(loadedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
          </p>
        )}
      </div>
    </footer>
  )
}
