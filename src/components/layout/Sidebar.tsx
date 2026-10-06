'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Sidebar.module.css';
import { EVT_MAJ, EVT_VUE, demanderNouveauBien, demanderNouveauClient, demanderNouveauRdv, demanderVue, vueDemandee } from '@/lib/intentions';
import { Ic } from '@/components/documents/ApercuActe';
import { typeDe } from '@/lib/contacts';
import { etapeDe } from '@/lib/biens-vente';
import { Icone } from '@/components/fiche/ParcoursBien';
import { chargerDemandesVisite } from '@/lib/demandes-visite';
import { compterRelancesDues } from '@/lib/relances';
import { jourParis } from '@/lib/mandat';
import { maintenantParis, visitePasseeParis } from '@/lib/visites';
import { TABLE_DEMANDES } from '@/lib/demandes-site';
import PictoBoite from '@/components/demandes/PictoBoite';

/* Où se retient l'état plié ou déplié d'un sous-menu : une mémoire pour
   l'ordinateur (« menu.documents » depuis la V3.18), une pour le téléphone. */
const cleMenu = (k: string, telephone: boolean) => (telephone ? `menu.tel.${k}` : `menu.${k}`);

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
 *
 * Contacts, Biens et Documents ont un sous-menu (V3.24) : la rubrique ouvre
 * sa page sur « Tous », chaque entrée ouvre directement sa catégorie (« Mes
 * vendeurs », « Mes estimations »), et l'entrée de ce qui est affiché
 * s'illumine.
 */
