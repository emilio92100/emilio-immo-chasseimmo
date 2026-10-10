'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { verifie } from '@/lib/ecritures';
import { ISSUES, issueDe, apprisDe, visitePassee, type Issue } from '@/lib/visites';
import { type EtatBon } from '@/components/documents/BonDeVisite';
import Curseur from '@/components/shared/Curseur';
import Cascade from '@/components/shared/Cascade';
import Depliant from '@/components/shared/Depliant';
import s from './OngletVisites.module.css';

/* ═══ Onglet Visites de la fiche client ═══════════════════════════════════
   V3.169 — « Le fil des visites » (maquette A, choisie par Alexandre le
   10 octobre 2026 : « ça fait un peu bas de gamme… le commentaire n'est pas
   assez mis en avant, il n'y a pas de photo du bien »).

   · Une barre de filtres où la pastille glisse (Curseur) : Compte rendu à
     faire · À venir · Il/Elle y pense · Pas pour lui/elle · (Sans issue) ·
     Toutes, au bout. À l'arrivée : « Compte rendu à faire » s'il en reste,
     sinon « À venir », sinon « Toutes ». Avant, quatre compteurs qui ne
     menaient nulle part (« quand on clique sur Non abouti, il n'y a rien »).
   · « Ce que la veille retient » (l'ancien « Ce que ses visites ont
     appris », que personne ne comprenait) : ce qu'il écarte, ce qu'il aime —
     la recherche le relit avant chaque passage.
   · Le fil : la date à gauche, la carte à droite, sa photo qui se fond dans
     le texte. Ton compte rendu en grand dans l'encadré doré ; ce que le
     client a dit dans son espace dans la bulle bleue.
   · Le bon de visite : sur une visite à venir, « Préparer » ou « à faire
     signer » ; sur une visite faite, seulement son état s'il existe (« Bon
     de visite signé »). Avant, le bouton s'affichait sur une visite faite
     sans bon et en créait un — Alexandre : « aucun rapport ».
   · « Caler la 2e visite » (À revoir) : la fenêtre du rendez-vous s'ouvre,
     le client et le bien déjà choisis (`onDeuxieme`). */

type Filtre = 'afaire' | 'avenir' | 'pense' | 'non' | 'sans' | 'toutes';

const COULEUR_ISSUE: Record<Issue, string> = { offre: '#a9822f', revoir: '#2563eb', reflexion: '#475569', non: '#b4532a' };

const enDate = (d?: string | null) => {
  if (!d) return null;
  const x = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  return isNaN(x.getTime()) ? null : x;
};
const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const heureDe = (v: any) => (/^\d{2}:\d{2}/.test(String(v.heure || '')) ? String(v.heure).slice(0, 5) : '');
const cleTri = (v: any) => `${String(v.date_visite || '').slice(0, 10)} ${heureDe(v) || '23:59'}`;
const euros = (n: number) => `${Math.round(Number(n)).toLocaleString('fr-FR')} €`;

/* Les mots qui changent avec la personne : Madame, Monsieur, un couple. */
function mots(civilite?: string | null, couple?: boolean) {
  if (couple) return { pense: 'Ils y pensent', pas: 'Pas pour eux', ecarte: 'Ils écartent', aime: 'Ils aiment', il: 'Ils' };
  if (civilite === 'Madame') return { pense: 'Elle y pense', pas: 'Pas pour elle', ecarte: 'Elle écarte', aime: 'Elle aime', il: 'Elle' };
  return { pense: 'Il y pense', pas: 'Pas pour lui', ecarte: 'Il écarte', aime: 'Il aime', il: 'Il' };
}

