'use client';

/* ═══ Cocher plusieurs contacts ou plusieurs biens, et agir d'un coup (V3.88) ═══
   Alexandre : « sur la liste des biens, dans n'importe quelle catégorie, des
   petites coches pour sélectionner ; quand j'en ai sélectionné, un petit
   bouton à droite qui dit combien ; et envoyer un mail à tous les contacts
   sélectionnés, ou les supprimer d'un coup. Pareil pour les contacts. »

   · CaseSelection : la case, au coin de la photo d'un bien. Elle apparaît
     au survol de la carte (classe globale `sel-ligne`), et reste visible dès
     qu'une case est cochée (`mode`). Au téléphone (pas de survol), toujours.
     (V3.88, elle recouvrait aussi l'avatar des contacts : remplacée en V3.89
     par CaseLigne.)
   · BarreSelection : la barre qui monte en bas à droite, le nombre, les
     gestes, « Tout sélectionner » et la croix qui décoche tout.
     V3.89 : un geste peut ouvrir un petit menu, au-dessus de la barre
     (« Changer d'étape », « ⋯ ») : trois boutons clairs plutôt que cinq.
   · CaseLigne / CaseTout (V3.89, Alexandre : « j'aime pas trop la sélection
     de la fiche de contact ») : pour les contacts, une colonne de cases
     carrées, toujours visibles, à gauche de chaque ligne, et « Tout cocher »
     dans l'en-tête. L'avatar reste un avatar.
   · ConfirmerLot : la fenêtre avant un geste en lot (supprimer, archiver) :
     la liste de ce qui sera touché, ce qui sera laissé de côté et pourquoi,
     puis l'avancement. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/* La case d'une ligne de contact (V3.89) : un carré, toujours là. */
