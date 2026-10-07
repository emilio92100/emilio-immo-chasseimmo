'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* ═══ La place laissée dans une fiche (V3.121) ═════════════════════════════
   Alexandre : « je vais dans Rapprochement, je descends, je clique sur un
   client… quand je retourne sur le bien, il se remet dans Vue d'ensemble.
   Pourquoi il ne reste pas là où je suis parti ? »

   Chaque fiche (un bien, un contact) retient ici son onglet, ce qui y est
   déplié, et la hauteur où on l'a quittée. Rouverte (la barre des fiches
   ouvertes, le retour du navigateur, la liste), elle reprend au même
   endroit. Une demande d'onglet (une alerte, une relance : intentions.ts)
   passe toujours devant.

   Rangé dans la session du navigateur, pour 30 minutes : au-delà, la fiche
   se rouvre comme neuve. Une commodité : sans mémoire, rien ne casse. */

const DUREE = 30 * 60_000;
export type Place = Record<string, unknown> & { haut?: number; le?: number };

const cle = (fiche: string) => `place.${fiche}`;

export function lirePlace(fiche: string): Place | null {
  if (typeof window === 'undefined') return null;
  try {
    const p = JSON.parse(window.sessionStorage.getItem(cle(fiche)) || 'null') as Place | null;
    if (!p || typeof p !== 'object' || !p.le || Date.now() - Number(p.le) > DUREE) return null;
    return p;
  } catch { return null; }
}

export function retenirPlace(fiche: string, x: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(cle(fiche), JSON.stringify({ ...(lirePlace(fiche) || {}), ...x, le: Date.now() }));
  } catch { /* sans mémoire : la fiche se rouvrira en haut */ }
}

/* Ce qui défile dans le CRM (AppLayout) : le <main> sur ordinateur, la
   zone qui le contient sur téléphone. Une seule des deux bouge à la fois. */
function zones(): HTMLElement[] {
  const main = document.querySelector<HTMLElement>('.crm-app main');
  return main ? [main, ...(main.parentElement ? [main.parentElement] : [])] : [];
}
const hauteurCrm = () => Math.max(0, ...zones().map(z => z.scrollTop));

/* Redescendre à `y`. Le contenu peut finir d'arriver juste après (une
   liste lue en plus) : on insiste une seconde et demie, tant que la page
   n'est pas assez haute, et on s'arrête net si Alexandre fait défiler
   lui-même. */
function redescendre(y: number) {
  const debut = Date.now();
  let lache = false;
  const stop = () => { lache = true; };
  const evts = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
  evts.forEach(e => window.addEventListener(e, stop, { passive: true, once: true }));
  const fin = () => evts.forEach(e => window.removeEventListener(e, stop));
  const pas = () => {
    if (lache) { fin(); return; }
    for (const z of zones()) if (z.scrollHeight > z.clientHeight) z.scrollTop = y;
    if (hauteurCrm() >= y - 2 || Date.now() - debut > 1500) { fin(); return; }
    requestAnimationFrame(pas);
  };
  requestAnimationFrame(() => requestAnimationFrame(pas));
}

/* La place d'une fiche, lue une fois à son ouverture (avant tout effet :
   en développement, React monte deux fois et la seconde lecture trouverait
   la hauteur déjà réécrite). */
export function usePlace(fiche: string): Place | null {
  const [p] = useState(() => lirePlace(fiche));
  return p;
}

/* La hauteur : retenue quand la fiche quitte l'écran (avant que le nouvel
   écran ne remplace le sien), rendue une fois son contenu affiché (`pret`).
   `reprendre` : faux quand la fiche s'ouvre sur une demande précise. */
export function useHauteur(fiche: string, place: Place | null, pret: boolean, reprendre: boolean) {
  const fait = useRef(false);
  useLayoutEffect(() => () => { retenirPlace(fiche, { haut: hauteurCrm() }); }, [fiche]);
  useEffect(() => {
    if (!pret || fait.current) return;
    fait.current = true;
    const y = reprendre ? Number(place?.haut || 0) : 0;
    if (y > 0) redescendre(y);
  }, [pret, reprendre, place]);
}
