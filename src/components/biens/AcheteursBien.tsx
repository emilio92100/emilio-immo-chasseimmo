'use client';
/* ═══ Les acheteurs d'un bien (V3.29) ═══════════════════════════════════════
   Les recherches actives qui correspondent au bien, notées comme dans leur
   espace (src/lib/correspondance.ts) : 70 % et plus « correspondent », 50 à
   69 % « en partie ».

   · En vente (mandat, sous offre, sous compromis) : on coche, puis
     « Sélection ou envoi… » — le mettre dans leur sélection (rien ne part),
     l'envoyer dans leur espace, ou, pour un seul acheteur, ouvrir le mail
     d'envoi habituel depuis sa fiche. Appeler, SMS, mail sur chaque ligne.
   · Avant le mandat (à suivre, estimation) : la même liste, sans envoi —
     « L'envoi s'ouvre au mandat ». On sait déjà qui appeler.
   · En pause, vendu, retiré : la liste reste, en lecture.

   La carte « Les acheteurs » de la Vue d'ensemble est ici aussi. */

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '@/components/documents/ApercuActe';
import { euros } from '@/lib/mandat';
import { dateCourte, titreBien, type BienVente } from '@/lib/biens-vente';
import { demanderOuvertureFiche } from '@/lib/intentions';
import {
  SEUIL_CORRESPOND, SEUIL_LISTE, envoyerDansEspace, mettreEnSelection, nomClient,
  type Acheteur, type Copie,
} from './outils';
import a from './AcheteursBien.module.css';
import AvatarContact from '@/components/contacts/AvatarContact';

export type ModeAcheteurs = 'vente' | 'avant' | 'pause' | 'fini';
export const modeAcheteurs = (etape: string): ModeAcheteurs =>
  etape === 'a_suivre' || etape === 'estimation' ? 'avant'
    : etape === 'suspendu' ? 'pause'
      : etape === 'vendu' || etape === 'retire' ? 'fini' : 'vente';

/* ── Petits morceaux ── */
const C = 113.1; // périmètre du cercle de la note (r = 18)
function Note({ n, t = 48 }: { n: number; t?: number }) {
  const coul = n >= 85 ? '#16a34a' : n >= SEUIL_CORRESPOND ? '#c9a84c' : '#94a3b8';
  return (
    <svg className={a.note} width={t} height={t} viewBox="0 0 48 48" role="img" aria-label={`${n} pour cent`}>
      <circle cx="24" cy="24" r="18" fill="none" stroke="#eef1f6" strokeWidth="4.5" />
      <circle cx="24" cy="24" r="18" fill="none" stroke={coul} strokeWidth="4.5" strokeLinecap="round"
        strokeDasharray={`${(C * n / 100).toFixed(1)} ${C}`} transform="rotate(-90 24 24)" />
      <text x="24" y="28.5" textAnchor="middle" fill="#1a2332" style={{ font: "800 12.5px 'Plus Jakarta Sans', sans-serif" }}>{n}</text>
    </svg>
  );
}

/* Une couleur douce par personne, toujours la même. */
const TEINTES = [
  { f: '#dcfce7', t: '#166534' }, { f: '#e0e7ff', t: '#3730a3' }, { f: '#fef3c7', t: '#92400e' },
  { f: '#fce7f3', t: '#9d174d' }, { f: '#e0f2fe', t: '#075985' }, { f: '#ede9fe', t: '#5b21b6' },
];
export function teinte(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TEINTES[h % TEINTES.length];
}
export function Avatar({ acheteur, petit }: { acheteur: Acheteur; petit?: boolean }) {
  const c = teinte(acheteur.client.id);
  return <AvatarContact c={acheteur.client} teinte={{ bg: c.f, fg: c.t }} className={petit ? a.avPetit : a.av} libre />;
}

/* Ce qui ne colle pas, en une ligne ; sinon « Tout correspond ». */
function ecart(x: Acheteur): { t: string; ok: boolean } {
  const pb = x.corr.lignes.filter(l => l.etat !== 'oui');
  if (!pb.length) return { t: `Tout correspond : ${x.corr.lignes.map(l => l.lib.toLowerCase()).slice(0, 4).join(', ')}`, ok: true };
  const l = pb.find(y => y.etat === 'non') || pb[0];
  return { t: `${l.lib} : ${l.valeur}, demandé ${l.demande}`, ok: false };
}