export function CaseLigne({ on, onBasculer, titre }: { on: boolean; onBasculer: () => void; titre: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={titre} title={titre} className={s.carre} data-on={on ? 'oui' : 'non'}
      onClick={e => { e.stopPropagation(); e.preventDefault(); onBasculer(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
      <i aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg></i>
    </button>
  );
}

/* « Tout cocher », dans l'en-tête de la liste : vide, à moitié (un tiret) ou plein. */
export function CaseTout({ n, total, onTout, onRien }: { n: number; total: number; onTout: () => void; onRien: () => void }) {
  const etat = !n ? 'non' : n >= total ? 'oui' : 'partiel';
  const titre = etat === 'oui' ? 'Tout décocher' : `Tout cocher (${total})`;
  return (
    <button type="button" role="checkbox" aria-checked={etat === 'partiel' ? 'mixed' : etat === 'oui'} aria-label={titre} title={titre} className={s.carre} data-on={etat}
      disabled={!total} onClick={e => { e.stopPropagation(); if (etat === 'oui') onRien(); else onTout(); }}>
      <i aria-hidden="true">{etat === 'partiel'
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 12h12" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}</i>
    </button>
  );
}

/* Le style d'une ligne cochée (contacts) : un liseré doré, un fond clair. */
export const STYLE_CHOISI = { borderColor: '#dcc27a', background: '#fffcf3', boxShadow: '0 0 0 3px rgba(201, 168, 76, .12)' } as const;

/* Un choix du petit menu d'un geste (V3.89). `off` : grisé, avec sa raison en sous-titre. */
export type ChoixMenu = { k: string; lib: string; sous?: string; ic?: string; couleur?: string; danger?: boolean; off?: boolean; onClick: () => void };
export type GesteLot = {
  k: string; lib: string; court?: string; ic: string; onClick?: () => void; danger?: boolean; titre?: string; principal?: boolean;
  /* Un menu au lieu d'une action (« Changer d'étape », « ⋯ »). */
  menu?: ChoixMenu[];
  /* L'icône seule (« ⋯ ») : `lib` sert d'étiquette pour le lecteur d'écran. */
  icone?: boolean;
};

export function BarreSelection({ n, un, plusieurs, gestes, toutes, onVider }: {
  n: number;
  /* « contact sélectionné » / « contacts sélectionnés » */
  un: string; plusieurs: string;
  gestes: GesteLot[];
  /* Tout cocher dans ce qui est affiché (rien si tout l'est déjà). */
  toutes?: { n: number; onClick: () => void } | null;
  onVider: () => void;
}) {
  /* Le menu ouvert (la clé du geste), s'il y en a un. */
  const [menu, setMenu] = useState<string | null>(null);
  const boite = useRef<HTMLDivElement>(null);
  /* Échap ferme le menu ; sinon il décoche tout, comme la croix. */
  useEffect(() => {
    if (!n) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      if (menu) setMenu(null); else onVider();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [n, onVider, menu]);
  /* Un clic ailleurs ferme le menu. */
  useEffect(() => {
    if (!menu) return;
    const dehors = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setMenu(null); };
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [menu]);
  if (!n) return null;
  const ouvert = gestes.find(g => g.k === menu && g.menu);
  const barre = (
    <div className={s.barre} role="region" aria-label="Sélection" ref={boite}>
      {ouvert && (
        <div className={s.menu} role="menu" aria-label={ouvert.lib} key={ouvert.k}>
          {ouvert.menu!.map(c => (
            <button key={c.k} type="button" role="menuitem" className={s.menuChoix} data-danger={c.danger ? 'oui' : undefined} disabled={c.off}
              onClick={() => { setMenu(null); c.onClick(); }}>
              {c.couleur ? <span className={s.menuPuce} style={{ background: c.couleur }} /> : c.ic ? <span className={s.menuIc}><Ic n={c.ic} t={15} e={2.1} /></span> : null}
              <span className={s.menuTx}><b>{c.lib}</b>{c.sous && <small>{c.sous}</small>}</span>
            </button>
          ))}
        </div>
      )}
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
          <button key={g.k} type="button" className={`${s.geste} ${g.icone ? s.gesteIc : ''}`} data-danger={g.danger ? 'oui' : undefined} data-principal={g.principal ? 'oui' : undefined}
            data-ouvert={menu === g.k ? 'oui' : undefined} title={g.titre || (g.icone ? g.lib : undefined)} aria-label={g.icone ? g.lib : undefined}
            aria-haspopup={g.menu ? 'menu' : undefined} aria-expanded={g.menu ? menu === g.k : undefined}
            onClick={() => { if (g.menu) setMenu(m => (m === g.k ? null : g.k)); else { setMenu(null); g.onClick?.(); } }}>
            <Ic n={g.ic} t={15} e={2.1} />
            {!g.icone && <><span className={g.court ? s.long : undefined}>{g.lib}</span>{g.court && <span className={s.court}>{g.court}</span>}</>}
            {g.menu && !g.icone && <span className={s.chevron} aria-hidden="true"><Ic n="haut" t={13} e={2.4} /></span>}
          </button>
        ))}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(barre, document.body);
}

export type Avancement = { fait: number; total: number; erreurs: string[] };

export function ConfirmerLot({ titre, phrase, liste, ignores = [], libValider, danger = false, avancement, onValider, onFermer, enPlus, ic }: {
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
  /* L'icône de l'en-tête (V3.89) : sinon la corbeille, ou l'archive. */
  ic?: string;
}) {
  const fini = !!avancement && avancement.fait + avancement.erreurs.length >= avancement.total;
  const enCours = !!avancement && !fini;
  const bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => { bouton.current?.focus(); }, []);
  const fen = (
    <div className={s.voile} onMouseDown={e => { if (e.target === e.currentTarget && !enCours) onFermer(); }}>
      <div className={s.fen} role="dialog" aria-modal="true" aria-label={titre}>
        <div className={s.fenTete}>
          <span className={s.fenIc} data-danger={danger ? 'oui' : undefined}><Ic n={ic || (danger ? 'corbeille' : 'archive')} t={19} /></span>
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
