'use client';
import { useState } from 'react';
import styles from './Sidebar.module.css';

const navItems = [
  {
    section: 'PRINCIPAL',
    items: [
      { id: 'dashboard',  label: 'Dashboard',          icon: '⊞',  badge: null },
      { id: 'clients',    label: 'Clients',             icon: '◎',  badge: { count: 12, type: 'gold' } },
      { id: 'recherche',  label: 'Recherche en cours',  icon: '⊙',  badge: { count: 8,  type: 'slate' } },
    ]
  },
  {
    section: 'SUIVI',
    items: [
      { id: 'visites',    label: 'Visites',             icon: '◷',  badge: { count: 3,  type: 'blue' } },
      { id: 'relances',   label: 'Relances',            icon: '◉',  badge: { count: 5,  type: 'red', pulse: true } },
      { id: 'mail',       label: 'Nouveau mail',        icon: '◻',  badge: null },
    ]
  },
  {
    section: 'ANALYSE',
    items: [
      { id: 'activite',   label: 'Mon activité',        icon: '◈',  badge: null },
      { id: 'parametres', label: 'Paramètres',          icon: '◌',  badge: null },
    ]
  }
];

export default function Sidebar({ activePage, onNavigate }: { activePage: string; onNavigate: (page: string) => void }) {
  return (
    <aside className={styles.sidebar}>

      {/* LOGO */}
      <div className={styles.logo}>
        <div className={styles.logoMark}>
          <span>EI</span>
        </div>
        <div>
          <div className={styles.logoName}>Emilio</div>
          <div className={styles.logoSub}>Immobilier</div>
        </div>
      </div>

      {/* NAV */}
      <nav className={styles.nav}>
        {navItems.map((group, gi) => (
          <div key={gi} className={styles.navGroup}>
            <div className={styles.navSection}>{group.section}</div>
            {group.items.map(item => (
              <button
                key={item.id}
                className={`${styles.navItem} ${activePage === item.id ? styles.active : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                {item.badge && (
                  <span className={`${styles.navBadge} ${styles[`badge_${item.badge.type}`]} ${item.badge.pulse ? 'pulse' : ''}`}>
                    {item.badge.count}
                  </span>
                )}
              </button>
            ))}
            {gi < navItems.length - 1 && <div className={styles.navSep} />}
          </div>
        ))}
      </nav>

      {/* USER */}
      <div className={styles.userArea}>
        <div className={styles.userCard}>
          <div className={styles.userAvatar}>AR</div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>Alexandre R.</div>
            <div className={styles.userRole}>Chasseur immobilier</div>
          </div>
        </div>
      </div>

    </aside>
  );
}
