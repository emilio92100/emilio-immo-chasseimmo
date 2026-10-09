'use client';

/* ═══ Des onglets qui glissent (V3.28) ══════════════════════════════════
   La barre des rubriques d'une fiche : la pastille de l'onglet choisi glisse
   jusqu'au nouvel onglet au lieu de sauter, et le contenu arrive en fondu,
   du côté où l'on va (vers la droite si l'onglet est plus loin, vers la
   gauche s'il est avant). Fiche d'un bien ; la fiche contact suivra.
   V3.152 : la pastille glisse en 300 ms (la courbe de la maquette « C ») et
   le contenu tombe en cascade (CorpsOnglet). */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Cascade from './Cascade';
import o from './OngletsGlissants.module.css';

export type OngletGlissant<K extends string> = { k: K; l: ReactNode; ic?: ReactNode; n?: number | null };

export function BarreOnglets<K extends string>({ onglets, actif, onChoisir, className, label }: {
  onglets: OngletGlissant<K>[];
  actif: K;
  onChoisir: (k: K) => void;
  className?: string;
  label: string;
}) {
  const nav = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; w: number } | null>(null);
  /* Pas de glissement au premier affichage : la pastille est posée, puis
     seulement ensuite elle s'anime. */
  const [anime, setAnime] = useState(false);
  const cle = onglets.map(x => `${x.k}:${x.n ?? ''}`).join('|');

  useLayoutEffect(() => {
    const n = nav.current;
    if (!n) return;
    const mesurer = () => {
      const el = n.querySelector<HTMLElement>(`[data-k="${actif}"]`);
      if (el) setPos(p => (p && p.x === el.offsetLeft && p.w === el.offsetWidth ? p : { x: el.offsetLeft, w: el.offsetWidth }));
    };
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(n);
    return () => ro.disconnect();
  }, [actif, cle]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnime(true));
    return () => cancelAnimationFrame(t);
  }, []);

  /* Au téléphone, la barre défile : l'onglet choisi vient en vue, hors du
     fondu des bords (32 px, V3.152 — voir Defilement.tsx). */
  useEffect(() => {
    const n = nav.current;
    const el = n?.querySelector<HTMLElement>(`[data-k="${actif}"]`);
    if (!n || !el || n.scrollWidth <= n.clientWidth) return;
    const g = el.offsetLeft - 36, d = el.offsetLeft + el.offsetWidth + 36 - n.clientWidth;
    if (g < n.scrollLeft) n.scrollTo({ left: g, behavior: 'smooth' });
    else if (d > n.scrollLeft) n.scrollTo({ left: d, behavior: 'smooth' });
  }, [actif]);

  return (
    <nav ref={nav} className={`${o.barre} ${className || ''}`} aria-label={label} data-defile="fondu">
      {pos && <span className={`${o.pastille} ${anime ? o.anime : ''}`} style={{ width: pos.w, transform: `translateX(${pos.x}px)` }} aria-hidden="true" />}
      {onglets.map(x => (
        <button key={x.k} data-k={x.k} type="button" className={`${o.onglet} ${actif === x.k ? o.on : ''} ${actif === x.k && !pos ? o.onSeul : ''}`}
          aria-pressed={actif === x.k} onClick={() => onChoisir(x.k)}>
          {x.ic}{x.l}{x.n ? <i>{x.n}</i> : null}
        </button>
      ))}
    </nav>
  );
}

/* Le contenu d'un onglet. V3.152 (style « C » choisi par Alexandre) :
   l'ancien s'efface, les blocs du nouveau tombent en cascade — c'est
   <Cascade> (src/lib/mouvement.ts). Le sens (`ordre`) ne sert plus qu'à
   l'animation de secours, quand le mouvement ne tourne pas : le contenu
   arrive alors en fondu, glissé du côté où l'on va, comme avant. */
export function CorpsOnglet<K extends string>({ k, ordre, children }: { k: K; ordre: K[]; children: ReactNode }) {
  const prec = useRef(k);
  const sens = useRef(1);
  if (prec.current !== k) {
    sens.current = ordre.indexOf(k) >= ordre.indexOf(prec.current) ? 1 : -1;
    prec.current = k;
  }
  return <Cascade cle={k} className={o.corps} style={{ '--sens': sens.current } as CSSProperties}>{children}</Cascade>;
}
