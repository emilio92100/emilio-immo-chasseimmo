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
import PageMail from '@/components/pages/PageMail';
import PageActivite from '@/components/pages/PageActivite';
import PageParametres from '@/components/pages/PageParametres';
import PageRecherche from '@/components/pages/PageRecherche';
import styles from './AppLayout.module.css';
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
const PAGES = ['dashboard', 'clients', 'fiche', 'recherche', 'visites',
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
  const [ficheClient, setFicheClient] = useState<Client | null>(null);
  const [chargeFiche, setChargeFiche] = useState(false);
  const contenu = useRef<HTMLElement>(null);

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
  }, [activePage, ficheClient?.id]);

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
      case 'recherche':  return <PageRecherche onNavigate={handleNavigate} />;
      case 'visites':    return <PageVisites onNavigate={handleNavigate} />;
      case 'relances':   return <PageRelances onNavigate={handleNavigate} />;
      case 'mail':       return <PageMail onNavigate={handleNavigate} />;
      case 'activite':   return <PageActivite />;
      case 'parametres': return <PageParametres />;
      default:           return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className={styles.appLayout}>
      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      <div className={styles.mainArea}>
        <Topbar onNavigate={handleNavigate} />
        <main className={styles.content} ref={contenu}>{renderPage()}</main>
      </div>
    </div>
  );
}
