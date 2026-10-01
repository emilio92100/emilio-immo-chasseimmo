/* ═══ Un acheteur écarté d'un bien (V3.45) ═════════════════════════════════
   Alexandre : « l'onglet Acheteurs montre des gens qui n'ont aucun rapport ».
   La note seule ne suffit pas : un budget trop court ou une autre ville ne
   pèsent que 2 sur 15, et un acheteur pouvait sortir à 60 % sans pouvoir
   acheter. Un critère essentiel nettement raté l'écarte, quelle que soit sa
   note. « Presque » reste (« En partie ») : c'est un appel à passer.

   Pour le CRM seulement (l'onglet Acheteurs d'un bien, les alertes, les
   mandats d'un client) : l'espace de l'acheteur garde la note telle quelle.
   Ce que la fiche ne dit pas ne se juge pas : un équipement « non annoncé »
   n'écarte personne tant que les annexes (ou l'immeuble) ne sont pas
   remplies. Les villes se comparent comme les communes (« Paris 16e » =
   « Paris 16ème »). */
import { grouperSecteurs, type BienCorr, type Correspondance, type CriteresCorr } from '@/lib/correspondance';
import { cleCommune } from '@/lib/communes';

export type RaisonEcart = 'budget' | 'secteur' | 'surface' | 'chambres' | 'indispensable';
export const RAISONS_ECART: Record<RaisonEcart, string> = {
  budget: 'budget trop court', secteur: 'autre secteur', surface: 'trop petit',
  chambres: 'pas assez de chambres', indispensable: 'il manque un indispensable',
};
const DE_L_IMMEUBLE = new Set(['Ascenseur', 'Gardien']);

export function raisonEcart(corr: Correspondance, b: BienCorr, c: CriteresCorr): RaisonEcart | null {
  const non = (lib: string) => corr.lignes.some(l => l.lib === lib && l.etat === 'non');
  if (non('Budget')) return 'budget';
  if (non('Secteur') && b.ville) {
    const ville = cleCommune(b.ville);
    if (!grouperSecteurs(c.secteurs || []).some(v => cleCommune(v.ville) === ville)) return 'secteur';
  }
  if (c.surfaceMin && b.surface && b.surface < c.surfaceMin * 0.9) return 'surface';
  if (non('Chambres')) return 'chambres';
  const connus = b.equipConnus;
  if (connus && corr.lignes.some(l => l.poids === 3 && l.etat === 'non' && (DE_L_IMMEUBLE.has(l.lib) ? connus.immeuble : connus.annexes))) return 'indispensable';
  return null;
}
