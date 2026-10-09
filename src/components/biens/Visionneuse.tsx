'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Photo } from '@/lib/biens-vente';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import v from './Visionneuse.module.css';

/* ═══ Les photos d'un bien, en grand (V3.31) ═══════════════════════════════
   Un clic sur une photo (onglet Photos, ou l'éditeur) l'ouvre sur tout
   l'écran, par-dessus le reste : les flèches passent à la précédente ou à la
   suivante (et reviennent au début après la dernière), comme le clavier
   (← →) et le doigt sur le téléphone (glisser). Échap, la croix ou un clic
   à côté de la photo referment. En bas : sa légende et les vignettes, pour
   sauter directement à une photo.

   Posée dans `document.body` : une fenêtre (l'éditeur) ne la rogne pas. */

export default function Visionneuse({ photos, depart, onFermer }: { photos: Photo[]; depart: number; onFermer: () => void }) {
  const n = photos.length;
  const [i, setI] = useState(() => Math.min(Math.max(depart, 0), Math.max(n - 1, 0)));
  const doigt = useRef<number | null>(null);
  const aller = (d: number) => setI(x => (x + d + n) % n);

  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
      else if (e.key === 'ArrowLeft') setI(x => (x - 1 + n) % n);
      else if (e.key === 'ArrowRight') setI(x => (x + 1) % n);
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [n, onFermer]);

  const p = photos[Math.min(i, n - 1)];
  if (!p) return null;
  const voisines = n > 1 ? [photos[(i + 1) % n], photos[(i - 1 + n) % n]] : [];

  return createPortal(
    <div className={v.fond} role="dialog" aria-modal="true" aria-label="Les photos du bien, en grand" onClick={onFermer}>
      <div className={v.haut} onClick={e => e.stopPropagation()}>
        <span className={v.compte}>{`${i + 1} / ${n}`}</span>
        <button type="button" className={v.fermer} onClick={onFermer} aria-label="Fermer"><Croix t={20} /></button>
      </div>

      <div className={v.scene}
        onTouchStart={e => { doigt.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={e => {
          const x0 = doigt.current; doigt.current = null;
          const x1 = e.changedTouches[0]?.clientX;
          if (x0 === null || x1 === undefined || n < 2) return;
          if (Math.abs(x1 - x0) > 50) aller(x1 < x0 ? 1 : -1);
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={p.url} src={p.url} alt={p.legende || `Photo ${i + 1}`} className={v.img} onClick={e => e.stopPropagation()} draggable={false} />
        {n > 1 && (
          <>
            <button type="button" className={`${v.fleche} ${v.gauche}`} aria-label="Photo précédente" onClick={e => { e.stopPropagation(); aller(-1); }}><Ic n="gauche" t={26} e={2.2} /></button>
            <button type="button" className={`${v.fleche} ${v.droite}`} aria-label="Photo suivante" onClick={e => { e.stopPropagation(); aller(1); }}><Ic n="droite" t={26} e={2.2} /></button>
          </>
        )}
        {/* Les deux voisines, chargées d'avance : la flèche est instantanée. */}
        {voisines.map(x => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`pre-${x.url}`} src={x.url} alt="" className={v.cachee} aria-hidden="true" />
        ))}
      </div>

      <div className={v.bas} onClick={e => e.stopPropagation()}>
        {p.legende && <div className={v.legende}>{p.legende}</div>}
        {n > 1 && (
          <div className={v.vignettes} data-defile="">
            {photos.map((x, j) => (
              <button key={x.url} type="button" className={`${v.vignette} ${j === i ? v.vignetteOn : ''}`} onClick={() => setI(j)} aria-label={`Photo ${j + 1}`} aria-current={j === i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
