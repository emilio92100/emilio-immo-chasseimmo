'use client';
import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import Dashboard from '@/components/dashboard/Dashboard';
import Clients from '@/components/clients/Clients';
import PageRelances from '@/components/pages/PageRelances';
import PageVisites from '@/components/pages/PageVisites';
import PageMail from '@/components/pages/PageMail';
import PageActivite from '@/components/pages/PageActivite';
import PageParametres from '@/components/pages/PageParametres';
import PageRecherche from '@/components/pages/PageRecherche';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  const [activePage, setActivePage] = useState('dashboard');
  const [pageData, setPageData] = useState<unknown>(null);

  const handleNavigate = (page: string, data?: unknown) => {
    setActivePage(page);
    setPageData(data || null);
  };

  const renderPage = () => {
    switch(activePage) {
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
        <main className={styles.content}>{renderPage()}</main>
      </div>
    </div>
  );
}
