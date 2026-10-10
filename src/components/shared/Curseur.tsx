'use client';

/* ═══ La pastille qui glisse (V3.167) ═══════════════════════════════════
   L'effet de « Demandes Internet » (Mon site · Portails · Tout), qu'Alexandre
   adore et veut partout : quand on change de filtre ou d'onglet, la pastille
   de couleur GLISSE jusqu'au nouveau choix au lieu de sauter, et le texte
   change de couleur en douceur. Le contenu, lui, monte en place (Cascade).

   On le pose en PREMIER enfant de la barre, sans rien changer d'autre :

     <div className="ma-barre">
       <Curseur cle={filtre} />
       <button aria-pressed={filtre === 'tout'}>Tout</button>
       …
     </div>

   · Le choix actif est reconnu à son `aria-pressed="true"` (ou
     `aria-selected`, ou `data-actif`) : c'est lui qu'on suit.
   · La pastille prend l'ALLURE du bouton actif — sa couleur, son arrondi, son
     ombre, sa bordure — lue dans le navigateur. Un filtre vert puis un rouge :
     la pastille glisse ET change de teinte. Le bouton actif, lui, perd son
     propre fond (globals.css, `[data-glisse="pret"]`) : c'est la pastille qui
     le porte. Rien d'autre à écrire.
   · Les autres boutons doivent avoir un fond transparent : la pastille passe
     dessous.
   · La barre peut défiler (au téléphone) ou passer à la ligne : la pastille
     la suit, et le choix actif est ramené en vue.
   · `className` : une allure en plus (l'intercalaire des onglets de la fiche
     acheteur, ses coins arrondis). */

import { useLayoutEffect, useRef, type CSSProperties } from 'react';

const ACTIF = ':scope > [aria-pressed="true"], :scope > [aria-selected="true"], :scope > [data-actif="true"]';
const ALLURE = [
  'backgroundColor', 'backgroundImage', 'boxShadow',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
] as const;

export default function Curseur({ cle, className, style }: {
  /** le choix actif : quand il change, la pastille glisse */
  cle: string | number | boolean | null | undefined;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const derniere = useRef<unknown>(Symbol('jamais'));

  /* Après chaque rendu de la barre (un compteur qui change, un choix) : la
     pastille va où est le choix actif. La première fois, elle y est posée
     sans glisser. */
  useLayoutEffect(() => {
    const c = ref.current;
    const barre = c?.parentElement;
    if (!c || !barre) return;
    placer(c, barre);
    if (derniere.current !== cle) {
      const premiere = typeof derniere.current === 'symbol';
      derniere.current = cle;
      if (!premiere) amenerEnVue(barre);
    }
  });

  /* La barre change de taille (fenêtre, police chargée, passage à la ligne). */
  useLayoutEffect(() => {
    const c = ref.current;
    const barre = c?.parentElement;
    if (!c || !barre || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => placer(c, barre));
    ro.observe(barre);
    for (const b of Array.from(barre.children)) if (b !== c) ro.observe(b);
    return () => { ro.disconnect(); barre.removeAttribute('data-glisse'); };
  }, []);

  return <span ref={ref} className={`emi-curseur${className ? ` ${className}` : ''}`} style={style} aria-hidden="true" />;
}

function placer(c: HTMLSpanElement, barre: HTMLElement) {
  const el = barre.querySelector<HTMLElement>(ACTIF);
  if (!el || el.offsetWidth < 1) {
    c.style.opacity = '0';
    barre.removeAttribute('data-glisse');
    return;
  }
  /* La pastille se place par rapport à la barre. */
  if (!barre.dataset.glissePos) {
    barre.dataset.glissePos = '1';
    if (getComputedStyle(barre).position === 'static') barre.style.position = 'relative';
  }
  /* L'allure du choix actif, lue un instant sans la neutralisation (rien
     n'est peint entre les deux : nous sommes avant l'image). */
  barre.setAttribute('data-glisse', 'mesure');
  const cs = getComputedStyle(el);
  const allure: Partial<Record<(typeof ALLURE)[number], string>> = {};
  for (const k of ALLURE) allure[k] = cs[k];
  barre.setAttribute('data-glisse', 'pret');

  const st = c.style;
  const pose = !c.dataset.pose;
  if (pose) st.transition = 'none';
  for (const k of ALLURE) st[k] = allure[k] || '';
  st.width = `${el.offsetWidth}px`;
  st.height = `${el.offsetHeight}px`;
  st.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
  st.opacity = '1';
  if (pose) {
    c.dataset.pose = '1';
    void c.offsetWidth;
    st.transition = '';
  }
}

/* Au téléphone, une barre qui défile ramène le choix actif en vue. */
function amenerEnVue(barre: HTMLElement) {
  if (barre.scrollWidth <= barre.clientWidth + 1) return;
  const el = barre.querySelector<HTMLElement>(ACTIF);
  if (!el) return;
  const g = el.offsetLeft - 36, d = el.offsetLeft + el.offsetWidth + 36 - barre.clientWidth;
  if (g < barre.scrollLeft) barre.scrollTo({ left: Math.max(0, g), behavior: 'smooth' });
  else if (d > barre.scrollLeft) barre.scrollTo({ left: d, behavior: 'smooth' });
}
