'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';

export default function PageRecherche({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('clients')
      .select('*')
      .in('statut', ['actif', 'prospect'])
      .order('updated_at', { ascending: false })
      .then(({ data }) => { setClients(data || []); setLoading(false); });
  }, []);

  const chaleurLabel: Record<string, string> = {
    tres_chaud: '🔥 Très chaud', interesse: '👍 Intéressé',
    tiede: '😐 Tiède', froid: '❄️ Froid',
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Recherche en cours</h1>
          <p className={styles.sub}>{clients.length} client{clients.length > 1 ? 's' : ''} avec mandat actif</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : clients.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔍</div>
          <div className={styles.emptyTitle}>Aucune recherche en cours</div>
          <div className={styles.emptySub}>Les clients actifs et prospects apparaissent ici</div>
        </div>
      ) : (
        <div className={styles.card}>
          {clients.map(c => {
            const joursSuivi = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
            return (
              <div key={c.id} className={styles.listRow} onClick={() => onNavigate('clients')}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: '#1a2332', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, color: '#c9a84c', fontSize: 13 }}>
                    {c.prenom[0]}{c.nom[0]}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div className={styles.name}>{c.prenom} {c.nom}</div>
                  <div className={styles.detail}>
                    {c.type_bien && `${c.type_bien} · `}
                    {c.budget_min && c.budget_max && `${(c.budget_min/1000).toFixed(0)}–${(c.budget_max/1000).toFixed(0)}k€ · `}
                    {c.secteurs?.length > 0 && c.secteurs.join(', ')}
                  </div>
                </div>
                <span className={`${styles.badge} ${styles.bSlate}`}>{chaleurLabel[c.chaleur] || '—'}</span>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2332' }}>{joursSuivi}j de suivi</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.reference}</div>
                </div>
                <span style={{ color: '#cbd5e1', fontSize: 20 }}>›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
