/* ═══ La bibliothèque des modèles ═════════════════════════════════════════
   Ajouter un modèle : un fichier dans ce dossier (voir commun.ts pour ce
   qu'il doit savoir faire), puis une ligne ci-dessous. La page Documents
   juridiques, l'éditeur et le PDF le prennent en charge sans autre code. */

import type { IdentiteAgence } from '@/lib/agence';
import type { Categorie, Donnees, Modele } from './commun';
import { MANDAT_VENTE } from './mandat-vente';
import { BON_VISITE } from './bon-visite';
import { OFFRE_ACHAT } from './offre-achat';
import { MANDAT_RECHERCHE } from './mandat-recherche';
import { AVENANT_VENTE } from './avenant-vente';
import { AVENANT_RECHERCHE } from './avenant-recherche';
import { COURRIER_RECONDUCTION } from './courrier-reconduction';

export const MODELES: Modele[] = [MANDAT_VENTE, AVENANT_VENTE, MANDAT_RECHERCHE, AVENANT_RECHERCHE, OFFRE_ACHAT, BON_VISITE, COURRIER_RECONDUCTION];
export const modele = (id: string): Modele | null => MODELES.find(m => m.id === id) || null;

/* Les rubriques de la page, dans l'ordre. Le mandat de recherche en ligne
   vit dans la fiche client (il se signe depuis l'espace) : la rubrique
   liste ceux qui ont été signés, à côté des mandats de recherche papier. */
export const CATEGORIES: { id: Categorie; titre: string; sous: string; ic: string; couleur: string }[] = [
  { id: 'mandats_vente', titre: 'Mandats de vente', sous: 'Simple, semi-exclusif ou exclusif', ic: 'maison', couleur: 'or' },
  { id: 'mandats_recherche', titre: 'Mandats de recherche', sous: 'En ligne depuis l’espace, ou sur papier', ic: 'loupe', couleur: 'bleu' },
  { id: 'offres', titre: 'Offres d’achat', sous: 'Faites par tes acheteurs, et la réponse du vendeur', ic: 'euro', couleur: 'brique' },
  { id: 'bons_visite', titre: 'Bons de visite', sous: 'La preuve de chaque visite', ic: 'calendrier', couleur: 'vert' },
  { id: 'courriers', titre: 'Courriers', sous: 'L’information avant chaque reconduction', ic: 'boucle', couleur: 'gris' },
];

export const STATUTS: Record<string, { l: string; ton: 'gris' | 'bleu' | 'vert' | 'rouge' }> = {
  brouillon: { l: 'Brouillon', ton: 'gris' },
  pret: { l: 'À faire signer', ton: 'bleu' },
  signe: { l: 'Signé', ton: 'vert' },
  annule: { l: 'Annulé', ton: 'rouge' },
};

/* Le PDF d'un document : la même mise en page que le mandat de recherche
   (page de garde, résumé, sommaire, parties à icône, cadres de signature). */
export async function pdfDocument(m: Modele, d: Donnees, identite: IdentiteAgence, o: { projet?: boolean } = {}): Promise<Uint8Array> {
  const { pdfMandat } = await import('@/lib/mandat-pdf');
  const g = m.garde(d);
  return pdfMandat(m.rediger(d, identite), {
    numero: typeof d.numero === 'string' ? d.numero : '',
    mandantNom: m.pour(d),
    resume: m.resume(d),
    sig: null,
    projet: !!o.projet,
    identite,
    garde: { ...g, mention: o.projet ? undefined : 'À signer par les parties, en autant d’exemplaires que de signataires' },
    entete: m.entete(d),
    titreDoc: m.titreDoc(d),
    lettre: !!g.lettre,
  });
}

export * from './commun';
