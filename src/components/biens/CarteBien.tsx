'use client';
import { euros } from '@/lib/mandat';
import { num, txt } from '@/lib/actes';
import {
  argentBien, avantMandat, etapeDe, ligneEtat, lirePhotos, motMandat, nomProprio, specsBien, villeAffichee, type BienVente, type EtatMandatDoc, type SuiviVente,
} from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import b from './Biens.module.css';

/* ═══ La carte d'un bien (la liste, et l'aperçu de l'éditeur) ═════════════ */

export const NOM_MANDAT: Record<string, string> = { simple: 'Simple', semi: 'Semi-exclusif', exclusif: 'Exclusif' };
const SOUS_MANDAT = ['mandat', 'offre', 'compromis', 'suspendu'];

/* Le prix d'une carte : affiché, sinon la fourchette d'estimation. Avant
   le mandat, la fourchette passe d'abord : le prix conseillé n'est pas
   encore un prix affiché (V3.16). Le montant reste quel que soit l'étape
   (en pause, retiré) : rien ne l'efface. */
export function prixCarte(bien: BienVente): { t: string; vide: boolean } {
  const d = bien.donnees || {};
  const p = bien.prix ?? num(d, 'prix');
  const a = num(d, 'estimBasse'), h = num(d, 'estimHaute');
  const fourchette = a && h ? `${euros(a).replace(/\s€$/, '')} – ${euros(h)}` : a || h ? euros((a || h) as number) : '';
  if (avantMandat(bien.etape) && fourchette) return { t: fourchette, vide: false };
  if (p) return { t: euros(p), vide: false };
  if (fourchette) return { t: fourchette, vide: false };
  return { t: bien.etape === 'a_suivre' ? 'Projet de vente' : bien.etape === 'estimation' ? 'Estimation à définir' : 'Prix à fixer', vide: true };
}

/* Les honoraires d'une vente conclue (TTC) : ceux saisis au compromis ou à
   la vente, sinon ceux du mandat.
   V3.50 : un bien VENDU ne montre que ceux de l'acte — ceux que compte le
   chiffre d'affaires. Avant, il retombait sur ceux du mandat : la carte
   disait « 42 500 € » quand le chiffre d'affaires comptait 0. */
export function honorairesVente(bien: BienVente, suivi: SuiviVente[]): number | null {
  const lignes = suivi.filter(x => x.type === 'etape' && (x.statut === 'vendu' || x.statut === 'compromis')).sort((x, y) => y.le.localeCompare(x.le));
  if (bien.etape === 'vendu') {
    const v = lignes.find(x => x.statut === 'vendu');
    const hv = v ? Number((v.donnees as Record<string, unknown>).hono) : NaN;
    return Number.isFinite(hv) && hv > 0 ? hv : null;
  }
  const e = lignes[0];
  const h = e ? Number((e.donnees as Record<string, unknown>).hono) : NaN;
  return Number.isFinite(h) && h > 0 ? h : argentBien(bien.donnees || {}).hono;
}
/* Une vente notée « sans honoraires » (V3.50). */
const venteSansHono = (suivi: SuiviVente[]) => {
  const v = suivi.filter(x => x.type === 'etape' && x.statut === 'vendu').sort((x, y) => y.le.localeCompare(x.le))[0];
  const d = (v?.donnees || {}) as Record<string, unknown>;
  return !!v && (d.sansHonoraires === true || d.hono === 0);
};

