'use client';
import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import Dashboard from '@/components/dashboard/Dashboard';
import Clients from '@/components/clients/Clients';
import styles from './AppLayout.module.css';

const PlaceholderPage = ({ title, sub }: { title: string; sub: string }) => (
  <div style={{ padding: '28px 24px' }}>
    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 22, fontWeight: 800, color: '#1a2332', marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 13, color: '#8896a8' }}>{sub}</div>
    <div style={{ marginTop: 24, background: 'white', borderRadius: 16, border: '1px solid #e3e8f0', padding: 40, textAlign: 'center', color: '#8896a8', fontSize: 13 }}>
      🚧 Page en cours de construction
    </div>
  </div>
);

export default function AppLayout() {
  const [activePage, setActivePage] = useState('dashboard');
  const [pageData, setPageData] = useState<unknown>(null);

  const handleNavigate = (page: string, data?: unknown) => {
    setActivePage(page);
    setPageData(data || null);
  };

  const renderPage = () => {
    switch(activePage) {
      case 'dashboard':   return <Dashboard onNavigate={handleNavigate} />;
      case 'clients':     return <Clients onNavigate={handleNavigate} />;
      case 'fiche':       return <PlaceholderPage title="Fiche Client" sub="En cours de construction" />;
      case 'recherche':   return <PlaceholderPage title="Recherche en cours" sub="8 clients avec mandat actif" />;
      case 'visites':     return <PlaceholderPage title="Visites" sub="Planning et comptes-rendus" />;
      case 'relances':    return <PlaceholderPage title="Relances" sub="5 relances en attente" />;
      case 'mail':        return <PlaceholderPage title="Nouveau mail" sub="Envoi depuis arogelet@emilio-immo.com" />;
      case 'activite':    return <PlaceholderPage title="Mon activité" sub="Statistiques 2026" />;
      case 'parametres':  return <PlaceholderPage title="Paramètres" sub="Configuration de votre outil" />;
      default:            return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className={styles.appLayout}>
      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      <div className={styles.mainArea}>
        <Topbar onNavigate={handleNavigate} />
        <main className={styles.content}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
