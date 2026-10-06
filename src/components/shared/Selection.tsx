'use client';

/* ═══ Cocher plusieurs contacts ou plusieurs biens, et agir d'un coup (V3.88) ═══
   Alexandre : « sur la liste des biens, dans n'importe quelle catégorie, des
   petites coches pour sélectionner ; quand j'en ai sélectionné, un petit
   bouton à droite qui dit combien ; et envoyer un mail à tous les contacts
   sélectionnés, ou les supprimer d'un coup. Pareil pour les contacts. »

   · CaseSelection : la case, posée sur l'avatar d'un contact ou sur la photo
     d'un bien. Elle apparaît au survol de la ligne (classe globale
     `sel-ligne` sur la ligne), et reste visible dès qu'une case est cochée
     (`mode`). Au téléphone (pas de survol), une petite case ronde au coin.
   · BarreSelection : la barre qui monte en bas à droite, le nombre, les
     gestes, « Tout sélectionner » et la croix qui décoche tout.
   · ConfirmerLot : la fenêtre avant un geste en lot (supprimer, archiver) :
     la liste de ce qui sera touché, ce qui sera laissé de côté et pourquoi,
     puis l'avancement. */

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '@/components/documents/ApercuActe';
import s from './Selection.module.css';

export function CaseSelection({ on, mode, onBasculer, titre, coin = false, className }: {
  on: boolean;
  /* Au moins une case est cochée dans la liste : toutes les cases se montrent. */
  mode: boolean;
  onBasculer: () => void;
  titre: string;
  /* Sur la photo d'un bien : une case au coin, pas sur toute l'image. */
  coin?: boolean;
  className?: string;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={titre} title={titre}
      className={`${s.case} ${coin ? s.caseCoin : ''} ${className || ''}`} data-on={on ? 'oui' : 'non'} data-mode={mode ? 'oui' : 'non'}
      onClick={e => { e.stopPropagation(); e.preventDefault(); onBasculer(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

/* L'avatar d'un contact, avec sa case par-dessus. */
export function AvecCase({ children, ...p }: { children: ReactNode; on: boolean; mode: boolean; onBasculer: () => void; titre: string }) {
  return <span className={s.porte}>{children}<CaseSelection {...p} /></span>;
}

/* Le style d'une ligne cochée (contacts) : un liseré doré, un fond clair. */
export const STYLE_CHOISI = { borderColor: '#dcc27a', background: '#fffcf3', boxShadow: '0 0 0 3px rgba(201, 168, 76, .12)' } as const;

export type GesteLot = { k: string; lib: string; court?: string; ic: string; onClick: () => void; danger?: boolean; titre?: string; principal?: boolean };

export function BarreSelection({ n, un, plusieurs, gestes, toutes, onVider }: {
  n: number;
  /* « contact sélectionné » / « contacts sélectionnés » */
  un: string; plusieurs: string;
  gestes: GesteLot[];
  /* Tout cocher dans ce qui est affiché (rien si tout l'est déjà). */
  toutes?: { n: number; onClick: () => void } | null;
  onVider: () => void;
}) {
  /* Échap décoche tout, comme la croix. */
  useEffect(() => {
    if (!n) return;
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onVider(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [n, onVider]);
  if (!n) return null;
  const barre = (
    <div className={s.barre} role="region" aria-label="Sélection">
      <div className={s.barreTete}>
        <span className={s.barreN}>{n}</span>
        <span className={s.barreLib}>{n > 1 ? plusieurs : un}</span>
        {toutes && toutes.n > n && (
          <button type="button" className={s.barreTout} onClick={toutes.onClick}>
            <span className={s.long}>{`Tout sélectionner (${toutes.n})`}</span><span className={s.court}>{`Tout (${toutes.n})`}</span>
          </button>
        )}
        <button type="button" className={s.barreX} onClick={onVider} aria-label="Tout décocher" title="Tout décocher (Échap)"><Ic n="croix" t={15} e={2.4} /></button>
      </div>
      <div className={s.barreGestes}>
        {gestes.map(g => (
          <button key={g.k} type="button" className={s.geste} data-danger={g.danger ? 'oui' : undefined} data-principal={g.principal ? 'oui' : undefined} title={g.titre} onClick={g.onClick}>
            <Ic n={g.ic} t={15} e={2.1} /><span className={g.court ? s.long : undefined}>{g.lib}</span>{g.court && <span className={s.court}>{g.court}</span>}
          </button>
        ))}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(barre, document.body);
}

export type Avancement = { fait: number; total: number; erreurs: string[] };

export function ConfirmerLot({ titre, phrase, liste, ignores = [], libValider, danger = false, avancement, onValider, onFermer, enPlus }: {
  titre: string; phrase: string;
  /* Ce qui sera touché (des noms). */
  liste: string[];
  /* Ce qui est laissé de côté, et pourquoi. */
  ignores?: { nom: string; pourquoi: string }[];
  libValider: string; danger?: boolean;
  /* Pendant et après le geste : null avant. */
  avancement: Avancement | null;
  onValider: () => void; onFermer: () => void;
  enPlus?: ReactNode;
}) {
  const fini = !!avancement && avancement.fait + avancement.erreurs.length >= avancement.total;
  const enCours = !!avancement && !fini;
  const bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => { bouton.current?.focus(); }, []);
  const fen = (
    <div className={s.voile} onMouseDown={e => { if (e.target === e.currentTarget && !enCours) onFermer(); }}>
      <div className={s.fen} role="dialog" aria-modal="true" aria-label={titre}>
        <div className={s.fenTete}>
          <span className={s.fenIc} data-danger={danger ? 'oui' : undefined}><Ic n={danger ? 'corbeille' : 'archive'} t={19} /></span>
          <div className={s.fenTx}><h2>{titre}</h2><p>{phrase}</p></div>
          <button type="button" className={s.fermer} aria-label="Fermer" disabled={enCours} onClick={onFermer}><Ic n="croix" t={15} e={2.3} /></button>
        </div>
        <div className={s.fenCorps}>
          {liste.length > 0 && (
            <ul className={s.liste}>
              {liste.map((x, i) => <li key={`${x}-${i}`}><Ic n={danger ? 'corbeille' : 'check'} t={13} e={2.2} /><span>{x}</span></li>)}
            </ul>
          )}
          {ignores.length > 0 && (
            <div className={s.ignores}>
              <b>{ignores.length > 1 ? `${ignores.length} laissés de côté` : '1 laissé de côté'}</b>
              <ul>{ignores.map((x, i) => <li key={`${x.nom}-${i}`}><span>{x.nom}</span><small>{x.pourquoi}</small></li>)}</ul>
            </div>
          )}
          {enPlus}
          {avancement && (
            <div className={s.avance} role="status">
              <span className={s.avanceBarre}><i style={{ width: `${avancement.total ? ((avancement.fait + avancement.erreurs.length) / avancement.total) * 100 : 100}%` }} /></span>
              <span>{fini ? `${avancement.fait} sur ${avancement.total} : c’est fait.` : `${avancement.fait + avancement.erreurs.length} sur ${avancement.total}…`}</span>
              {avancement.erreurs.length > 0 && <ul className={s.erreurs}>{avancement.erreurs.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
          )}
        </div>
        <div className={s.fenPied}>
          {fini ? (
            <button type="button" className={s.btn} ref={bouton} onClick={onFermer}>Fermer</button>
          ) : (
            <>
              <button type="button" className={s.btn} disabled={enCours} onClick={onFermer}>Annuler</button>
              <button type="button" ref={bouton} className={`${s.btn} ${danger ? s.btnDanger : s.btnPrim}`} disabled={enCours || !liste.length} onClick={onValider}>
                {enCours ? 'En cours…' : libValider}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(fen, document.body);
}
