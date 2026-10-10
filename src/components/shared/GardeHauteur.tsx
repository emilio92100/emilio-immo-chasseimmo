'use client';

/* ═══ Un panneau qui ne fait pas remonter la page (V3.167) ═══════════════
   Alexandre : « quand j'appuie sur Sélection alors que j'étais dans
   Visites, ma page se remet au-dessus : je ne vois que Sélection, je suis
   obligé de rescroller. Quand je change d'onglet, il faut que la page ne
   bouge pas, que l'onglet qui bouge. »

   La cause : un onglet plus court (une ligne, ou vide) raccourcit la page ;
   la zone qui défile n'a plus de quoi rester où elle était, et le
   navigateur la remonte d'autant.

   Le remède : au moment du clic — avant que React ne change quoi que ce
   soit —, le panneau retient la hauteur qu'il a (`min-height`). Le nouveau
   contenu arrive dans un panneau aussi haut que l'ancien : rien ne bouge.
   Puis cette réserve fond toute seule, sans que l'écran bouge : dès
   l'image suivante elle ne garde que ce qui est au-dessus du bas de
   l'écran, et elle diminue encore à mesure qu'on remonte. Ce qui est sous
   le bas de l'écran peut disparaître sans que personne ne le voie.

   Le clic compte s'il tombe dans le panneau (un filtre, « Écarter ») ou,
   avec `avecPrecedent`, dans l'élément juste avant lui (la barre des
   onglets de « Où en est la recherche »). */

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

export default function GardeHauteur({ avecPrecedent = false, className, style, children }: {
  avecPrecedent?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let reserve = 0;
    let ecoute = false;
    let image = 0;

    /* La réserve ne garde que la part du panneau au-dessus du bas de
       l'écran ; elle ne fait que diminuer. */
    const lacher = () => {
      image = 0;
      if (!reserve) return;
      const r = Math.max(0, Math.ceil(window.innerHeight - el.getBoundingClientRect().top));
      if (r >= reserve) return;
      reserve = r;
      el.style.minHeight = r > 0 ? `${r}px` : '';
      if (!r) arreter();
    };
    const arreter = () => {
      if (!ecoute) return;
      ecoute = false;
      document.removeEventListener('scroll', lacher, true);
      window.removeEventListener('resize', lacher);
    };
    const figer = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > reserve) {
        reserve = h;
        el.style.minHeight = `${h}px`;
      }
      if (!ecoute) {
        ecoute = true;
        document.addEventListener('scroll', lacher, { capture: true, passive: true });
        window.addEventListener('resize', lacher);
      }
      /* Après le changement (deux images : React, puis la cascade). */
      if (image) cancelAnimationFrame(image);
      image = requestAnimationFrame(() => { image = requestAnimationFrame(lacher); });
    };
    /* En phase de capture, sur le document : avant React. */
    const auClic = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (el.contains(t) || (avecPrecedent && el.previousElementSibling?.contains(t))) figer();
    };
    document.addEventListener('click', auClic, true);
    return () => {
      document.removeEventListener('click', auClic, true);
      if (image) cancelAnimationFrame(image);
      arreter();
      el.style.minHeight = '';
    };
  }, [avecPrecedent]);

  return <div ref={ref} className={className} style={style}>{children}</div>;
}
