'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Sidebar.module.css';

export default function Sidebar({ activePage, onNavigate }: { activePage: string; onNavigate: (page: string) => void }) {
  const [counts, setCounts] = useState({ clients: 0, relances: 0, visites: 0, recherche: 0 });

  useEffect(() => { fetchCounts(); }, [activePage]);

  async function fetchCounts() {
    const today = new Date().toISOString();
    const [{ count: cl }, { count: rel }, { count: vis }, { count: rech }] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('relances').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      supabase.from('visites').select('*', { count: 'exact', head: true }).eq('statut', 'a_venir').gte('date_visite', today),
      supabase.from('clients').select('*', { count: 'exact', head: true }).in('statut', ['actif', 'prospect']),
    ]);
    setCounts({ clients: cl || 0, relances: rel || 0, visites: vis || 0, recherche: rech || 0 });
  }

  const navItems = [
    {
      section: 'PRINCIPAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: '⊞', badge: null },
        { id: 'clients', label: 'Clients', icon: '◎', badge: counts.clients > 0 ? { count: counts.clients, type: 'gold' } : null },
        { id: 'recherche', label: 'Recherche en cours', icon: '⊙', badge: counts.recherche > 0 ? { count: counts.recherche, type: 'slate' } : null },
      ]
    },
    {
      section: 'SUIVI',
      items: [
        { id: 'visites', label: 'Visites', icon: '◷', badge: counts.visites > 0 ? { count: counts.visites, type: 'blue' } : null },
        { id: 'relances', label: 'Relances', icon: '◉', badge: counts.relances > 0 ? { count: counts.relances, type: 'red', pulse: true } : null },
        { id: 'mail', label: 'Nouveau mail', icon: '◻', badge: null },
      ]
    },
    {
      section: 'ANALYSE',
      items: [
        { id: 'activite', label: 'Mon activité', icon: '◈', badge: null },
        { id: 'parametres', label: 'Paramètres', icon: '◌', badge: null },
      ]
    }
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoMark}><span>EI</span></div>
        <div>
          <div className={styles.logoName}>Emilio</div>
          <div className={styles.logoSub}>Immobilier</div>
        </div>
      </div>

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

      <div className={styles.userArea}>
        <div className={styles.userCard}>
          <div className={styles.userAvatar}>AR</div>
          <div>
            <div className={styles.userName}>Alexandre R.</div>
            <div className={styles.userRole}>Chasseur immobilier</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
