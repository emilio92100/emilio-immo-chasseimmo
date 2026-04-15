'use client';
import styles from './Dashboard.module.css';

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <div className={styles.dashboard}>

      {/* ── WELCOME BANNER ── */}
      <div className={styles.welcomeBanner}>
        <div className={styles.welcomeLeft}>
          <p className={styles.welcomeDate}>Mercredi 15 avril 2026</p>
          <h1 className={styles.welcomeTitle}>Bonjour, Alexandre 👋</h1>
          <p className={styles.welcomeSub}>
            Vous avez <strong className={styles.accent}>5 relances</strong> en attente
            et <strong>3 visites</strong> cette semaine.
          </p>
        </div>
        <div className={styles.welcomeRight}>
          <button className={styles.mailBtn} onClick={() => onNavigate('mail')}>
            ✉️ Nouveau mail
          </button>
        </div>
      </div>

      {/* ── DIVIDER ── */}
      <div className={styles.sectionDivider}>
        <span>Vue d'ensemble</span>
      </div>

      {/* ── STATS ── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconSlate}`}>👥</div>
            <span className={`${styles.statBadge} ${styles.badgePurple}`}>3 prospects</span>
          </div>
          <div className={styles.statVal}>8</div>
          <div className={styles.statLabel}>Clients actifs</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconGold}`}>📄</div>
            <span className={`${styles.statBadge} ${styles.badgeGreen}`}>+6 vs mois dernier</span>
          </div>
          <div className={styles.statVal}>24</div>
          <div className={styles.statLabel}>Sélections ce mois</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconBlue}`}>📅</div>
            <span className={`${styles.statBadge} ${styles.badgeBlue}`}>3 à venir</span>
          </div>
          <div className={styles.statVal}>11</div>
          <div className={styles.statLabel}>Visites effectuées</div>
        </div>
        <div className={`${styles.statCard} ${styles.statDark}`}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconDark}`}>💰</div>
            <span className={`${styles.statBadge} ${styles.badgeGoldDark}`}>HT</span>
          </div>
          <div className={`${styles.statVal} ${styles.statValWhite}`}>18 400€</div>
          <div className={`${styles.statLabel} ${styles.statLabelDark}`}>CA mois en cours</div>
          <div className={styles.statSub}>✓ 1 dossier finalisé</div>
        </div>
      </div>

      {/* ── MAIN ROW ── */}
      <div className={styles.mainRow}>
        {/* RELANCES */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <span>🔔</span> Relances en attente
              <span className={`${styles.badge} ${styles.badgeRedSm}`}>5</span>
            </div>
            <button className={styles.cardLink} onClick={() => onNavigate('relances')}>Voir toutes →</button>
          </div>
          {[
            { name: 'Sophie Martin', detail: 'PDF envoyé le 10/04 — 3 biens', tag: '2j de retard', color: '#ef4444', badgeClass: 'badgeRed' },
            { name: 'Jean Dupont',   detail: 'PDF envoyé le 10/04 — 2 biens', tag: "Aujourd'hui",  color: '#ef4444', badgeClass: 'badgeRed' },
            { name: 'Marie Leblanc', detail: 'PDF envoyé le 13/04 — 1 bien',  tag: 'Dans 3 jours', color: '#f59e0b', badgeClass: 'badgeAmber' },
            { name: 'Paul Renard',   detail: 'Manuelle — "Après RDV notaire"', tag: '20 avril',    color: '#60a5fa', badgeClass: 'badgeBlue2' },
          ].map((r, i) => (
            <div key={i} className={styles.listRow}>
              <div className={styles.urgBar} style={{ background: r.color }} />
              <div className={styles.listInfo}>
                <div className={styles.listName}>{r.name}</div>
                <div className={styles.listDetail}>{r.detail}</div>
              </div>
              <span className={`${styles.badge} ${styles[r.badgeClass]}`}>{r.tag}</span>
            </div>
          ))}
        </div>

        {/* TRANSACTIONS */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}><span>🏠</span> Transactions en cours</div>
            <button className={styles.cardLink}>Voir tout →</button>
          </div>
          <div className={styles.txList}>
            <div className={styles.txItem}>
              <div className={styles.txTop}>
                <span className={styles.txName}>Sophie Martin</span>
                <span className={styles.txPrice}>348 000€</span>
              </div>
              <div className={styles.txSub}>Appt 3P · 68m² · Boulogne-Billancourt</div>
              <div className={styles.progBar}>
                <div className={`${styles.progStep} ${styles.done}`} />
                <div className={`${styles.progStep} ${styles.done}`} />
                <div className={`${styles.progStep} ${styles.done}`} />
                <div className={`${styles.progStep} ${styles.active}`} />
                <div className={styles.progStep} />
              </div>
              <div className={styles.txHint}>Compromis signé · Acte prévu 22/07</div>
            </div>
            <div className={styles.txItem}>
              <div className={styles.txTop}>
                <span className={styles.txName}>Jean Dupont</span>
                <span className={styles.txPrice}>520 000€</span>
              </div>
              <div className={styles.txSub}>Maison 5P · 120m² · Neuilly-sur-Seine</div>
              <div className={styles.progBar}>
                <div className={`${styles.progStep} ${styles.done}`} />
                <div className={`${styles.progStep} ${styles.active}`} />
                <div className={styles.progStep} />
                <div className={styles.progStep} />
                <div className={styles.progStep} />
              </div>
              <div className={styles.txHint}>Négociation · 2 contre-offres</div>
            </div>
          </div>
        </div>

        {/* RIGHT COL */}
        <div className={styles.rightCol}>
          {/* VISITES */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}><span>📅</span> Visites à venir</div>
              <button className={styles.cardLink} onClick={() => onNavigate('visites')}>Tout →</button>
            </div>
            <div className={styles.visiteList}>
              {[
                { day: '20', mon: 'Avr', name: 'Sophie Martin', lieu: 'Rue de Rivoli, 1er', heure: '14h00', dark: true },
                { day: '22', mon: 'Avr', name: 'Paul Renard',   lieu: 'Av. Foch, 16ème',   heure: '10h30', dark: false },
                { day: '24', mon: 'Avr', name: 'Marie Leblanc', lieu: 'Boulogne-B.',         heure: '16h00', dark: false },
              ].map((v, i) => (
                <div key={i} className={styles.visiteRow}>
                  <div className={`${styles.vdate} ${v.dark ? styles.vdateDark : styles.vdateLight}`}>
                    <div className={styles.vday}>{v.day}</div>
                    <div className={styles.vmon}>{v.mon}</div>
                  </div>
                  <div>
                    <div className={styles.vname}>{v.name}</div>
                    <div className={styles.vlieu}>{v.lieu}</div>
                    <div className={styles.vheure}>{v.heure}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ACTIVITÉ */}
          <div className={styles.card} style={{ flex: 1 }}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>🕐 Activité récente</div>
            </div>
            <div className={styles.actList}>
              {[
                { dot: '#c9a84c', text: <><strong>PDF envoyé</strong> · Sophie Martin · 3 biens</>, time: 'Il y a 2h' },
                { dot: '#10b981', text: <><strong>Visite effectuée</strong> · Paul Renard</>,       time: 'Hier 14h30' },
                { dot: '#1a2332', text: <><strong>Compromis signé</strong> · Sophie Martin</>,      time: 'Il y a 3 jours' },
              ].map((a, i) => (
                <div key={i} className={styles.actRow}>
                  <div className={styles.actDot} style={{ background: a.dot }} />
                  <div><div className={styles.actText}>{a.text}</div><div className={styles.actTime}>{a.time}</div></div>
                </div>
              ))}
            </div>
          </div>

          {/* MANDAT ALERT */}
          <div className={styles.mandatAlert}>
            <div className={styles.mandatLabel}>⚠️ Mandat expirant</div>
            <div className={styles.mandatName}>Marie Leblanc</div>
            <div className={styles.mandatExpire}>Expire le 15/05/2026</div>
            <div className={styles.mandatFooter}>
              <span className={styles.mandatDays}>30 jours</span>
              <button className={styles.mandatBtn}>Renouveler</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