export default function Sidebar({ activePage, onNavigate, ouvert = false, onFermer, reduit = false }: {
  activePage: string;
  onNavigate: (page: string, data?: unknown) => void;
  ouvert?: boolean;
  onFermer?: () => void;
  /* Ordinateur seulement : la barre réduite à ses icônes (l'agenda). */
  reduit?: boolean;
}) {
  /* Le petit menu du « + » de la barre du bas (téléphone). */
  const [plusOuvert, setPlusOuvert] = useState(false);
  const [counts, setCounts] = useState({ relances: 0, visites: 0, demandes: 0, aSigner: 0, enVente: 0, site: 0 });
  /* Les sous-menus (Documents en V3.18 ; Contacts et Biens en V3.24).
     Sur ordinateur, ouverts par défaut ; sur téléphone, tous pliés (le tiroir
     resterait trop long) : c'est la petite flèche qui les ouvre. Dans les
     deux cas, ce qu'on plie ou déplie le reste, d'une visite à l'autre, dans
     ce navigateur — le téléphone et l'ordinateur ont chacun leur mémoire. */
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({ clients: true, biens: true, documents: true });
  const telephone = useRef(false);
  useEffect(() => {
    telephone.current = window.matchMedia('(max-width: 900px)').matches;
    try {
      setOuverts(o => Object.fromEntries(Object.keys(o).map(k => {
        const v = localStorage.getItem(cleMenu(k, telephone.current));
        return [k, v === null ? !telephone.current : v === '1'];
      })));
    } catch { if (telephone.current) setOuverts({ clients: false, biens: false, documents: false }); }
  }, []);
  const basculer = (k: string) => setOuverts(o => {
    const v = !o[k];
    try { localStorage.setItem(cleMenu(k, telephone.current), v ? '1' : '0'); } catch { /* sans mémoire, tant pis */ }
    return { ...o, [k]: v };
  });
  /* La catégorie affichée par Contacts et par Biens : la page l'annonce, le
     menu allume l'entrée qui lui correspond. */
  const [vues, setVues] = useState<Record<string, string>>({});
  useEffect(() => {
    setVues({ clients: vueDemandee('clients') || 'tous', biens: vueDemandee('biens') || 'mandat' });
    const ecoute = (e: Event) => {
      const d = (e as CustomEvent<{ page: string; vue: string }>).detail;
      if (d) setVues(v => ({ ...v, [d.page]: d.vue }));
    };
    window.addEventListener(EVT_VUE, ecoute);
    return () => window.removeEventListener(EVT_VUE, ecoute);
  }, []);

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
    /* V3.50 : les visites à venir, même règle que le tableau de bord et la
       page Visites : « à venir », datées d'aujourd'hui (heure de Paris) ou
       plus tard, sans celles de ce matin déjà passées (elles attendent leur
       compte rendu). Avant, la date du jour était comparée à l'heure UTC
       exacte : toutes les visites du jour sortaient du compte. */
    const today = jourParis();
    const mParis = maintenantParis();
    /* La pastille ne dit que ce qui est dû : en retard ou pour aujourd'hui.
       Une relance prévue dans douze jours n'est pas une alerte — elle reste
       dans la page Relances, mais elle ne doit pas peser sur le menu.
       Fin de journée, pour que celles du jour comptent quelle que soit l'heure.
       V3.73 : sans celles du tri d'après l'import (compterRelancesDues). */
    /* Le compte des clients actifs est parti (V3.20) : plus aucune pastille ne
       l'affichait depuis la V3.14, il coûtait une requête toutes les 20 s. */
    const [rel, { data: vis }, demandes, { count: sig }, { count: bv }, { count: site }] = await Promise.all([
      compterRelancesDues().catch(() => 0),
      supabase.from('visites').select('date_visite, heure').eq('statut', 'a_venir').gte('date_visite', today).limit(1000),
      /* Les clients qui ont demandé à visiter depuis leur espace, sans date
         encore calée : la même liste que la page Visites. */
      chargerDemandesVisite().catch(() => []),
      /* Les documents juridiques finalisés, pas encore signés. Tant que la
         table n'existe pas (outils/sql/documents.sql), la lecture échoue et
         la pastille reste simplement absente. */
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('statut', 'pret'),
      /* Les biens en vente qui se travaillent : en vente, sous offre, sous
         compromis. Sans la table (outils/sql/biens-vente.sql), pas de pastille. */
      supabase.from('biens_vente').select('*', { count: 'exact', head: true }).in('etape', ['mandat', 'offre', 'compromis']).eq('archive', false),
      /* Les demandes du site pas encore prises en main (V3.34). Sans la table
         (outils/sql/demandes-site.sql), pas de pastille. */
      supabase.from(TABLE_DEMANDES).select('*', { count: 'exact', head: true }).eq('statut', 'nouveau').eq('archive', false),
    ]);
    const visAVenir = ((vis || []) as { date_visite: string | null; heure: string | null }[]).filter(v => !visitePasseeParis(v, mParis)).length;
    setCounts({ relances: rel || 0, visites: visAVenir, demandes: demandes.length, aSigner: sig || 0, enVente: bv || 0, site: site || 0 });
  }

  /* Une fiche client appartient à la rubrique Clients : la rubrique reste
     allumée quand on y entre, on sait toujours où l'on est. */
  const courant = activePage === 'fiche' ? 'clients' : activePage;

  /* Un seul type pour toutes les pastilles : sans lui, TypeScript déduit un
     type différent par entrée et refuse les champs absents des autres. */
  type Badge = { count: number; type: string; suffixe?: string; pulse?: boolean; titre?: string };
  const navItems: { section: string; items: { id: string; label: string; picto: string; badge: Badge | null }[] }[] = [
    {
      section: 'PRINCIPAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', picto: 'accueil', badge: null },
        /* « Contacts » : acheteurs, vendeurs, notaires, confrères… (V3.14). La
           pastille « actifs » ne voulait plus rien dire ici : partie. */
        { id: 'clients', label: 'Contacts', picto: 'clients', badge: null },
        { id: 'biens', label: 'Biens', picto: 'maison', badge: counts.enVente > 0 ? { count: counts.enVente, type: 'gold', titre: `${counts.enVente} bien${counts.enVente > 1 ? 's' : ''} en vente, sous offre ou sous compromis` } : null },
      ]
    },
    {
      section: 'SUIVI',
      items: [
        /* Ce que les formulaires du site ont déposé (V3.34) : une demande
           nouvelle attend une réponse, pastille rouge comme une relance. */
        { id: 'demandes', label: 'Demandes du site', picto: 'boite', badge: counts.site > 0
          ? { count: counts.site, type: 'red', pulse: true, titre: `${counts.site} nouvelle${counts.site > 1 ? 's' : ''} demande${counts.site > 1 ? 's' : ''} du site` } : null },
        { id: 'agenda', label: 'Agenda', picto: 'calendrier', badge: null },
        /* Une demande de visite à caler passe avant tout : pastille rouge,
           comme une relance. Sinon, le nombre de visites à venir, en bleu. */
        { id: 'visites', label: 'Visites', picto: 'cle', badge: counts.demandes > 0
          ? { count: counts.demandes, type: 'red', pulse: true, titre: `${counts.demandes} demande${counts.demandes > 1 ? 's' : ''} de visite à caler` }
          : counts.visites > 0 ? { count: counts.visites, type: 'blue' } : null },
        { id: 'relances', label: 'Relances', picto: 'cloche', badge: counts.relances > 0 ? { count: counts.relances, type: 'red', pulse: true } : null },
      ]
    },
    /* Les outils (V3.36, à la demande d'Alexandre) : ce qu'on ouvre pour faire
       quelque chose, à part de ce qui se suit au jour le jour. */
    {
      section: 'OUTILS',
      items: [
        /* Les contacts et les biens, là où ils sont (V3.26). */
        { id: 'carte', label: 'Carte', picto: 'carteplan', badge: null },
        { id: 'documents', label: 'Documents', picto: 'note', badge: counts.aSigner > 0
          ? { count: counts.aSigner, type: 'blue', titre: `${counts.aSigner} document${counts.aSigner > 1 ? 's' : ''} à faire signer` } : null },
        { id: 'mail', label: 'Nouveau mail', picto: 'mail', badge: null },
      ]
    },
    {
      section: 'ANALYSE',
      items: [
        { id: 'activite', label: 'Mon activité', picto: 'activite', badge: null },
        { id: 'parametres', label: 'Paramètres', picto: 'reglages', badge: null },
      ]
    }
  ];

  /* Ouvrir une catégorie. Déjà sur la page : elle change sur place, en
     douceur (la liste n'est pas rechargée) ; sinon, on y va. */
  const allerVue = (page: string, vue: string) => {
    if (activePage === page) { demanderVue(page, vue); onFermer?.(); }
    else onNavigate(page, { vue });
  };

  /* Les sous-menus. Contacts : trois types de contact, dans leur couleur ;
     « Contacts » lui-même ouvre « Tous ». Biens : trois étapes ; « Biens »
     ouvre les mandats en cours. Documents : deux endroits de la page, et le registre. */
  type Sous = { cle: string; label: string; ic: string; c: string; fond: string; go: () => void; actif: boolean };
  const sousMenus: Record<string, Sous[]> = {
    clients: (['acheteur', 'vendeur', 'proprietaire'] as const).map(k => {
      const t = typeDe(k);
      return { cle: k, label: `Mes ${t.pluriel.toLowerCase()}`, ic: t.ic, c: t.c, fond: t.fond,
        go: () => allerVue('clients', k), actif: activePage === 'clients' && vues.clients === k };
    }),
    biens: ([['mandat', 'Mes mandats en cours', 'panneau'], ['estimation', 'Mes estimations', 'euro'], ['a_suivre', 'Mes biens à suivre', 'oeil']] as const).map(([k, label, ic]) => {
      const e = etapeDe(k);
      return { cle: k, label, ic, c: e.c, fond: `${e.c}17`,
        go: () => allerVue('biens', k), actif: activePage === 'biens' && vues.biens === k };
    }),
    documents: [
      { cle: 'creer', label: 'Créer un document', ic: 'plus', c: '#34496e', fond: '#eef2f8', go: () => onNavigate('documents', { ancre: 'creer' }), actif: false },
      { cle: 'liste', label: 'Liste des documents', ic: 'lignes', c: '#34496e', fond: '#eef2f8', go: () => onNavigate('documents', { ancre: 'liste' }), actif: false },
      { cle: 'registre', label: 'Registre des mandats', ic: 'cadenas', c: '#34496e', fond: '#eef2f8', go: () => onNavigate('registre'), actif: activePage === 'registre' },
    ],
  };
  /* Ce que la rubrique elle-même ouvre : « Tous » des contacts, les mandats
     en cours des biens (V3.80). */
  const allerRubrique = (id: string) => (id === 'clients' || id === 'biens' ? allerVue(id, id === 'clients' ? 'tous' : 'mandat') : onNavigate(id));

  /* La barre du bas : les quatre écrans du quotidien, et le geste le plus
     fréquent au milieu. Le reste (mail, activité, paramètres) est dans le
     tiroir, à un geste. */
  const onglets: { id: string; label: string; picto: string; pastille?: number }[] = [
    { id: 'dashboard', label: 'Accueil', picto: 'accueil' },
    { id: 'clients', label: 'Contacts', picto: 'clients' },
    { id: '+', label: 'Nouveau', picto: 'plus' },
    { id: 'visites', label: 'Visites', picto: 'cle', pastille: counts.demandes || counts.visites },
    { id: 'relances', label: 'Relances', picto: 'cloche', pastille: counts.relances },
  ];

  return (
    <>
      {/* Le voile derrière le tiroir : un toucher à côté le referme. */}
      <div className={`${styles.voile} ${ouvert ? styles.voileOuvert : ''}`} onClick={onFermer} aria-hidden="true" />

      <aside className={`${styles.sidebar} ${ouvert ? styles.ouvert : ''} ${reduit ? styles.reduit : ''}`}>
        {/* Le logo de l'agence, en grand (V3.29) ; le « E » seul quand la
            barre est réduite à ses icônes. Les images sont dans public/logos/. */}
        <div className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logoGrand} src="/logos/logo-emilio-800.png" alt="Emilio conseil immobilier" width={800} height={336} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logoMark} src="/logos/e-192.png" alt="Emilio" width={40} height={40} />
          <button type="button" className={styles.fermer} onClick={onFermer} aria-label="Fermer le menu">
            <Icone nom="fermer" taille={18} epaisseur={2} />
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map((group, gi) => (
            <div key={gi} className={styles.navGroup}>
              <div className={styles.navSection}>{group.section}</div>
              {group.items.map(item => {
                const sous = sousMenus[item.id];
                /* Une entrée du sous-menu allumée : la rubrique s'efface
                   derrière elle (elle reste marquée, en plus léger). */
                const sousActif = !!sous?.some(x => x.actif);
                const bouton = (
                  <button
                    key={item.id}
                    className={`${styles.navItem} ${courant === item.id && !sousActif ? styles.active : ''} ${sous ? styles.navItemBascule : ''} ${sousActif ? styles.navParent : ''}`}
                    onClick={() => allerRubrique(item.id)}
                    title={reduit ? item.label : undefined}
                    aria-label={reduit ? item.label : undefined}
                  >
                    <span className={styles.navPicto}>{item.picto === 'boite' ? <PictoBoite taille={19} epaisseur={1.9} /> : <Icone nom={item.picto} taille={19} epaisseur={1.9} />}</span>
                    <span className={styles.navLabel}>{item.label}</span>
                    {item.badge && (
                      <span className={`${styles.navBadge} ${styles[`badge_${item.badge.type}`]} ${item.badge.pulse ? 'pulse' : ''}`}
                        title={item.badge.titre || (item.badge.suffixe ? `${item.badge.count} dossiers ${item.badge.suffixe}` : undefined)}>
                        {item.badge.count}
                        {item.badge.suffixe && <span className={styles.navBadgeMot}>{item.badge.suffixe}</span>}
                      </span>
                    )}
                  </button>
                );
                if (!sous) return bouton;
                /* La rubrique, sa flèche qui plie le sous-menu, et le
                   sous-menu. Menu réduit : la rubrique seule. */
                const deplie = ouverts[item.id] !== false;
                return (
                  <div key={item.id} className={styles.navAvecSous}>
                    <div className={styles.navLigne}>
                      {bouton}
                      <button type="button" className={`${styles.navBascule} ${deplie ? styles.navBasculeOuvert : ''}`}
                        onClick={() => basculer(item.id)} aria-expanded={deplie} aria-controls={`sous-menu-${item.id}`}
                        aria-label={`${deplie ? 'Replier' : 'Déplier'} le sous-menu ${item.label}`}
                        title={deplie ? 'Replier' : 'Déplier'}>
                        <Icone nom="chevron" taille={15} epaisseur={2.2} />
                      </button>
                    </div>
                    <div id={`sous-menu-${item.id}`} className={`${styles.sousMenu} ${deplie ? styles.sousMenuOuvert : ''}`} inert={!deplie}>
                      <div className={styles.sousMenuIn}>
                        <div className={styles.sousListe}>
                          {sous.map(x => (
                            <button key={x.cle} type="button" className={`${styles.sousItem} ${x.actif ? styles.sousActif : ''}`}
                              onClick={x.go} aria-current={x.actif ? 'page' : undefined}
                              style={{ '--sc': x.c, '--sf': x.fond, '--sa': `${x.c}38`, '--sb': `${x.c}70` } as React.CSSProperties}>
                              <span className={styles.sousIc}><Ic n={x.ic} t={15} e={2} /></span>
                              <span className={styles.sousMot}>{x.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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
            /* Le « + » ouvre un petit menu : nouveau client, nouveau
               rendez-vous, nouveau mail. Sur téléphone, c'est le seul endroit
               toujours à portée de pouce, quel que soit l'écran. */
            return (
              <button key={o.id} type="button" className={`${styles.ongletPlus} ${plusOuvert ? styles.ongletPlusOuvert : ''}`}
                onClick={() => setPlusOuvert(v => !v)} aria-expanded={plusOuvert} aria-haspopup="menu"
                aria-label="Créer : client, rendez-vous ou mail">
                <span className={styles.plusRond}><Icone nom="plus" taille={24} epaisseur={2.4} /></span>
                <span className={styles.ongletMot}>{o.label}</span>
              </button>
            );
          }
          const actif = courant === o.id;
          return (
            <button key={o.id} type="button" className={`${styles.onglet} ${actif ? styles.ongletActif : ''}`}
              onClick={() => allerRubrique(o.id)} aria-current={actif ? 'page' : undefined}>
              <span className={styles.ongletPicto}>
                <Icone nom={o.picto} taille={23} epaisseur={actif ? 2.1 : 1.8} />
                {!!o.pastille && o.pastille > 0 && (
                  <span className={`${styles.ongletPastille} ${o.id === 'relances' || (o.id === 'visites' && counts.demandes > 0) ? styles.ongletPastilleRouge : ''}`}>
                    {o.pastille > 9 ? '9+' : o.pastille}
                  </span>
                )}
              </span>
              <span className={styles.ongletMot}>{o.label}</span>
            </button>
          );
        })}
      </nav>

      {plusOuvert && (
        <>
          <div className={styles.plusVoile} onClick={() => setPlusOuvert(false)} aria-hidden="true" />
          <div className={styles.plusMenu} role="menu" aria-label="Créer">
            {([
              { cle: 'client', ico: 'clients', t: 'Nouveau contact', s: 'Acheteur, vendeur, notaire…', go: () => { demanderNouveauClient(); onNavigate('clients'); } },
              { cle: 'bien', ico: 'maison', t: 'Nouveau bien', s: 'À suivre, estimation, mandat…', go: () => { demanderNouveauBien(); onNavigate('biens'); } },
              { cle: 'rdv', ico: 'calendrier', t: 'Nouveau rendez-vous', s: 'Visite, appel, signature…', go: () => demanderNouveauRdv() },
              { cle: 'mail', ico: 'mail', t: 'Nouveau mail', s: 'Écrire à un ou plusieurs clients', go: () => onNavigate('mail') },
            ]).map(x => (
              <button key={x.cle} type="button" role="menuitem" className={styles.plusChoix}
                onClick={() => { setPlusOuvert(false); x.go(); }}>
                <span className={styles.plusIco}><Icone nom={x.ico} taille={20} epaisseur={1.9} /></span>
                <span className={styles.plusTexte}><b>{x.t}</b><i>{x.s}</i></span>
                <span className={styles.plusFleche}><Icone nom="chevron" taille={16} epaisseur={2} /></span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