const BADGES: Record<string, string> = {
  interesse: 'ça lui plaît', souhaite_visiter: 'veut visiter', visite: 'a visité', offre_faite: 'a fait une offre', refuse: 'pas pour lui',
};
const joursDepuis = (iso: unknown) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null;
};
/* Une recherche ouverte depuis moins d'une semaine, et le bien pas encore dans son dossier. */
export const estNouveau = (x: Acheteur) => !x.copie && (joursDepuis(x.recherche.created_at) ?? 99) <= 7;
const enSelection = (c: Copie | null) => !!c && c.etape === 'selection';
const presente = (c: Copie | null) => !!c && c.etape !== 'selection';

function etat(x: Acheteur): { t: string; ton: 'nouveau' | 'dossier' } | null {
  const c = x.copie;
  if (c && enSelection(c)) return { t: `Dans sa sélection depuis le ${dateCourte(c.created_at)} · pas encore envoyé`, ton: 'dossier' };
  if (c) {
    return {
      t: [`Présenté le ${dateCourte(c.envoye_le || c.created_at)}`, c.vu_le ? 'l’a ouvert' : '', c.badge_retour && BADGES[c.badge_retour] ? BADGES[c.badge_retour] : ''].filter(Boolean).join(' · '),
      ton: 'dossier',
    };
  }
  if (estNouveau(x)) {
    const j = joursDepuis(x.recherche.created_at) ?? 0;
    return { t: `Nouveau : recherche ouverte ${j <= 0 ? 'aujourd’hui' : j === 1 ? 'hier' : `il y a ${j} jours`}`, ton: 'nouveau' };
  }
  return null;
}

const telDe = (x: Acheteur) => (x.client.telephones || []).find(Boolean) || '';
const mailDe = (x: Acheteur) => (x.client.emails || []).find(Boolean) || '';
const sansEspaces = (t: string) => t.replace(/[\s.]+/g, '');

/* L'illustration de l'en-tête : trois acheteurs qui flottent. */
function Illu() {
  return (
    <svg className={a.illu} width="116" height="72" viewBox="0 0 116 72" aria-hidden="true">
      <g className={a.f1}><circle cx="26" cy="38" r="20" fill="#dcfce7" stroke="#fff" strokeWidth="3" /><circle cx="26" cy="32" r="6" fill="#16a34a" /><path d="M15 50c2-7 20-7 22 0" fill="#16a34a" /></g>
      <g className={a.f2}><circle cx="58" cy="30" r="22" fill="#e0e7ff" stroke="#fff" strokeWidth="3" /><circle cx="58" cy="24" r="7" fill="#4f46e5" /><path d="M46 43c2-8 22-8 24 0" fill="#4f46e5" /></g>
      <g className={a.f3}><circle cx="90" cy="40" r="19" fill="#fef3c7" stroke="#fff" strokeWidth="3" /><circle cx="90" cy="34" r="6" fill="#b45309" /><path d="M80 51c2-7 18-7 20 0" fill="#b45309" /></g>
    </svg>
  );
}

