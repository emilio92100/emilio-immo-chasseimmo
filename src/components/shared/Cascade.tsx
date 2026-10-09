'use client';

/* ═══ Le contenu d'un onglet, en cascade (V3.152, style « C ») ═══════════
   Quand `cle` change (un autre onglet, une autre tuile, un autre filtre),
   l'ancien contenu s'efface en 130 ms, posé par-dessus, et les blocs du
   nouveau tombent de 12 px, l'un après l'autre (src/lib/mouvement.ts,
   `cascader`). Seuls les blocs à l'écran bougent ; le contenu est utilisable
   tout de suite.

   C'est un <div> ordinaire, rendu à neuf à chaque clé (comme le faisaient les
   `key={onglet}` qu'il remplace) : une mise en page qui comptait sur lui
   comme conteneur passe par `className` et `style`.

   `arrivee` : la cascade joue aussi au premier affichage (une liste qui
   arrive après sa silhouette de chargement). Sans lui, le premier affichage
   reste celui de l'écran.

   Sans le mouvement (navigateur ancien), rien ne bouge ici : une liste qui
   avait la classe `cascade` de globals.css la garde dans `className`, et
   cette animation-là prend le relais, comme avant. */

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cascader } from '@/lib/mouvement';

export default function Cascade({ cle, arrivee = false, className, style, children }: {
  cle: string | number;
  arrivee?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const boite = useRef<HTMLDivElement>(null);
  /* La clé déjà jouée : le double appel des effets du mode strict ne relance
     pas la cascade. */
  const jouee = useRef<string | number | null>(arrivee ? null : cle);
  useLayoutEffect(() => {
    if (jouee.current === cle) return;
    jouee.current = cle;
    if (boite.current) cascader(boite.current);
  }, [cle]);
  return (
    <div key={cle} ref={boite} data-emi-cascade="" className={className} style={style}>
      {children}
    </div>
  );
}
