'use client';
import { euros } from '@/lib/mandat';
import { num, txt } from '@/lib/actes';
import {
  argentBien, etapeDe, ligneEtat, lirePhotos, nomProprio, specsBien, type BienVente, type SuiviVente,
} from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import b from './Biens.module.css';

/* ═══ La carte d'un bien (la liste, et l'aperçu de l'éditeur) ═════════════ */

export const NOM_MANDAT: Record<string, string> = { simple: 'Simple', semi: 'Semi-exclusif', exclusif: 'Exclusif' };
const SOUS_MANDAT = ['mandat', 'offre', 'compromis', 'suspendu'];

/* Le prix d'une carte : affiché, sinon la fourchette d'estimation. */
export function prixCarte(bien: BienVente): { t: string; vide: boolean } {
  const d = bien.donnees || {};
  const p = bien.prix ?? num(d, 'prix');
  if (p) return { t: euros(p), vide: false };
  const a = num(d, 'estimBasse'), h = num(d, 'estimHaute');
  if (a && h) return { t: `${euros(a).replace(' €', '')} – ${euros(h)}`, vide: false };
  if (a || h) return { t: euros((a || h) as number), vide: false };
  return { t: bien.etape === 'estimation' ? 'À estimer' : 'Prix à fixer', vide: true };
}

/* Les honoraires d'une vente conclue : ceux saisis au compromis ou à la
   vente, sinon ceux du mandat. */
export function honorairesVente(bien: BienVente, suivi: SuiviVente[]): number | null {
  const e = suivi.filter(x => x.type === 'etape' && (x.statut === 'vendu' || x.statut === 'compromis')).sort((x, y) => y.le.localeCompare(x.le))[0];
  const h = e ? Number((e.donnees as Record<string, unknown>).hono) : NaN;
  return Number.isFinite(h) && h > 0 ? h : argentBien(bien.donnees || {}).hono;
}

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

export default function CarteBien({ bien, suivi, nbAcheteurs, nbVisites, nbOffres, proprio, onClick }: {
  bien: BienVente; suivi: SuiviVente[]; nbAcheteurs: number; nbVisites: number; nbOffres: number;
  proprio?: string; onClick?: () => void;
}) {
  const d = bien.donnees || {};
  const e = etapeDe(bien.etape);
  const photo = bien.photo || lirePhotos(d.photos)[0]?.url || '';
  const prix = prixCarte(bien);
  const etat = ligneEtat(bien, suivi);
  const mandat = SOUS_MANDAT.includes(bien.etape) && bien.mandat_type ? bien.mandat_type : '';
  const lieu = [bien.ville || txt(d, 'ville'), bien.quartier || txt(d, 'quartier')].filter(Boolean).join(' · ');
  const qui = nomProprio(d) || proprio || '';
  const conclu = bien.etape === 'compromis' || bien.etape === 'vendu';
  const hono = conclu ? honorairesVente(bien, suivi) : null;
  const enVente = !['vendu', 'retire'].includes(bien.etape);
  const compte = bien.etape !== 'estimation' && (nbVisites > 0 || nbOffres > 0 || bien.etape === 'mandat')
    ? `${nbVisites} visite${nbVisites > 1 ? 's' : ''} · ${nbOffres} offre${nbOffres > 1 ? 's' : ''}` : '';
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
          {mandat && <em className={mandat === 'exclusif' ? 'exclu' : undefined}>{NOM_MANDAT[mandat]?.toUpperCase()}</em>}
        </div>
        <div className={`${b.prix} ${prix.vide ? b.prixVide : ''}`}>{prix.t}</div>
        <div className={b.specs}>{specsBien(d) || 'Caractéristiques à saisir'}</div>
        {lieu && <div className={b.info}><Ic n="lieu" t={14} /><span>{lieu}</span></div>}
        {qui && <div className={b.info}><Ic n="personne" t={14} /><span>{qui}</span></div>}
      </div>
      <div className={`${b.etat} ${etat.ton === 'alerte' ? b.etatAlerte : etat.ton === 'ok' ? b.etatOk : ''}`}>{etat.t}</div>
      <div className={b.cartePied}>
        {enVente && nbAcheteurs > 0 && <span className={b.chipOr}><Ic n="cible" t={14} />{`${nbAcheteurs} acheteur${nbAcheteurs > 1 ? 's' : ''} pour ce bien`}</span>}
        {hono ? <span className={b.compteurs}>{`Honoraires : ${euros(hono)}`}</span> : compte ? <span className={b.compteurs}>{compte}</span> : null}
      </div>
    </Tag>
  );
}
