'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import AvatarContact from '@/components/contacts/AvatarContact';
import { bienVisitable, poserVisites } from '@/lib/planifier-visite';
import dv from './DemandesVisite.module.css';
import { supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/registre';
import { ModaleRappelVisite, libelleRappel } from '@/components/shared/RappelVisite';
import { chargerDemandesVisite, type DemandeVisite } from '@/lib/demandes-visite';
import { demanderOuvertureFiche, signalerMaj } from '@/lib/intentions';
import styles from './Page.module.css';
import EnteteRubrique, { PictoVisites } from '@/components/shared/EnteteRubrique';
import CompteRenduVisite, { enregistrerCompteRendu, type ValeursCR } from '@/components/shared/CompteRenduVisite';
import { ISSUES, issueDe, maintenantParis, visitePasseeParis, type Issue } from '@/lib/visites';
import { annulerVisites } from '@/lib/annuler-visites';

/* Petite enveloppe dessinée pour le bouton de rappel. */
function Enveloppe() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m3.6 7.6 8.4 5.8 8.4-5.8" />
    </svg>
  );
}

/* Trois pictos dessinés pour les demandes de visite (V3.129). */
function Picto({ n, t = 16 }: { n: 'cal' | 'fiche' | 'croix' | 'maison'; t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {n === 'cal' && <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>}
      {n === 'fiche' && <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>}
      {n === 'croix' && <path d="M6 6l12 12M18 6 6 18" />}
      {n === 'maison' && <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>}
    </svg>
  );
}

/* Le bien demandé, en petite carte (la carte de la demande et la fenêtre). */
function BienDemande({ d }: { d: DemandeVisite }) {
  const euros = (n: number) => n.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0') + '\u00a0€';
  const lieu = [d.bien.quartier, d.bien.ville].filter(Boolean).join(', ');
  const carac = [d.bien.surface ? `${d.bien.surface}\u00a0m²` : '', d.bien.nb_pieces ? `${d.bien.nb_pieces}\u00a0pièces` : ''].filter(Boolean).join(' · ');
  const photo = d.bien.photos?.[0];
  return (
    <div className={dv.bien}>
      {photo
        ? <img src={photo} alt="" className={dv.photo} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
        : <span className={`${dv.photo} ${dv.photoVide}`}><Picto n="maison" t={22} /></span>}
      <span className={dv.bienTx}>
        <b>{d.bien.titre || lieu || 'Bien présenté'}</b>
        {(lieu || carac) && <small>{[lieu, carac].filter(Boolean).join(' · ')}</small>}
      </span>
      {d.bien.prix ? <span className={dv.prix}>{euros(d.bien.prix)}</span> : null}
    </div>
  );
}

/* « Planifier la visite » sans quitter la page (V3.129, Alexandre : « ça
   ouvre déjà un pop-up et je peux organiser directement la visite sans
   ouvrir la fiche »). Les écritures sont celles de la fiche
   (src/lib/planifier-visite.ts) : la relance « Veut visiter » se solde, le
   Suivi note la visite, la demande passe dans « À venir ». */
