/* ═══ L'offre d'achat sur un bien de l'agence (V3.190) ══════════════════════

   Alexandre : « même si c'est un mandat que j'ai, et que le bien est
   présenté, et qu'ensuite visite, et ensuite qu'il se fait une offre, que
   moi, de mon côté, j'ai le même visuel. Tu peux reprendre les éléments qu'il
   y a dans le bien ».

   Ce que l'offre reprend de la fiche du bien en vente (`biens_vente`) : le
   vendeur, l'adresse, le prix affiché, et AUCUN honoraire de
   recherche — Emilio est payé par le mandat de vente, l'acheteur paie le
   prix, rien de plus. Le lien avec le bien : `bienVenteId`.

   Le prix s'entend toujours « honoraires compris » : payés par l'acquéreur
   (le PDF dit alors le net vendeur et les honoraires, `honoVendeur`), ou par
   le vendeur sur ce prix. `honoVente` garde la règle du mandat (taux ou
   forfait) : l'éditeur recalcule `honoVendeur` à chaque prix (deduire,
   src/lib/actes/offre-achat.ts).

   Navigateur (Documents) et serveur (l'espace du client). */

import { argentBien, honorairesPour, nomProprioActe, type Donnees } from './biens-vente';
import { num, txt } from './actes';

export type VentePourOffre = { id: string; ville?: string | null; adresse?: string | null; donnees?: Donnees | null };

export function champsOffreAgence(v: VentePourOffre, agence: string, prix?: number | null): Donnees {
  const d = v.donnees || {};
  const a = argentBien(d);
  const adresse = txt(d, 'adresse') || v.adresse || '';
  const ville = txt(d, 'ville') || v.ville || '';
  const forfait = d.honoMode === 'forfait';
  return {
    bienVenteId: v.id,
    vendeurNom: nomProprioActe(d),
    agenceVendeur: agence,
    ...(adresse ? { adresse } : {}),
    ...(ville ? { ville } : {}),
    ...(a.prix ? { prixAffiche: a.prix } : {}),
    forme: 'fai',
    honoVente: a.acq ? { taux: forfait ? null : num(d, 'taux'), forfait: forfait ? num(d, 'forfait') : null } : null,
    honoVendeur: a.acq ? (prix ? honorairesPour(d, prix) ?? a.hono : a.hono) : null,
    honoMode: 'aucun', honoTaux: null, honoForfait: null, honoMandat: null,
  };
}

/** Ses honoraires du mandat de vente au prix offert, quand l'acquéreur les
    paie (le PDF dit « soit un prix net revenant au vendeur de… »). */
export function honoVendeurAuPrix(v: VentePourOffre, prix: number | null): number | null {
  const d = v.donnees || {};
  const a = argentBien(d);
  if (!a.acq || !prix) return null;
  return honorairesPour(d, prix) ?? a.hono;
}
