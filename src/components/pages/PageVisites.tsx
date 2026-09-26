'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ModaleRappelVisite, libelleRappel } from '@/components/shared/RappelVisite';
import { chargerDemandesVisite, type DemandeVisite } from '@/lib/demandes-visite';
import { demanderOuvertureFiche, signalerMaj } from '@/lib/intentions';
import styles from './Page.module.css';
import EnteteRubrique, { PictoVisites } from '@/components/shared/EnteteRubrique';
import CompteRenduVisite, { enregistrerCompteRendu, type ValeursCR } from '@/components/shared/CompteRenduVisite';
import { ISSUES, issueDe, type Issue } from '@/lib/visites';

/* Petite enveloppe dessinée pour le bouton de rappel. */
function Enveloppe() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m3.6 7.6 8.4 5.8 8.4-5.8" />
    </svg>
  );
}

/* L'issue d'une visite faite, en pastille (voir src/lib/visites.ts). */
function PastilleIssue({ i, offreFaite }: { i: Issue; offreFaite?: boolean }) {
  const x = ISSUES[i];
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: x.fond, color: x.couleur, border: `1px solid ${x.trait}` }}>
      {`${x.e} ${i === 'offre' && offreFaite ? 'Offre faite' : x.crm}`}
    </span>
  );
}
function Raisons({ l, non }: { l?: string[] | null; non?: boolean }) {
  if (!l || !l.length) return null;
  return (
    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {l.map(m => <span key={m} style={{ fontSize: 11.5, fontWeight: 700, color: non ? '#9a3412' : '#334155', background: non ? '#fff4ef' : '#f1f5f9', border: `1px solid ${non ? '#fbd5c5' : '#e2e8f0'}`, borderRadius: 99, padding: '2px 8px' }}>{m}</span>)}
    </span>
  );
}

