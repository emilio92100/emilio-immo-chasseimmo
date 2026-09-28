'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import Dashboard from '@/components/dashboard/Dashboard';
import Clients from '@/components/clients/Clients';
import FicheSelonType from '@/components/contacts/FicheContact';
import PageRelances from '@/components/pages/PageRelances';
import PageVisites from '@/components/pages/PageVisites';
import PageAgenda, { NouveauRdvPartout } from '@/components/pages/PageAgenda';
import PageMail from '@/components/pages/PageMail';
import PageActivite from '@/components/pages/PageActivite';
import PageParametres from '@/components/pages/PageParametres';
import PageDocuments, { type IntentionDocuments } from '@/components/documents/PageDocuments';
import PageRegistre from '@/components/documents/PageRegistre';
import PageBiens from '@/components/biens/PageBiens';
import RappelCarte from '@/components/layout/RappelCarte';
import NouvelleVersion from '@/components/layout/NouvelleVersion';
import Avertissements from '@/components/layout/Avertissements';
import styles from './AppLayout.module.css';
/* Toute l'adaptation au téléphone des écrans du CRM, au même endroit. */
import '@/styles/crm-mobile.css';
import type { Client } from '@/lib/supabase';
import { reprendreSuspendus } from '@/lib/suspension';
import FichesOuvertes, { type FicheOuverte, EVT_FICHE_OUVERTE, EVT_BIEN_ACTIF, lireFiches, ecrireFiches, ajouterFiche } from '@/components/layout/FichesOuvertes';
import { nomFoyer } from '@/lib/foyer';
import { signalerEchec } from '@/lib/ecritures';
import { signalerMaj } from '@/lib/intentions';

/**
 * L'écran affiché, et le client ouvert, vivent dans l'URL — pas seulement en
 * mémoire. Sans ça : un F5 sur une fiche renvoyait au tableau de bord, les
 * flèches Précédent / Suivant du navigateur ne faisaient rien, et une fiche
 * client n'était pas partageable par lien.
 *
 * L'URL reste volontairement une query string (`/?page=fiche&client=<id>`) :
 * le CRM tient sur une seule route Next, on ne redécoupe pas l'application.
 */
const PAGES = ['dashboard', 'clients', 'fiche', 'biens', 'agenda', 'visites',
  'relances', 'documents', 'registre', 'mail', 'activite', 'parametres'];

function lireUrl(): { page: string; clientId: string | null } {
  if (typeof window === 'undefined') return { page: 'dashboard', clientId: null };
  const p = new URLSearchParams(window.location.search);
  const page = p.get('page') || 'dashboard';
  return { page: PAGES.includes(page) ? page : 'dashboard', clientId: p.get('client') };
}

function ecrireUrl(page: string, clientId?: string | null, remplacer = false) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams();
  if (page !== 'dashboard') p.set('page', page);
  if (page === 'fiche' && clientId) p.set('client', clientId);
  const q = p.toString();
  const url = q ? `${window.location.pathname}?${q}` : window.location.pathname;
  if (url === window.location.pathname + window.location.search) return;
  window.history[remplacer ? 'replaceState' : 'pushState'](null, '', url);
}

/* Une fiche de contact pour la barre du bas (FichesOuvertes). */
function ficheDeContact(c: Client): FicheOuverte {
  const x = c as unknown as Record<string, unknown>;
  return {
    k: 'contact', id: c.id, titre: nomFoyer(c) || 'Contact', sous: c.reference || undefined, statut: c.statut,
    personne: { prenom: c.prenom, nom: c.nom, civilite: (x.civilite as string) || null, couple: !!x.couple, conjoint: x.conjoint, types: x.types },
  };
}