export function Anneau({ note, t = 46 }: { note: number; t?: number }) {
  const r = t / 2 - 4, c = 2 * Math.PI * r;
  const couleur = note >= 80 ? '#c9a84c' : note >= 65 ? '#d9bf74' : '#cbd5e1';
  return (
    <span className={b.anneau} style={{ width: t, height: t }}>
      <svg width={t} height={t} aria-hidden="true">
        <circle cx={t / 2} cy={t / 2} r={r} fill="none" stroke="#eef1f6" strokeWidth={4} />
        <circle cx={t / 2} cy={t / 2} r={r} fill="none" stroke={couleur} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${(c * note) / 100} ${c}`} />
      </svg>
      <b className={note >= 100 ? b.cent : undefined}>{note}<small>%</small></b>
    </span>
  );
}

type PropsCarte = {
  bien: BienVente; suivi: SuiviVente[]; nbAcheteurs: number; nbVisites: number; nbOffres: number;
  /* Parmi nbVisites, celles qui sont encore à venir (V3.33 : on dit
     toujours « faites » ou « prévues »). */
  nbPrevues?: number;
  /* V3.50 : celles passées sans compte rendu — ni faites, ni prévues. */
  nbCR?: number;
  /* Où en est son mandat de vente dans Documents (V3.42). */
  mandat?: EtatMandatDoc | null;
  proprio?: string; onClick?: () => void;
};

/* Les puces de l'état (V3.42) : une par chose, avec son dessin, au lieu de
   « 1 visite faite · aucune offre » en gris, calé à droite. Un zéro reste
   pâle. Avant la vente, le mandat en route (« Mandat en préparation »),
   s'il y en a un ; après, les visites et les offres ; et les acheteurs qui
   correspondent. */
function Puces({ bien, mandat, nbAcheteurs, nbVisites, nbPrevues, nbCR = 0, nbOffres, long }: {
  bien: BienVente; mandat?: EtatMandatDoc | null; nbAcheteurs: number; nbVisites: number; nbPrevues: number; nbCR?: number; nbOffres: number; long?: boolean;
}) {
  const avant = avantMandat(bien.etape);
  const enVente = ['mandat', 'suspendu', 'offre'].includes(bien.etape);
  const faites = Math.max(0, nbVisites - nbPrevues - nbCR);
  const pl = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const l: { cle: string; ic: string; t: string; ton?: 'vide' | 'or' | 'mandat' }[] = [];
  if (avant && mandat && mandat.statut !== 'signe') l.push({ cle: 'm', ic: 'plume', t: motMandat(mandat), ton: 'mandat' });
  if (!avant && (enVente || nbVisites > 0 || nbOffres > 0)) {
    if (faites || (!nbPrevues && !nbCR)) l.push({ cle: 'v', ic: 'cle', t: faites ? `${pl(faites, 'visite')} faite${faites > 1 ? 's' : ''}` : 'Aucune visite', ton: faites ? undefined : 'vide' });
    if (nbCR) l.push({ cle: 'c', ic: 'bulle', t: `${nbCR > 1 ? `${nbCR} comptes rendus` : '1 compte rendu'} à faire`, ton: 'or' });
    if (nbPrevues) l.push({ cle: 'p', ic: 'calendrier', t: `${pl(nbPrevues, 'visite')} prévue${nbPrevues > 1 ? 's' : ''}` });
    l.push({ cle: 'o', ic: 'euro', t: nbOffres ? pl(nbOffres, 'offre') : 'Aucune offre', ton: nbOffres ? undefined : 'vide' });
  }
  if (!['vendu', 'retire'].includes(bien.etape) && nbAcheteurs > 0) l.push({ cle: 'a', ic: 'cible', t: `${pl(nbAcheteurs, 'acheteur')}${long ? ' pour ce bien' : ''}`, ton: 'or' });
  if (!l.length) return null;
  return (
    <span className={b.puces}>
      {l.map(x => <span key={x.cle} className={`${b.puceL} ${x.ton === 'vide' ? b.puceVide : x.ton === 'or' ? b.puceOr : x.ton === 'mandat' ? b.puceMandat : ''}`}><Ic n={x.ic} t={13} /><span>{x.t}</span></span>)}
    </span>
  );
}

/* La liste en lignes (V3.17) : la même information qu'une carte, sur une
   ligne, la photo en petit. Au téléphone, deux étages. */
export function LigneBien({ bien, suivi, nbAcheteurs, nbVisites, nbPrevues = 0, nbCR = 0, nbOffres, mandat: mandatDoc = null, proprio, onClick }: PropsCarte) {
  const d = bien.donnees || {};
  const e = etapeDe(bien.etape);
  const photo = bien.photo || lirePhotos(d.photos)[0]?.url || '';
  const prix = prixCarte(bien);
  const etat = ligneEtat(bien, suivi, mandatDoc);
  const mandat = SOUS_MANDAT.includes(bien.etape) && bien.mandat_type ? bien.mandat_type : '';
  const lieu = [villeAffichee(bien.ville || txt(d, 'ville'), bien.code_postal || txt(d, 'cp')), bien.quartier || txt(d, 'quartier')].filter(Boolean).join(' · ');
  const qui = nomProprio(d) || proprio || '';
  return (
    <button type="button" className={b.ligneB} onClick={onClick}>
      <span className={b.ligneImg}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="" loading="lazy" /> : <Ic n="photo" t={20} />}
      </span>
      <span className={b.ligneTitre}>
        <span className={b.ligneEtape}>
          <span className={b.point} style={{ background: e.c }} />{e.court}
          {mandat && <em className={mandat === 'exclusif' ? b.exclu : undefined}>{NOM_MANDAT[mandat]?.toUpperCase()}</em>}
        </span>
        <b className={prix.vide ? b.prixVide : undefined}>{prix.t}</b>
        <small>{specsBien(d) || 'Caractéristiques à saisir'}</small>
      </span>
      <span className={b.ligneLieu}>
        {lieu && <span><Ic n="lieu" t={14} />{lieu}</span>}
        {qui && <span><Ic n="personne" t={14} />{qui}</span>}
      </span>
      <span className={b.ligneEtat}>
        <span className={`${b.ligneEtatT} ${etat.ton === 'alerte' ? b.ligneAlerte : etat.ton === 'ok' ? b.ligneOk : ''}`}><Ic n={etat.ic} t={15} /><span>{etat.t}</span></span>
        <Puces bien={bien} mandat={mandatDoc} nbAcheteurs={nbAcheteurs} nbVisites={nbVisites} nbPrevues={nbPrevues} nbCR={nbCR} nbOffres={nbOffres} />
      </span>
      <span className={b.ligneFleche}><Ic n="droite" t={16} e={2.4} /></span>
    </button>
  );
}

export default function CarteBien({ bien, suivi, nbAcheteurs, nbVisites, nbPrevues = 0, nbCR = 0, nbOffres, mandat: mandatDoc = null, proprio, onClick }: PropsCarte) {
  const d = bien.donnees || {};
  const e = etapeDe(bien.etape);
  const photo = bien.photo || lirePhotos(d.photos)[0]?.url || '';
  const prix = prixCarte(bien);
  const etat = ligneEtat(bien, suivi, mandatDoc);
  const mandat = SOUS_MANDAT.includes(bien.etape) && bien.mandat_type ? bien.mandat_type : '';
  const lieu = [villeAffichee(bien.ville || txt(d, 'ville'), bien.code_postal || txt(d, 'cp')), bien.quartier || txt(d, 'quartier')].filter(Boolean).join(' · ');
  const qui = nomProprio(d) || proprio || '';
  const conclu = bien.etape === 'compromis' || bien.etape === 'vendu';
  const hono = conclu ? honorairesVente(bien, suivi) : null;
  /* Vendu sans honoraires de l'acte : on le dit, plutôt qu'un chiffre qui n'est pas compté. */
  const motHono = hono ? `Honoraires : ${euros(hono)} TTC` : bien.etape === 'vendu' ? (venteSansHono(suivi) ? 'Vente sans honoraires' : 'Honoraires non renseignés') : '';
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag type={onClick ? 'button' : undefined} className={b.carte} onClick={onClick}>
      <div className={b.carteImg}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="" loading="lazy" /> : <span className={b.imgVide}><Ic n="photo" t={26} />Pas encore de photo</span>}
        <span className={b.pastille}><span className={b.point} style={{ background: e.c }} />{e.court}</span>
        {mandat && <span className={`${b.badgeMandat} ${mandat === 'exclusif' ? b.badgeExcl : ''}`}>{NOM_MANDAT[mandat]?.toUpperCase()}</span>}
      </div>
      <div className={b.carteCorps}>
        <div className={b.carteHaut}>
          <span><span className={b.point} style={{ background: e.c }} />{e.court}</span>
          {mandat && <em className={mandat === 'exclusif' ? b.exclu : undefined}>{NOM_MANDAT[mandat]?.toUpperCase()}</em>}
        </div>
        <div className={`${b.prix} ${prix.vide ? b.prixVide : ''}`}>{prix.t}</div>
        <div className={b.specs}>{specsBien(d) || 'Caractéristiques à saisir'}</div>
        {lieu && <div className={b.info}><Ic n="lieu" t={14} /><span>{lieu}</span></div>}
        {qui && <div className={b.info}><Ic n="personne" t={14} /><span>{qui}</span></div>}
      </div>
      <div className={`${b.etat} ${etat.ton === 'alerte' ? b.etatAlerte : etat.ton === 'ok' ? b.etatOk : ''}`}><Ic n={etat.ic} t={15} /><span>{etat.t}</span></div>
      <div className={b.cartePied}>
        {motHono
          ? <span className={b.compteurs}>{motHono}</span>
          : <Puces bien={bien} mandat={mandatDoc} nbAcheteurs={nbAcheteurs} nbVisites={nbVisites} nbPrevues={nbPrevues} nbCR={nbCR} nbOffres={nbOffres} long />}
      </div>
    </Tag>
  );
}
