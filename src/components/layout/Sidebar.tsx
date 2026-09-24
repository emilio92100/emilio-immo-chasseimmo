'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Sidebar.module.css';
import { EVT_MAJ, demanderNouveauClient } from '@/lib/intentions';
import { Icone } from '@/components/fiche/ParcoursBien';

/**
 * La navigation du CRM.
 *
 * Sur ordinateur : la barre de gauche, inchangée.
 *
 * Sur téléphone (≤ 900 px), la même barre devient un tiroir qui glisse depuis
 * la gauche (le bouton ☰ de la barre du haut l'ouvre), et une barre d'onglets
 * se pose en bas de l'écran, sous le pouce : Accueil, Clients, le « + » du
 * nouveau client, Visites, Relances. Les compteurs sont les mêmes des deux
 * côtés — ils ne sont lus qu'une fois, ici.
 */
export default function Sidebar({ activePage, onNavigate, ouvert = false, onFermer }: {
  activePage: string;
  onNavigate: (page: string) => void;
  ouvert?: boolean;
  onFermer?: () => void;
}) {
  const [counts, setCounts] = useState({ actifs: 0, relances: 0, visites: 0 });

  /* Les compteurs ne se recalculaient qu'en changeant de page : clôturer une
     relance depuis une fiche laissait l'ancien chiffre affiché. Ils écoutent
     maintenant les écrans qui touchent aux dossiers, le retour sur l'onglet,
     et se rafraîchissent d'eux-mêmes de temps en temps. */
  useEffect(() => {
    fetchCounts();
    const revoir = () => { if (!document.hidden) fetchCounts(); };
    const minuterie = setInterval(revoir, 20000);
    window.addEventListener(EVT_MAJ, fetchCounts);
    window.addEventListener('focus', revoir);
    document.addEventListener('visibilitychange', revoir);
    return () => {
      clearInterval(minuterie);
      window.removeEventListener(EVT_MAJ, fetchCounts);
      window.removeEventListener('focus', revoir);
      document.removeEventListener('visibilitychange', revoir);
    };
  }, [activePage]);

  /* Le tiroir se ferme avec la touche Échap, comme une fenêtre. */
  useEffect(() => {
    if (!ouvert) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer?.(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [ouvert, onFermer]);

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

  /* Une fiche client appartient à la rubrique Clients : la rubrique reste
     allumée quand on y entre, on sait toujours où l'on est. */
  const courant = activePage === 'fiche' ? 'clients' : activePage;

  /* Un seul type pour toutes les pastilles : sans lui, TypeScript déduit un
     type différent par entrée et refuse les champs absents des autres. */
  type Badge = { count: number; type: string; suffixe?: string; pulse?: boolean };
  const navItems: { section: string; items: { id: string; label: string; icon: string; picto: string; badge: Badge | null }[] }[] = [
    {
      section: 'PRINCIPAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: '⊞', picto: 'accueil', badge: null },
        { id: 'clients', label: 'Clients', icon: '◎', picto: 'clients', badge: counts.actifs > 0 ? { count: counts.actifs, suffixe: 'actifs', type: 'gold' } : null },
      ]
    },
    {
      section: 'SUIVI',
      items: [
        { id: 'visites', label: 'Visites', icon: '◷', picto: 'calendrier', badge: counts.visites > 0 ? { count: counts.visites, type: 'blue' } : null },
        { id: 'relances', label: 'Relances', icon: '◉', picto: 'cloche', badge: counts.relances > 0 ? { count: counts.relances, type: 'red', pulse: true } : null },
        { id: 'mail', label: 'Nouveau mail', icon: '◻', picto: 'mail', badge: null },
      ]
    },
    {
      section: 'ANALYSE',
      items: [
        { id: 'activite', label: 'Mon activité', icon: '◈', picto: 'activite', badge: null },
        { id: 'parametres', label: 'Paramètres', icon: '◌', picto: 'reglages', badge: null },
      ]
    }
  ];

  /* La barre du bas : les quatre écrans du quotidien, et le geste le plus
     fréquent au milieu. Le reste (mail, activité, paramètres) est dans le
     tiroir, à un geste. */
  const onglets: { id: string; label: string; picto: string; pastille?: number }[] = [
    { id: 'dashboard', label: 'Accueil', picto: 'accueil' },
    { id: 'clients', label: 'Clients', picto: 'clients' },
    { id: '+', label: 'Nouveau', picto: 'plus' },
    { id: 'visites', label: 'Visites', picto: 'calendrier', pastille: counts.visites },
    { id: 'relances', label: 'Relances', picto: 'cloche', pastille: counts.relances },
  ];

  return (
    <>
      {/* Le voile derrière le tiroir : un toucher à côté le referme. */}
      <div className={`${styles.voile} ${ouvert ? styles.voileOuvert : ''}`} onClick={onFermer} aria-hidden="true" />

      <aside className={`${styles.sidebar} ${ouvert ? styles.ouvert : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoMark}><span>EI</span></div>
          <div>
            <div className={styles.logoName}>Emilio</div>
            <div className={styles.logoSub}>Immobilier</div>
          </div>
          <button type="button" className={styles.fermer} onClick={onFermer} aria-label="Fermer le menu">
            <Icone nom="fermer" taille={18} epaisseur={2} />
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map((group, gi) => (
            <div key={gi} className={styles.navGroup}>
              <div className={styles.navSection}>{group.section}</div>
              {group.items.map(item => (
                <button
                  key={item.id}
                  className={`${styles.navItem} ${courant === item.id ? styles.active : ''}`}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navPicto}><Icone nom={item.picto} taille={19} epaisseur={1.9} /></span>
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

      {/* ═══ La barre d'onglets du téléphone ═══ */}
      <nav className={styles.barreBas} aria-label="Navigation principale">
        {onglets.map(o => {
          if (o.id === '+') {
            return (
              <button key={o.id} type="button" className={styles.ongletPlus}
                onClick={() => { demanderNouveauClient(); onNavigate('clients'); }}
                aria-label="Nouveau client">
                <span className={styles.plusRond}><Icone nom="plus" taille={24} epaisseur={2.4} /></span>
                <span className={styles.ongletMot}>{o.label}</span>
              </button>
            );
          }
          const actif = courant === o.id;
          return (
            <button key={o.id} type="button" className={`${styles.onglet} ${actif ? styles.ongletActif : ''}`}
              onClick={() => onNavigate(o.id)} aria-current={actif ? 'page' : undefined}>
              <span className={styles.ongletPicto}>
                <Icone nom={o.picto} taille={23} epaisseur={actif ? 2.1 : 1.8} />
                {!!o.pastille && o.pastille > 0 && (
                  <span className={`${styles.ongletPastille} ${o.id === 'relances' ? styles.ongletPastilleRouge : ''}`}>
                    {o.pastille > 9 ? '9+' : o.pastille}
                  </span>
                )}
              </span>
              <span className={styles.ongletMot}>{o.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
