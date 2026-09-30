'use client';
import type { ReactNode } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import s from './Tuiles.module.css';

/* ═══ Les tuiles du bandeau bleu (V3.33) ══════════════════════════════════
   Une seule façon de dire « où en est ce contact » en haut d'une fiche :
   un vendeur (ses biens, ses visites, ses offres), un pro (échanges,
   relances), un acheteur (sélection, présentés, visites, offres).

   Alexandre : « 1 en gros, bien en petit dessous… c'est moche », « quand il
   y a zéro, ce n'est pas la peine que ça arrive quelque part », et « que
   l'espace bleu ne soit pas vide sur le côté ». Donc :
   · le chiffre et son mot sur une ligne (« 3 visites »), ce qui compte en
     dessous (« dont 1 à venir ») ;
   · à zéro, la tuile est grisée, en pointillés, et ne se clique pas ;
   · les tuiles se partagent toute la largeur disponible, à parts égales :
     plus de bande bleue vide à droite.
   Au niveau du module (AGENTS.md §2.4). */

export function Tuile({ ic, titre, sous, vide, onClic, aide }: {
  ic: string; titre: string; sous: string; vide: boolean; onClic?: () => void; aide?: string;
}) {
  const corps = (
    <>
      <span className={s.ic}><Ic n={ic} t={17} e={2} /></span>
      <span className={s.tx}><b>{titre}</b><small>{sous}</small></span>
    </>
  );
  if (vide || !onClic) return <div className={`${s.tuile} ${vide ? s.vide : ''}`}>{corps}</div>;
  return (
    <button type="button" className={`${s.tuile} ${s.clic}`} onClick={onClic} title={aide}>
      {corps}<span className={s.va}><Ic n="droite" t={13} e={2.4} /></span>
    </button>
  );
}

/** Le rang de tuiles : toute la largeur, à parts égales. `grandit` : il
    prend aussi la hauteur qui reste dans sa colonne (quand les coordonnées,
    à côté, sont plus hautes), au lieu de laisser du bleu vide en dessous. */
export function Tuiles({ children, label, grandit }: { children: ReactNode; label: string; grandit?: boolean }) {
  return <div className={`${s.tuiles} ${grandit ? s.grandit : ''}`} aria-label={label}>{children}</div>;
}

/** La ligne discrète sous les tuiles : « Suivi depuis… », « Son espace… ». */
export function LigneTuiles({ children }: { children: ReactNode }) {
  return <div className={s.ligne}>{children}</div>;
}

export function Horloge({ fort, doux }: { fort: string; doux: string }) {
  return <span className={s.depuis}><Ic n="horloge" t={13} e={2.2} /><span>{fort}<i>{doux}</i></span></span>;
}
