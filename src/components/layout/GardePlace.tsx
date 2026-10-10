'use client';
import { useEffect } from 'react';

/* ═══ Changer d'onglet ne fait pas bouger la page (V3.167) ════════════════
   Alexandre : « quand je change d'onglet, il faut que la page reste
   pareille, même sur téléphone. Si je veux juste changer l'onglet, je
   change juste l'onglet. La page doit rester telle quelle. »

   Un onglet, un filtre ou une vue plus courte raccourcissait la page : la
   zone qui défile (le <main> sur ordinateur, ce qui le contient au
   téléphone) n'avait plus de quoi rester où elle était, et le navigateur
   la remontait d'autant — on se retrouvait plus haut, obligé de redescendre.

   Ce veilleur, posé une fois dans AppLayout, écoute les clics (en phase de
   capture : avant que React ne change quoi que ce soit) sur un CHOIX du
   <main> — un bouton d'onglet ou de filtre : `aria-pressed`,
   `aria-selected`, `role="tab"`, `data-actif`, `data-k`, ou un bouton
   d'une rangée `role="group"`, `role="tablist"`, d'une barre qui glisse
   (`data-glisse`) ou d'une barre d'onglets (`nav`). À ce moment-là, une
   cale (un `padding-bottom` en plus sur le <main>) garantit que la page
   reste assez haute pour ne pas bouger. Puis la cale fond toute seule, sans
   que l'écran bouge : elle ne garde que ce qui manque sous le bas de
   l'écran, et diminue à mesure qu'on remonte, jusqu'à disparaître.

   Le panneau de « Où en est la recherche » a en plus sa propre garde
   (GardeHauteur.tsx) : son fond descend avec la place gardée. */

const CHOIX = '[aria-pressed], [aria-selected], [role="tab"], [data-actif], [data-k]';
const RANGEE = '[role="group"], [role="tablist"], [data-glisse], nav';

export default function GardePlace() {
  useEffect(() => {
    let base = 0;
    let cale = 0;
    let main: HTMLElement | null = null;
    let zone: HTMLElement | null = null;
    let image = 0;

    /* Ce qui défile : le <main>, ou au téléphone ce qui le contient. */
    const zoneDe = (m: HTMLElement) => {
      const oy = getComputedStyle(m).overflowY;
      return oy === 'auto' || oy === 'scroll' ? m : m.parentElement || m;
    };
    const poser = (px: number) => {
      if (!main) return;
      cale = px;
      main.style.paddingBottom = px > 0 ? `${base + px}px` : '';
      if (!px) lacher();
    };
    const lacher = () => {
      zone?.removeEventListener('scroll', ajuster);
      window.removeEventListener('resize', ajuster);
      zone = null;
    };
    /* Ne garder que ce qui manque pour rester où l'on est. */
    function ajuster() {
      image = 0;
      if (!main || !zone || !cale) return;
      const contenu = zone.scrollHeight - cale;
      const manque = Math.max(0, Math.ceil(zone.scrollTop + zone.clientHeight - contenu));
      if (manque < cale) poser(manque);
    }
    const figer = (m: HTMLElement) => {
      const z = zoneDe(m);
      if (main !== m) { if (cale) poser(0); main = m; }
      if (!cale) base = parseFloat(getComputedStyle(m).paddingBottom) || 0;
      /* Le pire des cas : tout le contenu disparaît. Assez pour rester. */
      const px = Math.ceil(z.scrollTop + z.clientHeight);
      if (px > cale) poser(px);
      if (zone !== z) {
        zone?.removeEventListener('scroll', ajuster);
        zone = z;
        z.addEventListener('scroll', ajuster, { passive: true });
        window.addEventListener('resize', ajuster);
      }
      /* Après le changement : React, puis la cascade (deux images). */
      if (image) cancelAnimationFrame(image);
      image = requestAnimationFrame(() => { image = requestAnimationFrame(ajuster); });
    };
    const auClic = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const m = document.querySelector<HTMLElement>('.crm-app main');
      if (!m || !m.contains(t)) return;
      const b = t.closest<HTMLElement>('button, a, [role="tab"]');
      if (!b || !m.contains(b) || b.matches(':disabled')) return;
      if (b.matches(CHOIX) || b.parentElement?.matches(RANGEE)) figer(m);
    };
    document.addEventListener('click', auClic, true);
    return () => {
      document.removeEventListener('click', auClic, true);
      if (image) cancelAnimationFrame(image);
      if (main) main.style.paddingBottom = '';
      lacher();
    };
  }, []);
  return null;
}
