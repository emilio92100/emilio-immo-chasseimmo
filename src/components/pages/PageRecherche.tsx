'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';

export default function PageRecherche({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('clients').select('*').eq('statut', 'actif')
      .order('updated_at', { ascending: false })
      .then(({ data }) => { setClients(data || []); setLoading(false); });
  }, []);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {clients.map(c => {
            const jours = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
            const equipements = [c.parking&&'🅿️',c.balcon&&'🌿',c.terrasse&&'☀️',c.jardin&&'🌳',c.cave&&'📦',c.ascenseur&&'🛗'].filter(Boolean);
            const joursMandat = c.mandat_date_expiration ? Math.floor((new Date(c.mandat_date_expiration).getTime()-Date.now())/86400000) : null;

            // Grouper secteurs par ville
            const secteursByVille: Record<string, string[]> = {};
            (c.secteurs || []).forEach((s: string) => {
              const match = s.match(/^(.+?)\s*\((.+?)\)$/);
              if (match) {
                const quartier = match[1].trim();
                const ville = match[2].trim();
                if (!secteursByVille[ville]) secteursByVille[ville] = [];
                secteursByVille[ville].push(quartier);
              } else {
                if (!secteursByVille[s]) secteursByVille[s] = [];
              }
            });

            return (
              <div key={c.id} onClick={() => onNavigate('fiche', c)}
                style={{ background: 'white', borderRadius: 16, border: '1px solid #e3e8f0', padding: '18px 20px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.15s' }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)'; }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#e3e8f0'; }}>

                {/* Ligne 1 : identité + statut + KPIs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: '#1a2332', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, color: '#c9a84c', fontSize: 14 }}>{c.prenom[0]}{c.nom[0]}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 16, color: '#1a2332' }}>{c.prenom} {c.nom}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#ecfdf5', color: '#10b981', border: '1px solid #bbf7d0' }}>● Actif</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>{c.reference}</span>
                      {joursMandat !== null && joursMandat < 15 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>⚠️ Mandat {joursMandat}j</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: '#1a2332' }}>{jours}j</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Suivi</div>
                    </div>
                  </div>
                  <span style={{ color: '#cbd5e1', fontSize: 20 }}>›</span>
                </div>

                {/* Ligne 2 : critères chips */}
                {(c.type_bien || c.budget_min || c.surface_min || equipements.length > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                    {c.type_bien && <span style={{ fontSize: 12, fontWeight: 600, color: '#1a2332', background: '#f1f5f9', padding: '3px 10px', borderRadius: 20, border: '1px solid #e3e8f0' }}>🏠 {c.type_bien}</span>}
                    {c.budget_min && <span style={{ fontSize: 12, fontWeight: 700, color: '#854d0e', background: '#fef9c3', padding: '3px 10px', borderRadius: 20, border: '1px solid #fde68a' }}>💰 {(c.budget_min/1000).toFixed(0)}–{((c.budget_max||0)/1000).toFixed(0)}k€</span>}
                    {c.surface_min && <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', background: '#f8fafc', padding: '3px 10px', borderRadius: 20, border: '1px solid #e3e8f0' }}>📐 {c.surface_min}{c.surface_max?`–${c.surface_max}`:'+'} m²</span>}
                    {c.nb_pieces_min && <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', background: '#f8fafc', padding: '3px 10px', borderRadius: 20, border: '1px solid #e3e8f0' }}>🚪 {c.nb_pieces_min}{c.nb_pieces_max?`–${c.nb_pieces_max}`:'+'} pièces</span>}
                    {c.dpe_max && <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '3px 10px', borderRadius: 20, border: '1px solid #bbf7d0' }}>🌿 DPE ≤ {c.dpe_max}</span>}
                    {equipements.map((e: any,i: number) => <span key={i} style={{ fontSize: 14 }}>{e}</span>)}
                  </div>
                )}

                {/* Ligne 3 : secteurs groupés par ville */}
                {Object.keys(secteursByVille).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {Object.entries(secteursByVille).map(([ville, quartiers]) => (
                      <div key={ville} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', minWidth: 'max-content', paddingTop: 2 }}>📍 {ville}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {quartiers.length === 0
                            ? <span style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>Toute la ville</span>
                            : quartiers.map(q => <span key={q} style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>{q}</span>)
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
