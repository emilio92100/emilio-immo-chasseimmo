'use client';
import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import Dashboard from '@/components/dashboard/Dashboard';
import styles from './AppLayout.module.css';

// Pages placeholder
const PlaceholderPage = ({ title, sub }: { title: string; sub: string }) => (
  <div style={{ padding: '28px 24px' }}>
    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 22, fontWeight: 800, color: '#1a2332', marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 13, color: '#8896a8' }}>{sub}</div>
    <div style={{ marginTop: 24, background: 'white', borderRadius: 16, border: '1px solid #e3e8f0', padding: 40, textAlign: 'center', color: '#8896a8', fontSize: 13 }}>
      🚧 Page en cours de construction
    </div>
  </div>
);

const pages: Record<string, React.ReactNode> = {
  clients:    <PlaceholderPage title="Mes Clients" sub="Gestion de vos acheteurs" />,
  recherche:  <PlaceholderPage title="Recherche en cours" sub="8 clients avec mandat actif" />,
  visites:    <PlaceholderPage title="Visites" sub="Planning et comptes-rendus" />,
  relances:   <PlaceholderPage title="Relances" sub="5 relances en attente" />,
  mail:       <PlaceholderPage title="Nouveau mail" sub="Envoi depuis arogelet@emilio-immo.com" />,
  activite:   <PlaceholderPage title="Mon activité" sub="Statistiques 2026" />,
  parametres: <PlaceholderPage title="Paramètres" sub="Configuration de votre outil" />,
};

export default function AppLayout() {
  const [activePage, setActivePage] = useState('dashboard');

  const handleNavigate = (page: string) => setActivePage(page);

  return (
    <div className={styles.appLayout}>
      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      <div className={styles.mainArea}>
        <Topbar onNavigate={handleNavigate} />
        <main className={styles.content}>
          {activePage === 'dashboard'
            ? <Dashboard onNavigate={handleNavigate} />
            : pages[activePage] || <Dashboard onNavigate={handleNavigate} />
          }
        </main>
      </div>
    </div>
  );
}
