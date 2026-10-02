'use client';
/* ═══ La Vue d'ensemble d'un bien (V3.29) ═══════════════════════════════════
   En haut, quatre cartes qui disent où en est la vente : le mandat (ou,
   avant lui, le rendez-vous et l'estimation), les acheteurs, les visites et
   offres, le propriétaire. Dessous, les prochaines visites et ce qui s'est
   passé dernièrement. Maquettes validées : « La nouvelle fiche bien ». */

import { useState, type ReactNode } from 'react';
import Depliant from '@/components/shared/Depliant';
import { Ic } from '@/components/documents/ApercuActe';
import v from './VueBien.module.css';
import { jourParis } from '@/lib/mandat';

const jourMois = (ymd: string) => {
  const x = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/^1 /, '1er ');
};
const jours = (ymd: string) => Math.round((Date.parse(`${ymd.slice(0, 10)}T12:00:00`) - Date.parse(`${jourParis()}T12:00:00`)) / 86400000);
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

/* ── Avant le mandat : le parcours de l'estimation (V3.31) ──────────────
   Il remplace la carte « Le rendez-vous d'estimation » du haut et le bloc
   « L'estimation » du bas, qui disaient la même chose à deux endroits
   (maquette B validée par Alexandre). Les cinq jalons en frise — rendez-vous,
   visite sur place, montant, avis de valeur, mandat —, celui en cours en or,
   puis « Ensuite : … » et le bouton qui fait avancer. En colonne sur le
   téléphone. */
export type Jalon = { cle: string; l: string; ic: string; v: string; etat: 'fait' | 'encours' | 'avenir' };
export function ParcoursEstimation({ titre, jalons, ensuite, action, onDejaSigne, children }: {
  titre: string; jalons: Jalon[]; ensuite: string; action?: { l: string; onClick: () => void }; onDejaSigne: () => void; children?: ReactNode;
}) {
  const n = jalons.findIndex(j => j.etat === 'encours');
  return (
    <section className={v.parcours}>
      <div className={v.parcoursT}>
        <span className={v.parcoursIc}><Ic n="regle" t={17} /></span>
        <h3>{titre}</h3>
        <span className={v.parcoursN}>{n >= 0 ? `étape ${n + 1} sur ${jalons.length}` : ''}</span>
      </div>
      <ol className={v.jalons} style={{ gridTemplateColumns: `repeat(${jalons.length}, minmax(0, 1fr))` }}>
        {jalons.map(j => (
          <li key={j.cle} data-etat={j.etat}>
            <span className={v.jRond}><Ic n={j.etat === 'fait' ? 'check' : j.ic} t={j.etat === 'fait' ? 16 : 15} e={j.etat === 'fait' ? 2.8 : 1.9} /></span>
            <span className={v.jTx}><b>{j.l}</b><small>{j.v}</small></span>
          </li>
        ))}
      </ol>
      {children}
      <div className={v.ensuite}>
        <span>{`Ensuite : ${ensuite}`}</span>
        <span className={v.ensuiteBtns}>
          {action && <button type="button" className={v.ensuiteBtn} onClick={action.onClick}>{action.l}</button>}
          <button type="button" className={v.ensuiteLien} onClick={onDejaSigne}>Le mandat est déjà signé ?</button>
        </span>
      </div>
    </section>
  );
}

/* ── Pour la visite (V3.31) : les indications de visite en carte, à côté du
   propriétaire. Les trois premières lignes, le chemin et les consignes ;
   « Tout voir » déplie le reste. ── */
export type LigneVisite = { ic: string; l: string; v: string; tel?: string };
/* Une ligne longue (un nom et un numéro, un créneau détaillé) prend toute la
   largeur de la carte (V3.45) : dans une colonne de 100 px, elle se coupait
   mot à mot. */
const large = (x: LigneVisite) => x.v.length + (x.tel?.length || 0) > 20;
function LiVisite({ x }: { x: LigneVisite }) {
  return (
    <div className={v.visiteLi} data-large={large(x) ? 'oui' : 'non'}>
      <Ic n={x.ic} t={14} />
      <span>
        <small>{x.l}</small>
        <b>{x.v}</b>
        {x.tel && <a className={v.visiteTel} href={`tel:${x.tel.replace(/[\s.]+/g, '')}`}>{x.tel}</a>}
      </span>
    </div>
  );
}
export function CartePourLaVisite({ lignes, encarts, onModifier }: { lignes: LigneVisite[]; encarts: { l: string; v: string }[]; onModifier: () => void }) {
  const [tout, setTout] = useState(false);
  const vide = !lignes.length && !encarts.length;
  const long = lignes.length > 3 || encarts.some(x => x.v.length > (lignes.length ? 110 : 300));
  return (
    <div className={`${v.kpi} ${v.kpiBlanc}`}>
      <div className={v.kpiT} style={{ color: '#1d4ed8' }}>
        <span className={v.kpiIc} style={{ background: '#eff6ff', color: '#2563eb' }}><Ic n="cle" t={17} /></span>
        Pour la visite
        <button type="button" className={v.kpiModif} onClick={onModifier}>{vide ? 'Les noter' : 'Modifier'}</button>
      </div>
      {vide ? <span className={v.kpiSousGris}>Occupé ou libre, clés, codes, contact sur place : à noter dès maintenant, pour ta visite puis celles des acheteurs.</span> : (
        <>
          {lignes.length > 0 && (
            <div className={v.visiteL}>
              {/* Les trois premières côte à côte (V3.32) : la carte ne dépasse
                  plus ses voisines, plus de grand blanc à côté d'elle. */}
              <div className={v.visiteGrille}>
                {lignes.slice(0, 3).map(x => <LiVisite key={x.l} x={x} />)}
              </div>
              {/* Le reste glisse à l'ouverture (V3.32). */}
              {lignes.length > 3 && (
                <Depliant ouvert={tout} ecart={7}>
                  <div className={v.visiteL}>
                    {lignes.slice(3).map(x => <LiVisite key={x.l} x={x} />)}
                  </div>
                </Depliant>
              )}
            </div>
          )}
          {/* Le rognage sur la ligne intérieure : sur le cadre, la 3e ligne
              débordait dans le bas du cadre (V3.32). */}
          {encarts.map(x => <div key={x.l} className={v.visiteEncart}><span className={tout ? undefined : lignes.length ? v.visiteEncartCourt : v.visiteEncartMoyen}><b>{`${x.l} : `}</b>{x.v}</span></div>)}
          {long && <button type="button" className={v.kpiLienBleu} onClick={() => setTout(!tout)}>{tout ? 'Réduire' : 'Tout voir'}</button>}
        </>
      )}
    </div>
  );
}

