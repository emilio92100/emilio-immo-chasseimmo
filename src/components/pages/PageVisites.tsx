'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import AvatarContact from '@/components/contacts/AvatarContact';
import { bienVisitable, poserVisites } from '@/lib/planifier-visite';
import dv from './DemandesVisite.module.css';
import cv from './CartesVisites.module.css';
import { ficheClient } from '@/components/biens/outils';
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

/* Les pictos dessinés de la page : demandes de visite (V3.129), cartes des visites (V3.135). */
type NomPicto = 'cal' | 'fiche' | 'croix' | 'maison' | 'tel' | 'check' | 'cr' | 'pin' | 'fleche' | 'etoile';
function Picto({ n, t = 16, plein }: { n: NomPicto; t?: number; plein?: boolean }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill={plein ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {n === 'cal' && <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>}
      {n === 'fiche' && <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>}
      {n === 'croix' && <path d="M6 6l12 12M18 6 6 18" />}
      {n === 'maison' && <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>}
      {n === 'tel' && <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />}
      {n === 'check' && <path d="M5 12.5l4.2 4.2L19 7" />}
      {n === 'cr' && <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>}
      {n === 'pin' && <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>}
      {n === 'fleche' && <path d="m9 6 6 6-6 6" />}
      {n === 'etoile' && <path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />}
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

/* ═══ La carte d'une visite (V3.135, maquette A) ═══════════════════════════
   Alexandre : « j'aime bien la première… quand on clique sur le nom de la
   personne, ça renvoie sur la fiche de l'acheteur ; quand on clique sur le
   bien, sur la photo du bien… ça arrive sur la fiche du bien ». La date en
   grand à gauche, l'heure dedans ; la pastille dit QUAND (« Demain », « Il y
   a 2 jours ») puisque le titre de la section dit déjà où en est la visite.
   Les boutons font exactement ce qu'ils faisaient : compte rendu (la fenêtre
   de la fiche), annulation (src/lib/annuler-visites.ts), rappel au client. */
type Groupe = 'a_faire' | 'a_venir' | 'effectuee';

/* Le nombre de jours entre la visite et aujourd'hui (à Paris) : 0 aujourd'hui, 1 demain, -1 hier. */
function ecartJours(dateVisite: string, auj: string): number {
  const [a, m, j] = String(dateVisite).slice(0, 10).split('-').map(Number);
  const [A, M, J] = auj.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, j) - Date.UTC(A, M - 1, J)) / 86400000);
}
function quandRelatif(e: number): string {
  if (e === 0) return 'Aujourd’hui';
  if (e === 1) return 'Demain';
  if (e === -1) return 'Hier';
  return e > 1 ? `Dans ${e} jours` : `Il y a ${-e} jours`;
}

/* Les visites d'un même client le même jour, ensemble (dans l'ordre de la
   liste ; à l'intérieur d'une journée, par heure). Sans regroupement, une
   visite par paquet. */
function parJournee(liste: any[], regrouper: boolean): any[][] {
  if (!regrouper) return liste.map(v => [v]);
  const paquets = new Map<string, any[]>();
  for (const v of liste) {
    const cle = v.date_visite ? `${v.clients?.id || v.client_id}|${String(v.date_visite).slice(0, 10)}` : `seule|${v.id}`;
    const p = paquets.get(cle);
    if (p) p.push(v); else paquets.set(cle, [v]);
  }
  const h = (v: any) => (v.heure ? String(v.heure).slice(0, 5) : '99:99');
  return [...paquets.values()].map(p => p.sort((a, b) => h(a).localeCompare(h(b))));
}

function Etoiles({ n }: { n: number }) {
  return (
    <span className={cv.etoiles} aria-label={`${n} sur 5`}>
      {[0, 1, 2, 3, 4].map(k => <span key={k} className={k < n ? cv.on : undefined}><Picto n="etoile" t={14} plein={k < n} /></span>)}
      <small>{`${n}/5`}</small>
    </span>
  );
}

