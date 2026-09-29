'use client';
/* ═══ La Vue d'ensemble d'un bien (V3.29) ═══════════════════════════════════
   En haut, quatre cartes qui disent où en est la vente : le mandat (ou,
   avant lui, le rendez-vous et l'estimation), les acheteurs, les visites et
   offres, le propriétaire. Dessous, les prochaines visites et ce qui s'est
   passé dernièrement. Maquettes validées : « La nouvelle fiche bien ». */

import type { ReactNode } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import { euros } from '@/lib/mandat';
import { initiales } from './outils';
import v from './VueBien.module.css';

const jourMois = (ymd: string) => {
  const x = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/^1 /, '1er ');
};
const jourLong = (ymd: string) => {
  const x = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  if (isNaN(x.getTime())) return '';
  const t = x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const jours = (ymd: string) => Math.round((Date.parse(`${ymd.slice(0, 10)}T12:00:00`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00`)) / 86400000);
const dans = (ymd: string) => {
  const j = jours(ymd);
  return j === 0 ? 'aujourd’hui' : j === 1 ? 'demain' : j === -1 ? 'hier' : j > 1 ? `dans ${j} jours` : `il y a ${-j} jours`;
};

export function Kpis({ n, children }: { n: number; children: ReactNode }) {
  return <div className={v.kpis} data-n={n}>{children}</div>;
}

/* ── Le mandat : son type, ses dates, et le temps qui passe ── */
export function CarteMandat({ type, numero, signe, fin, onModifier }: {
  type: string; numero: string; signe: string; fin: string; onModifier: () => void;
}) {
  const total = signe && fin ? jours(fin) - jours(signe) : 0;
  const ecoule = signe ? -jours(signe) + 1 : 0;
  const reste = fin ? jours(fin) : null;
  const pct = total > 0 ? Math.min(100, Math.max(2, (ecoule / total) * 100)) : 0;
  return (
    <div className={`${v.kpi} ${v.kpiMarine} ${v.kpiLarge}`}>
      <div className={v.kpiT}><span className={v.kpiIc}><Ic n="plume" t={17} /></span>Le mandat</div>
      <b className={v.kpiGros}>{[type || 'Mandat', numero ? `n° ${numero}` : ''].filter(Boolean).join(' · ')}</b>
      {signe || fin ? (
        <>
          <span className={v.kpiSous}>{[signe ? `Signé le ${jourMois(signe)}` : '', fin ? `jusqu’au ${jourMois(fin)}` : ''].filter(Boolean).join(' · ')}</span>
          {total > 0 && <div className={v.barre}><span style={{ width: `${pct}%` }} /></div>}
          {reste !== null && (
            <span className={reste < 0 ? v.kpiAlerte : reste <= 15 ? v.kpiAttention : v.kpiOr}>
              {reste < 0 ? `Terminé depuis ${-reste} jour${reste < -1 ? 's' : ''}` : total > 0 ? `Jour ${Math.min(ecoule, total)} sur ${total} · il reste ${reste} jour${reste > 1 ? 's' : ''}` : `Il reste ${reste} jour${reste > 1 ? 's' : ''}`}
            </span>
          )}
        </>
      ) : (
        <>
          <span className={v.kpiSous}>Les dates du mandat ne sont pas saisies.</span>
          <button type="button" className={v.kpiBtn} onClick={onModifier}>Les saisir</button>
        </>
      )}
    </div>
  );
}

/* ── Avant le mandat : le rendez-vous, puis l'estimation ── */
export function CarteEstimation({ rdv, fourchette, prix, suivre, proprio, onDefinir, onEstimation }: {
  rdv: string; fourchette: string; prix: number | null; suivre: boolean; proprio: string;
  onDefinir: () => void; onEstimation: () => void;
}) {
  const fait = !!(fourchette || prix);
  return (
    <div className={`${v.kpi} ${v.kpiMarine}`}>
      <div className={v.kpiT}><span className={v.kpiIc}><Ic n={fait ? 'etiquette' : 'calendrier'} t={17} /></span>{fait ? 'L’estimation' : suivre ? 'Le projet' : 'Le rendez-vous d’estimation'}</div>
      {fait ? (
        <>
          <b className={v.kpiGros}>{prix ? euros(prix) : fourchette}</b>
          <span className={v.kpiSous}>{prix && fourchette ? `Prix conseillé · fourchette ${fourchette}` : prix ? 'Prix conseillé' : 'Fourchette'}</span>
          <button type="button" className={v.kpiBtnClair} onClick={onDefinir}>Modifier</button>
        </>
      ) : rdv ? (
        <>
          <b className={v.kpiGros}>{jourLong(rdv)}</b>
          <span className={v.kpiSous}>{[proprio ? `Avec ${proprio}` : 'Sur place', dans(rdv)].join(' · ')}</span>
          {suivre
            ? <button type="button" className={v.kpiBtn} onClick={onEstimation}>Passer à l’estimation</button>
            : <button type="button" className={v.kpiBtn} onClick={onDefinir}>Définir l’estimation</button>}
        </>
      ) : (
        <>
          <b className={v.kpiGros}>À prendre</b>
          <span className={v.kpiSous}>{suivre ? 'Le propriétaire y réfléchit. Le montant se donne en passant à l’estimation.' : 'Pas encore de date.'}</span>
          {suivre
            ? <button type="button" className={v.kpiBtn} onClick={onEstimation}>Passer à l’estimation</button>
            : <button type="button" className={v.kpiBtn} onClick={onDefinir}>Définir l’estimation</button>}
        </>
      )}
    </div>
  );
}

/* ── Les visites et les offres, en chiffres ── */
export type Repartition = { l: string; n: number; c: string }[];
export function CarteVisites({ nbVisites, nbAVenir, nbOffres, repartition, onVoir }: {
  nbVisites: number; nbAVenir: number; nbOffres: number; repartition: Repartition; onVoir: () => void;
}) {
  const total = repartition.reduce((t, x) => t + x.n, 0);
  return (
    <div className={`${v.kpi} ${v.kpiBlanc}`}>
      <div className={v.kpiT} style={{ color: '#6d28d9' }}><span className={v.kpiIc} style={{ background: '#f5f3ff', color: '#7c3aed' }}><Ic n="cle" t={17} /></span>Visites et offres</div>
      <div className={v.chiffres}>
        <div><b>{nbVisites}</b><small>{nbVisites > 1 ? 'visites' : 'visite'}{nbAVenir ? ` · ${nbAVenir} à venir` : ''}</small></div>
        <div><b className={nbOffres ? v.or : undefined}>{nbOffres}</b><small>{nbOffres > 1 ? 'offres en cours' : 'offre en cours'}</small></div>
      </div>
      {total > 0 ? (
        <>
          <div className={v.repart} aria-hidden="true">{repartition.filter(x => x.n).map(x => <span key={x.l} style={{ flex: x.n, background: x.c }} />)}</div>
          <span className={v.kpiSousGris}>{repartition.filter(x => x.n).map(x => `${x.n} ${x.l}`).join(' · ')}</span>
        </>
      ) : <span className={v.kpiSousGris}>{nbVisites ? 'Les comptes rendus diront ce qu’ils en pensent.' : 'Aucune visite pour l’instant.'}</span>}
      <button type="button" className={v.kpiLien} onClick={onVoir}>Voir les visites et offres</button>
    </div>
  );
}

/* ── Le propriétaire : l'appeler en un geste ── */
export function CarteProprio({ nom, sous, tel, pluriel, onFiche, onModifier }: {
  nom: string; sous: string; tel: string; pluriel: boolean; onFiche?: () => void; onModifier: () => void;
}) {
  const brut = tel.replace(/[\s.]+/g, '');
  return (
    <div className={`${v.kpi} ${v.kpiBlanc} ${v.kpiLarge}`}>
      <div className={v.kpiT} style={{ color: '#0f766e' }}><span className={v.kpiIc} style={{ background: '#f0fdfa', color: '#0d9488' }}><Ic n="personne" t={17} /></span>{pluriel ? 'Les propriétaires' : 'Le propriétaire'}</div>
      {nom ? (
        <div className={v.proprio}>
          <span className={v.proprioAv}>{initiales(nom)}</span>
          <div><b>{nom}</b>{sous && <small>{sous}</small>}</div>
        </div>
      ) : <span className={v.kpiSousGris}>Pas encore renseigné.</span>}
      <div className={v.proprioBtns}>
        {tel && <a className={v.pbTel} href={`tel:${brut}`} aria-label="Appeler" title={tel}><Ic n="telephone" t={16} /></a>}
        {tel && <a className={v.pb} href={`sms:${brut}`} aria-label="SMS" title="SMS"><Ic n="bulle" t={16} /></a>}
        {onFiche
          ? <button type="button" className={v.pbTexte} onClick={onFiche}>{pluriel ? 'Leur fiche' : 'Sa fiche'}</button>
          : <button type="button" className={v.pbTexte} onClick={onModifier}>{nom ? 'Relier une fiche' : 'Le renseigner'}</button>}
      </div>
    </div>
  );
}

/* ── Les prochaines visites ── */
export type ProchaineVisite = { cle: string; ymd: string; heure: string; qui: string; sous: string; etat: string; ton: 'bleu' | 'or' | 'gris'; clientId: string | null };
export function BlocProchaines({ items, onVoir, onAjouter, onFiche }: {
  items: ProchaineVisite[]; onVoir: () => void; onAjouter: () => void; onFiche: (clientId: string) => void;
}) {
  return (
    <section className={v.bloc}>
      <div className={v.blocT}>
        <h3>Les prochaines visites</h3>
        <button type="button" className={v.lien} onClick={onAjouter}>+ Visite</button>
      </div>
      {items.length === 0 ? <div className={v.vide}>Aucune visite prévue. « + Visite » : un acheteur suivi, ou quelqu’un hors du CRM.</div> : items.map((x, i) => {
        const d = new Date(`${x.ymd}T12:00:00`);
        const jour = isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').toUpperCase();
        return (
          <div key={x.cle} className={v.visite}>
            <span className={i === 0 ? v.date1 : v.date}><small>{jour}</small><b>{isNaN(d.getTime()) ? '—' : d.getDate()}</b></span>
            <div className={v.visiteTx}>
              {x.clientId
                ? <button type="button" className={v.visiteNom} onClick={() => onFiche(x.clientId!)}>{[x.qui, x.heure ? x.heure.replace(':', ' h ').replace(/ 00$/, '') : ''].filter(Boolean).join(' · ')}</button>
                : <b className={v.visiteNom}>{[x.qui, x.heure ? x.heure.replace(':', ' h ').replace(/ 00$/, '') : ''].filter(Boolean).join(' · ')}</b>}
              <small>{x.sous}</small>
            </div>
            <span className={`${v.etat} ${v['etat_' + x.ton]}`}>{x.etat}</span>
          </div>
        );
      })}
      <button type="button" className={v.lienBas} onClick={onVoir}>Toutes les visites et offres</button>
    </section>
  );
}

/* ── Dernièrement : les quatre dernières lignes de l'historique ── */
export type Recent = { cle: string; titre: string; detail?: string; le: string; c: string };
export function BlocDernierement({ items, onTout }: { items: Recent[]; onTout: () => void }) {
  return (
    <section className={v.bloc}>
      <div className={v.blocT}><h3>Dernièrement</h3></div>
      {items.length === 0 ? <div className={v.vide}>Rien encore.</div> : (
        <div className={v.recents}>
          {items.map(x => (
            <div key={x.cle} className={v.recent}>
              <span className={v.point} style={{ background: x.c }} />
              <span className={v.recentTx}><b>{x.titre}</b>{x.detail ? ` · ${x.detail}` : ''}</span>
              <span className={v.recentLe}>{jourMois(x.le)}</span>
            </div>
          ))}
        </div>
      )}
      <button type="button" className={v.lienBas} onClick={onTout}>Tout l’historique</button>
    </section>
  );
}
