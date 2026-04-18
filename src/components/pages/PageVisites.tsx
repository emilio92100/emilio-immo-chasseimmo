'use client';
import { useState, useEffect } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import styles from './Page.module.css';

const AVIS_LABELS: Record<string, string> = {
  tres_interesse: '🔥 Très intéressé',
  interesse: '👍 Intéressé',
  a_voir: '🤔 À revoir',
  pas_interesse: '👎 Pas intéressé',
  elimine: '❌ Éliminé',
};
const AVIS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  tres_interesse: { bg: '#fef9c3', color: '#854d0e', border: '#fde68a' },
  interesse: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  a_voir: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
  pas_interesse: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
  elimine: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
};

export default function PageVisites({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [visites, setVisites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [crForm, setCrForm] = useState({ visite_id: '', etoiles: 0, commentaire: '', avis_client: '' });
  const [showCR, setShowCR] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('visites')
      .select('*, clients(id, prenom, nom, reference), biens(titre, ville, photos)')
      .order('date_visite', { ascending: true });
    setVisites(data || []);
    setLoading(false);
  }

  function openCR(visiteId: string) {
    setCrForm({ visite_id: visiteId, etoiles: 0, commentaire: '', avis_client: '' });
    setShowCR(true);
  }

  async function saveCR() {
    const { visite_id, etoiles, commentaire, avis_client } = crForm;
    setSaving(true);
    const { error } = await supabase.from('visites').update({
      statut: 'effectuee',
      note_etoiles: etoiles || 0,
      commentaire: commentaire || '',
      avis_client: avis_client || '',
    }).eq('id', visite_id);
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return; }
    const v = visites.find(x => x.id === visite_id);
    const clientId = v?.clients?.id;
    if (clientId) {
      const avisLabel = AVIS_LABELS[avis_client] || '';
      const etoilesStr = etoiles > 0 ? '⭐'.repeat(etoiles) : '';
      await supabase.from('envois').insert({
        client_id: clientId,
        type: 'compte_rendu_visite',
        objet: `Visite — ${v?.biens?.titre || v?.biens?.ville || 'Bien'}`,
        corps: [avis_client ? `Avis : ${avisLabel}` : '', etoilesStr ? `Note : ${etoilesStr}` : '', commentaire ? `\n${commentaire}` : ''].filter(Boolean).join(' · '),
        destinataires: [],
        sms_envoye: false,
      });
      if (v?.bien_id) await supabase.from('biens').update({ badge_retour: 'visite' }).eq('id', v.bien_id);
      await addJournal(clientId, 'visite_effectuee', `✅ Visite effectuée${etoilesStr ? ' · '+etoilesStr : ''} — ${v?.biens?.titre || v?.biens?.ville || ''}`, commentaire || undefined);
    }
    setSaving(false); setShowCR(false); load();
  }

  async function annuler(id: string) {
    if (!confirm('Annuler cette visite ?')) return;
    await supabase.from('visites').update({ statut: 'annulee' }).eq('id', id);
    load();
  }

  const aVenir = visites.filter(v => v.statut === 'a_venir');
  const effectuees = visites.filter(v => v.statut === 'effectuee');

  const formatDate = (d: string) => {
    const date = new Date(d);
    return {
      day: date.getDate(),
      mon: date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      year: date.getFullYear(),
      full: date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    };
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Visites</h1>
          <p className={styles.sub}>{aVenir.length} à venir · {effectuees.length} effectuée{effectuees.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : visites.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📅</div>
          <div className={styles.emptyTitle}>Aucune visite planifiée</div>
          <div className={styles.emptySub}>Les visites s'ajoutent depuis la fiche client → onglet Biens</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* À VENIR */}
          {aVenir.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
                À venir — {aVenir.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {aVenir.map(v => {
                  const date = v.date_visite ? formatDate(v.date_visite) : null;
                  const photo = v.biens?.photos?.[0];
                  return (
                    <div key={v.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #e3e8f0', borderLeft: '3px solid #3b82f6', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                        {photo && <img src={photo} alt="" style={{ width: 90, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                        <div style={{ flex: 1, padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            {date && (
                              <div style={{ background: '#1a2332', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 44, flexShrink: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 18, color: 'white', lineHeight: 1 }}>{date.day}</div>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>{date.mon} {date.year}</div>
                              </div>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{v.clients?.prenom} {v.clients?.nom}</div>
                              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{v.biens?.titre || v.biens?.ville || '—'}</div>
                              {v.heure && <div style={{ fontSize: 13, color: '#c9a84c', fontWeight: 700, marginTop: 4 }}>🕐 {v.heure}</div>}
                              {v.contact_agence && <div style={{ fontSize: 12, color: '#94a3b8' }}>📞 {v.contact_agence}</div>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 14px 14px 0', justifyContent: 'center' }}>
                          <button onClick={() => openCR(v.id)} style={{ background: '#1a2332', color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>✓ Effectuée</button>
                          <button onClick={() => annuler(v.id)} style={{ background: 'white', color: '#64748b', border: '1px solid #e3e8f0', borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* EFFECTUÉES */}
          {effectuees.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                Effectuées — {effectuees.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {effectuees.map(v => {
                  const date = v.date_visite ? formatDate(v.date_visite) : null;
                  const photo = v.biens?.photos?.[0];
                  const avis = v.avis_client ? AVIS_COLORS[v.avis_client] : null;
                  return (
                    <div key={v.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #e3e8f0', borderLeft: '3px solid #10b981', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                        {photo && <img src={photo} alt="" style={{ width: 90, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                        <div style={{ flex: 1, padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            {date && (
                              <div style={{ background: '#ecfdf5', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 44, flexShrink: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 18, color: '#065f46', lineHeight: 1 }}>{date.day}</div>
                                <div style={{ fontSize: 9, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: 1 }}>{date.mon} {date.year}</div>
                              </div>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{v.clients?.prenom} {v.clients?.nom}</div>
                              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{v.biens?.titre || v.biens?.ville || '—'}</div>
                              {v.heure && <div style={{ fontSize: 13, color: '#c9a84c', fontWeight: 700, marginTop: 4 }}>🕐 {v.heure}</div>}
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                                {v.avis_client && avis && (
                                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: avis.bg, color: avis.color, border: `1px solid ${avis.border}` }}>
                                    {AVIS_LABELS[v.avis_client]}
                                  </span>
                                )}
                                {v.note_etoiles > 0 && <span style={{ fontSize: 15 }}>{'⭐'.repeat(v.note_etoiles)} <span style={{ fontSize: 11, color: '#94a3b8' }}>{v.note_etoiles}/5</span></span>}
                              </div>
                              {v.commentaire && (
                                <div style={{ fontSize: 13, color: '#1a2332', background: '#f0fdf4', borderRadius: 10, padding: '8px 12px', marginTop: 8, borderLeft: '3px solid #10b981' }}>
                                  {v.commentaire}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL COMPTE-RENDU */}
      {showCR && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,22,35,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20, backdropFilter: 'blur(4px)', animation: 'fadeIn 0.18s ease' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCR(false); }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 520, boxShadow: '0 24px 48px rgba(0,0,0,0.18)', animation: 'slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: '#1a2332', margin: 0 }}>✅ Compte-rendu de visite</h2>
              <button onClick={() => setShowCR(false)} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e3e8f0', background: 'white', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>Note globale</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setCrForm(f => ({ ...f, etoiles: f.etoiles === n ? 0 : n }))}
                      style={{ width: 44, height: 44, borderRadius: 12, border: `2px solid ${crForm.etoiles >= n ? '#c9a84c' : '#e2e8f0'}`, background: crForm.etoiles >= n ? '#fef9c3' : 'white', fontSize: 22, cursor: 'pointer' }}>⭐</button>
                  ))}
                  {crForm.etoiles > 0 && <span style={{ alignSelf: 'center', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{crForm.etoiles}/5</span>}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>Avis du client</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {Object.entries(AVIS_LABELS).map(([v, l]) => (
                    <button key={v} onClick={() => setCrForm(f => ({ ...f, avis_client: f.avis_client === v ? '' : v }))}
                      style={{ padding: '8px 6px', borderRadius: 10, border: `1px solid ${crForm.avis_client === v ? '#1a2332' : '#e2e8f0'}`, background: crForm.avis_client === v ? '#1a2332' : 'white', color: crForm.avis_client === v ? 'white' : '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>Commentaires</label>
                <textarea value={crForm.commentaire} onChange={e => setCrForm(f => ({ ...f, commentaire: e.target.value }))}
                  rows={4} placeholder="Points positifs, négatifs, éléments à vérifier..."
                  style={{ width: '100%', background: '#f8fafc', border: '1.5px solid #e3e8f0', borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowCR(false)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e3e8f0', background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={saveCR} disabled={saving} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: '#1a2332', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? '⏳ Sauvegarde...' : '✅ Valider le compte-rendu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
