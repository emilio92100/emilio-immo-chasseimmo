'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';

export default function PageActivite() {
  const [stats, setStats] = useState({ clients: 0, actifs: 0, visites: 0, envois: 0, finalisés: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const [{ count: cl }, { count: act }, { count: vis }, { count: env }, { count: fin }] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('statut', 'actif'),
        supabase.from('visites').select('*', { count: 'exact', head: true }).eq('statut', 'effectuee'),
        supabase.from('envois').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('statut', 'bien_trouve'),
      ]);
      setStats({ clients: cl || 0, actifs: act || 0, visites: vis || 0, envois: env || 0, finalisés: fin || 0 });
      setLoading(false);
    }
    fetch();
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Mon activité</h1>
          <p className={styles.sub}>Statistiques depuis le lancement</p>
        </div>
      </div>
      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>👥</div>
            <div className={styles.statVal}>{stats.clients}</div>
            <div className={styles.statLabel}>Clients total</div>
          </div>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>🟢</div>
            <div className={styles.statVal}>{stats.actifs}</div>
            <div className={styles.statLabel}>Clients actifs</div>
          </div>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>📅</div>
            <div className={styles.statVal}>{stats.visites}</div>
            <div className={styles.statLabel}>Visites effectuées</div>
          </div>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>📄</div>
            <div className={styles.statVal}>{stats.envois}</div>
            <div className={styles.statLabel}>Envois réalisés</div>
          </div>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div className={styles.statVal}>{stats.finalisés}</div>
            <div className={styles.statLabel}>Dossiers finalisés</div>
          </div>
          <div className={styles.statCard} style={{ background: '#1a2332', borderColor: '#1a2332' }}>
            <div style={{ fontSize: 28 }}>💰</div>
            <div className={styles.statVal} style={{ color: '#c9a84c' }}>0€</div>
            <div className={styles.statLabel} style={{ color: 'rgba(255,255,255,0.45)' }}>CA total HT</div>
          </div>
        </div>
      )}
    </div>
  );
}