/* ── Les visites et les offres, en chiffres ── */
export type Repartition = { l: string; n: number; c: string }[];
export function CarteVisites({ nbVisites, nbAVenir, nbOffres, repartition, prochaine, onVoir, onVisite, onOffre }: {
  nbVisites: number; nbAVenir: number; nbOffres: number; repartition: Repartition; onVoir: () => void;
  /* V3.32 : la prochaine visite (« jeu. 2 oct. · 18 h · Paul MARTIN »), et
     les deux gestes — la carte n'a plus de grand blanc sous ses chiffres. */
  prochaine?: string; onVisite?: () => void; onOffre?: () => void;
}) {
  const total = repartition.reduce((t, x) => t + x.n, 0);
  return (
    <div className={`${v.kpi} ${v.kpiBlanc}`}>
      <div className={v.kpiT} style={{ color: '#6d28d9' }}><span className={v.kpiIc} style={{ background: '#f5f3ff', color: '#7c3aed' }}><Ic n="cle" t={17} /></span>Visites et offres</div>
      <div className={v.chiffres}>
        {/* Faites (la date est passée) et prévues, jamais « 3 visites » tout court (V3.33). */}
        <div><b>{nbVisites - nbAVenir}</b><small>{`${nbVisites - nbAVenir > 1 ? 'visites faites' : 'visite faite'}${nbAVenir ? ` · ${nbAVenir} prévue${nbAVenir > 1 ? 's' : ''}` : ''}`}</small></div>
        <div><b className={nbOffres ? v.or : undefined}>{nbOffres}</b><small>{nbOffres > 1 ? 'offres en cours' : 'offre en cours'}</small></div>
      </div>
      {prochaine && <span className={v.voProchaine}><Ic n="calendrier" t={14} /><span><small>Prochaine visite</small><b>{prochaine}</b></span></span>}
      {total > 0 ? (
        <>
          <div className={v.repart} aria-hidden="true">{repartition.filter(x => x.n).map(x => <span key={x.l} style={{ flex: x.n, background: x.c }} />)}</div>
          <span className={v.kpiSousGris}>{repartition.filter(x => x.n).map(x => `${x.n} ${x.l}`).join(' · ')}</span>
        </>
      ) : !prochaine && <span className={v.kpiSousGris}>{nbVisites ? 'Les comptes rendus diront ce qu’ils en pensent.' : 'Aucune visite pour l’instant.'}</span>}
      {(onVisite || onOffre) && (
        <div className={v.voBtns}>
          {onVisite && <button type="button" className={v.voBtn} onClick={onVisite}><Ic n="calendrier" t={14} /><span>Organiser une visite</span></button>}
          {onOffre && <button type="button" className={`${v.voBtn} ${v.voBtnOr}`} onClick={onOffre}><Ic n="euro" t={14} /><span>Enregistrer une offre</span></button>}
        </div>
      )}
      <button type="button" className={v.kpiLien} style={onVisite || onOffre ? { marginTop: 0 } : undefined} onClick={onVoir}>Voir les visites et offres</button>
    </div>
  );
}

/* ── Le propriétaire : la carte « Le propriétaire » (V3.29-V3.53) a laissé
   la place à la pastille à cheval sur le bandeau (PastilleProprio, V3.54). ── */

/* ── Les prochaines visites ── */
export type ProchaineVisite = { cle: string; ymd: string; heure: string; qui: string; sous: string; etat: string; ton: 'bleu' | 'or' | 'gris'; clientId: string | null };
export function BlocProchaines({ items, onVoir, onAjouter, onFiche }: {
  items: ProchaineVisite[]; onVoir: () => void; onAjouter?: () => void; onFiche: (clientId: string) => void;
}) {
  return (
    <section className={v.bloc}>
      <div className={v.blocT}>
        <h3>Les prochaines visites</h3>
        {onAjouter && <button type="button" className={v.lien} onClick={onAjouter}>+ Visite</button>}
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
              <span className={v.recentTx}><b>{x.titre}</b>{x.detail ? ` · ${x.detail.split('\n')[0]}` : ''}</span>
              <span className={v.recentLe}>{jourMois(x.le)}</span>
            </div>
          ))}
        </div>
      )}
      <button type="button" className={v.lienBas} onClick={onTout}>Tout l’historique</button>
    </section>
  );
}
