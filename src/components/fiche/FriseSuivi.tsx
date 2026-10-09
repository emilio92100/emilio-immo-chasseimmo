'use client';
import { Fragment, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Depliant from '@/components/shared/Depliant';
import ChoixDate from '@/components/shared/ChoixDate';
import { delaiRelance } from '@/lib/relances';
import { supabase } from '@/lib/supabase';
import { euros } from '@/lib/mandat';
import { etapeDe } from '@/lib/biens-vente';
import { lireRemises, type RemiseClient } from '@/lib/remise-client';
import s from './FriseSuivi.module.css';

/* ═══ Le suivi du dossier, en frise ═══════════════════════════════════════
   Avant : une liste de lignes grises, la même petite icône « 📝 » pour un
   appel, une note ou un rendez-vous, et un trait de 1 px qu'on ne voyait
   pas. Il fallait lire chaque ligne pour savoir ce qui s'était passé.

   Maintenant, un trait qui descend du futur vers le passé :
     · en haut, « À venir » : les relances en attente, la plus lointaine en
       premier, celle en retard (en rouge) juste au-dessus d'« Aujourd'hui » ;
     · puis l'histoire, mois par mois. Ce qu'Alexandre a fait lui-même
       (appel, rendez-vous, note, message du client, envoi, mandat) est une
       carte, avec l'icône de sa couleur ; ce que le CRM a noté tout seul
       (statut, bien ajouté, dossier créé…) une ligne discrète, pour que le
       travail se voie avant le bruit.
   Un appel noté avec un des raccourcis de « Ajouter une action » (a répondu,
   messagerie, pas de réponse) porte sa pastille : on voit d'un coup d'œil
   qui a décroché. Les données restent préparées dans FicheClient. */

export type LigneSuivi = { kind: 'comm' | 'event'; ts: string; data: any };
export type RelanceAVenir = { id: string; date_echeance: string; note: string | null; recherche_id?: string | null };

/* ── Les issues d'un appel : un clic dans la fenêtre « Ajouter une action »
   écrit le titre, la frise le relit pour poser la pastille. ── */
export const ISSUES_APPEL = [
  { k: 'repondu', lib: 'A répondu', titre: 'Appel — a répondu', c: '#15803d', bg: '#ecfdf3', bord: '#bbf0cf' },
  { k: 'messagerie', lib: 'Messagerie', titre: 'Appel — messagerie', c: '#8a6a1f', bg: '#fdf6e3', bord: '#efdcae' },
  { k: 'sans', lib: 'Pas de réponse', titre: 'Appel — pas de réponse', c: '#b4531f', bg: '#fff3eb', bord: '#f8d3bb' },
  { k: 'recu', lib: 'Appel reçu', titre: 'Appel reçu', c: '#2d5c8f', bg: '#eaf2fb', bord: '#c9dcf1' },
] as const;
export const issueAppel = (titre?: string | null) => ISSUES_APPEL.find(x => x.titre === (titre || '').trim()) || null;

/* ── Le tiroir des appels (V3.83) ──
   Alexandre : « dans Appels, un petit tiroir pour catégoriser les appels :
   les décrochés, les messageries… comme ça je vais directement au détail des
   appels qui ont été décrochés ». Sous le filtre « Appels », une rangée par
   issue, avec son nombre ; un clic n'affiche qu'elle. Un appel noté sans
   préciser (« Appel passé ») est « Sans précision ». */
const ISSUES_TIROIR: { k: string; lib: string; c: string; bg: string; bord: string }[] = [
  ...ISSUES_APPEL.map(x => ({ k: x.k as string, lib: x.lib as string, c: x.c as string, bg: x.bg as string, bord: x.bord as string })),
  { k: 'autre', lib: 'Sans précision', c: '#64748b', bg: '#f1f5f9', bord: '#d8e0ea' },
];
const issueDe = (it: LigneSuivi): string | null => (it.kind === 'event' && it.data?.type === 'appel' ? issueAppel(it.data.titre)?.k || 'autre' : null);

/* ── Les familles, leur couleur et leur icône ── */
type Famille = { ic: string; c: string; bg: string; carte: boolean };
const FAMILLES: Record<string, Famille> = {
  appel:    { ic: 'tel',      c: '#2d5c8f', bg: '#e9f1fb', carte: true },
  rdv:      { ic: 'gens',     c: '#a07c28', bg: '#fbf4e2', carte: true },
  note:     { ic: 'note',     c: '#475569', bg: '#eef2f7', carte: true },
  message:  { ic: 'bulle',    c: '#6d4fa3', bg: '#f2edfa', carte: true },
  comm:     { ic: 'mail',     c: '#0f766e', bg: '#e5f4f1', carte: true },
  mandat:   { ic: 'mandat',   c: '#2e4166', bg: '#e8eef8', carte: true },
  visite:   { ic: 'calendrier', c: '#15803d', bg: '#eaf7ef', carte: false },
  affaire:  { ic: 'euro',     c: '#a07c28', bg: '#fbf4e2', carte: false },
  systeme:  { ic: 'point',    c: '#94a3b8', bg: '#f1f4f8', carte: false },
};
/* Les grandes étapes d'une vente (V3.47) : mandat, offre, offre acceptée,
   compromis, compromis tombé, acte. Écrites par le CRM, mais ce sont les
   moments qu'on vient chercher : une carte à leur couleur, pas une ligne
   discrète (`metadata.jalon`, posé par noterJalon dans biens/outils.ts). */
const JALONS: Record<string, Famille> = {
  mandat:          { ic: 'mandat',    c: '#2e4166', bg: '#e8eef8', carte: true },
  offre_faite:     { ic: 'euro',      c: '#a07c28', bg: '#fbf4e2', carte: true },
  offre_recue:     { ic: 'euro',      c: '#a07c28', bg: '#fbf4e2', carte: true },
  offre_acceptee:  { ic: 'accord',    c: '#0f766e', bg: '#e5f4f1', carte: true },
  compromis:       { ic: 'signature', c: '#1d4ed8', bg: '#eaf2fb', carte: true },
  compromis_tombe: { ic: 'retour',    c: '#b91c1c', bg: '#fef2f2', carte: true },
  acte:            { ic: 'cle',       c: '#15803d', bg: '#eaf7ef', carte: true },
};
const jalonDe = (it: LigneSuivi): Famille | null => (it.kind === 'event' && typeof it.data?.metadata?.jalon === 'string' ? JALONS[it.data.metadata.jalon] || null : null);
const ICONE_SYSTEME: Record<string, string> = {
  statut_change: 'tourne', bien_ajoute: 'maison', bien_modifie: 'maison', bien_supprime: 'corbeille',
  creation: 'etincelle', recherche_creee: 'etincelle', recherche_renommee: 'crayon', recherche_reinitialisee: 'tourne',
  recherche_supprimee: 'corbeille', retour_etape: 'retour', relance_manuelle: 'cloche', contact: 'crayon',
};
function familleDe(it: LigneSuivi): string {
  if (it.kind === 'comm') return it.data?.type === 'compte_rendu_visite' ? 'visite' : 'comm';
  const t = it.data?.type as string;
  if (t === 'appel') return 'appel';
  if (t === 'rdv' || t === 'rdv_planifie') return 'rdv';
  if (t === 'note') return 'note';
  if (t === 'message_client' || t === 'demande_rappel' || t === 'point_auto_reponse') return 'message';
  if (t === 'email_libre' || t === 'envoi_externe' || t === 'mail_envoye' || t === 'envoi_bien') return 'comm';
  if (t === 'mandat') return 'mandat';
  /* V3.50 : l'annulation d'une visite (src/lib/annuler-visites.ts) se range avec les visites. */
  if (t === 'visite_planifiee' || t === 'visite_effectuee' || t === 'visite_annulee') return 'visite';
  if (t === 'offre_ecrite' || t === 'offre_faite' || t === 'etape_transaction' || t === 'dossier_finalise') return 'affaire';
  return 'systeme';
}

/* ── Les filtres : même ordre et mêmes groupes qu'avant (FicheClient) ── */
export const FILTRES_SUIVI: { id: string; lib: string; fam?: string }[] = [
  { id: 'tout', lib: 'Tout' },
  { id: 'appel', lib: 'Appels', fam: 'appel' },
  { id: 'rdv', lib: 'RDV', fam: 'rdv' },
  { id: 'note', lib: 'Notes', fam: 'note' },
  { id: 'message', lib: 'Messages & rappels', fam: 'message' },
  { id: 'communications', lib: 'Communications', fam: 'comm' },
  { id: 'mandat', lib: 'Mandat', fam: 'mandat' },
  { id: 'systeme', lib: 'Système', fam: 'systeme' },
];

/* ── Les icônes, dessinées (pas d'émoji : ils ne rendent pas pareil d'un
   téléphone à l'autre). ── */
const TRAITS: Record<string, string[]> = {
  tel: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
  gens: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'c:9,7,4', 'M22 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  note: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  bulle: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-9 5.7a2 2 0 0 1-2 0L2 7'],
  mandat: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'm9 15 2 2 4-4'],
  calendrier: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  euro: ['M4 10h12', 'M4 14h9', 'M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2'],
  cloche: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0'],
  maison: ['M3 10.5 12 4l9 6.5', 'M5 9.5V20h14V9.5', 'M10 20v-5h4v5'],
  tourne: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  etincelle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'],
  crayon: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  corbeille: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  retour: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  loupe: ['c:11,11,7', 'm21 21-4.3-4.3'],
  oeil: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'c:12,12,3'],
  bas: ['m6 9 6 6 6-6'],
  report: ['M21 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7', 'M16 2v4', 'M8 2v4', 'M3 10h18', 'M15 18h7', 'm19 15 3 3-3 3'],
  point: ['c:12,12,3'],
  fleche: ['M5 12h14', 'm13 6 6 6-6 6'],
  gauche: ['m15 18-6-6 6-6'],
  droite: ['m9 18 6-6-6-6'],
  croix: ['M18 6 6 18', 'm6 6 12 12'],
  photo: ['M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z', 'c:12,13,4'],
  cle: ['m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4', 'm21 2-9.6 9.6', 'c:7.5,15.5,5.5'],
  signature: ['m21 17-2.2-1.9a.5.5 0 0 0-.8.4v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.5-4-4-8.5-4a1 1 0 0 0 0 5c4.2 0 4.7-11.3 5.7-13.5a2.5 2.5 0 1 1 3.3 3.3', 'M3 21h18'],
  accord: ['m11 17 2 2a1 1 0 1 0 3-3', 'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7.1-.9l.5.3a2 2 0 0 0 1.4.3L21 4', 'm21 3 1 11h-2', 'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3', 'M3 4h8'],
};
export function IcSuivi({ n, t = 16, e = 2 }: { n: string; t?: number; e?: number }) {
  const tr = TRAITS[n] || TRAITS.point;
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={e} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {tr.map((d, i) => {
        if (d.startsWith('c:')) { const [cx, cy, r] = d.slice(2).split(','); return <circle key={i} cx={cx} cy={cy} r={r} />; }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}

/* ── Les dates ── */
const midi = (iso: string) => { const d = new Date(iso); d.setHours(12, 0, 0, 0); return d; };
function joursJusquA(iso: string) {
  const a = new Date(); a.setHours(12, 0, 0, 0);
  return Math.round((midi(iso).getTime() - a.getTime()) / 86400000);
}
function quand(iso: string) {
  const d = new Date(iso);
  const autreAnnee = d.getFullYear() !== new Date().getFullYear();
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', ...(autreAnnee ? { year: 'numeric' } : {}) });
  return `${jour} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}
const delai = (j: number) => (j < 0 ? `en retard de ${-j} j` : j === 0 ? 'aujourd’hui' : j === 1 ? 'demain' : `dans ${j} j`);
const moisDe = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
/* Le report (V3.85) : un jour à midi, en « aaaa-mm-jj » local. */
const plusJours = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dateCourte = (k: string) => (k ? new Date(`${k}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
const REPORTS: [string, number][] = [['Demain', 1], ['Dans 3 j', 3], ['Dans 7 j', 7], ['Dans 15 j', 15], ['Dans 1 mois', 30]];

/* Retrouver l'action d'où vient une relance, et la faire briller. */
function montrer(id: string) {
  const el = document.getElementById(`suivi-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('suivi-surligne'); void el.offsetWidth; el.classList.add('suivi-surligne');
}

/* ── Le mail envoyé, replié (V3.85) ──
   Alexandre : « sur le point sur la recherche, je ne vois pas le mail en
   entier qui a été envoyé ; replié par défaut c'est bien, mais un petit
   bouton Voir le détail qui affiche ce qui a été envoyé à ce client ». Le
   texte du mail est gardé avec l'envoi (`envois.corps`) ou dans la ligne du
   Suivi (« À : … », puis le texte) : un bouton le déplie, comme un mail. */
/* Le nom d'un bien du dossier, tel qu'on l'écrit partout dans la frise. */
const titreBienDossier = (b: any) => String(b?.titre || `${b?.type_bien || 'Bien'} — ${b?.ville || ''}`);
const photoBienDossier = (b: any): string => (Array.isArray(b?.photos) ? String(b.photos.find((x: unknown) => typeof x === 'string' && x) || '') : '');

/* ── Le bien d'un envoi, en grand (V3.150) ──
   Alexandre : « un bien joint, maison 7 pièces : il faudrait pouvoir appuyer
   dessus pour savoir lequel c'est, il n'y a pas de photo… tant que la maison
   est dans la base, même si un jour elle est vendue, qu'on puisse voir ce
   qu'on lui avait envoyé ». La copie du bien dans son dossier (ce qu'il a
   reçu, elle reste quand le bien est vendu) : ses photos, ses infos, où il en
   est chez lui ; pour un bien de l'agence, son étape d'aujourd'hui. */
function CarteBienEnvoye({ b, onFermer, onOuvrir }: { b: any; onFermer: () => void; onOuvrir?: (b: any) => void }) {
  const photos: string[] = Array.isArray(b.photos) ? b.photos.filter((x: unknown) => typeof x === 'string' && x) : [];
  const [i, setI] = useState(0);
  const [agence, setAgence] = useState<{ etape: string; archive: boolean } | null>(null);
  useEffect(() => {
    if (!b.bien_vente_id) return;
    let vivant = true;
    supabase.from('biens_vente').select('etape, archive').eq('id', b.bien_vente_id).maybeSingle().then(({ data }) => {
      if (vivant && data) setAgence({ etape: String((data as { etape?: string }).etape || ''), archive: !!(data as { archive?: boolean }).archive });
    });
    return () => { vivant = false; };
  }, [b.bien_vente_id]);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
      if (e.key === 'ArrowRight' && photos.length > 1) setI(k => (k + 1) % photos.length);
      if (e.key === 'ArrowLeft' && photos.length > 1) setI(k => (k - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer, photos.length]);
  const lieu = [b.quartier, [b.code_postal, b.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const etage = b.etage === 0 ? 'RDC' : b.etage ? `${b.etage}e étage` : '';
  const carac = [b.surface ? `${b.surface} m²` : '', b.nb_pieces ? `${b.nb_pieces} pièce${b.nb_pieces > 1 ? 's' : ''}` : '', b.nb_chambres ? `${b.nb_chambres} chambre${b.nb_chambres > 1 ? 's' : ''}` : '', etage].filter(Boolean);
  const prix = Number(b.prix_acquereur || b.prix_vendeur || 0);
  const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const canal = b.canal_envoi === 'mail' ? ' par mail' : b.canal_envoi === 'whatsapp' ? ' par WhatsApp' : b.canal_envoi === 'lien' ? ' dans son espace' : '';
  const chezLui = b.etape === 'presente' && b.envoye_le ? `Présenté le ${jour(b.envoye_le)}${canal}` : b.etape === 'selection' ? 'Dans sa sélection, pas encore envoyé' : '';
  const et = agence ? etapeDe(agence.etape) : null;
  const fin = !!agence && (agence.etape === 'vendu' || agence.etape === 'retire' || agence.archive);
  const fen = (
    <div className={s.bvVoile} onMouseDown={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className={s.bvFen} role="dialog" aria-modal="true" aria-label={titreBienDossier(b)}>
        <div className={s.bvPhoto}>
          {photos.length ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photos[i]} src={photos[i]} alt="" />
          ) : <span className={s.bvSans}><IcSuivi n="maison" t={34} e={1.6} /><small>Pas de photo</small></span>}
          {photos.length > 1 && (
            <>
              <button type="button" className={s.bvNav} data-cote="g" aria-label="Photo précédente" onClick={() => setI(k => (k - 1 + photos.length) % photos.length)}><IcSuivi n="gauche" t={18} e={2.4} /></button>
              <button type="button" className={s.bvNav} data-cote="d" aria-label="Photo suivante" onClick={() => setI(k => (k + 1) % photos.length)}><IcSuivi n="droite" t={18} e={2.4} /></button>
              <span className={s.bvCompte}><IcSuivi n="photo" t={13} e={2} />{`${i + 1} / ${photos.length}`}</span>
            </>
          )}
          {et && <span className={s.bvEtape} style={{ background: et.c }}>{agence?.archive ? 'Archivé' : et.court}</span>}
          <button type="button" className={s.bvFermer} aria-label="Fermer" onClick={onFermer}><IcSuivi n="croix" t={16} e={2.4} /></button>
        </div>
        <div className={s.bvCorps}>
          <div className={s.bvTitre}>
            <b>{titreBienDossier(b)}</b>
            {lieu && <span>{lieu}</span>}
          </div>
          {carac.length > 0 && <div className={s.bvCarac}>{carac.map(x => <span key={x}>{x}</span>)}</div>}
          <div className={s.bvPrix}>
            {prix ? <b>{euros(prix)}</b> : <b className={s.bvSansPrix}>Prix à venir</b>}
            <small>{prix ? (b.bien_vente_id ? 'le prix qu’il a reçu, honoraires compris' : 'le prix de l’annonce') : 'envoyé avant le mandat, sans prix'}</small>
          </div>
          <div className={s.bvInfos}>
            {chezLui && <div><IcSuivi n="mail" t={14} /><span>{chezLui}</span></div>}
            {b.vu_le && <div><IcSuivi n="loupe" t={14} /><span>{`Fiche ouverte le ${jour(b.vu_le)}`}</span></div>}
            {b.bien_vente_id
              ? <div><IcSuivi n="maison" t={14} /><span>{et ? `Bien de l’agence · aujourd’hui « ${agence?.archive ? 'Archivé' : et.court} »${fin ? ' : sa fiche reste consultable' : ''}` : 'Bien de l’agence'}</span></div>
              : (b.source_portail || b.agence_nom) && <div><IcSuivi n="maison" t={14} /><span>{['Annonce', b.source_portail, b.agence_nom && b.agence_nom !== b.source_portail ? b.agence_nom : ''].filter(Boolean).join(' · ')}</span></div>}
          </div>
          {b.retour_client && <p className={s.bvRetour}><span>Sa réponse</span>{b.retour_client}</p>}
        </div>
        <div className={s.bvPied}>
          {!b.bien_vente_id && b.url && <a className={s.bvLien} href={String(b.url)} target="_blank" rel="noopener noreferrer">Voir l’annonce</a>}
          <button type="button" className={s.bvBtn} onClick={onFermer}>Fermer</button>
          {onOuvrir && <button type="button" className={`${s.bvBtn} ${s.bvBtnPrim}`} onClick={() => onOuvrir(b)}>{b.bien_vente_id ? 'Ouvrir la fiche du bien' : 'Voir le bien en détail'}<IcSuivi n="fleche" t={15} e={2.3} /></button>}
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(fen, document.body);
}

/* Un bien joint, en pastille : sa photo et son nom ; un clic l'ouvre en grand. */
function PastilleBien({ b, onVoir, petite }: { b: any; onVoir: (b: any) => void; petite?: boolean }) {
  const ph = photoBienDossier(b);
  return (
    <button type="button" className={s.pBien} data-petite={petite ? 'oui' : undefined} onClick={() => onVoir(b)} title="Voir le bien">
      {ph
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={ph} alt="" />
        : <span className={s.pBienIc}><IcSuivi n="maison" t={petite ? 12 : 13} /></span>}
      <span className={s.pBienT}>{titreBienDossier(b)}</span>
      <IcSuivi n="droite" t={12} e={2.4} />
    </button>
  );
}

function MailPlie({ objet, a, corps, nbBiens = 0, biensJoints = [], onVoirBien, ouvert, onBasculer }: {
  objet: string; a: string; corps: string;
  /* Les biens joints : leur nombre, et ceux qu'on retrouve dans son dossier
     (V3.150 : en pastilles, avec leur photo ; un clic les ouvre). */
  nbBiens?: number; biensJoints?: any[]; onVoirBien?: (b: any) => void;
  ouvert: boolean; onBasculer: () => void;
}) {
  const absents = Math.max(0, nbBiens - biensJoints.length);
  return (
    <>
      <button type="button" className={s.voirMail} data-on={ouvert ? 'oui' : 'non'} aria-expanded={ouvert} onClick={onBasculer}>
        <IcSuivi n="mail" t={14} e={2.1} />{ouvert ? 'Masquer le mail' : 'Voir le mail'}<IcSuivi n="bas" t={13} e={2.4} />
      </button>
      <Depliant ouvert={ouvert}>
        <div className={s.mail}>
          <div className={s.mailTete}>
            {objet && <div><span>Objet</span><b>{objet}</b></div>}
            {a && <div><span>À</span><em>{a}</em></div>}
          </div>
          <p className={s.mailCorps}>{corps}</p>
          {nbBiens > 0 && (
            <div className={s.mailBiens}>
              <span>{nbBiens > 1 ? `${nbBiens} biens joints` : '1 bien joint'}</span>
              {biensJoints.map((b, i) => (onVoirBien
                ? <PastilleBien key={`${b.id}-${i}`} b={b} onVoir={onVoirBien} />
                : <em key={`${b.id}-${i}`}><IcSuivi n="maison" t={12} />{titreBienDossier(b)}</em>))}
              {absents > 0 && <i className={s.mailBienAbsent}>{absents > 1 ? `${absents} autres, retirés de son dossier` : biensJoints.length ? '1 autre, retiré de son dossier' : 'Retiré de son dossier depuis'}</i>}
            </div>
          )}
        </div>
      </Depliant>
    </>
  );
}

/* Une ligne « Mail envoyé » du Suivi : « À : …, … », une ligne vide, puis le
   texte du mail (src/app/api/mail, send-mail). Le reste reste tel quel. */
function mailDuJournal(j: { type?: string; description?: string | null }): { a: string; corps: string } | null {
  if (j.type !== 'mail_envoye' && j.type !== 'envoi_bien') return null;
  const m = /^À : ([^\n]*)\n+([\s\S]+)$/.exec(String(j.description || '').trim());
  return m ? { a: m[1].trim(), corps: m[2].trim() } : null;
}

/* V3.152 — Un bien de l'agence présenté par simple mail (/api/biens-vente,
   « presenter ») : une ligne `envoi_bien` sans bien du dossier, qui nomme le
   bien de l'agence. Elle n'a pas de double dans `envois` : la fiche d'un
   acheteur la garde dans son Suivi, avec les Communications (FicheClient). */
export const estMailSimple = (j: { type?: string | null; bien_id?: string | null; metadata?: Record<string, unknown> | null } | null | undefined) =>
  !!j && j.type === 'envoi_bien' && !j.bien_id && typeof j.metadata?.bien_vente_id === 'string';

/* V3.152 — « Mail ouvert » : ce que Mailjet sait d'un simple mail parti avec
   son pixel d'ouverture (`metadata.suivi_ouverture`, voir
   src/app/api/biens-vente/route.ts). Demandé une seule fois par mail et par
   session, seulement pour les envois de moins de 30 jours, d'un coup pour
   toute la frise (/api/mail/remise) ; une erreur ne montre rien. */
const OUVERT = ['opened', 'clicked'];
const MAIL_OUVERT_JOURS = 30;
const statutsMail = new Map<string, string>();
const dejaDemandes = new Set<string>();
function aDemander(it: LigneSuivi): RemiseClient | null {
  const j = it.kind === 'event' ? it.data : null;
  const m = j?.metadata;
  if (!m || m.suivi_ouverture !== true || typeof m.mailjet_id !== 'string' || !/^\d{1,30}$/.test(m.mailjet_id)) return null;
  if (!(Date.now() - new Date(j.created_at).getTime() <= MAIL_OUVERT_JOURS * 86_400_000)) return null;
  return { id: m.mailjet_id, email: typeof m.email === 'string' ? m.email : '', clientId: j.client_id || null, rechercheId: j.recherche_id || null };
}
function useMailsOuverts(items: LigneSuivi[]): (j: { metadata?: Record<string, unknown> | null } | null | undefined) => boolean {
  const [, setMaj] = useState(0);
  const l = items.map(aDemander).filter((x): x is RemiseClient => !!x);
  const cle = l.map(x => x.id).join(',');
  useEffect(() => {
    const neufs = l.filter(x => !dejaDemandes.has(x.id)).slice(0, 40);
    if (!neufs.length) return;
    neufs.forEach(x => dejaDemandes.add(x.id));
    lireRemises(neufs).then(etats => {
      for (const e of etats) statutsMail.set(e.id, e.statut);
      setMaj(n => n + 1);
    }).catch(() => { /* rien ne s'affiche */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return j => {
    const id = j?.metadata?.mailjet_id;
    return typeof id === 'string' && OUVERT.includes(statutsMail.get(id) || '');
  };
}

type Props = {
  items: LigneSuivi[];
  filtre: string;
  comptes: Record<string, number>;
  onFiltre: (id: string) => void;
  /* Le bouton « + d'une autre recherche », s'il y a lieu (il vit dans FicheClient). */
  enPlus?: React.ReactNode;
  aVenir: RelanceAVenir[];
  relancesAtt: RelanceAVenir[];
  biens: any[];
  nomAutreRecherche: (j: any) => string | null;
  surligne: string | null;
  modifiable: (j: any) => boolean;
  onModifier: (j: any) => void;
  onSupprimer: (j: any) => void;
  onAjouter: () => void;
  onAppel: () => void;
  /* V3.85 — Reporter une relance « À venir » sans quitter la fiche (Alexandre :
     « on peut reporter depuis Relances, mais pas depuis le suivi de la
     fiche »). Rend `true` si c'est enregistré ; la fiche relit ses relances. */
  onReporter?: (id: string, jour: string) => Promise<boolean>;
  /* V3.150 — « Ouvrir la fiche du bien », depuis la carte d'un bien envoyé. */
  onBien?: (b: any) => void;
  /* La fiche d'un contact qui n'est pas acheteur (V3.23) : « Historique »,
     et seulement les filtres qui ont un sens pour lui. */
  titre?: string;
  filtresVisibles?: string[];
};

export default function FriseSuivi({ items, filtre, comptes, onFiltre, enPlus, aVenir, relancesAtt, biens, nomAutreRecherche, surligne, modifiable, onModifier, onSupprimer, onAjouter, onAppel, onReporter, onBien, titre: titreFrise = 'Historique du dossier', filtresVisibles }: Props) {
  /* Le bien ouvert en grand (V3.150). */
  const [bienOuvert, setBienOuvert] = useState<any | null>(null);
  /* V3.152 : un simple mail que Mailjet dit ouvert. */
  const mailOuvert = useMailsOuverts(items);
  /* L'action d'où vient chaque relance : pour « Voir l'action ». */
  const actionDe = new Map<string, string>();
  for (const it of items) { const rid = it.kind === 'event' ? it.data?.metadata?.relance_id : null; if (rid) actionDe.set(rid, it.data.id); }
  const futur = filtre === 'tout' ? [...aVenir].sort((a, b) => new Date(b.date_echeance).getTime() - new Date(a.date_echeance).getTime()) : [];

  /* Le tiroir des appels : le nombre par issue, et celle choisie. Les
     nombres restent ceux des appels pendant que le tiroir se replie. */
  const appels = filtre === 'appel';
  const parIssue: Record<string, number> = {};
  for (const it of items) { const k = issueDe(it); if (k) parIssue[k] = (parIssue[k] || 0) + 1; }
  const [gele, setGele] = useState<Record<string, number>>(parIssue);
  if (appels && JSON.stringify(gele) !== JSON.stringify(parIssue)) setGele(parIssue);
  const nb = appels ? parIssue : gele;
  const nAppels = Object.values(nb).reduce((a, b) => a + b, 0);
  const passes = nAppels - (nb.recu || 0);
  const [issueChoisie, setIssueChoisie] = useState('tout');
  const issue = appels && issueChoisie !== 'tout' && parIssue[issueChoisie] ? issueChoisie : 'tout';
  const vus = issue === 'tout' ? items : items.filter(it => issueDe(it) === issue);

  /* Le report d'une relance « À venir » : laquelle est ouverte, le jour
     choisi (le délai des Paramètres d'abord, comme la page Relances). */
  const [reportId, setReportId] = useState<string | null>(null);
  const [jourReport, setJourReport] = useState('');
  const [reportEnCours, setReportEnCours] = useState(false);
  /* Les mails dépliés (V3.85), par ligne. */
  const [mailsOuverts, setMailsOuverts] = useState<Record<string, boolean>>({});
  const basculerMail = (cle: string) => setMailsOuverts(m => ({ ...m, [cle]: !m[cle] }));
  const ouvrirReport = (id: string) => {
    if (reportId === id) { setReportId(null); return; }
    setReportId(id);
    setJourReport(plusJours(5));
    delaiRelance().then(j => setJourReport(plusJours(j))).catch(() => {});
  };
  const validerReport = async (id: string) => {
    if (!onReporter || !jourReport || reportEnCours) return;
    setReportEnCours(true);
    const ok = await onReporter(id, jourReport);
    setReportEnCours(false);
    if (ok) setReportId(null);
  };

  /* Mois par mois : un repère sur le trait à chaque changement. */
  let moisCourant = '';

  return (
    <div className={s.frise}>
      <div className={s.tete}>
        <div className={s.teteTitre}>
          <b>{titreFrise}</b>
          <span>{`${comptes.tout || 0} élément${(comptes.tout || 0) > 1 ? 's' : ''}`}</span>
        </div>
        <div className={s.teteBoutons}>
          <button type="button" className={s.btnAppel} onClick={onAppel}><IcSuivi n="tel" t={15} />Noter un appel</button>
          <button type="button" className={s.btnAjout} onClick={onAjouter}>+ Ajouter une action</button>
        </div>
      </div>

      <div className={s.filtres} data-defile="">
        {FILTRES_SUIVI.filter(f => !filtresVisibles || filtresVisibles.includes(f.id)).map(f => {
          const n = comptes[f.id] || 0;
          const fam = f.fam ? FAMILLES[f.fam] : null;
          return (
            <button key={f.id} type="button" className={s.filtre} data-on={filtre === f.id ? 'oui' : 'non'} data-vide={n ? 'non' : 'oui'} aria-expanded={f.id === 'appel' ? appels && !!n : undefined}
              onClick={() => { if (f.id !== filtre) setIssueChoisie('tout'); onFiltre(f.id); }}>
              {fam && <i style={{ background: fam.c }} />}
              {f.lib}
              {n > 0 && <b>{n}</b>}
            </button>
          );
        })}
        {enPlus}
      </div>

      <Depliant ouvert={appels && nAppels > 0} ecart={14}>
        <div className={s.tiroir}>
          <div className={s.tiroirTete}>
            <span className={s.tiroirTitre}><IcSuivi n="tel" t={13} e={2.2} />Quels appels ?</span>
            {passes > 0 && <span className={s.tiroirTaux}>{`${nb.repondu || 0} réponse${(nb.repondu || 0) > 1 ? 's' : ''} sur ${passes} appel${passes > 1 ? 's' : ''} passé${passes > 1 ? 's' : ''}`}</span>}
          </div>
          <div className={s.tiroirBarre} aria-hidden="true">
            {ISSUES_TIROIR.map(x => (nb[x.k] ? <i key={x.k} style={{ flexGrow: nb[x.k], background: x.c, opacity: issue === 'tout' || issue === x.k ? 1 : .28 }} /> : null))}
          </div>
          <div className={s.tiroirPuces} role="group" aria-label="Les appels, par issue">
            <button type="button" className={s.tiroirPuce} data-on={issue === 'tout' ? 'oui' : 'non'} aria-pressed={issue === 'tout'} onClick={() => setIssueChoisie('tout')}>
              <span className={s.tiroirLib}>Tous</span><b>{nAppels}</b>
            </button>
            {ISSUES_TIROIR.map(x => {
              const n = nb[x.k] || 0;
              if (x.k === 'autre' && !n) return null;
              const on = issue === x.k;
              return (
                <button key={x.k} type="button" className={s.tiroirPuce} data-on={on ? 'oui' : 'non'} aria-pressed={on} disabled={!n}
                  style={on ? { color: x.c, background: x.bg, borderColor: x.c, boxShadow: `0 0 0 3px ${x.bg}` } : undefined}
                  onClick={() => setIssueChoisie(on ? 'tout' : x.k)}>
                  <i style={{ background: x.c }} /><span className={s.tiroirLib}>{x.lib}</span><b>{n}</b>
                </button>
              );
            })}
          </div>
        </div>
      </Depliant>

      {vus.length === 0 && futur.length === 0 ? (
        <div className={s.vide}>
          <span className={s.videIc}><IcSuivi n="note" t={22} e={1.8} /></span>
          <b>Rien à afficher</b>
          {filtre !== 'tout' && <span>{`Aucun élément dans « ${FILTRES_SUIVI.find(f => f.id === filtre)?.lib || filtre} ». « Tout » montre l’historique complet.`}</span>}
        </div>
      ) : (
        <ol key={`${filtre}-${issue}`} className={`${s.liste} ${s.listeArrive}`}>
          {futur.length > 0 && (
            <li className={s.repere} data-sorte="avenir"><span className={s.repereRond} /><span className={s.repereTexte}>À venir</span></li>
          )}
          {futur.map(r => {
            const j = joursJusquA(r.date_echeance);
            const retard = j < 0;
            const action = actionDe.get(r.id);
            return (
              <li key={`r-${r.id}`} className={s.ligne} data-sorte="avenir">
                <span className={s.noeud} data-bord="oui" style={{ color: retard ? '#be123c' : '#a07c28', background: retard ? '#fff1f2' : '#fdf6e3', borderColor: retard ? '#fbd0d6' : '#efdcae' }}><IcSuivi n="cloche" t={16} /></span>
                <div className={`${s.carte} ${s.carteRelance}`} data-retard={retard ? 'oui' : 'non'}>
                  <div className={s.carteTete}>
                    {/* V3.127 (Alexandre : « relance à faire le », pour qu'on comprenne mieux). */}
                    <span className={s.titre}>{`Relance à faire le ${midi(r.date_echeance).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}</span>
                    <span className={s.pastille} style={retard ? { color: '#be123c', background: '#fff1f2', borderColor: '#fbd0d6' } : { color: '#8a6a1f', background: '#fff', borderColor: '#efdcae' }}>{delai(j)}</span>
                    {onReporter && (
                      <button type="button" className={s.reporter} data-on={reportId === r.id ? 'oui' : 'non'} aria-expanded={reportId === r.id} onClick={() => ouvrirReport(r.id)} title="Reporter cette relance à un autre jour">
                        <IcSuivi n="report" t={13} e={2.2} />Reporter
                      </button>
                    )}
                    {action && <button type="button" className={s.voir} onClick={() => montrer(action)}>Voir l’action<IcSuivi n="bas" t={13} e={2.4} /></button>}
                    <span className={s.actions} aria-hidden="true" data-vide="oui" />
                  </div>
                  {r.note && <p className={s.texte}>{r.note}</p>}
                  {onReporter && (
                    <Depliant ouvert={reportId === r.id}>
                      <div className={s.report}>
                        <span className={s.reportT}>Reporter au</span>
                        <div className={s.reportPuces}>
                          {REPORTS.map(([lib, n]) => {
                            const d = plusJours(n);
                            return <button key={lib} type="button" data-on={jourReport === d ? 'oui' : 'non'} onClick={() => setJourReport(d)}>{lib}</button>;
                          })}
                          <ChoixDate compact valeur={jourReport} min={plusJours(0)} placeholder="Une autre date" onChange={v => { if (v) setJourReport(v); }} />
                        </div>
                        <div className={s.reportPied}>
                          <button type="button" className={s.reportAnnuler} onClick={() => setReportId(null)} disabled={reportEnCours}>Annuler</button>
                          <button type="button" className={s.reportOk} onClick={() => validerReport(r.id)} disabled={!jourReport || reportEnCours}>
                            {reportEnCours ? 'Report…' : `Reporter au ${dateCourte(jourReport)}`}
                          </button>
                        </div>
                      </div>
                    </Depliant>
                  )}
                </div>
              </li>
            );
          })}
          {futur.length > 0 && vus.length > 0 && (
            <li className={s.repere} data-sorte="aujourdhui"><span className={s.repereRond} /><span className={s.repereTexte}>Aujourd’hui</span></li>
          )}

          {vus.map(it => {
            const m = moisDe(it.ts);
            const nouveauMois = m !== moisCourant;
            moisCourant = m;
            const famK = familleDe(it);
            const jalon = jalonDe(it);
            const fam = jalon || FAMILLES[famK];
            const cle = it.kind === 'comm' ? `c-${it.data.id}` : `e-${it.data.id}`;
            const mois = nouveauMois ? (
              <li key={`m-${cle}`} className={s.repere}><span className={s.repereRond} /><span className={s.repereTexte}>{m}</span></li>
            ) : null;

            /* ── Un envoi (sélection de biens, compte rendu de visite…) ── */
            if (it.kind === 'comm') {
              const e = it.data;
              const cr = e.type === 'compte_rendu_visite';
              const parts: string[] = cr && e.corps ? String(e.corps).split(' | ') : [];
              return (<Fragment key={cle}>{mois}
                <li key={cle} className={s.ligne}>
                  <span className={s.noeud} style={{ color: fam.c, background: fam.bg }}><IcSuivi n={cr ? 'calendrier' : 'mail'} t={16} /></span>
                  <div className={s.carte}>
                    <div className={s.carteTete}>
                      <span className={s.titre}>{e.objet || (cr ? 'Compte rendu de visite' : 'Envoi')}</span>
                      <span className={s.heure}>{quand(e.created_at)}</span>
                      <span className={s.actions} aria-hidden="true" data-vide="oui" />
                    </div>
                    {cr && parts.length > 0 && <p className={s.texte} style={{ color: '#15803d', fontWeight: 700 }}>{parts.slice(0, 2).join(' · ')}</p>}
                    {cr && parts.length > 2 && <p className={`${s.texte} ${s.citation}`} style={{ borderColor: '#86d6a8', background: '#f3fbf6' }}>{parts[2]}</p>}
                    {!cr && e.destinataires?.length > 0 && <p className={s.sous}>{`À ${e.destinataires.join(', ')}`}</p>}
                    {!cr && String(e.corps || '').trim() && (
                      <MailPlie objet={e.objet || ''} a={(e.destinataires || []).join(', ')} corps={String(e.corps).trim()}
                        nbBiens={(e.biens_ids || []).length}
                        biensJoints={((e.biens_ids || []) as string[]).map(id => biens.find(y => y.id === id)).filter(Boolean)}
                        onVoirBien={setBienOuvert}
                        ouvert={!!mailsOuverts[cle]} onBasculer={() => basculerMail(cle)} />
                    )}
                  </div>
                </li>
              </Fragment>);
            }

            /* ── Une ligne du journal ── */
            const j = it.data;
            const autre = nomAutreRecherche(j);
            const issue = j.type === 'appel' ? issueAppel(j.titre) : null;
            const titre = issue && issue.k !== 'recu' ? 'Appel' : j.titre;
            const rid = j.metadata?.relance_id as string | undefined;
            const rel = rid ? relancesAtt.find(x => x.id === rid) : null;
            const b = j.bien_id ? biens.find(x => x.id === j.bien_id) : null;
            const mj = mailDuJournal(j);
            const actions = modifiable(j) ? (
              <span className={s.actions}>
                <button type="button" onClick={() => onModifier(j)} title="Modifier" aria-label="Modifier cette ligne"><IcSuivi n="crayon" t={14} /></button>
                <button type="button" onClick={() => onSupprimer(j)} title="Supprimer" aria-label="Supprimer cette ligne" data-rouge="oui"><IcSuivi n="corbeille" t={14} /></button>
              </span>
            ) : null;
            /* Une carte sans crayon garde la même place à droite : les heures
               restent alignées d'une carte à l'autre. */
            const place = actions || <span className={s.actions} aria-hidden="true" data-vide="oui" />;
            /* « Bien ajouté : Duplex… » nomme déjà le bien : pas d'étiquette en plus. */
            const bienVu = b && !(famK === 'systeme');
            /* V3.154 : un bon de visite signé — ses biens, un par étiquette ;
               celui qu'on retrouve dans le dossier s'ouvre d'un clic. */
            const bonBiens = Array.isArray(j.metadata?.biens) ? (j.metadata.biens as { id?: string | null; lib?: string }[]) : [];
            const etiquettes = (autre || rel || bienVu || bonBiens.length > 0) ? (
              <div className={s.etiquettes}>
                {bienVu && <PastilleBien b={b} onVoir={setBienOuvert} petite />}
                {bonBiens.map((x, k) => {
                  const lie = x.id ? biens.find(y => y.id === x.id) : null;
                  return lie
                    ? <PastilleBien key={k} b={lie} onVoir={setBienOuvert} petite />
                    : <span key={k} className={s.etAutre}><IcSuivi n="maison" t={12} />{x.lib || 'Bien'}</span>;
                })}
                {rel && (() => {
                  const n = joursJusquA(rel.date_echeance);
                  return <span className={s.etRelance} data-retard={n < 0 ? 'oui' : 'non'}><IcSuivi n="cloche" t={13} />{`Relance le ${midi(rel.date_echeance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${delai(n)}`}</span>;
                })()}
                {autre && <span className={s.etAutre}><IcSuivi n="loupe" t={12} />{autre}</span>}
              </div>
            ) : null;

            if (!fam.carte) {
              /* Ce que le CRM a noté tout seul : une ligne, pas une carte. */
              /* V3.152 : « A ouvert la fiche du bien » (son lien personnel, metadata.vue_bien). */
              const ic = famK === 'systeme' ? (j.metadata?.vue_bien ? 'oeil' : ICONE_SYSTEME[j.type] || 'point') : fam.ic;
              return (<Fragment key={cle}>{mois}
                <li key={cle} id={`suivi-${j.id}`} className={`${s.ligne} ${s.discrete} suivi-ligne${surligne === j.id ? ' suivi-surligne' : ''}`} data-famille={famK}>
                  <span className={s.noeudPetit} style={{ color: fam.c, background: fam.bg }}><IcSuivi n={ic} t={12} e={2.2} /></span>
                  <div className={s.discreteCorps}>
                    <div className={s.discreteTete}>
                      <span className={s.discreteTitre}>{j.titre}</span>
                      <span className={s.heure}>{quand(j.created_at)}</span>
                      {actions}
                    </div>
                    {j.description && <p className={s.discreteTexte}>{j.description}</p>}
                    {etiquettes}
                  </div>
                </li>
              </Fragment>);
            }

            return (<Fragment key={cle}>{mois}
              <li key={cle} id={`suivi-${j.id}`} className={`${s.ligne} suivi-ligne${surligne === j.id ? ' suivi-surligne' : ''}`} data-famille={jalon ? 'jalon' : famK}>
                <span className={s.noeud} style={{ color: fam.c, background: fam.bg }}><IcSuivi n={fam.ic} t={16} /></span>
                <div className={`${s.carte} ${jalon ? s.carteJalon : ''}`} style={jalon ? { ['--jc' as string]: fam.c, ['--jf' as string]: fam.bg } as React.CSSProperties : undefined}>
                  <div className={s.carteTete}>
                    <span className={s.titre}>{titre}</span>
                    {issue && issue.k !== 'recu' && <span className={s.pastille} style={{ color: issue.c, background: issue.bg, borderColor: issue.bord }}>{issue.lib}</span>}
                    {mailOuvert(j) && <span className={s.pastille} style={{ color: '#0f766e', background: '#f0fdfa', borderColor: '#99f6e4' }}>Mail ouvert</span>}
                    <span className={s.heure}>{quand(j.created_at)}</span>
                    {place}
                  </div>
                  {mj ? (
                    <>
                      <p className={s.sous}>{`À ${mj.a}`}</p>
                      <MailPlie objet={String(j.titre || '').split(' — ').slice(1).join(' — ')} a={mj.a} corps={mj.corps}
                        ouvert={!!mailsOuverts[cle]} onBasculer={() => basculerMail(cle)} />
                    </>
                  ) : j.description && <p className={`${s.texte} ${famK === 'message' ? s.citation : ''}`}>{j.description}</p>}
                  {etiquettes}
                </div>
              </li>
            </Fragment>);
          })}
        </ol>
      )}
      {bienOuvert && <CarteBienEnvoye b={bienOuvert} onFermer={() => setBienOuvert(null)} onOuvrir={onBien ? x => { setBienOuvert(null); onBien(x); } : undefined} />}
    </div>
  );
}