function FenetreVisite({ d, revu, onFermer, onFait }: { d: DemandeVisite; revu: boolean; onFermer: () => void; onFait: (texte: string) => void }) {
  const [date, setDate] = useState('');
  const [heure, setHeure] = useState('');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const acceptes = useRef<Set<string>>(new Set());
  const nom = `${d.client?.prenom || ''} ${d.client?.nom || ''}`.trim() || 'le client';
  const aujourdhui = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !envoi) onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [envoi, onFermer]);
  const valider = async () => {
    if (envoi || !d.client) return;
    setEnvoi(true);
    const bien = { id: d.bien.id, titre: d.bien.titre, ville: d.bien.ville, bien_vente_id: d.bien.bien_vente_id || null };
    try {
      if (!(await bienVisitable([bien], acceptes.current))) return;
      const ok = await poserVisites({ clientId: d.client.id, rechercheId: d.rechercheId, biens: [bien], revus: revu ? [bien.id] : [], date, heure, contact, notes });
      if (!ok) return;
      const quand = date ? new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
      onFait(`Visite planifiée avec ${nom}${quand ? ` le ${quand}` : ''}${heure ? ` à ${heure}` : ''}. Elle passe dans « À venir ».`);
    } finally { setEnvoi(false); }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={dv.voile} onClick={e => { if (e.target === e.currentTarget && !envoi) onFermer(); }}>
      <div className={dv.fenetre} role="dialog" aria-modal="true" aria-label="Planifier la visite">
        <div className={dv.fTete}>
          <span className={dv.fIc}><Picto n="cal" t={19} /></span>
          <div style={{ minWidth: 0 }}>
            <h2>Planifier la visite</h2>
            <p>{`Avec ${nom}`}</p>
          </div>
          <button type="button" className={dv.fFermer} onClick={onFermer} aria-label="Fermer"><Picto n="croix" t={15} /></button>
        </div>
        <div className={dv.fCorps}>
          <BienDemande d={d} />
          {d.dispos && <div className={dv.dispo}><small>Ses disponibilités</small>{d.dispos}</div>}
          <div className={dv.champs}>
            <div className={dv.champ}><label htmlFor="pv-date">Date</label><input id="pv-date" type="date" min={aujourdhui} value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className={dv.champ}><label htmlFor="pv-heure">Heure</label><input id="pv-heure" type="time" value={heure} onChange={e => setHeure(e.target.value)} /></div>
            <div className={`${dv.champ} ${dv.plein}`}><label htmlFor="pv-contact">Contact agence ou vendeur</label><input id="pv-contact" value={contact} onChange={e => setContact(e.target.value)} placeholder="Nom, téléphone, e-mail…" /></div>
            <div className={`${dv.champ} ${dv.plein}`}><label htmlFor="pv-notes">Notes préparatoires</label><textarea id="pv-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Points à vérifier, documents à apporter…" /></div>
          </div>
          <div className={dv.aide}>{'La visite va dans l’agenda et dans son espace. La demande quitte « Demandes » et passe dans « À venir ».'}</div>
        </div>
        <div className={dv.fPied}>
          <button type="button" className={dv.btn} onClick={onFermer} disabled={envoi}>Annuler</button>
          <button type="button" className={`${dv.btn} ${dv.btnV}`} onClick={() => { void valider(); }} disabled={envoi}>
            <Picto n="cal" t={15} /><span>{envoi ? 'Enregistrement…' : 'Confirmer la visite'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
  /* V3.129 : la demande dont on planifie la visite (la fenêtre), et la phrase qui le confirme. */
  const [aPlanifier, setAPlanifier] = useState<DemandeVisite | null>(null);
  const [bravo, setBravo] = useState('');

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
    /* Par pages de 1 000 (V3.33) : au-delà, Supabase coupait sans rien dire,
       et comme la liste part de la plus ancienne, c'étaient les visites à
       venir qui disparaissaient les premières. */
    const [{ data }, dem] = await Promise.all([
      toutLire<any>((de, a) => supabase
        .from('visites')
        .select('*, clients(id, prenom, nom, reference), biens(titre, ville, photos, badge_retour)')
        .order('date_visite', { ascending: true }).order('id').range(de, a)),
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

  /* V3.50 : la même annulation que l'agenda et la fiche (src/lib/annuler-
     visites.ts). Ici, seul le statut changeait : le rappel de la visite
     restait dans les Relances, et le Suivi de l'acheteur n'en disait rien.
     Un échec s'affiche en rouge. */
  async function annuler(id: string) {
    if (!confirm('Annuler cette visite ?')) return;
    await annulerVisites([id]);
    load();
  }

  /* Une visite « à venir » dont la date est passée attend son compte rendu.
     V3.50 : à l'heure de Paris, la même règle que le menu et le tableau de
     bord (src/lib/visites.ts). */
  const maintenant = new Date();
  const mParis = maintenantParis(maintenant);
  const passee = (v: { date_visite?: string | null; heure?: string | null }) => visitePasseeParis(v, mParis);
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
    /* V3.129 : la fiche descend jusqu'au bien et l'entoure un instant (OngletBiens, `vise`). */
    demanderOuvertureFiche({ clientId: d.client.id, onglet: 'presentes', rechercheId: d.rechercheId, bienId: d.bien.id });
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

      {aPlanifier && (
        <FenetreVisite d={aPlanifier}
          revu={visites.some(v => v.bien_id === aPlanifier.bien.id && (v.statut === 'effectuee' || v.statut === 'a_venir'))}
          onFermer={() => setAPlanifier(null)}
          onFait={texte => { setAPlanifier(null); setBravo(texte); load(); window.setTimeout(() => setBravo(''), 9000); }} />
      )}

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
              {/* V3.129 (Alexandre, maquette 1) : le client, puis le bien en petite
                  carte, ses disponibilités en bulle ; « Planifier la visite »
                  ouvre la fenêtre ici, « Voir sur sa fiche » descend jusqu'au bien. */}
              {bravo && <div className={dv.bravo} role="status" style={{ marginBottom: 10 }}><Picto n="cal" t={16} /><span>{bravo}</span></div>}
              <div className={dv.liste}>
                {demandesTrouvees.map((d, i) => {
                  const nom = `${d.client?.prenom || ''} ${d.client?.nom || ''}`.trim() || 'Le client';
                  const att = attente(d.quand);
                  return (
                    <div key={d.id} className={dv.carte} role="button" tabIndex={0} style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
                      onClick={() => ouvrirDemande(d)} onKeyDown={e => { if (e.key === 'Enter') ouvrirDemande(d); }}>
                      <div className={dv.qui}>
                        {d.client && <AvatarContact c={d.client} teinte={{ bg: '#eef2f8', fg: '#34496e' }} taille={42} />}
                        <span className={dv.quiTx}><b>{nom}</b><span>veut visiter ce bien</span></span>
                        <span className={`${dv.attente} ${att.vieux ? dv.attenteVieille : ''}`}><i />{att.texte}</span>
                      </div>
                      <div className={dv.actions}>
                        <button type="button" className={`${dv.btn} ${dv.btnV}`} onClick={e => { e.stopPropagation(); setBravo(''); setAPlanifier(d); }}>
                          <Picto n="cal" t={15} /><span>Planifier la visite</span>
                        </button>
                        <button type="button" className={dv.btn} onClick={e => { e.stopPropagation(); ouvrirDemande(d); }}>
                          <Picto n="fiche" t={15} /><span>Voir sur sa fiche</span>
                        </button>
                      </div>
                      <BienDemande d={d} />
                      {d.dispos && <div className={dv.dispo}><small>Ses disponibilités</small>{d.dispos}</div>}
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
                              <div style={{ background: 'var(--emilio-fond)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 44, flexShrink: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 18, color: 'white', lineHeight: 1 }}>{date.day}</div>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>{date.mon} {date.year}</div>
                              </div>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--emilio)' }}>{v.clients?.prenom} {v.clients?.nom}</div>
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
                          <button onClick={() => openCR(v.id)} style={{ background: g.id === 'a_faire' ? '#c9a84c' : 'var(--emilio)', color: g.id === 'a_faire' ? 'var(--emilio)' : 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{g.id === 'a_faire' ? 'Compte rendu' : '✓ Effectuée'}</button>
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
                              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--emilio)' }}>{v.clients?.prenom} {v.clients?.nom}</div>
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
                                <div style={{ fontSize: 13, color: 'var(--emilio)', background: '#f0fdf4', borderRadius: 10, padding: '8px 12px', marginTop: 8, borderLeft: '3px solid #10b981' }}>
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
