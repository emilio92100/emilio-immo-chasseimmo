/* ═══ Signer sans code : la règle, seule (V3.154) ═══════════════════════════
   Alexandre : « sur place, pas besoin de code reçu par e-mail : chacun a
   son cadre et signe avec le stylet que je lui donne. Pour le bon de
   visite, si je choisis sur place. »

   Un signataire signe SANS code à usage unique seulement si TOUT est vrai :
     · le document est un bon de visite ;
     · ses réponses disent « Sur place » (donnees.signature) ;
     · la signature lancée est bien une signature sur place ;
     · ce signataire est attendu sur place (pas passé à son lien, pas déjà
       signé) ;
     · la demande vient du CRM d'Alexandre : le badge signé du CRM
       (src/lib/badge.ts), celui que src/proxy.ts demande déjà pour toute
       route /api/documents/… — revérifié ici, pour que la règle ne tienne
       pas qu'au portail.
   Tout le reste garde son code : les mandats, les avenants, l'offre d'achat,
   la délégation, sur place comme en ligne, et la signature en ligne de
   n'importe quel document (/api/signer ne passe jamais par ici).

   Sans dépendance lourde : le banc d'essai l'importe tel quel. */

import { surPlaceSansCode, type Donnees } from '@/lib/actes/commun';

export type DemandeSansCode = {
  /* documents.modele */
  modele: string;
  /* documents.donnees */
  donnees: Donnees;
  /* documents.signature : la signature lancée (son mode). */
  signature: { mode?: string } | null | undefined;
  /* La ligne du signataire (documents_signataires). */
  signataire: { mode?: string; statut?: string } | null | undefined;
  /* Le badge du CRM est-il valide ? (badgeValide) */
  badge: boolean;
};

export function signeSansCode(o: DemandeSansCode): boolean {
  return o.badge === true
    && o.modele === 'bon_visite'
    && surPlaceSansCode(o.modele, o.donnees || {})
    && o.signature?.mode === 'sur_place'
    && o.signataire?.mode === 'sur_place'
    && o.signataire?.statut === 'attendu';
}
