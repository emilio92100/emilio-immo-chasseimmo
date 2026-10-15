/* ═══ Les fenêtres restent ouvertes (V3.192) ═══════════════════════════════
   Alexandre : « quand on note les éléments, parfois on clique à côté, en
   dehors de la case, et tout se supprime, la fenêtre disparaît. Il faut
   vraiment que les pop-up ou les fenêtres restent bloquées ».

   Le CRM compte une quarantaine de fenêtres qui se fermaient d'un clic sur
   leur voile, écrites de plusieurs façons (onClick ou onMouseDown avec
   `e.target === e.currentTarget`, ou le voile qui ferme et la fenêtre qui
   arrête le clic). Plutôt que de les reprendre une à une — et d'en oublier
   —, un écouteur posé sur `window`, en phase de capture, arrête l'appui qui
   tombe SUR LE VOILE d'une fenêtre où l'on peut écrire : il n'arrive jamais
   à React, rien ne se ferme, rien n'est perdu. La fenêtre fait un petit
   signe pour dire qu'elle reste là.

   On ferme avec ×, Annuler ou Échap, comme avant. Une fenêtre sans champ
   (une photo, une explication) se ferme toujours d'un clic à côté. Les menus
   et leurs attrape-clics transparents ne sont pas touchés.

   Monté une fois, dans AppLayout (le CRM seulement, pas l'espace client). */

/* Un champ où l'on écrit ou choisit (pas une case à cocher ni un bouton). */
const CHAMP = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="range"]):not([type="color"])',
  'textarea', 'select', '[contenteditable="true"]', '[contenteditable=""]',
].join(', ');

/* L'opacité du fond (« rgba(15,22,35,.55) » → .55). */
function opacite(cs: CSSStyleDeclaration): number {
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return 1;
  const c = (cs.backgroundColor || '').trim();
  if (!c || c === 'transparent') return 0;
  const barre = c.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (barre) return parseFloat(barre[1]) / (barre[2] ? 100 : 1);
  const m = c.match(/^rgba\(([^)]+)\)$/);
  if (m) { const p = m[1].split(','); return p.length >= 4 ? parseFloat(p[3]) : 1; }
  return 1;
}

/** Le voile d'une fenêtre : posé sur tout l'écran, translucide (ou flouté),
    avec une fenêtre dedans. Une feuille opaque plein écran n'en est pas un :
    on clique DANS la fenêtre. */
function estUnVoile(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  if (cs.position !== 'fixed') return false;
  const r = el.getBoundingClientRect();
  if (r.width < window.innerWidth * 0.85 || r.height < window.innerHeight * 0.85) return false;
  const a = opacite(cs);
  const flou = !!cs.backdropFilter && cs.backdropFilter !== 'none';
  return (a > 0 && a < 0.95) || flou;
}

/* La fenêtre posée sur le voile : son plus grand enfant. */
function fenetreDe(voile: HTMLElement): HTMLElement | null {
  let mieux: HTMLElement | null = null, aire = 0;
  for (const x of Array.from(voile.children)) {
    if (!(x instanceof HTMLElement)) continue;
    const r = x.getBoundingClientRect();
    if (r.width * r.height > aire) { aire = r.width * r.height; mieux = x; }
  }
  return mieux;
}

const sobre = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let dernierSigne = 0;
/* « Je reste là » : un léger battement, sans déplacer la fenêtre. */
function faireSigne(voile: HTMLElement) {
  const now = Date.now();
  if (now - dernierSigne < 400 || sobre()) return;
  dernierSigne = now;
  const f = fenetreDe(voile);
  if (!f || typeof f.animate !== 'function') return;
  try {
    f.animate([{ scale: '1' }, { scale: '1.012' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.4,1)' });
  } catch { /* un navigateur sans la propriété `scale` : rien */ }
}

function arreter(e: Event) {
  const cible = e.target;
  if (!(cible instanceof HTMLElement)) return;
  /* Seulement l'appui qui tombe sur le voile lui-même, pas dans la fenêtre. */
  if (!estUnVoile(cible)) return;
  if (!cible.querySelector(CHAMP)) return;
  e.stopPropagation();
  if (e.type === 'click') faireSigne(cible);
}

const EVENEMENTS = ['pointerdown', 'mousedown', 'click'] as const;

/** Pose l'écouteur ; rend la fonction qui le retire. */
export function figerLesFenetres(): () => void {
  if (typeof window === 'undefined') return () => {};
  for (const t of EVENEMENTS) window.addEventListener(t, arreter, true);
  return () => { for (const t of EVENEMENTS) window.removeEventListener(t, arreter, true); };
}
