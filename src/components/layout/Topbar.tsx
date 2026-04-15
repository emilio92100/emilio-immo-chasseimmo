'use client';
import styles from './Topbar.module.css';

export default function Topbar({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.searchWrap}>
        <span className={styles.searchIco}>⊕</span>
        <input
          type="text"
          placeholder="Client, bien, secteur, URL d'annonce..."
          className={styles.searchInput}
        />
        <span className={styles.searchHint}>⌘K</span>
      </div>
      <div className={styles.spacer} />
      <button
        className={`${styles.alertBtn} pulse`}
        onClick={() => onNavigate('relances')}
      >
        <span>🔔</span>
        <span>5 relances</span>
      </button>
      <button className={styles.btn} onClick={() => onNavigate('mail')}>
        ✉️ Nouveau mail
      </button>
      <button className={`${styles.btn} ${styles.btnDark}`} onClick={() => onNavigate('clients')}>
        + Nouveau client
      </button>
    </header>
  );
}
