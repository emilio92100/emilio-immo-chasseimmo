'use client';

/* ═══ Des onglets qui glissent (V3.28) ══════════════════════════════════
   La barre des rubriques d'une fiche : la pastille de l'onglet choisi glisse
   jusqu'au nouvel onglet au lieu de sauter, et le contenu arrive en fondu,
   du côté où l'on va (vers la droite si l'onglet est plus loin, vers la
   gauche s'il est avant). Fiche d'un bien ; la fiche contact suivra. */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

  /* Au téléphone, la barre défile : l'onglet choisi vient en vue. */
  useEffect(() => {
    const n = nav.current;
    const el = n?.querySelector<HTMLElement>(`[data-k="${actif}"]`);
    if (!n || !el || n.scrollWidth <= n.clientWidth) return;
    const g = el.offsetLeft - 16, d = el.offsetLeft + el.offsetWidth + 16 - n.clientWidth;
    if (g < n.scrollLeft) n.scrollTo({ left: g, behavior: 'smooth' });
    else if (d > n.scrollLeft) n.scrollTo({ left: d, behavior: 'smooth' });
  }, [actif]);

  return (
    <nav ref={nav} className={`${o.barre} ${className || ''}`} aria-label={label}>
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

/* Le contenu d'un onglet : il arrive en fondu, glissé du côté où l'on va. */
export function CorpsOnglet<K extends string>({ k, ordre, children }: { k: K; ordre: K[]; children: ReactNode }) {
  const prec = useRef(k);
  const sens = useRef(1);
  if (prec.current !== k) {
    sens.current = ordre.indexOf(k) >= ordre.indexOf(prec.current) ? 1 : -1;
    prec.current = k;
  }
  return <div key={k} className={o.corps} style={{ '--sens': sens.current } as CSSProperties}>{children}</div>;
}