export default function PageVisites({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [visites, setVisites] = useState<any[]>([]);
  /* Les clients qui ont demandé à visiter un bien depuis leur espace, et
     pour qui aucune date n'est encore calée (voir src/lib/demandes-visite.ts). */
  const [demandes, setDemandes] = useState<DemandeVisite[]>([]);
  const [loading, setLoading] = useState(true);
  /* La visite dont on fait le compte rendu (null = fenêtre fermée). */
  const [crVisite, setCrVisite] = useState<any>(null);
  /* Retrouver une visite : par le bien ou par le client, et par où elle en est. */
  const [cherche, setCherche] = useState('');
  const [filtre, setFiltre] = useState<'tout' | 'demandes' | 'a_faire' | 'a_venir' | 'effectuees' | 'annulees'>('tout');
  /* Le rappel au client : la fenêtre s'ouvre sur une visite et retrouve
     toutes celles du même jour pour ce client. */
  const [rappelDe, setRappelDe] = useState<string | null>(null);

  /* L'agenda envoie ici pour un compte rendu : la visite s'ouvre directement. */
  useEffect(() => {
    load().then((liste) => {
      try {
        const id = window.sessionStorage.getItem('emi-cr');
        if (id) { window.sessionStorage.removeItem('emi-cr'); setFiltre('a_faire'); openCR(id, liste); }
      } catch { /* sans effet */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const [{ data }, dem] = await Promise.all([
      supabase
        .from('visites')
        .select('*, clients(id, prenom, nom, reference), biens(titre, ville, photos, badge_retour)')
        .order('date_visite', { ascending: true }),
      chargerDemandesVisite().catch(() => [] as DemandeVisite[]),
    ]);
    setVisites(data || []);
    setDemandes(dem);
    setLoading(false);
    signalerMaj();
    return data || [];
  }

  function openCR(visiteId: string, liste?: any[]) {
    const v = (liste || visites).find(x => x.id === visiteId);
    if (v) setCrVisite(v);
  }

  async function saveCR(x: ValeursCR): Promise<string | null> {
    const v = crVisite;
    if (!v) return 'visite non identifiée';
    const clientId = v.clients?.id || v.client_id;
    const err = await enregistrerCompteRendu(v, x, {
      clientId, rechercheId: v.recherche_id || null,
      bienTitre: v.biens?.titre || v.biens?.ville || 'Bien', badgeActuel: v.biens?.badge_retour,
    });
    if (err) return err;
    setCrVisite(null);
    load();
    return null;
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
  const demandesTrouvees = q
    ? demandes.filter(d => sansAccent(`${d.client?.prenom || ''} ${d.client?.nom || ''} ${d.bien.titre || ''} ${d.bien.ville || ''}`).includes(q))
    : demandes;

  /* Une demande ouvre la fiche du client sur ses biens présentés : le bien y
     est dans le groupe « Il veut visiter », avec de quoi caler la visite. */
  function ouvrirDemande(d: DemandeVisite) {
    if (!d.client) return;
    demanderOuvertureFiche({ clientId: d.client.id, onglet: 'presentes', rechercheId: d.rechercheId });
    onNavigate('fiche', d.client);
  }
  /* Depuis quand il attend, en jours de calendrier. Au-delà de deux jours,
     l'attente s'écrit en rouge. */
  const attente = (iso: string) => {
    const d = new Date(iso);
    const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const j = Math.round((jour(maintenant) - jour(d)) / 86400000);
    const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
    return {
      texte: j <= 0 ? `Demandé aujourd’hui à ${h}` : j === 1 ? `Demandé hier à ${h}` : `Attend depuis ${j} jours`,
      vieux: j >= 2,
    };
  };
  const euros = (n: number) => n.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0') + '\u00a0€';

  /* La phrase sous le titre : la prochaine visite, avec qui et quand. Elle ne
     répète aucun chiffre des tuiles. Calculée sur toutes les visites, pas
     seulement celles que la recherche laisse passer. */
  const prochaineVisite = visites
    .filter(v => v.statut === 'a_venir' && v.date_visite && !passee(v))
    .sort((a, b) => quand(a).localeCompare(quand(b)))[0];
  const phraseProchaine = (() => {
    if (!prochaineVisite) return 'Aucune visite prévue pour l’instant';
    const [a, m, j] = String(prochaineVisite.date_visite).slice(0, 10).split('-').map(Number);
    const jourV = new Date(a, m - 1, j);
    const auj = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const ecart = Math.round((jourV.getTime() - auj.getTime()) / 86400000);
    const date = ecart === 0 ? 'aujourd’hui' : ecart === 1 ? 'demain' : jourV.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const heure = prochaineVisite.heure ? ` à ${String(prochaineVisite.heure).slice(0, 5)}` : '';
    const qui = [prochaineVisite.clients?.prenom, prochaineVisite.clients?.nom].filter(Boolean).join(' ');
    return `Prochaine visite ${date}${heure}${qui ? ` avec ${qui}` : ''}`;
  })();

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
      {/* Le titre et ses chiffres dans un seul bloc : les chiffres sont les
          filtres. La ligne grise « 0 à venir · 0 effectuée » a disparu, elle
          disait en petit ce que les tuiles disent en grand. */}
      <EnteteRubrique titre="Visites" icone={PictoVisites}
        phrase={visites.length === 0 && demandes.length === 0 ? (loading ? undefined : 'Aucune visite pour l’instant') : phraseProchaine}
        recherche={visites.length > 0 || demandes.length > 0 ? { valeur: cherche, onChange: setCherche, placeholder: 'Chercher un bien ou un client…', label: 'Chercher une visite' } : undefined}
        label="Filtrer les visites" actif={filtre} onChoisir={(c: string) => setFiltre(c as typeof filtre)}
        tuiles={visites.length === 0 && demandes.length === 0 ? [] : ([
          { cle: 'tout', lib: 'Toutes', n: trouvees.length },
          { cle: 'demandes', lib: 'Demandes', n: demandesTrouvees.length, couleur: '#ef4444', alerte: true },
          { cle: 'a_faire', lib: 'Compte rendu à faire', n: aFaire.length, couleur: '#f59e0b', alerte: true },
          { cle: 'a_venir', lib: 'À venir', n: aVenir.length, couleur: '#3b82f6' },
          { cle: 'effectuees', lib: 'Effectuées', n: effectuees.length, couleur: '#10b981' },
          { cle: 'annulees', lib: 'Annulées', n: annulees.length, couleur: '#94a3b8' },
        ]).filter(x => x.cle !== 'demandes' || demandes.length > 0)} />

      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : visites.length === 0 && demandes.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📅</div>
          <div className={styles.emptyTitle}>Aucune visite planifiée</div>
          <div className={styles.emptySub}>Les visites s'ajoutent depuis l'Agenda ou depuis la fiche client</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {trouvees.length === 0 && demandesTrouvees.length === 0 && (
            <div className={styles.empty}><div className={styles.emptySub}>{`Aucune visite ne correspond à « ${cherche} ».`}</div></div>
          )}

          {/* DEMANDES DE VISITE — le client a appuyé sur « Je souhaite le visiter »
              dans son espace, et aucune date n'est encore calée. Elles passent
              en tête : c'est ce qui attend une action. */}
          {demandesTrouvees.length > 0 && montrer('demandes') && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                {`Demandes de visite — ${demandesTrouvees.length}`}
              </div>
              <div style={{ fontSize: 12.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.45 }}>
                {'Demandées par le client depuis son espace. Dès qu’une visite est calée sur le bien, la demande passe dans « À venir ».'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {demandesTrouvees.map(d => {
                  const photo = d.bien.photos?.[0];
                  const nom = `${d.client?.prenom || ''} ${d.client?.nom || ''}`.trim() || 'Le client';
                  const att = attente(d.quand);
                  const lieu = [d.bien.quartier, d.bien.ville].filter(Boolean).join(', ');
                  const carac = [d.bien.surface ? `${d.bien.surface}\u00a0m²` : '', d.bien.nb_pieces ? `${d.bien.nb_pieces}\u00a0pièces` : '', d.bien.prix ? euros(d.bien.prix) : ''].filter(Boolean).join(' · ');
                  return (
                    <div key={d.id} className="pv-carte" role="button" tabIndex={0}
                      onClick={() => ouvrirDemande(d)} onKeyDown={e => { if (e.key === 'Enter') ouvrirDemande(d); }}
                      style={{ background: 'white', borderRadius: 16, border: '1px solid #fbd5d5', borderLeft: '3px solid #ef4444', overflow: 'hidden', boxShadow: '0 8px 22px -18px rgba(220,38,38,.7)', cursor: 'pointer' }}>
                      <div className="pv-ligne" style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                        {photo
                          ? <img src={photo} alt="" className="pv-photo" style={{ width: 96, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <div className="pv-photo" style={{ width: 96, flexShrink: 0, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🏠</div>}
                        <div className="pv-corps" style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>{'👀 Veut visiter'}</span>
                            <span style={{ fontSize: 12, fontWeight: att.vieux ? 700 : 500, color: att.vieux ? '#dc2626' : '#94a3b8' }}>{att.texte}</span>
                          </div>
                          <div style={{ fontSize: 15, color: '#1a2332', marginTop: 8, lineHeight: 1.35 }}>
                            <b>{nom}</b>{' souhaite visiter ce logement'}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#334155', marginTop: 3 }}>{d.bien.titre || lieu || 'Bien présenté'}</div>
                          {(lieu || carac) && (
                            <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>{[lieu, carac].filter(Boolean).join(' · ')}</div>
                          )}
                          {d.dispos && (
                            <div style={{ fontSize: 12.5, color: '#1a2332', background: '#fff8f8', border: '1px solid #fde4e4', borderRadius: 10, padding: '7px 11px', marginTop: 9, lineHeight: 1.5 }}>
                              <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: '#b91c1c', marginBottom: 2 }}>Ses disponibilités</span>
                              {d.dispos}
                            </div>
                          )}
                        </div>
                        <div className="pv-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 14px 14px 0', justifyContent: 'center' }}>
                          <button type="button" onClick={e => { e.stopPropagation(); ouvrirDemande(d); }}
                            style={{ background: '#1a2332', color: 'white', border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            {'Ouvrir sa fiche →'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
                              {g.id === 'a_faire' && v.avis_client_le && v.issue && ISSUES[v.issue as Issue] && (
                                <div style={{ fontSize: 12.5, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '7px 10px', marginTop: 9, lineHeight: 1.45 }}>
                                  <b>{`${v.clients?.prenom || 'Le client'} a répondu : ${ISSUES[v.issue as Issue].crm}`}</b>
                                  {v.prix_envisage ? `, autour de ${Number(v.prix_envisage).toLocaleString('fr-FR')} €` : ''}
                                  {v.motifs?.length ? <div style={{ marginTop: 5 }}><Raisons l={v.motifs} non={v.issue === 'non'} /></div> : null}
                                  {v.mot_client ? <div style={{ marginTop: 4 }}>{`« ${v.mot_client} »`}</div> : null}
                                </div>
                              )}
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
                  const issue = issueDe(v);
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
                                {issue && <PastilleIssue i={issue} offreFaite={v.biens?.badge_retour === 'offre_faite'} />}
                                {v.note_etoiles > 0 && <span style={{ fontSize: 15 }}>{'⭐'.repeat(v.note_etoiles)} <span style={{ fontSize: 11, color: '#94a3b8' }}>{v.note_etoiles}/5</span></span>}
                              </div>
                              {(v.motifs?.length > 0 || v.aime?.length > 0) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                                  <Raisons l={v.motifs} non={issue === 'non'} />
                                  {v.aime?.length > 0 && <span style={{ fontSize: 12, color: '#166534' }}>{`Il a aimé : ${v.aime.join(', ')}`}</span>}
                                </div>
                              )}
                              {v.mot_client && (
                                <div style={{ fontSize: 12.5, color: '#1e3a8a', background: '#eff6ff', borderRadius: 9, padding: '7px 10px', marginTop: 8 }}>{`« ${v.mot_client} » — ${v.clients?.prenom || 'le client'}, dans son espace`}</div>
                              )}
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

      {/* COMPTE RENDU — la même fenêtre que dans la fiche client */}
      {crVisite && (() => {
        const d = crVisite.date_visite ? new Date(`${String(crVisite.date_visite).slice(0, 10)}T12:00:00`) : null;
        const sous = [`${crVisite.clients?.prenom || ''} ${crVisite.clients?.nom || ''}`.trim(), d && !isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '', crVisite.heure ? `à ${String(crVisite.heure).slice(0, 5)}` : ''].filter(Boolean).join(' · ');
        return (
          <CompteRenduVisite visite={crVisite} titre={crVisite.biens?.titre || crVisite.biens?.ville || 'Bien'} sous={sous}
            prenom={crVisite.clients?.prenom || ''} onFermer={() => setCrVisite(null)} onValider={saveCR} />
        );
      })()}
    </div>
  );
}