function CarteVisite({ v, groupe, auj, rang, onClient, onBien, onCR, onAnnuler, onRappel }: {
  v: any; groupe: Groupe; auj: string; rang: number;
  onClient: () => void; onBien: () => void; onCR: () => void; onAnnuler: () => void; onRappel: () => void;
}) {
  const ton = groupe === 'a_faire' ? { date: cv.dateAfaire, past: cv.pastAfaire } : groupe === 'a_venir' ? { date: cv.dateAvenir, past: cv.pastAvenir } : { date: cv.dateFaite, past: cv.pastFaite };
  const iso = v.date_visite ? String(v.date_visite).slice(0, 10) : '';
  const d = iso ? new Date(`${iso}T12:00:00Z`) : null;
  const jourSem = d ? d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }) : '';
  const mois = d ? d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }) : '';
  const annee = iso && iso.slice(0, 4) !== auj.slice(0, 4) ? ` ${iso.slice(0, 4)}` : '';
  const heure = /^\d{2}:\d{2}/.test(String(v.heure || '')) ? String(v.heure).slice(0, 5) : '';
  const nom = `${v.clients?.prenom || ''} ${v.clients?.nom || ''}`.trim() || 'Client';
  const prenom = v.clients?.prenom || 'Le client';
  const photo = v.biens?.photos?.[0];
  const lieu = [v.biens?.quartier, v.biens?.ville].filter(Boolean).join(', ');
  const issue = groupe === 'effectuee' ? issueDe(v) : null;
  const repondu = groupe === 'a_faire' && v.avis_client_le && v.issue && ISSUES[v.issue as Issue] ? ISSUES[v.issue as Issue] : null;
  const motifs: string[] = Array.isArray(v.motifs) ? v.motifs : [];
  const aime: string[] = Array.isArray(v.aime) ? v.aime : [];
  return (
    <div className={cv.carte} style={{ animationDelay: `${Math.min(rang, 6) * 40}ms` }}>
      <div className={`${cv.date} ${ton.date}`}>
        {d ? <><small>{jourSem}</small><b>{d.getUTCDate()}</b><small>{`${mois}${annee}`}</small></> : <small>Sans date</small>}
        {heure && <em>{heure}</em>}
      </div>

      <div className={cv.milieu}>
        <div className={cv.qui}>
          <button type="button" className={cv.nom} onClick={onClient} title={`Ouvrir la fiche de ${nom}`}>
            {v.clients && <AvatarContact c={v.clients} teinte={{ bg: '#eef2f8', fg: '#34496e' }} taille={34} />}
            <b>{nom}</b>
          </button>
          {iso && <span className={`${cv.past} ${ton.past}`}><i />{quandRelatif(ecartJours(iso, auj))}</span>}
        </div>

        <button type="button" className={cv.bien} onClick={onBien} title="Ouvrir la fiche du bien">
          {photo
            ? <img src={photo} alt="" className={cv.photo} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
            : <span className={`${cv.photo} ${cv.photoVide}`}><Picto n="maison" t={22} /></span>}
          <span className={cv.bienTx}>
            <b>{v.biens?.titre || lieu || 'Bien'}</b>
            {lieu && <small><Picto n="pin" t={13} />{lieu}</small>}
          </span>
          <span className={cv.fleche}><Picto n="fleche" t={18} /></span>
        </button>

        <div className={cv.meta}>
          {v.contact_agence && <span className={cv.m}><Picto n="tel" t={14} />{v.contact_agence}</span>}
          {groupe === 'a_venir' && v.rappel_envoye_le && <span className={`${cv.m} ${cv.vert}`}><Picto n="check" t={14} />{libelleRappel(v.rappel_envoye_le)}</span>}
        </div>

        {/* Le client a déjà répondu dans son espace : le compte rendu part de là. */}
        {repondu && (
          <div className={cv.bulle}>
            <small>{`${prenom}, dans son espace`}</small>
            <b>{`A répondu : ${repondu.crm}`}</b>
            {v.prix_envisage ? `, autour de ${Number(v.prix_envisage).toLocaleString('fr-FR')} €` : ''}
            {v.mot_client ? <div>{`« ${v.mot_client} »`}</div> : null}
            {motifs.length > 0 && <div className={cv.avis}>{motifs.map(m => <span key={m} className={`${cv.puce} ${v.issue === 'non' ? cv.puceNon : ''}`}>{m}</span>)}</div>}
          </div>
        )}

        {/* Ce que la visite a donné */}
        {groupe === 'effectuee' && (issue || v.note_etoiles > 0 || motifs.length > 0 || aime.length > 0) && (
          <div className={cv.avis}>
            {issue && (
              <span className={cv.issue} style={{ color: ISSUES[issue].couleur, background: ISSUES[issue].fond, borderColor: ISSUES[issue].trait }}>
                {issue === 'offre' && v.biens?.badge_retour === 'offre_faite' ? 'Offre faite' : ISSUES[issue].crm}
              </span>
            )}
            {v.note_etoiles > 0 && <Etoiles n={Math.min(5, Number(v.note_etoiles))} />}
            {motifs.map(m => <span key={`m-${m}`} className={`${cv.puce} ${issue === 'non' ? cv.puceNon : ''}`}>{m}</span>)}
            {aime.map(m => <span key={`a-${m}`} className={`${cv.puce} ${cv.puceAime}`}>{m}</span>)}
          </div>
        )}
        {groupe === 'effectuee' && v.mot_client && <div className={cv.bulle}><small>{`${prenom}, dans son espace`}</small>{v.mot_client}</div>}
        {groupe === 'effectuee' && v.commentaire && <div className={cv.note}><Picto n="cr" t={14} /><span>{v.commentaire}</span></div>}
      </div>

      <div className={cv.actions}>
        {groupe === 'a_faire' && <>
          <button type="button" className={`${cv.btn} ${cv.btnOr}`} onClick={onCR}><Picto n="cr" t={15} /><span>Faire le compte rendu</span></button>
          <button type="button" className={cv.btn} onClick={onClient}><Picto n="fiche" t={15} /><span>Voir sa fiche</span></button>
          <button type="button" className={`${cv.btn} ${cv.btnDiscret}`} onClick={onAnnuler}><Picto n="croix" t={14} /><span>Annuler</span></button>
        </>}
        {groupe === 'a_venir' && <>
          <button type="button" className={`${cv.btn} ${cv.btnBleu}`} onClick={onCR}><Picto n="check" t={15} /><span>Effectuée</span></button>
          <button type="button" className={`${cv.btn} ${v.rappel_envoye_le ? '' : cv.btnRappel}`} onClick={onRappel}><Enveloppe /><span>{v.rappel_envoye_le ? 'Renvoyer le rappel' : 'Envoyer le rappel'}</span></button>
          <button type="button" className={`${cv.btn} ${cv.btnDiscret}`} onClick={onAnnuler}><Picto n="croix" t={14} /><span>Annuler</span></button>
        </>}
        {groupe === 'effectuee' && (
          <button type="button" className={cv.btn} onClick={onClient}><Picto n="fiche" t={15} /><span>Voir sa fiche</span></button>
        )}
      </div>
    </div>
  );
}

