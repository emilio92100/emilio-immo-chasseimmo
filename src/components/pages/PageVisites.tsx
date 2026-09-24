'use client';
import { useState, useEffect } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import { ModaleRappelVisite, libelleRappel } from '@/components/shared/RappelVisite';
import styles from './Page.module.css';

/* Petite enveloppe dessinée pour le bouton de rappel. */
function Enveloppe() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m3.6 7.6 8.4 5.8 8.4-5.8" />
    </svg>
  );
}

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
  /* Retrouver une visite : par le bien ou par le client, et par où elle en est. */
  const [cherche, setCherche] = useState('');
  const [filtre, setFiltre] = useState<'tout' | 'a_faire' | 'a_venir' | 'effectuees' | 'annulees'>('tout');
  /* Le rappel au client : la fenêtre s'ouvre sur une visite et retrouve
     toutes celles du même jour pour ce client. */
  const [rappelDe, setRappelDe] = useState<string | null>(null);

  /* L'agenda envoie ici pour un compte rendu : la visite s'ouvre directement. */
  useEffect(() => {
    load().then(() => {
      try {
        const id = window.sessionStorage.getItem('emi-cr');
        if (id) { window.sessionStorage.removeItem('emi-cr'); setFiltre('a_faire'); openCR(id); }
      } catch { /* sans effet */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('visites')
      .select('*, clients(id, prenom, nom, reference), biens(titre, ville, photos)')
      .order('date_visite', { ascending: true });
    setVisites(data || []);
    setLoading(false);
    return data || [];
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
    const { error } = await supabase.from('visites').update({ statut: 'annulee' }).eq('id', id);
    if (error) { alert("L'annulation n'a pas pu être enregistrée.\n\n" + error.message); return; }
    load();
  }

  /* Une visite « à venir » dont la date est passée attend son compte rendu. */
  const maintenant = new Date();
  const passee = (v: any) => {
    if (!v.date_visite) return false;
    const d = new Date(`${String(v.date_visite).slice(0, 10)}T${v.heure ? String(v.heure).slice(0, 5) : '23:59'}:00`);
    return !isNaN(d.getTime()) && d < maintenant;
  };
  const sansAccent = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = sansAccent(cherche.trim());
  const trouvees = q
    ? visites.filter(v => sansAccent(`${v.clients?.prenom || ''} ${v.clients?.nom || ''} ${v.biens?.titre || ''} ${v.biens?.ville || ''} ${v.contact_agence || ''}`).includes(q))
    : visites;
  const recentes = (l: any[]) => [...l].sort((a, b) => String(b.date_visite || '').localeCompare(String(a.date_visite || '')));
  const aFaire = recentes(trouvees.filter(v => v.statut === 'a_venir' && passee(v)));
  const quand = (v: any) => `${String(v.date_visite || '9999').slice(0, 10)} ${v.heure ? String(v.heure).slice(0, 5) : '99:99'}`;
  const aVenir = trouvees.filter(v => v.statut === 'a_venir' && !passee(v)).sort((a, b) => quand(a).localeCompare(quand(b)));
  const effectuees = recentes(trouvees.filter(v => v.statut === 'effectuee'));
  const annulees = recentes(trouvees.filter(v => v.statut === 'annulee'));
  const montrer = (f: typeof filtre) => filtre === 'tout' || filtre === f;

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
          <p className={styles.sub}>{`${aVenir.length} à venir · ${effectuees.length} effectuée${effectuees.length > 1 ? 's' : ''}${aFaire.length ? ` · ${aFaire.length} compte${aFaire.length > 1 ? 's' : ''} rendu${aFaire.length > 1 ? 's' : ''} à faire` : ''}`}</p>
        </div>
      </div>

      {visites.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: 12, color: '#94a3b8', pointerEvents: 'none' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7" /><path d="m20.5 20.5-4.7-4.7" /></svg>
            </span>
            <input value={cherche} onChange={e => setCherche(e.target.value)} placeholder="Chercher un bien ou un client…" aria-label="Chercher une visite"
              style={{ width: '100%', boxSizing: 'border-box', height: 42, padding: '0 14px 0 40px', borderRadius: 12, border: '1.5px solid #e3e8f0', background: 'white', fontSize: 14, fontFamily: 'inherit', color: '#1a2332', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {([
              { id: 'tout', lib: 'Toutes', n: trouvees.length, c: '#1a2332' },
              { id: 'a_faire', lib: 'Compte rendu à faire', n: aFaire.length, c: '#b45309' },
              { id: 'a_venir', lib: 'À venir', n: aVenir.length, c: '#3b82f6' },
              { id: 'effectuees', lib: 'Effectuées', n: effectuees.length, c: '#10b981' },
              { id: 'annulees', lib: 'Annulées', n: annulees.length, c: '#94a3b8' },
            ] as const).map(x => {
              const actif = filtre === x.id;
              return (
                <button key={x.id} type="button" onClick={() => setFiltre(x.id)} aria-pressed={actif}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 20, padding: '7px 13px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${actif ? '#1a2332' : '#e3e8f0'}`, background: actif ? '#1a2332' : 'white', color: actif ? 'white' : '#64748b' }}>
                  {x.id !== 'tout' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: x.c }} />}
                  {x.lib}
                  <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: '1px 7px', background: actif ? 'rgba(255,255,255,.18)' : '#f1f5f9', color: actif ? 'white' : '#94a3b8' }}>{x.n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : visites.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📅</div>
          <div className={styles.emptyTitle}>Aucune visite planifiée</div>
          <div className={styles.emptySub}>Les visites s'ajoutent depuis l'Agenda ou depuis la fiche client</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {trouvees.length === 0 && (
            <div className={styles.empty}><div className={styles.emptySub}>{`Aucune visite ne correspond à « ${cherche} ».`}</div></div>
          )}

          {/* À VENIR — et celles dont la date est passée, qui attendent leur compte rendu */}
          {([
            { id: 'a_faire' as const, liste: aFaire, titre: 'Compte rendu à faire', c: '#b45309' },
            { id: 'a_venir' as const, liste: aVenir, titre: 'À venir', c: '#3b82f6' },
          ]).filter(g => g.liste.length > 0 && montrer(g.id)).map(g => (
            <div key={g.id}>
              <div style={{ fontSize: 11, fontWeight: 800, color: g.c, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.c, display: 'inline-block' }}></span>
                {`${g.titre} — ${g.liste.length}`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.liste.map(v => {
                  const date = v.date_visite ? formatDate(v.date_visite) : null;
                  const photo = v.biens?.photos?.[0];
                  return (
                    <div key={v.id} className="pv-carte" style={{ background: 'white', borderRadius: 16, border: '1px solid #e3e8f0', borderLeft: `3px solid ${g.c}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div className="pv-ligne" style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                        {photo && <img src={photo} alt="" className="pv-photo" style={{ width: 90, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                        <div className="pv-corps" style={{ flex: 1, padding: '14px 16px' }}>
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
                              {g.id === 'a_venir' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                  {v.rappel_envoye_le && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#047857', background: '#ecfdf5', borderRadius: 20, padding: '4px 10px' }}>
                                      <span aria-hidden="true">✓</span><span>{libelleRappel(v.rappel_envoye_le)}</span>
                                    </span>
                                  )}
                                  <button type="button" onClick={() => setRappelDe(v.id)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: v.rappel_envoye_le ? 'white' : '#fffaf0', color: '#8a6a1f', border: `1px solid ${v.rappel_envoye_le ? '#e3e8f0' : '#ecdcae'}`, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <Enveloppe />{v.rappel_envoye_le ? 'Renvoyer' : 'Envoyer le rappel'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="pv-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 14px 14px 0', justifyContent: 'center' }}>
                          <button onClick={() => openCR(v.id)} style={{ background: g.id === 'a_faire' ? '#c9a84c' : '#1a2332', color: g.id === 'a_faire' ? '#1a2332' : 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{g.id === 'a_faire' ? 'Compte rendu' : '✓ Effectuée'}</button>
                          <button onClick={() => annuler(v.id)} style={{ background: 'white', color: '#64748b', border: '1px solid #e3e8f0', borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* EFFECTUÉES */}
          {effectuees.length > 0 && montrer('effectuees') && (
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
                    <div key={v.id} className="pv-carte" style={{ background: 'white', borderRadius: 16, border: '1px solid #e3e8f0', borderLeft: '3px solid #10b981', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div className="pv-ligne" style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                        {photo && <img src={photo} alt="" className="pv-photo" style={{ width: 90, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                        <div className="pv-corps" style={{ flex: 1, padding: '14px 16px' }}>
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

          {/* ANNULÉES — gardées pour mémoire, sans action */}
          {annulees.length > 0 && montrer('annulees') && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#cbd5e1', display: 'inline-block' }}></span>
                {`Annulées — ${annulees.length}`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {annulees.map(v => {
                  const date = v.date_visite ? formatDate(v.date_visite) : null;
                  return (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fafbfd', borderRadius: 14, border: '1px solid #e3e8f0', padding: '10px 14px', opacity: .8 }}>
                      {date && <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', minWidth: 70 }}>{`${date.day} ${date.mon} ${date.year}`}</span>}
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <b style={{ fontSize: 13.5, color: '#64748b', textDecoration: 'line-through' }}>{`${v.clients?.prenom || ''} ${v.clients?.nom || ''}`.trim() || '—'}</b>
                        <span style={{ fontSize: 12.5, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.biens?.titre || v.biens?.ville || '—'}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {rappelDe && (
        <ModaleRappelVisite visiteId={rappelDe} onFerme={() => setRappelDe(null)} onEnvoye={() => { setRappelDe(null); load(); }} />
      )}

      {/* MODAL COMPTE-RENDU */}
      {showCR && (
        <div className="crm-voile" style={{ position: 'fixed', inset: 0, background: 'rgba(15,22,35,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20, backdropFilter: 'blur(4px)', animation: 'fadeIn 0.18s ease' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCR(false); }}>
          <div className="crm-feuille" style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 520, boxShadow: '0 24px 48px rgba(0,0,0,0.18)', animation: 'slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}>
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
                <div className="crm-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {Object.entries(AVIS_LABELS).map(([v, l]) => (
                    <button key={v} onClick={() => setCrForm(f => ({ ...f, avis_client: f.avis_client === v ? '' : v }))}
                      style={{ padding: '8px 6px', borderRadius: 10, border: `1px solid ${crForm.avis_client === v ? '#1a2332' : '#e2e8f0'}`, background: crForm.avis_client === v ? '#1a2332' : 'white', color: crForm.avis_client === v ? 'white' : '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>
                  Compte-rendu <span style={{ color: '#b45309', textTransform: 'none', letterSpacing: 0 }}>— lu par le client</span>
                </label>
                <textarea value={crForm.commentaire} onChange={e => setCrForm(f => ({ ...f, commentaire: e.target.value }))}
                  rows={4} placeholder="Ce que vous retenez de la visite, écrit pour lui…"
                  style={{ width: '100%', background: '#f8fafc', border: '1.5px solid #e3e8f0', borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div className="crm-pied" style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
