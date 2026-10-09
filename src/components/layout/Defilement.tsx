'use client';
import { useEffect } from 'react';

/* ═══ Les rangées qui défilent de côté (V3.152) ═══════════════════════════
   Alexandre, sur son téléphone : les barres d'onglets et de pastilles
   coupées au bord de l'écran ne disent pas qu'on peut les faire glisser
   (« il faut mettre un peu de transparence sur chaque bord, pour montrer
   qu'on peut défiler à droite et à gauche »).

   Toute rangée qui défile de côté porte l'attribut `data-defile`. Ce petit
   veilleur, posé une seule fois dans AppLayout, tient à jour deux autres
   attributs sur chacune :
     · `data-defile-g` — il reste de quoi voir à gauche ;
     · `data-defile-d` — il reste de quoi voir à droite.
   crm-mobile.css en fait un fondu, du seul côté concerné (téléphone et
   tablette ; l'ordinateur ne change pas).

   Il suit les rangées ajoutées plus tard (un onglet qu'on ouvre, une
   fenêtre), leurs changements de taille et leur défilement. La première
   fois qu'il voit une rangée, l'élément choisi qui serait hors de l'écran
   (onglet allumé, pastille cochée) est amené en vue — sauf avec
   `data-defile="fondu"` : la rangée s'en charge elle-même (les onglets
   glissants, l'en-tête d'une rubrique), ou n'a pas d'élément « choisi » à
   montrer (une barre d'outils, la ligne « Affiner »).

   Pour une nouvelle rangée : `data-defile=""` sur l'élément qui défile, et
   rien d'autre. */

/* Un demi-pixel de défilement ne compte pas comme « il en reste ». */
const MARGE = 2;
/* Ce qui dit « je suis l'élément choisi » dans une rangée. */
const CHOISI = '[aria-pressed="true"], [aria-selected="true"], [aria-current]:not([aria-current="false"]), [data-actif="true"], [data-defile-actif]';
/* L'élément amené en vue reste hors du fondu (32 px, crm-mobile.css). */
const HORS_FONDU = 36;

function marquer(el: HTMLElement) {
  const reste = el.scrollWidth - el.clientWidth;
  const g = reste > MARGE && el.scrollLeft > MARGE;
  const d = reste > MARGE && el.scrollLeft < reste - MARGE;
  if (g !== el.hasAttribute('data-defile-g')) el.toggleAttribute('data-defile-g', g);
  if (d !== el.hasAttribute('data-defile-d')) el.toggleAttribute('data-defile-d', d);
}

function amenerChoisi(el: HTMLElement) {
  if (el.scrollWidth - el.clientWidth <= MARGE) return;
  const choisi = el.querySelector<HTMLElement>(CHOISI);
  if (!choisi) return;
  const r = choisi.getBoundingClientRect();
  const cadre = el.getBoundingClientRect();
  if (r.left < cadre.left + HORS_FONDU) el.scrollLeft -= cadre.left + HORS_FONDU - r.left;
  else if (r.right > cadre.right - HORS_FONDU) el.scrollLeft += r.right - (cadre.right - HORS_FONDU);
}

export default function Defilement() {
  useEffect(() => {
    const suivies = new Set<HTMLElement>();
    const taille = new ResizeObserver(entrees => {
      for (const e of entrees) marquer(e.target as HTMLElement);
    });

    /* Un passage : les rangées apparues sont suivies (et leur élément
       choisi amené en vue), celles qui ont quitté la page sont lâchées, et
       toutes sont remesurées — leur contenu a pu changer de largeur. */
    let prevu = 0;
    const passage = () => {
      prevu = 0;
      for (const el of suivies) {
        if (!el.isConnected || !el.hasAttribute('data-defile')) {
          taille.unobserve(el); suivies.delete(el);
          el.removeAttribute('data-defile-g'); el.removeAttribute('data-defile-d');
        }
      }
      document.querySelectorAll<HTMLElement>('[data-defile]').forEach(el => {
        if (!suivies.has(el)) {
          suivies.add(el); taille.observe(el);
          if (el.getAttribute('data-defile') !== 'fondu') amenerChoisi(el);
        }
        marquer(el);
      });
    };
    const planifier = () => { if (!prevu) prevu = requestAnimationFrame(passage); };

    /* Le défilement d'une rangée ne remonte pas jusqu'au document : on
       l'écoute à la descente (capture), une seule fois pour toutes. */
    const auDefile = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLElement && el.hasAttribute('data-defile')) marquer(el);
    };
    document.addEventListener('scroll', auDefile, { capture: true, passive: true });

    /* Tout changement dans la page (une rangée ajoutée, un onglet de plus,
       un compteur qui s'allonge) : un passage, au plus un par image. */
    const veille = new MutationObserver(planifier);
    veille.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-defile'] });
    window.addEventListener('resize', planifier);
    /* Les polices arrivent après le premier affichage et changent les largeurs. */
    document.fonts?.ready.then(planifier).catch(() => { /* sans elles, rien à refaire */ });
    planifier();

    return () => {
      if (prevu) cancelAnimationFrame(prevu);
      document.removeEventListener('scroll', auDefile, { capture: true });
      window.removeEventListener('resize', planifier);
      veille.disconnect();
      taille.disconnect();
    };
  }, []);
  return null;
}
