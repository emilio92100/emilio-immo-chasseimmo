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
      .eq('statut', 'actif')
      .order('updated_at', { ascending: false })
      .then(({ data }) => { setClients(data || []); setLoading(false); });
  }, []);

  const statutColor: Record<string, {bg:string,color:string}> = {
    prospect: { bg: '#f5f3ff', color: '#8b5cf6' },
    actif: { bg: '#ecfdf5', color: '#10b981' },
    suspendu: { bg: '#fffbeb', color: '#f59e0b' },
    offre_ecrite: { bg: '#fffbeb', color: '#f59e0b' },
    bien_trouve: { bg: '#eff6ff', color: '#3b82f6' },
    perdu: { bg: '#fef2f2', color: '#ef4444' },
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Recherche en cours</h1>
          <p className={styles.sub}>{clients.length} client{clients.length !== 1 ? 's' : ''} actif{clients.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : clients.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔍</div>
          <div className={styles.emptyTitle}>Aucune recherche en cours</div>
          <div className={styles.emptySub}>Les clients avec le statut <strong>Actif</strong> apparaissent ici</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clients.map(c => {
            const jours = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
            const sc = statutColor[c.statut] || statutColor.actif;
            const equipements = [c.parking && '🅿️', c.balcon && '🌿', c.terrasse && '☀️', c.jardin && '🌳', c.cave && '📦', c.ascenseur && '🛗'].filter(Boolean) as string[];
            return (
              <div key={c.id} onClick={() => onNavigate('fiche', c)} style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: '16px 20px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center', transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                onMouseOver={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                onMouseOut={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)')}>

                {/* Avatar */}
                <div style={{ width: 46, height: 46, borderRadius: 14, background: '#1a2332', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, color: '#c9a84c', fontSize: 14 }}>{c.prenom[0]}{c.nom[0]}</span>
                </div>

                {/* Infos principales */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{c.prenom} {c.nom}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>{c.statut.replace('_', ' ')}</span>
                    {c.mandat_date_expiration && (() => { const j = Math.floor((new Date(c.mandat_date_expiration).getTime() - Date.now()) / 86400000); return j < 15 ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#ef4444' }}>⚠️ Mandat {j}j</span> : null; })()}
                  </div>

                  {/* Critères en ligne */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                    {c.type_bien && <span style={{ fontSize: 12, fontWeight: 600, color: '#1a2332' }}>🏠 {c.type_bien}</span>}
                    {c.budget_min && <span style={{ fontSize: 12, fontWeight: 700, color: '#c9a84c' }}>💰 {(c.budget_min/1000).toFixed(0)}–{((c.budget_max||0)/1000).toFixed(0)}k€</span>}
                    {c.surface_min && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>📐 {c.surface_min}{c.surface_max ? `–${c.surface_max}` : '+'}m²</span>}
                    {c.nb_pieces_min && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>🚪 {c.nb_pieces_min}{c.nb_pieces_max ? `–${c.nb_pieces_max}` : '+'}P</span>}
                    {c.dpe_max && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>🌿 DPE ≤ {c.dpe_max}</span>}
                    {equipements.length > 0 && <span style={{ fontSize: 12, color: '#64748b' }}>{equipements.join(' ')}</span>}
                  </div>

                  {/* Secteurs */}
                  {c.secteurs?.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {c.secteurs.slice(0, 4).map((s: string) => (
                        <span key={s} style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '1px 8px', borderRadius: 20, fontWeight: 600 }}>{s}</span>
                      ))}
                      {c.secteurs.length > 4 && <span style={{ fontSize: 11, color: '#94a3b8' }}>+{c.secteurs.length - 4} autres</span>}
                    </div>
                  )}
                </div>

                {/* Stats droite */}
                <div style={{ display: 'flex', gap: 16, flexShrink: 0, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: '#1a2332' }}>{jours}j</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Suivi</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.reference}</div>
                  <span style={{ color: '#cbd5e1', fontSize: 20 }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