/* ══ LA LISTE ════════════════════════════════════════════════════════════ */
export function ListeAcheteurs({ acheteurs, mode, nbRecherches, onFiche, onAgir, max, onTout, titre, ecartes }: {
  acheteurs: Acheteur[]; mode: ModeAcheteurs; nbRecherches: number;
  /* V3.45 : « 3 autres recherches ne sont pas montrées : budget trop court… » */
  ecartes?: string;
  onFiche: (clientId: string) => void;
  /* Ouvre « Sélection ou envoi » pour ces acheteurs (en vente seulement). */
  onAgir?: (l: Acheteur[]) => void;
  /* La version courte de la Vue d'ensemble : les premiers, et « Voir les N ». */
  max?: number; onTout?: () => void; titre?: string;
}) {
  const liste = useMemo(() => acheteurs.filter(x => x.corr.note >= SEUIL_LISTE), [acheteurs]);
  const bons = liste.filter(x => x.corr.note >= SEUIL_CORRESPOND);
  const partiels = liste.length - bons.length;
  const [filtre, setFiltre] = useState<'tout' | 'bons' | 'partiels'>(() => (bons.length ? 'bons' : 'tout'));
  const vente = mode === 'vente' && !!onAgir;
  /* Les trois premiers qui correspondent et n'ont pas encore le bien sont cochés d'office. */
  const [choisis, setChoisis] = useState<string[]>(() => (vente ? bons.filter(x => !x.copie).slice(0, 3).map(x => x.recherche.id) : []));
  const vus = (max ? liste : liste.filter(x => filtre === 'tout' || (filtre === 'bons' ? x.corr.note >= SEUIL_CORRESPOND : x.corr.note < SEUIL_CORRESPOND)));
  const montres = max ? vus.slice(0, max) : vus;
  const coches = liste.filter(x => choisis.includes(x.recherche.id) && !presente(x.copie));
  const basculer = (id: string) => setChoisis(c => (c.includes(id) ? c.filter(y => y !== id) : [...c, id]));

  const titreBloc = titre || (mode === 'avant' ? 'Qui pourrait l’acheter' : 'Acheteurs qui correspondent');
  const sous = mode === 'avant'
    ? 'Sur les critères de leur recherche et la surface, les pièces, le secteur du bien. Le prix compte dès qu’il est défini.'
    : `Parmi vos ${nbRecherches} recherche${nbRecherches > 1 ? 's' : ''} active${nbRecherches > 1 ? 's' : ''}, avec la même note que dans leur espace. Un budget trop court, un autre secteur, trop petit ou pas assez de chambres : la recherche est écartée.`;
  const verrou = mode === 'avant' ? 'L’envoi s’ouvre au mandat' : mode === 'pause' ? 'Vente en pause : l’envoi reprend avec elle' : mode === 'fini' ? 'Le bien n’est plus en vente' : '';

  return (
    <section className={`${a.bloc} ${max ? a.court : ''}`} aria-label={titreBloc}>
      <div className={a.tete}>
        {!max && <Illu />}
        <div className={a.teteTx}>
          <div className={a.teteL1}>
            <h3>{titreBloc}</h3>
            <b className={a.teteN}>{bons.length}</b>
            {max && partiels > 0 && <span className={a.pastille}>{`${partiels} en partie`}</span>}
          </div>
          <p>{sous}</p>
        </div>
        {!max && liste.length > 0 && (
          <div className={a.puces} role="group" aria-label="Filtrer">
            <button type="button" className={filtre === 'tout' ? a.puceOn : a.puce} aria-pressed={filtre === 'tout'} onClick={() => setFiltre('tout')}>Tous <b>{liste.length}</b></button>
            <button type="button" className={filtre === 'bons' ? a.puceOn : a.puce} aria-pressed={filtre === 'bons'} onClick={() => setFiltre('bons')}>Correspondent <b>{bons.length}</b></button>
            <button type="button" className={filtre === 'partiels' ? a.puceOn : a.puce} aria-pressed={filtre === 'partiels'} onClick={() => setFiltre('partiels')}>En partie <b>{partiels}</b></button>
          </div>
        )}
        {max && verrou && <span className={a.verrou}><Ic n="cadenas" t={14} />{verrou}</span>}
      </div>

      {liste.length === 0 ? (
        <div className={a.vide}>
          <span className={a.videIc}><Ic n="groupe" t={24} /></span>
          <b>Aucune recherche ne lui correspond pour l’instant.</b>
          <span>{mode === 'avant' ? 'La liste se remplit dès qu’un acheteur est suivi, ou que la surface, les pièces, le secteur sont saisis.' : 'Elle se met à jour dès qu’un acheteur est suivi, ou que le prix change.'}</span>
        </div>
      ) : (
        <div className={a.lignes}>
          {montres.map((x, i) => {
            const on = choisis.includes(x.recherche.id) && !presente(x.copie);
            const e = ecart(x);
            const et = etat(x);
            const tel = telDe(x), mail = mailDe(x);
            return (
              <div key={x.recherche.id} className={`${a.ligne} ${vente ? a.ligneVente : ''} ${on ? a.ligneOn : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
                {vente && (
                  <button type="button" className={`${a.coche} ${on ? a.cocheOn : ''}`} disabled={presente(x.copie)} aria-pressed={on}
                    aria-label={presente(x.copie) ? 'Déjà présenté' : on ? 'Retirer du choix' : 'Choisir cet acheteur'} title={presente(x.copie) ? 'Il l’a déjà dans son espace' : undefined}
                    onClick={() => basculer(x.recherche.id)}>
                    <Ic n="check" t={13} e={3.2} />
                  </button>
                )}
                <Note n={x.corr.note} t={max ? 44 : 48} />
                <Avatar acheteur={x} />
                <div className={a.qui}>
                  <div className={a.quiL1}>
                    <button type="button" className={a.nom} onClick={() => onFiche(x.client.id)}>{nomClient(x.client)}</button>
                    {x.recherche.budget_max ? <span className={a.budget}>{`jusqu’à ${euros(x.recherche.budget_max)}`}</span> : null}
                  </div>
                  <span className={e.ok ? a.ecartOk : a.ecartKo}>{e.t}</span>
                  {et && <span className={et.ton === 'nouveau' ? a.etatNouveau : a.etat}>{et.ton === 'nouveau' && <i className={a.ping} />}{et.t}</span>}
                </div>
                {!max && (
                  <div className={a.actions}>
                    <div className={a.contacts}>
                      {tel && <a className={a.rond} href={`tel:${sansEspaces(tel)}`} aria-label={`Appeler ${nomClient(x.client)}`} title={tel}><Ic n="telephone" t={16} /><span className={a.rondTx}>Appeler</span></a>}
                      {tel && <a className={a.rond} href={`sms:${sansEspaces(tel)}`} aria-label={`SMS à ${nomClient(x.client)}`} title="SMS"><Ic n="bulle" t={16} /><span className={a.rondTx}>SMS</span></a>}
                      {mail && <a className={`${a.rond} ${a.rondMail}`} href={`mailto:${mail}`} aria-label={`Mail à ${nomClient(x.client)}`} title={mail}><Ic n="mail" t={16} /></a>}
                    </div>
                    {vente && (
                      <button type="button" className={a.agir} onClick={() => onAgir!([x])}>
                        <Ic n="envoyer" t={15} />{presente(x.copie) ? 'Renvoyer…' : 'Envoyer…'}
                      </button>
                    )}
                  </div>
                )}
                {max && x.recherche.budget_max ? <span className={a.budgetD}>{'jusqu’à '}<b>{euros(x.recherche.budget_max)}</b></span> : null}
              </div>
            );
          })}
          {!max && !montres.length && <div className={a.videPetit}>Personne dans ce filtre.</div>}
        </div>
      )}

      {!max && ecartes && <p className={a.ecartes}><Ic n="info" t={14} /><span>{ecartes}</span></p>}

      {max && onTout && liste.length > 0 && (
        <button type="button" className={a.tout} onClick={onTout}>{liste.length > montres.length ? `Voir les ${liste.length} dans l’onglet Acheteurs` : 'Ouvrir l’onglet Acheteurs'}</button>
      )}
      {!max && vente && liste.length > 0 && (
        <div className={a.pied}>
          <span className={a.piedN}><b>{coches.length}</b>{coches.length > 1 ? 'acheteurs choisis' : 'acheteur choisi'}</span>
          <span className={a.piedAide}>Ceux qui l’ont déjà dans leur espace ne se cochent pas.</span>
          <button type="button" className={a.btnOr} disabled={!coches.length} onClick={() => onAgir!(coches)}>
            <Ic n="envoyer" t={17} />Sélection ou envoi…
          </button>
        </div>
      )}
      {!max && !vente && verrou && liste.length > 0 && (
        <div className={a.pied}><span className={a.verrou}><Ic n="cadenas" t={14} />{verrou}</span></div>
      )}
    </section>
  );
}

/* ══ LA CARTE DE LA VUE D'ENSEMBLE ═══════════════════════════════════════ */
export function CarteAcheteurs({ acheteurs, mode, onVoir }: { acheteurs: Acheteur[]; mode: ModeAcheteurs; onVoir: () => void }) {
  const liste = acheteurs.filter(x => x.corr.note >= SEUIL_LISTE);
  const bons = liste.filter(x => x.corr.note >= SEUIL_CORRESPOND);
  const nouveaux = bons.filter(estNouveau).length;
  const avant = mode === 'avant';
  const n = avant ? liste.length : bons.length;
  const tete = (avant ? liste : bons).slice(0, 4);
  const reste = n - tete.length;
  return (
    <div className={`${a.kpi} ${a.kpiOr}`}>
      <div className={a.kpiT}><span className={a.kpiIc}><Ic n="groupe" t={17} /></span>{avant ? 'Acheteurs potentiels' : 'Les acheteurs'}</div>
      <div className={a.kpiN}><b>{n}</b><span>{avant ? (n > 1 ? 'pourraient l’acheter' : 'pourrait l’acheter') : n > 1 ? 'correspondent' : 'correspond'}</span></div>
      {n > 0 ? (
        <div className={a.pile}>
          {tete.map((x, i) => <span key={x.recherche.id} className={a[`f${(i % 3) + 1}`]}><Avatar acheteur={x} petit /></span>)}
          {reste > 0 && <span className={a.avPetit} style={{ background: '#eef1f6', color: '#475569' }}>{`+${reste}`}</span>}
          {!avant && nouveaux > 0 && <span className={a.nouveaux}><i className={a.ping} />{nouveaux > 1 ? `${nouveaux} nouveaux` : '1 nouveau'}</span>}
        </div>
      ) : <span className={a.kpiSous}>{avant ? 'Aucune recherche ne correspond encore.' : 'Aucune recherche ne correspond pour l’instant.'}</span>}
      {avant && n > 0
        ? <span className={a.kpiSous}>{`${bons.length} correspond${bons.length > 1 ? 'ent' : ''} · ${liste.length - bons.length} en partie`}</span>
        : null}
      <button type="button" className={a.kpiLien} onClick={onVoir}>Voir les acheteurs</button>
    </div>
  );
}

/* ══ SÉLECTION OU ENVOI ══════════════════════════════════════════════════ */
export function FenEnvoiAcheteurs({ bien, choisis, onFermer, onFait, onFiche }: {
  bien: BienVente; choisis: Acheteur[];
  onFermer: () => void;
  onFait: (message: { t: string; ok: boolean }) => void;
  /* Ouvrir la fiche du client (le mail d'envoi s'y ouvre tout seul). */
  onFiche: (clientId: string) => void;
}) {
  const [en, setEn] = useState<'' | 'selection' | 'espace' | 'mail'>('');
  const [erreur, setErreur] = useState('');
  const seul = choisis.length === 1 ? choisis[0] : null;
  const nom = seul ? nomClient(seul.client) : '';
  const pourSelection = choisis.filter(x => !x.copie);
  const pourEspace = choisis.filter(x => !presente(x.copie));
  const titre = titreBien(bien.donnees || {});

  async function selection() {
    setEn('selection'); setErreur('');
    const r = await mettreEnSelection(bien, pourSelection);
    setEn('');
    if (r.erreurs.length && !r.n) { setErreur(r.erreurs.join('\n')); return; }
    onFait(r.erreurs.length
      ? { t: `${r.n} mis en sélection. Erreurs : ${r.erreurs.join(' ; ')}`, ok: false }
      : { t: r.n > 1 ? `Dans la sélection de ${r.n} acheteurs. Rien n’est parti : envoyez-le depuis leur fiche, ou d’ici.` : `Dans la sélection de ${nomClient(pourSelection[0].client)}. Rien n’est parti.`, ok: true });
  }
  async function espace() {
    setEn('espace'); setErreur('');
    const r = await envoyerDansEspace(bien, pourEspace);
    setEn('');
    if (r.erreurs.length && !r.n) { setErreur(r.erreurs.join('\n')); return; }
    onFait(r.erreurs.length
      ? { t: `${r.n} envoi${r.n > 1 ? 's' : ''} fait${r.n > 1 ? 's' : ''}. Erreurs : ${r.erreurs.join(' ; ')}`, ok: false }
      : { t: r.n > 1 ? `Envoyé dans l’espace de ${r.n} acheteurs.` : r.n === 1 ? 'Envoyé dans son espace.' : 'Ils l’avaient déjà.', ok: true });
  }
  /* Le mail habituel part de sa fiche, sur les biens de son dossier : le bien
     y entre d'abord (à l'étape Sélection s'il n'y était pas), puis sa fiche
     s'ouvre sur la fenêtre d'envoi, ce bien déjà choisi. */
  async function mail() {
    if (!seul) return;
    setEn('mail'); setErreur('');
    const r = await mettreEnSelection(bien, [seul]);
    const id = r.ids[seul.recherche.id];
    setEn('');
    if (!id) { setErreur(r.erreurs.join('\n') || 'Le bien n’a pas pu être ajouté à son dossier.'); return; }
    demanderOuvertureFiche({ clientId: seul.client.id, onglet: 'selection', rechercheId: seul.recherche.id, envoi: [id] });
    onFiche(seul.client.id);
  }

  const fen = (
    <div className={a.voile} onMouseDown={e => { if (e.target === e.currentTarget && !en) onFermer(); }}>
      <div className={a.fen} role="dialog" aria-modal="true" aria-label="Sélection ou envoi">
        <div className={a.fenTete}>
          <span className={a.fenIc}><Ic n="envoyer" t={20} /></span>
          <div className={a.fenTx}>
            <h2>{seul ? `${titre} pour ${nom}` : `${titre} pour ${choisis.length} acheteurs`}</h2>
            <p>{seul ? `Correspond à ${seul.corr.note} % de sa recherche.` : choisis.map(x => nomClient(x.client)).join(', ')}</p>
          </div>
          <button type="button" className={a.fermer} aria-label="Fermer" disabled={!!en} onClick={onFermer}><Ic n="croix" t={16} e={2.2} /></button>
        </div>
        <div className={a.choix}>
          <button type="button" className={a.option} disabled={!pourSelection.length || !!en} onClick={selection}>
            <span className={a.optIc}><Ic n="liste" t={20} /></span>
            <span className={a.optTx}>
              <b>{en === 'selection' ? 'Ajout…' : seul ? 'Mettre dans sa sélection' : 'Mettre dans leur sélection'}</b>
              <small>{!pourSelection.length
                ? (seul ? 'Il est déjà dans son dossier.' : 'Ils l’ont déjà tous dans leur dossier.')
                : `Le bien entre dans ${seul ? 'son' : 'leur'} dossier, à l’étape Sélection. Rien ne part : ${seul ? 'il' : 'ils'} ne le ${seul ? 'voit' : 'voient'} pas encore.${!seul && pourSelection.length < choisis.length ? ` ${choisis.length - pourSelection.length} l’ont déjà.` : ''}`}</small>
            </span>
          </button>
          <button type="button" className={`${a.option} ${a.optionOr}`} disabled={!pourEspace.length || !!en} onClick={espace}>
            <span className={a.optIc}><Ic n="envoyer" t={20} /></span>
            <span className={a.optTx}>
              <b>{en === 'espace' ? 'Envoi…' : seul ? 'Envoyer dans son espace' : 'Envoyer dans leur espace'}</b>
              <small>{!pourEspace.length
                ? 'Déjà dans son espace.'
                : `Il y arrive tout de suite, avec la note de correspondance. ${seul ? 'Il est prévenu' : 'Ils sont prévenus'} sur ${seul ? 'son' : 'leur'} téléphone s’${seul ? 'il l’a' : 'ils l’ont'} accepté.`}</small>
            </span>
          </button>
          {seul && (
            <button type="button" className={a.option} disabled={!!en || !mailDe(seul)} onClick={mail}>
              <span className={a.optIc}><Ic n="mail" t={20} /></span>
              <span className={a.optTx}>
                <b>{en === 'mail' ? 'Ouverture…' : 'Envoyer par mail…'}</b>
                <small>{mailDe(seul) ? 'Sa fiche s’ouvre sur le mail d’envoi habituel, ce bien déjà choisi. Vous relisez avant qu’il parte.' : 'Pas d’adresse mail sur sa fiche.'}</small>
              </span>
            </button>
          )}
          {!seul && <p className={a.aide}>{'Pour un mail, un acheteur à la fois : « Envoyer… » sur sa ligne.'}</p>}
          {erreur && <p className={a.erreur}>{erreur}</p>}
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(fen, document.body);
}