function Ic({ d, t = 16, e = 2 }: { d: ReactNode; t?: number; e?: number }) {
  return <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={e} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
}
const IC = {
  agenda: <><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M12 13.5v4" /><path d="M10 15.5h4" /></>,
  loupe: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /><path d="M8.5 11h5" /><path d="M11 8.5v5" /></>,
  croix: <path d="M6 6l12 12M18 6 6 18" />,
  oeil: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  euro: <><path d="M17 6.5A7 7 0 1 0 17 17.5" /><path d="M4 10h9" /><path d="M4 14h9" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6" /><path d="M14 9v6" /></>,
  plume: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  bon: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 14h6" /></>,
  bonOk: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="m9 14.5 2.2 2.2L15.5 12" /></>,
  tel: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  maison: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  personne: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  horloge: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};
const IC_ISSUE: Record<Issue, ReactNode> = { offre: IC.euro, revoir: IC.oeil, reflexion: IC.pause, non: IC.croix };

export default function OngletVisites({ visites, biens, prenom, civilite, couple, masques, rechercheId, onCompteRendu, onAnnuler, onRecharger, onMasques, onOrganiser, onBon, bonEnCours, bonEtat, onDeuxieme }: {
  visites: any[]; biens: any[]; prenom: string; masques: string[]; rechercheId: string;
  /* V3.169 : pour accorder « Elle y pense », « Pas pour lui »… */
  civilite?: string | null; couple?: boolean;
  onCompteRendu: (v: any) => void; onAnnuler: (v: any) => void;
  onRecharger: () => void; onMasques: () => void;
  /* V3.134 : « Organiser une visite », le client déjà choisi. */
  onOrganiser?: () => void;
  /* V3.154 : le bon de visite, prérempli (BonDeVisite.tsx) ; `bonEnCours` :
     la visite dont le bon se prépare. */
  onBon?: (v: any) => void; bonEnCours?: string | null;
  /* Où en est le bon de chaque visite. */
  bonEtat?: (v: any) => EtatBon | null;
  /* V3.169 : « Caler la 2e visite » — le rendez-vous, ce bien déjà choisi. */
  onDeuxieme?: (v: any) => void;
}) {
  const [choisi, setChoisi] = useState<Filtre | null>(null);
  const [deplace, setDeplace] = useState<string | null>(null);
  const m = mots(civilite, couple);
  const qui = prenom || 'Le client';
  const maintenant = new Date();

  const vivantes = visites.filter(v => v.statut === 'a_venir' || v.statut === 'effectuee');
  const bienDe = (v: any) => biens.find(b => b.id === v.bien_id);
  const titreDe = (v: any) => { const b = bienDe(v); return b?.titre || [b?.quartier, b?.ville].filter(Boolean).join(', ') || 'Bien non renseigné'; };
  /* Une 2e visite : une autre visite du même bien, plus ancienne, a eu lieu ou était calée. */
  const revisite = (v: any) => vivantes.some(x => x.id !== v.id && x.bien_id === v.bien_id && cleTri(x) < cleTri(v));

  const aVenir = vivantes.filter(v => v.statut === 'a_venir').sort((a, b) => cleTri(a).localeCompare(cleTri(b)));
  const aFaire = aVenir.filter(v => visitePassee(v, maintenant));
  const prochaines = aVenir.filter(v => !visitePassee(v, maintenant));
  const faites = vivantes.filter(v => v.statut === 'effectuee').sort((a, b) => cleTri(b).localeCompare(cleTri(a)));
  const retenues = faites.filter(v => { const i = issueDe(v); return i === 'offre' || i === 'revoir' || i === 'reflexion'; });
  const nonAbouties = faites.filter(v => issueDe(v) === 'non');
  const sansIssue = faites.filter(v => !issueDe(v));
  const appris = apprisDe(visites, masques);

  /* À l'arrivée : ce qui attend un geste d'abord. Un filtre choisi à la main
     reste, sauf s'il n'existe plus (« Sans issue » vidé). */
  const defaut: Filtre = aFaire.length ? 'afaire' : prochaines.length ? 'avenir' : 'toutes';
  const filtre: Filtre = choisi && !(choisi === 'sans' && !sansIssue.length) ? choisi : defaut;

  /* V3.50 : vérifiées ligne à ligne (AGENTS §3.2) — la base fermée peut
     refuser sans erreur, et l'écran faisait comme si c'était enregistré. */
  async function masquer(t: string) {
    const l = Array.from(new Set([...(masques || []), t]));
    if (!(await verifie('La ligne retirée', supabase.from('recherches').update({ appris_masques: l }).eq('id', rechercheId).select('id'), { ligne: true }))) return;
    onMasques();
  }
  async function toutReafficher() {
    if (!(await verifie('Les lignes réaffichées', supabase.from('recherches').update({ appris_masques: [] }).eq('id', rechercheId).select('id'), { ligne: true }))) return;
    onMasques();
  }
  /* Une visite modifiée sur place (date, heure, contact). */
  async function modifier(id: string, quoi: string, champs: Record<string, string | null>) {
    await verifie(quoi, supabase.from('visites').update(champs).eq('id', id).select('id'), { ligne: true });
  }

  const boutonOrganiser = onOrganiser ? (
    <button type="button" className={`${s.organiser} fc-organiser`} onClick={onOrganiser}>
      <span style={{ color: '#e3c872', display: 'flex' }}><Ic d={IC.agenda} t={16} e={2.2} /></span>Organiser une visite
    </button>
  ) : null;

  if (vivantes.length === 0) {
    return (
      <div className={s.onglet}>
        <div className={s.vide}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 16, color: '#13243d', marginBottom: 4 }}>Aucune visite</div>
          <div style={{ marginBottom: onOrganiser ? 14 : 0 }}>{visites.length > 0 ? 'Les visites annulées ne s’affichent plus ici.' : 'Ses biens ou tes biens en vente : tu les cherches par le prix, l’adresse ou le propriétaire.'}</div>
          {boutonOrganiser}
        </div>
      </div>
    );
  }

  /* « À revoir » : la 2e visite est-elle déjà calée ? */
  const suivante = (v: any) => prochaines.find(x => x.bien_id === v.bien_id && cleTri(x) > cleTri(v)) || null;

  /* Le bon de visite : un état, ou un geste sur une visite pas encore faite. */
  const bonUi = (v: any, faite: boolean) => {
    if (!onBon) return null;
    const e = bonEtat?.(v) ?? null;
    const enCours = bonEnCours === v.id;
    if (e === 'signe') {
      return <button type="button" className={`${s.bon} ${s.bonSigne}`} onClick={() => onBon(v)} disabled={enCours} title="Ouvrir le bon de visite signé"><Ic d={IC.bonOk} t={15} e={2.1} />{enCours ? 'Ouverture…' : 'Bon de visite signé'}</button>;
    }
    if (e === 'pret' || e === 'brouillon') {
      return <button type="button" className={`${s.bon} ${s.bonASigner}`} onClick={() => onBon(v)} disabled={enCours}><Ic d={IC.bon} t={14} e={2.1} />{enCours ? 'Ouverture…' : faite ? 'Bon de visite pas encore signé' : 'Bon de visite prêt, à faire signer'}</button>;
    }
    if (faite) return null;
    return <button type="button" className={`${s.bon} ${s.bonPreparer}`} onClick={() => onBon(v)} disabled={enCours} title="Le bon de visite, prérempli avec le client et le bien"><Ic d={IC.bon} t={14} e={2.1} />{enCours ? 'Préparation…' : 'Préparer le bon de visite'}</button>;
  };

  /* Ce que le client a répondu dans son espace (une visite dont la date est passée). */
  const reponse = (v: any) => {
    if (!v.avis_client_le || !v.issue || !ISSUES[v.issue as Issue]) return null;
    const i = v.issue as Issue;
    const le = new Date(v.avis_client_le);
    return (
      <div className={s.mot}>
        <span className={s.motIc}>{(prenom || '?').charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0 }}>
          <div className={s.motLib}>{`${qui} a répondu dans son espace · ${le.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}</div>
          <div className={s.motTexte}>
            {`${ISSUES[i].crm}${v.prix_envisage ? `, autour de ${euros(v.prix_envisage)}` : ''}.`}
            {v.mot_client ? <small>{`« ${v.mot_client} »`}</small> : null}
          </div>
          {v.motifs?.length ? <div className={s.raisons} style={{ marginTop: 6 }}>{v.motifs.map((x: string) => <span key={x} className={`${s.raison} ${i === 'non' ? s.raisonNon : s.raisonNeutre}`}>{x}</span>)}</div> : null}
        </div>
      </div>
    );
  };

  const carte = (v: any, genre: 'afaire' | 'venir' | 'faite') => {
    const b = bienDe(v);
    const d = enDate(v.date_visite);
    const h = heureDe(v);
    const i = genre === 'faite' ? issueDe(v) : null;
    const offreFaite = b?.badge_retour === 'offre_faite';
    const photo = Array.isArray(b?.photos) ? b.photos.find(Boolean) : null;
    const contact = v.contact_agence || b?.agence_nom || '';
    const deux = revisite(v);
    const jours = d ? Math.round((d.getTime() - new Date(new Date().toDateString()).getTime() - 12 * 3600_000) / 86_400_000) : null;
    const dans = jours === null ? '' : jours <= 0 ? 'Aujourd’hui' : jours === 1 ? 'Demain' : `Dans ${jours} jours`;
    const suite = i === 'revoir' ? suivante(v) : null;
    const suiteD = suite ? enDate(suite.date_visite) : null;
    const details = [b?.surface ? `${String(b.surface).replace('.', ',')} m²` : '', b?.nb_pieces ? `${b.nb_pieces} p.` : '', b?.prix_acquereur ? euros(b.prix_acquereur) : ''].filter(Boolean).join(' · ');

    /* L'étiquette posée sur la photo. */
    const etiquette = genre === 'afaire'
      ? { t: 'Compte rendu à faire', c: '#d97706', ic: IC.plume }
      : i ? { t: i === 'non' ? m.pas : i === 'offre' && offreFaite ? 'Offre faite' : ISSUES[i].crm, c: COULEUR_ISSUE[i], ic: IC_ISSUE[i] } : null;

    const sous = genre === 'faite'
      ? <>{contact ? `Visité avec ${contact}` : 'Visité'}{i === 'revoir' ? <>{' · '}<b style={{ color: '#1d4ed8' }}>{suiteD ? `2e visite le ${suiteD.getDate()} ${suiteD.toLocaleDateString('fr-FR', { month: 'short' })}` : '2e visite à caler'}</b></> : null}{i === 'offre' && v.prix_envisage && !offreFaite ? ` · autour de ${euros(v.prix_envisage)}` : ''}</>
      : details || (contact ? `Avec ${contact}` : '');

    return (
      <div key={v.id} className={s.fil}>
        <div className={`${s.date} ${genre === 'venir' ? s.dateVenir : genre === 'afaire' ? s.dateAlerte : ''}`}>
          {d ? (
            <>
              <div className={s.dateJ}>{d.toLocaleDateString('fr-FR', { weekday: 'long' })}</div>
              <div className={s.dateN}>{d.getDate()}</div>
              <div className={s.dateM}>{d.toLocaleDateString('fr-FR', { month: 'long' })}</div>
              {h && <div className={s.dateH}>{h}</div>}
            </>
          ) : <div className={s.dateN}>—</div>}
        </div>
        <article className={`${s.carte} ${genre === 'venir' ? s.carteVenir : genre === 'afaire' ? s.carteAlerte : ''}`}>
          <div className={`${s.photo} ${i === 'non' ? s.photoFanee : ''}`}>
            {photo ? <img src={photo} alt={titreDe(v)} loading="lazy" /> : <span className={s.sansPhoto}><Ic d={IC.maison} t={34} e={1.6} /></span>}
            {etiquette && <span className={s.etiquette} style={{ background: etiquette.c }}><Ic d={etiquette.ic} t={13} e={2.6} />{etiquette.t}</span>}
            {d && <span className={s.datePhoto}>{`${maj(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))}${h ? ` · ${h}` : ''}`}</span>}
          </div>
          <div className={s.corps}>
            <div className={s.tete}>
              <div className={s.titre}>
                <h3>{titreDe(v)}</h3>
                {sous ? <p>{sous}</p> : null}
              </div>
              {genre === 'venir' && dans && <span className={`${s.badge} ${s.badgeBleu}`}>{dans}</span>}
              {genre !== 'faite' && deux && <span className={`${s.badge} ${s.badgeGris}`}>2e visite</span>}
            </div>

            {genre === 'afaire' && reponse(v)}

            {genre !== 'faite' && (contact || b?.agence_tel) && (
              <div className={s.agent}>
                <span className={s.agentIc}><Ic d={IC.personne} t={17} e={2} /></span>
                <div className={s.agentTx}>
                  <b>{contact || 'L’agence'}</b>
                  {b?.adresse ? <><br /><span>{b.adresse}</span></> : null}
                </div>
                {b?.agence_tel && <a className={s.btn} href={`tel:${String(b.agence_tel).replace(/[^\d+]/g, '')}`}><Ic d={IC.tel} t={15} e={2.1} />Appeler</a>}
              </div>
            )}

            {genre === 'faite' && v.mot_client ? (
              <div className={s.mot}>
                <span className={s.motIc}>{(prenom || '?').charAt(0).toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div className={s.motLib}>{`${qui}, dans son espace`}</div>
                  <div className={s.motTexte}>{`« ${v.mot_client} »`}</div>
                </div>
              </div>
            ) : null}

            {genre === 'faite' && v.commentaire ? (
              <div className={s.cr}>
                <div className={s.crLib}>Ton compte rendu</div>
                <div className={s.crTexte}>{v.commentaire}</div>
              </div>
            ) : null}

            {genre === 'faite' && v.motifs?.length ? (
              <div className={s.raisons}>
                <span>{i === 'non' ? 'Ses raisons :' : 'À vérifier :'}</span>
                {v.motifs.map((x: string) => <span key={x} className={`${s.raison} ${i === 'non' ? s.raisonNon : s.raisonNeutre}`}>{x}</span>)}
              </div>
            ) : null}
            {genre === 'faite' && v.aime?.length ? (
              <div className={s.raisons}>
                <span>Ce qui a plu :</span>
                {v.aime.map((x: string) => <span key={x} className={`${s.raison} ${s.raisonOui}`}>{x}</span>)}
              </div>
            ) : null}
            {genre === 'faite' && v.retenir === false && i === 'non' ? <div style={{ fontSize: 12, color: '#94a3b8' }}>Ne compte pas pour la recherche.</div> : null}

            {genre !== 'faite' && (
              <Depliant ouvert={deplace === v.id} ecart={12}>
                <div className={s.deplacer}>
                  <label>Date<input type="date" defaultValue={String(v.date_visite || '').split('T')[0]} onChange={async e => { await modifier(v.id, 'La date de la visite', { date_visite: e.target.value || null }); onRecharger(); }} /></label>
                  <label style={{ flex: '0 1 120px' }}>Heure<input type="time" defaultValue={v.heure || ''} onChange={async e => { await modifier(v.id, 'L’heure de la visite', { heure: e.target.value || null }); }} /></label>
                  <label style={{ flex: '2 1 180px' }}>Contact<input placeholder="Contact agence" defaultValue={v.contact_agence || ''} onBlur={async e => { if (e.target.value !== (v.contact_agence || '')) await modifier(v.id, 'Le contact de la visite', { contact_agence: e.target.value || null }); }} /></label>
                </div>
              </Depliant>
            )}

            <div className={s.pied}>
              {genre === 'afaire' && <button type="button" className={`${s.btn} ${s.btnPlein}`} onClick={() => onCompteRendu(v)}><Ic d={IC.plume} t={14} e={2.2} />Faire le compte rendu</button>}
              {bonUi(v, genre === 'faite')}
              {genre === 'faite' && <span className={s.etoiles}>{v.note_etoiles ? <>{'★'.repeat(v.note_etoiles)}<span>{'★'.repeat(Math.max(0, 5 - v.note_etoiles))}</span></> : null}</span>}
              <span className={s.ressort} />
              {genre === 'venir' && <button type="button" className={s.btn} onClick={() => onCompteRendu(v)}>Visite faite</button>}
              {genre !== 'faite' && <button type="button" className={`${s.btn} ${s.btnTexte}`} onClick={() => setDeplace(x => (x === v.id ? null : v.id))} aria-expanded={deplace === v.id}>{deplace === v.id ? 'Fermer' : 'Déplacer'}</button>}
              {genre !== 'faite' && <button type="button" className={`${s.btn} ${s.btnRouge}`} onClick={() => onAnnuler(v)} title="La visite ne se fera pas : elle sort de l’agenda et de l’espace du client">{genre === 'afaire' ? 'Pas eu lieu' : 'Annuler'}</button>}
              {genre === 'faite' && <button type="button" className={s.btn} onClick={() => onCompteRendu(v)}><Ic d={IC.plume} t={14} e={2.1} />{i ? 'Modifier le compte rendu' : 'Préciser l’issue'}</button>}
              {genre === 'faite' && i === 'revoir' && !suite && onDeuxieme && <button type="button" className={`${s.btn} ${s.btnBleu}`} onClick={() => onDeuxieme(v)}>Caler la 2e visite</button>}
            </div>
          </div>
        </article>
      </div>
    );
  };

  const section = (t: string, c: string, liste: any[], genre: 'afaire' | 'venir' | 'faite', phrase?: string) => (
    <div className={s.section} key={t}>
      <div className={s.sectionT}><b style={{ color: c }}>{t}</b><span /></div>
      {phrase && <p className={s.sectionP}>{phrase}</p>}
      {liste.map(v => carte(v, genre))}
    </div>
  );
  const rien = (t: string) => <div className={s.vide}>{t}</div>;

  const FILTRES: { k: Filtre; t: string; n: number; alerte?: boolean }[] = [
    { k: 'afaire', t: 'Compte rendu à faire', n: aFaire.length, alerte: aFaire.length > 0 },
    { k: 'avenir', t: 'À venir', n: prochaines.length },
    { k: 'pense', t: m.pense, n: retenues.length },
    { k: 'non', t: m.pas, n: nonAbouties.length },
    ...(sansIssue.length ? [{ k: 'sans' as Filtre, t: 'Sans issue', n: sansIssue.length }] : []),
  ];
  const bouton = (f: { k: Filtre; t: string; n: number; alerte?: boolean }) => (
    <button key={f.k} type="button" aria-pressed={filtre === f.k} onClick={() => setChoisi(f.k)}
      className={`${s.filtre} ${!f.n && f.k !== 'toutes' ? s.filtreVide : ''} ${f.alerte ? s.filtreAlerte : ''}`}>
      {f.t}<i>{f.n}</i>
    </button>
  );

  let contenu: ReactNode;
  if (filtre === 'afaire') {
    contenu = aFaire.length
      ? section('Compte rendu à faire', '#b45309', aFaire, 'afaire', 'La date est passée : dis comment ça s’est passé. Visite repoussée : change la date. Pas eu lieu : dis-le.')
      : rien('Tous les comptes rendus sont faits.');
  } else if (filtre === 'avenir') {
    contenu = prochaines.length ? section('À venir', '#22497c', prochaines, 'venir') : rien('Aucune visite à venir.');
  } else if (filtre === 'pense') {
    contenu = retenues.length
      ? section(m.pense, '#a9822f', retenues, 'faite', `${qui} veut faire une offre, revoir le bien ou réfléchit encore.`)
      : rien(`Aucune visite où ${qui} reste intéressé${civilite === 'Madame' ? 'e' : couple ? 's' : ''} pour l’instant.`);
  } else if (filtre === 'non') {
    contenu = nonAbouties.length
      ? section(m.pas, '#b4532a', nonAbouties, 'faite', 'Chaque raison nourrit « Ce que la veille retient ».')
      : rien('Aucune visite non aboutie.');
  } else if (filtre === 'sans') {
    contenu = section('Sans issue', '#64748b', sansIssue, 'faite', `Faites avant les issues, ou sans en choisir une. ${m.il} peut encore donner son avis dans son espace.`);
  } else {
    contenu = (
      <>
        {aFaire.length > 0 && section('Compte rendu à faire', '#b45309', aFaire, 'afaire')}
        {prochaines.length > 0 && section('À venir', '#22497c', prochaines, 'venir')}
        {faites.length > 0 && section('Déjà visités', '#64748b', faites, 'faite')}
      </>
    );
  }

  return (
    <div className={s.onglet}>
      <div className={s.barre}>
        <div className={s.rail} role="group" aria-label="Filtrer les visites" data-defile="">
          <Curseur cle={filtre} />
          {FILTRES.map(bouton)}
          <span className={s.sep} aria-hidden="true" />
          {bouton({ k: 'toutes', t: 'Toutes', n: vivantes.length })}
        </div>
        <span className={s.ressort} />
        {boutonOrganiser}
      </div>

      <div className={s.retient}>
        <span className={s.retientIc}><Ic d={IC.loupe} t={20} e={2} /></span>
        <div className={s.retientCorps}>
          <div>
            <div className={s.retientT}>Ce que la veille retient de ses visites</div>
            <div className={s.retientP}>
              {appris.eviter.length || appris.aime.length
                ? `Avant chaque recherche, la veille relit ce que ${qui} a dit de ses visites : elle écarte ce qui ne va pas et met en avant ce qui a plu. Une ligne qui ne vaut plus, tu la retires.`
                : `Rien encore. Les raisons de ses visites non abouties et ce qui lui a plu s’afficheront ici, et la veille s’en servira avant chaque recherche.`}
            </div>
          </div>
          {(appris.eviter.length > 0 || appris.aime.length > 0) && (
            <div className={s.retientLignes}>
              {appris.eviter.length > 0 && (
                <div className={s.retientGroupe}>
                  <span className={s.retientLib} style={{ color: '#b4532a' }}>{m.ecarte}</span>
                  {appris.eviter.map(x => (
                    <span key={x.t} className={`${s.puceRetient} ${s.ecarte}`}>
                      {x.t}<small>{`· ${x.n} visite${x.n > 1 ? 's' : ''}`}</small>
                      <button type="button" onClick={() => masquer(x.t)} aria-label={`Retirer « ${x.t} »`} title="Retirer : ne vaut plus pour la recherche"><Ic d={IC.croix} t={10} e={3} /></button>
                    </span>
                  ))}
                </div>
              )}
              {appris.aime.length > 0 && (
                <div className={s.retientGroupe}>
                  <span className={s.retientLib} style={{ color: '#15803d' }}>{m.aime}</span>
                  {appris.aime.map(x => (
                    <span key={x.t} className={`${s.puceRetient} ${s.aime}`}>
                      {x.t}<small>{`· ${x.n} visite${x.n > 1 ? 's' : ''}`}</small>
                      <button type="button" onClick={() => masquer(x.t)} aria-label={`Retirer « ${x.t} »`} title="Retirer : ne vaut plus pour la recherche"><Ic d={IC.croix} t={10} e={3} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {masques?.length ? <button type="button" className={s.reafficher} onClick={toutReafficher}>{`Réafficher ${masques.length} ligne${masques.length > 1 ? 's' : ''} retirée${masques.length > 1 ? 's' : ''}`}</button> : null}
        </div>
      </div>

      <Cascade cle={filtre} style={{ display: 'flex', flexDirection: 'column', gap: 22 } as CSSProperties}>
        {contenu}
      </Cascade>
    </div>
  );
}