/* ═══ Plusieurs visites du même client le même jour (V3.135) ═════════════
   Alexandre : « s'il y a plusieurs visites pour la même personne… le nom de
   la personne et en dessous plusieurs lignes du bien ». Une seule carte : la
   date et le nom une fois, une ligne par bien avec son heure, sa photo et ses
   propres boutons ; le rappel une fois (il regroupe déjà toutes les visites
   du jour, voir ModaleRappelVisite). Les jours différents restent séparés. */
function CarteJournee({ visites, groupe, auj, rang, onClient, onBien, onCR, onAnnuler, onRappel }: {
  visites: any[]; groupe: 'a_faire' | 'a_venir'; auj: string; rang: number;
  onClient: () => void; onBien: (v: any) => void; onCR: (v: any) => void; onAnnuler: (v: any) => void; onRappel: () => void;
}) {
  const v0 = visites[0];
  const ton = groupe === 'a_faire' ? { date: cv.dateAfaire, past: cv.pastAfaire } : { date: cv.dateAvenir, past: cv.pastAvenir };
  const iso = String(v0.date_visite).slice(0, 10);
  const d = new Date(`${iso}T12:00:00Z`);
  const annee = iso.slice(0, 4) !== auj.slice(0, 4) ? ` ${iso.slice(0, 4)}` : '';
  const nom = `${v0.clients?.prenom || ''} ${v0.clients?.nom || ''}`.trim() || 'Client';
  const prenom = v0.clients?.prenom || 'Le client';
  const rappel = groupe === 'a_venir' ? visites.map(v => v.rappel_envoye_le).filter(Boolean).sort().pop() : null;
  return (
    <div className={`${cv.carte} ${cv.journee}`} style={{ animationDelay: `${Math.min(rang, 6) * 40}ms` }}>
      <div className={`${cv.date} ${ton.date}`}>
        <small>{d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' })}</small>
        <b>{d.getUTCDate()}</b>
        <small>{`${d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })}${annee}`}</small>
        <em>{`${visites.length} visites`}</em>
      </div>

      <div className={cv.milieu}>
        <div className={cv.qui}>
          <button type="button" className={cv.nom} onClick={onClient} title={`Ouvrir la fiche de ${nom}`}>
            {v0.clients && <AvatarContact c={v0.clients} teinte={{ bg: '#eef2f8', fg: '#34496e' }} taille={34} />}
            <b>{nom}</b>
          </button>
          <span className={`${cv.past} ${ton.past}`}><i />{quandRelatif(ecartJours(iso, auj))}</span>
        </div>

        <div className={cv.lignes}>
          {visites.map(v => {
            const heure = /^\d{2}:\d{2}/.test(String(v.heure || '')) ? String(v.heure).slice(0, 5) : '';
            const photo = v.biens?.photos?.[0];
            const lieu = [v.biens?.quartier, v.biens?.ville].filter(Boolean).join(', ');
            const repondu = groupe === 'a_faire' && v.avis_client_le && v.issue && ISSUES[v.issue as Issue] ? ISSUES[v.issue as Issue] : null;
            return (
              <div key={v.id} className={cv.ligne}>
                <span className={cv.heureL}>{heure || '—'}</span>
                <button type="button" className={cv.bien} onClick={() => onBien(v)} title="Ouvrir la fiche du bien">
                  {photo
                    ? <img src={photo} alt="" className={cv.photo} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                    : <span className={`${cv.photo} ${cv.photoVide}`}><Picto n="maison" t={22} /></span>}
                  <span className={cv.bienTx}>
                    <b>{v.biens?.titre || lieu || 'Bien'}</b>
                    {lieu && <small><Picto n="pin" t={13} />{lieu}</small>}
                    {v.contact_agence && <small><Picto n="tel" t={13} />{v.contact_agence}</small>}
                  </span>
                  <span className={cv.fleche}><Picto n="fleche" t={18} /></span>
                </button>
                <div className={cv.actL}>
                  {groupe === 'a_faire'
                    ? <button type="button" className={`${cv.btn} ${cv.btnOr} ${cv.btnPetit}`} onClick={() => onCR(v)}><Picto n="cr" t={14} /><span>Compte rendu</span></button>
                    : <button type="button" className={`${cv.btn} ${cv.btnBleu} ${cv.btnPetit}`} onClick={() => onCR(v)}><Picto n="check" t={14} /><span>Effectuée</span></button>}
                  <button type="button" className={`${cv.btn} ${cv.btnDiscret} ${cv.btnPetit}`} onClick={() => onAnnuler(v)} aria-label={`Annuler la visite de ${heure || 'ce bien'}`} title="Annuler cette visite"><Picto n="croix" t={14} /><span className={cv.surTel}>Annuler</span></button>
                </div>
                {repondu && (
                  <div className={`${cv.bulle} ${cv.ligneBulle}`}>
                    <small>{`${prenom}, dans son espace`}</small>
                    <b>{`A répondu : ${repondu.crm}`}</b>
                    {v.prix_envisage ? `, autour de ${Number(v.prix_envisage).toLocaleString('fr-FR')} €` : ''}
                    {v.mot_client ? <div>{`« ${v.mot_client} »`}</div> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {rappel && <div className={cv.meta}><span className={`${cv.m} ${cv.vert}`}><Picto n="check" t={14} />{libelleRappel(rappel)}</span></div>}
      </div>

      <div className={cv.actions}>
        {groupe === 'a_venir' && (
          <button type="button" className={`${cv.btn} ${rappel ? '' : cv.btnRappel}`} onClick={onRappel}><Enveloppe /><span>{rappel ? 'Renvoyer le rappel' : 'Envoyer le rappel'}</span></button>
        )}
        <button type="button" className={cv.btn} onClick={onClient}><Picto n="fiche" t={15} /><span>Voir sa fiche</span></button>
      </div>
    </div>
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
        .select('*, clients(*), biens(titre, ville, quartier, photos, badge_retour, bien_vente_id)')
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
  /* V3.135 — Le nom ouvre la fiche de l'acheteur, sur ses visites. Le bien
     ouvre sa fiche : celle du mandat quand c'est un bien de l'agence ; sinon
     la fiche de l'acheteur, descendue jusqu'au bien dans ses biens présentés
     (c'est là que vit un bien trouvé ailleurs). La fiche se charge entière
     (ficheClient) : la ligne de la visite n'a pas tout ce qu'il lui faut. */
  async function allerFiche(clientId: string) {
    try { onNavigate('fiche', await ficheClient(clientId)); } catch (e) { alert((e as Error).message); }
  }
  function ouvrirClient(v: any) {
    const id = v.clients?.id || v.client_id;
    if (!id) return;
    demanderOuvertureFiche({ clientId: id, onglet: 'visites', rechercheId: v.recherche_id || null });
    void allerFiche(id);
  }
  function ouvrirBien(v: any) {
    if (v.biens?.bien_vente_id) { onNavigate('biens', { bien: v.biens.bien_vente_id }); return; }
    const id = v.clients?.id || v.client_id;
    if (!id) return;
    demanderOuvertureFiche({ clientId: id, onglet: 'presentes', rechercheId: v.recherche_id || null, bienId: v.bien_id || undefined });
    void allerFiche(id);
  }
  const aujParis = maintenantParis(maintenant).slice(0, 10);

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
        label="Filtrer les visites" aCheval actif={filtre} onChoisir={(c: string) => setFiltre(c as typeof filtre)}
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

          {/* COMPTE RENDU À FAIRE, À VENIR, EFFECTUÉES — la même carte (V3.135, maquette A) */}
          {([
            { id: 'a_faire' as const, groupe: 'a_faire' as Groupe, liste: aFaire, titre: 'Compte rendu à faire', c: '#b45309', point: '#f59e0b' },
            { id: 'a_venir' as const, groupe: 'a_venir' as Groupe, liste: aVenir, titre: 'À venir', c: '#2563eb', point: '#3b82f6' },
            { id: 'effectuees' as const, groupe: 'effectuee' as Groupe, liste: effectuees, titre: 'Effectuées', c: '#0f9f6e', point: '#10b981' },
          ]).filter(g => g.liste.length > 0 && montrer(g.id)).map(g => (
            <div key={g.id}>
              <div style={{ fontSize: 11, fontWeight: 800, color: g.c, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.point, display: 'inline-block' }}></span>
                {`${g.titre} — ${g.liste.length}`}
              </div>
              <div className={cv.liste}>
                {parJournee(g.liste, g.groupe !== 'effectuee').map((l, k) => l.length > 1 && g.groupe !== 'effectuee' ? (
                  <CarteJournee key={l[0].id} visites={l} groupe={g.groupe} auj={aujParis} rang={k}
                    onClient={() => ouvrirClient(l[0])} onBien={v => ouvrirBien(v)}
                    onCR={v => openCR(v.id)} onAnnuler={v => { void annuler(v.id); }} onRappel={() => setRappelDe(l[0].id)} />
                ) : (
                  <CarteVisite key={l[0].id} v={l[0]} groupe={g.groupe} auj={aujParis} rang={k}
                    onClient={() => ouvrirClient(l[0])} onBien={() => ouvrirBien(l[0])}
                    onCR={() => openCR(l[0].id)} onAnnuler={() => { void annuler(l[0].id); }} onRappel={() => setRappelDe(l[0].id)} />
                ))}
              </div>
            </div>
          ))}

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
