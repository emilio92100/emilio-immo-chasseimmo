'use client';
/* ═══ Ce qui se déplie, en douceur (V3.32) ═══════════════════════════════
   Alexandre : « quand on déplie ou on replie, il faut que ce soit fluide,
   joli, pas brusque ». Avant, un bloc apparaissait d'un coup ({ouvert && …}).
   Ici, la hauteur glisse de 0 à la taille du contenu (grille 0fr → 1fr : pas
   besoin de connaître la hauteur), le contenu arrive en fondu et descend de
   quelques pixels. Même geste partout : documents, dossier, textes longs,
   associés, listes « Voir les autres »…

   - Le contenu n'est rendu qu'à la première ouverture (rien de lourd tant
     que c'est replié), puis gardé : il se replie en glissant lui aussi.
   - Ouvert et arrivé, le débordement redevient visible : une ombre, un menu
     ou un contour de focus ne sont plus coupés.
   - `inert` quand c'est replié : ni clic ni tabulation dans ce qu'on ne voit pas.
   - `ecart` : le `gap` du parent (en px). Replié, le bloc le reprend par une
     marge négative : pas de vide fantôme sous ce qui précède.
   - Le mouvement réduit du système (prefers-reduced-motion) est respecté. */
import { useState, type CSSProperties, type ReactNode } from 'react';
import s from './Depliant.module.css';

export default function Depliant({ ouvert, children, className, id, ecart }: {
  ouvert: boolean; children: ReactNode; className?: string; id?: string; ecart?: number;
}) {
  const [monte, setMonte] = useState(ouvert);
  const [arrive, setArrive] = useState(ouvert);
  /* Ouvert pour la première fois : on monte le contenu dans le même rendu. */
  if (ouvert && !monte) setMonte(true);
  /* On replie : le débordement se referme tout de suite, avant de glisser. */
  if (!ouvert && arrive) setArrive(false);
  return (
    <div id={id} className={`${s.depliant} ${className || ''}`} data-ouvert={ouvert ? 'oui' : 'non'} data-arrive={ouvert && arrive ? 'oui' : 'non'}
      inert={!ouvert} style={ecart ? ({ '--ecart': `${ecart}px` } as CSSProperties) : undefined}
      onTransitionEnd={e => { if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows' && ouvert) setArrive(true); }}>
      <div className={s.dedans}>{monte ? children : null}</div>
    </div>
  );
}
