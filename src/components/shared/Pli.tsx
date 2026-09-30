'use client';
import { Ic } from '@/components/documents/ApercuActe';
import s from './Pli.module.css';

/* ═══ « Voir le détail » / « Replier », à côté du titre (V3.33) ═══════════
   Alexandre : « voir le détail, il faut qu'il soit à côté du nom, pas tout à
   droite ; pas collé, un espace, et qu'on voie afficher voir le détail ou
   pas. Pareil pour tout ce qui se plie. » Une seule pastille partout :
   - `PastillePli` : à poser DANS un bouton qui plie déjà (un en-tête
     cliquable) — ce n'est qu'un repère visuel ;
   - `BoutonPli` : le bouton lui-même, quand le titre n'est pas cliquable. */

export function PastillePli({ ouvert, voir = 'Voir le détail', replier = 'Replier', className }: { ouvert: boolean; voir?: string; replier?: string; className?: string }) {
  return (
    <span className={`${s.pli} ${className || ''}`} data-ouvert={ouvert ? 'oui' : 'non'} aria-hidden="true">
      <span>{ouvert ? replier : voir}</span>
      <span className={s.fleche}><Ic n="bas" t={13} e={2.4} /></span>
    </span>
  );
}

export function BoutonPli({ ouvert, onClick, voir = 'Voir le détail', replier = 'Replier' }: {
  ouvert: boolean; onClick: () => void; voir?: string; replier?: string;
}) {
  return (
    <button type="button" className={`${s.pli} ${s.bouton}`} data-ouvert={ouvert ? 'oui' : 'non'} aria-expanded={ouvert} onClick={onClick}>
      <span>{ouvert ? replier : voir}</span>
      <span className={s.fleche}><Ic n="bas" t={13} e={2.4} /></span>
    </button>
  );
}
