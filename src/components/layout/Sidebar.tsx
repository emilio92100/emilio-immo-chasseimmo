'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Sidebar.module.css';

export default function Sidebar({ activePage, onNavigate }: { activePage: string; onNavigate: (page: string) => void }) {
  const [counts, setCounts] = useState({ actifs: 0, relances: 0, visites: 0 });

  useEffect(() => { fetchCounts(); }, [activePage]);

  async function fetchCounts() {
    const today = new Date().toISOString();
    /* La pastille ne dit que ce qui est dû : en retard ou pour aujourd'hui.
       Une relance prévue dans douze jours n'est pas une alerte — elle reste
       dans la page Relances, mais elle ne doit pas peser sur le menu.
       Fin de journée, pour que celles du jour comptent quelle que soit l'heure. */
    const finDuJour = new Date(); finDuJour.setHours(23, 59, 59, 999);
    const [{ count: cl }, { count: rel }, { count: vis }] = await Promise.all([
      /* Le total des clients ne dit rien : un dossier clos il y a deux ans pèse
         autant qu'une recherche en cours. On compte ce sur quoi on travaille. */
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('statut', 'actif'),
      supabase.from('relances').select('*', { count: 'exact', head: true })
        .eq('statut', 'en_attente').lte('date_echeance', finDuJour.toISOString()),
      supabase.from('visites').select('*', { count: 'exact', head: true }).eq('statut', 'a_venir').gte('date_visite', today),
    ]);
    setCounts({ actifs: cl || 0, relances: rel || 0, visites: vis || 0 });
  }

  /* Un seul type pour toutes les pastilles : sans lui, TypeScript déduit un
     type différent par entrée et refuse les champs absents des autres. */
  type Badge = { count: number; type: string; suffixe?: string; pulse?: boolean };
  const navItems: { section: string; items: { id: string; label: string; icon: string; badge: Badge | null }[] }[] = [
    {
      section: 'PRINCIPAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: '⊞', badge: null },
        { id: 'clients', label: 'Clients', icon: '◎', badge: counts.actifs > 0 ? { count: counts.actifs, suffixe: 'actifs', type: 'gold' } : null },
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
                  <span className={`${styles.navBadge} ${styles[`badge_${item.badge.type}`]} ${item.badge.pulse ? 'pulse' : ''}`}
                    title={item.badge.suffixe ? `${item.badge.count} dossiers ${item.badge.suffixe}` : undefined}>
                    {item.badge.count}
                    {item.badge.suffixe && <span className={styles.navBadgeMot}>{item.badge.suffixe}</span>}
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