export default function AppLayout() {
  const [activePage, setActivePage] = useState('dashboard');
  const [sens, setSens] = useState<'avant' | 'arriere'>('avant');
  const [ficheClient, setFicheClient] = useState<Client | null>(null);
  const [chargeFiche, setChargeFiche] = useState(false);
  const [intention, setIntention] = useState<IntentionDocuments | null>(null);
  /* Chaque navigation remonte l'écran, même vers celui qui est déjà affiché :
     « Biens en vente » depuis la fiche d'un bien revient à la liste. */
  const [navN, setNavN] = useState(0);
  /* La barre des fiches ouvertes : lue dans le navigateur après le montage
     (le serveur ne la connaît pas), puis gardée à chaque changement. */
  const [fiches, setFiches] = useState<FicheOuverte[]>([]);
  const [bienActif, setBienActif] = useState<string | null>(null);
  const fichesLues = useRef(false);
  /* Le tiroir de navigation du téléphone (le bouton ☰ de la barre du haut). */
  const [menuOuvert, setMenuOuvert] = useState(false);
  const fermerMenu = useCallback(() => setMenuOuvert(false), []);
  /* Sur ordinateur, le menu de gauche peut se réduire à ses icônes. L'agenda
     l'ouvre réduit, pour gagner la largeur de la semaine ; le bouton de la
     barre du haut le remet (ou le réduit) sur n'importe quel écran. */
  const [menuReduit, setMenuReduit] = useState(false);
  /* Sur téléphone, c'est cette zone-ci qui défile, barre du haut comprise :
     la barre part avec la page quand on descend, et seule la barre d'onglets
     du bas reste à l'écran (voir AppLayout.module.css). Sur ordinateur,
     c'est le <main> qui défile, sous une barre fixe. */
  const zoneBarre = useRef<HTMLDivElement>(null);
  const contenu = useRef<HTMLElement>(null);

  /* La classe « crm » sur <html> : les règles du téléphone s'appliquent au
     CRM et à ses fenêtres (posées sur <body>), jamais à l'espace client. */
  useEffect(() => {
    document.documentElement.classList.add('crm');
    return () => document.documentElement.classList.remove('crm');
  }, []);

  /* ── La session Supabase, sans laquelle le CRM est aveugle ──
     Deux serrures protègent ce CRM : le cookie, qui autorise l'affichage des
     pages, et la session Supabase, qui autorise la lecture des données (le
     RLS — voir migration-rls.sql). Le cookie tient trente jours, la session
     beaucoup moins.

     Sans ce garde-fou, une session perdue donnerait des écrans parfaitement
     vides, sans le moindre message : les pages s'affichent (le cookie est
     bon), mais chaque requête revient sans rien. On préfère renvoyer vers la
     page de connexion, qui dit au moins quoi faire.

     `onAuthStateChange` couvre aussi la déconnexion depuis un autre onglet. */
  useEffect(() => {
    let vivant = true;

    const dehors = async () => {
      try { await fetch('/api/login', { method: 'DELETE' }); } catch { /* on sort quand même */ }
      window.location.href = '/login';
    };

    supabase.auth.getSession().then(({ data }) => {
      if (vivant && !data.session) dehors();
    });

    const { data: ecoute } = supabase.auth.onAuthStateChange((evenement, session) => {
      if (!vivant) return;
      if (evenement === 'SIGNED_OUT' || (!session && evenement !== 'INITIAL_SESSION')) dehors();
    });

    return () => { vivant = false; ecoute.subscription.unsubscribe(); };
  }, []);

  /* « Suspendu jusqu'au… » : à l'ouverture du CRM, les dossiers dont la date
     de reprise est arrivée repassent en « Actif » (src/lib/suspension.ts).
     Une fois par ouverture ; un échec s'affiche en rouge comme les autres. */
  useEffect(() => {
    setFiches(lireFiches());
    fichesLues.current = true;
    const ouverte = (e: Event) => setFiches(l => ajouterFiche(l, (e as CustomEvent<FicheOuverte>).detail));
    const actif = (e: Event) => setBienActif((e as CustomEvent<string | null>).detail);
    window.addEventListener(EVT_FICHE_OUVERTE, ouverte);
    window.addEventListener(EVT_BIEN_ACTIF, actif);
    return () => { window.removeEventListener(EVT_FICHE_OUVERTE, ouverte); window.removeEventListener(EVT_BIEN_ACTIF, actif); };
  }, []);
  useEffect(() => { if (fichesLues.current) ecrireFiches(fiches); }, [fiches]);

  useEffect(() => {
    reprendreSuspendus(supabase).then(({ repris, erreurs }) => {
      for (const e of erreurs) signalerEchec('La reprise automatique d’un dossier suspendu', e);
      if (repris.length) signalerMaj();
    });
  }, []);

  /* Le serveur rend la page sans connaître l'URL du navigateur : on la lit
     après le montage, puis on ouvre ce qu'elle désigne. Le même chemin sert
     au retour arrière du navigateur. */
  useEffect(() => {
    let vivant = true;
    const ouvrir = async ({ page, clientId }: { page: string; clientId: string | null }) => {
      if (page === 'fiche' && clientId) {
        setActivePage('fiche');
        setChargeFiche(true);
        const { data } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
        if (!vivant) return;
        setChargeFiche(false);
        if (data) { setFicheClient(data as Client); setFiches(l => ajouterFiche(l, ficheDeContact(data as Client))); return; }
        /* Le client n'existe plus : on ne laisse pas un écran vide derrière. */
        setFicheClient(null);
        setActivePage('clients');
        ecrireUrl('clients', null, true);
        return;
      }
      setFicheClient(null);
      setActivePage(page === 'fiche' ? 'clients' : page);
    };
    ouvrir(lireUrl());
    const retour = () => { ouvrir(lireUrl()); };
    window.addEventListener('popstate', retour);
    return () => { vivant = false; window.removeEventListener('popstate', retour); };
  }, []);

  const handleNavigate = useCallback((page: string, data?: unknown) => {
    setMenuOuvert(false);
    /* Documents peut s'ouvrir avec une tâche (« Préparer un avenant »
       depuis la fiche d'un client). */
    setIntention(page === 'documents' && data && typeof data === 'object' ? (data as IntentionDocuments) : null);
    /* Entrer dans une fiche pousse l'écran vers le haut, en sortir le fait
       redescendre : le mouvement dit d'où l'on vient. */
    setSens(page === 'fiche' ? 'avant' : 'arriere');
    if (page === 'fiche' && data) {
      const c = data as Client;
      setFicheClient(c);
      setFiches(l => ajouterFiche(l, ficheDeContact(c)));
      setChargeFiche(false);
      setActivePage('fiche');
      ecrireUrl('fiche', c.id);
      return;
    }
    setFicheClient(null);
    setActivePage(page);
    setNavN(n => n + 1);
    ecrireUrl(page, null);
    /* Un bien en vente précis (« Voir le bien ») : Biens en vente le lit
       dans l'URL en s'ouvrant. */
    const bienId = page === 'biens' && data && typeof data === 'object' ? (data as { bien?: string }).bien : undefined;
    if (bienId) window.history.replaceState(null, '', `${window.location.pathname}?page=biens&bien=${encodeURIComponent(bienId)}`);
  }, []);

  /* Rouvrir une fiche de la barre du bas. Un contact se relit (la barre ne
     garde que son nom) ; un contact supprimé depuis sort de la barre. */
  const ouvrirFiche = useCallback(async (f: FicheOuverte) => {
    if (f.k === 'bien') { handleNavigate('biens', { bien: f.id }); return; }
    const { data, error } = await supabase.from('clients').select('*').eq('id', f.id).maybeSingle();
    if (error) { signalerEchec('L’ouverture de la fiche', error.message); return; }
    if (!data) { setFiches(l => l.filter(x => !(x.k === 'contact' && x.id === f.id))); return; }
    handleNavigate('fiche', data);
  }, [handleNavigate]);

  /* Le <main> (sur téléphone : la zone qui le contient) est le seul élément
     qui défile du CRM (html et body sont en overflow:hidden), et React ne le
     recrée jamais d'un écran à l'autre : il gardait donc sa position. On
     arrivait sur une fiche déjà défilée de la hauteur où on avait laissé la
     liste précédente, entête hors écran. */
  useEffect(() => {
    contenu.current?.scrollTo({ top: 0 });
    zoneBarre.current?.scrollTo({ top: 0 });
  }, [activePage, ficheClient?.id]);
  useEffect(() => { setMenuReduit(activePage === 'agenda'); }, [activePage]);

  const renderPage = () => {
    if (activePage === 'fiche') {
      if (ficheClient) {
        /* Un acheteur a sa fiche d'acheteur ; un vendeur, un notaire, un
           confrère… la fiche d'un contact (voir src/lib/contacts.ts). */
        return (
          <FicheSelonType
            client={ficheClient}
            onBack={() => handleNavigate('clients')}
            onNavigate={handleNavigate}
          />
        );
      }
      if (chargeFiche) {
        return <div style={{ padding: '40px 24px', color: '#64748b', fontSize: 14 }}>Chargement de la fiche…</div>;
      }
    }
    switch (activePage) {
      case 'dashboard':  return <Dashboard onNavigate={handleNavigate} />;
      case 'clients':    return <Clients onNavigate={handleNavigate} />;
      case 'biens':      return <PageBiens onNavigate={handleNavigate} />;
      case 'agenda':     return <PageAgenda onNavigate={handleNavigate} />;
      case 'visites':    return <PageVisites onNavigate={handleNavigate} />;
      case 'relances':   return <PageRelances onNavigate={handleNavigate} />;
      case 'documents':  return <PageDocuments onNavigate={handleNavigate} intention={intention} onIntention={() => setIntention(null)} />;
      case 'registre':   return <PageRegistre onNavigate={handleNavigate} />;
      case 'mail':       return <PageMail onNavigate={handleNavigate} />;
      case 'activite':   return <PageActivite />;
      case 'parametres': return <PageParametres />;
      default:           return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className={`${styles.appLayout} crm-app`}>
      <Sidebar activePage={activePage} onNavigate={handleNavigate} ouvert={menuOuvert} onFermer={fermerMenu} reduit={menuReduit} />
      <div className={styles.mainArea} ref={zoneBarre}>
        <Topbar onNavigate={handleNavigate} onMenu={() => setMenuOuvert(true)} menuReduit={menuReduit} onBasculerMenu={() => setMenuReduit(r => !r)} />
        <main className={`${styles.content} ${fiches.length ? styles.contentAvecFiches : ''}`} ref={contenu}>
          {/* La carte professionnelle à renouveler (Paramètres › Agence). */}
          <RappelCarte page={activePage} onNavigate={handleNavigate} />
          <div key={`${activePage}:${ficheClient?.id || ''}:${navN}`} className={sens === 'avant' ? 'ecran-avant' : 'ecran-arriere'}>
            {renderPage()}
          </div>
        </main>
        {/* Les fiches ouvertes : on passe d'un contact ou d'un bien à l'autre. */}
        <FichesOuvertes fiches={fiches}
          active={activePage === 'fiche' && ficheClient ? { k: 'contact', id: ficheClient.id } : activePage === 'biens' && bienActif ? { k: 'bien', id: bienActif } : null}
          onOuvrir={ouvrirFiche}
          onFermer={f => setFiches(l => l.filter(x => !(x.k === f.k && x.id === f.id)))}
          onToutFermer={() => setFiches([])} />
      </div>
      {/* « Nouveau rendez-vous », de n'importe quel écran : la fenêtre de
          l'agenda, posée ici une fois pour toutes (voir PageAgenda). */}
      <NouveauRdvPartout />
      {/* « Une nouvelle version est prête — Recharger », après une mise en ligne. */}
      <NouvelleVersion />
      {/* « … : pas enregistré », quand une écriture échoue (V3.17). */}
      <Avertissements />
    </div>
  );
}
