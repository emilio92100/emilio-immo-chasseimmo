'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import Dashboard from '@/components/dashboard/Dashboard';
import Clients from '@/components/clients/Clients';
import FicheClient from '@/components/fiche/FicheClient';
import PageRelances from '@/components/pages/PageRelances';
import PageVisites from '@/components/pages/PageVisites';
import PageAgenda from '@/components/pages/PageAgenda';
import PageMail from '@/components/pages/PageMail';
import PageActivite from '@/components/pages/PageActivite';
import PageParametres from '@/components/pages/PageParametres';
import styles from './AppLayout.module.css';
/* Toute l'adaptation au téléphone des écrans du CRM, au même endroit. */
import '@/styles/crm-mobile.css';
import type { Client } from '@/lib/supabase';

/**
 * L'écran affiché, et le client ouvert, vivent dans l'URL — pas seulement en
 * mémoire. Sans ça : un F5 sur une fiche renvoyait au tableau de bord, les
 * flèches Précédent / Suivant du navigateur ne faisaient rien, et une fiche
 * client n'était pas partageable par lien.
 *
 * L'URL reste volontairement une query string (`/?page=fiche&client=<id>`) :
 * le CRM tient sur une seule route Next, on ne redécoupe pas l'application.
 */
const PAGES = ['dashboard', 'clients', 'fiche', 'agenda', 'visites',
  'relances', 'mail', 'activite', 'parametres'];

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

export default function AppLayout() {
  const [activePage, setActivePage] = useState('dashboard');
  const [sens, setSens] = useState<'avant' | 'arriere'>('avant');
  const [ficheClient, setFicheClient] = useState<Client | null>(null);
  const [chargeFiche, setChargeFiche] = useState(false);
  /* Le tiroir de navigation du téléphone (le bouton ☰ de la barre du haut). */
  const [menuOuvert, setMenuOuvert] = useState(false);
  const fermerMenu = useCallback(() => setMenuOuvert(false), []);
  /* Sur téléphone, la barre du haut (menu + recherche) se replie quand on
     descend dans la page et revient dès qu'on remonte : l'écran gagne sa
     hauteur. Posé directement sur l'élément, sans passer par l'état React :
     replier la barre ne redessine pas la fiche. Sans effet sur ordinateur. */
  const zoneBarre = useRef<HTMLDivElement>(null);
  const barreCachee = useRef(false);
  /* Replier ou déplier change la hauteur de la zone qui défile : en bas de
     page, le navigateur recale alors le défilement de lui-même. Ce recalage
     n'est pas un geste — on l'ignore le temps de l'animation, sinon la barre
     clignoterait en boucle. */
  const calmeJusqua = useRef(0);
  const replierBarre = (oui: boolean) => {
    const z = zoneBarre.current;
    if (!z || barreCachee.current === oui) return;
    barreCachee.current = oui;
    calmeJusqua.current = performance.now() + 420;
    if (oui) z.setAttribute('data-barre', 'cachee'); else z.removeAttribute('data-barre');
  };
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
        if (data) { setFicheClient(data as Client); return; }
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
    /* Entrer dans une fiche pousse l'écran vers le haut, en sortir le fait
       redescendre : le mouvement dit d'où l'on vient. */
    setSens(page === 'fiche' ? 'avant' : 'arriere');
    if (page === 'fiche' && data) {
      const c = data as Client;
      setFicheClient(c);
      setChargeFiche(false);
      setActivePage('fiche');
      ecrireUrl('fiche', c.id);
      return;
    }
    setFicheClient(null);
    setActivePage(page);
    ecrireUrl(page, null);
  }, []);

  /* Le <main> est le seul élément qui défile du CRM (html et body sont en
     overflow:hidden), et React ne le recrée jamais d'un écran à l'autre : il
     gardait donc sa position. On arrivait sur une fiche déjà défilée de la
     hauteur où on avait laissé la liste précédente, entête hors écran. */
  useEffect(() => {
    contenu.current?.scrollTo({ top: 0 });
    replierBarre(false);
  }, [activePage, ficheClient?.id]);

  /* On ne réagit qu'aux vrais gestes (plus de 8 px dans un sens) : un
     tremblement du doigt ne fait pas clignoter la barre. En haut de page,
     ou pendant qu'on tape une recherche, elle reste toujours visible. */
  useEffect(() => {
    const zone = contenu.current;
    if (!zone) return;
    let repere = zone.scrollTop;
    const telephone = window.matchMedia('(max-width: 900px)');
    const surDefilement = () => {
      if (!telephone.matches) return;
      const y = zone.scrollTop;
      if (performance.now() < calmeJusqua.current) { repere = y; return; }
      const ecart = y - repere;
      if (y < 64) { replierBarre(false); repere = y; return; }
      if (Math.abs(ecart) < 8) return;
      const champ = document.activeElement as HTMLElement | null;
      const enRecherche = !!champ?.closest?.('header');
      replierBarre(ecart > 0 && !enRecherche);
      repere = y;
    };
    zone.addEventListener('scroll', surDefilement, { passive: true });
    return () => zone.removeEventListener('scroll', surDefilement);
  }, []);

  const renderPage = () => {
    if (activePage === 'fiche') {
      if (ficheClient) {
        return (
          <FicheClient
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
      case 'agenda':     return <PageAgenda onNavigate={handleNavigate} />;
      case 'visites':    return <PageVisites onNavigate={handleNavigate} />;
      case 'relances':   return <PageRelances onNavigate={handleNavigate} />;
      case 'mail':       return <PageMail onNavigate={handleNavigate} />;
      case 'activite':   return <PageActivite />;
      case 'parametres': return <PageParametres />;
      default:           return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className={`${styles.appLayout} crm-app`}>
      <Sidebar activePage={activePage} onNavigate={handleNavigate} ouvert={menuOuvert} onFermer={fermerMenu} />
      <div className={styles.mainArea} ref={zoneBarre}>
        <Topbar onNavigate={handleNavigate} onMenu={() => setMenuOuvert(true)} />
        <main className={styles.content} ref={contenu}>
          <div key={`${activePage}:${ficheClient?.id || ''}`} className={sens === 'avant' ? 'ecran-avant' : 'ecran-arriere'}>
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}
