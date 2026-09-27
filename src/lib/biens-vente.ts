/* ═══ Les biens (à vendre) ═══════════════════════════════════════════════════
   Les biens qu'Alexandre vend ou pourrait vendre pour un propriétaire : un
   projet à suivre, une estimation, un mandat, jusqu'à la vente. La rubrique
   « Biens » du CRM.

   Une ligne de `biens_vente` par bien. Les colonnes servent à la liste ;
   tout le reste vit dans `donnees` (les réponses du formulaire, comme les
   documents juridiques) : les pièces une à une (`detailPieces` ; `pieces`
   est leur nombre), l'intérieur, l'extérieur,
   l'énergie, la copropriété, les charges, le prix, la visite, l'annonce, les
   photos et les pièces du dossier. Le suivi (visites hors CRM, offres,
   étapes, notes) est dans `biens_vente_suivi`. Voir outils/sql/biens-vente.sql.

   Ce fichier est isomorphe : le CRM (navigateur) et les bancs d'essai le lisent. */

import { euros } from '@/lib/mandat';
import {
  PERSONNE_VIDE, lirePersonnes, nomComplet, nomsCourts, txt, num, liste, jourLong,
  type Champ, type Donnees, type Personne, type Option,
} from '@/lib/actes';
import type { BienCorr } from '@/lib/correspondance';

export type { Donnees };

/* ── Les étapes de la vente ─────────────────────────────────────────────── */
/* `a_suivre` : un propriétaire qui pense vendre, pas encore estimé. La
   colonne `etape` est un texte libre (pas de contrainte en base). */
export type EtapeVente = 'a_suivre' | 'estimation' | 'mandat' | 'suspendu' | 'offre' | 'compromis' | 'vendu' | 'retire';
export const ETAPES_VENTE: { k: EtapeVente; lib: string; court: string; pluriel: string; c: string }[] = [
  { k: 'a_suivre', lib: 'À suivre', court: 'À suivre', pluriel: 'À suivre', c: '#0ea5a4' },
  { k: 'estimation', lib: 'Estimation', court: 'Estimation', pluriel: 'Estimations', c: '#8b5cf6' },
  { k: 'mandat', lib: 'Mandat en cours', court: 'En vente', pluriel: 'Mandats en cours', c: '#10b981' },
  { k: 'suspendu', lib: 'En pause', court: 'En pause', pluriel: 'En pause', c: '#94a3b8' },
  { k: 'offre', lib: 'Sous offre', court: 'Sous offre', pluriel: 'Sous offre', c: '#f59e0b' },
  { k: 'compromis', lib: 'Sous compromis', court: 'Sous compromis', pluriel: 'Sous compromis', c: '#3b82f6' },
  { k: 'vendu', lib: 'Vendu', court: 'Vendu', pluriel: 'Vendus', c: '#34496e' },
  { k: 'retire', lib: 'Retiré de la vente', court: 'Retiré', pluriel: 'Retirés', c: '#b4532a' },
];
/* Le fil du bandeau de la fiche : le chemin normal d'une vente. */
export const PARCOURS: EtapeVente[] = ['a_suivre', 'estimation', 'mandat', 'offre', 'compromis', 'vendu'];
/* Avant le mandat : pas de mandat, pas d'annonce, pas de visite. */
export const AVANT_MANDAT: EtapeVente[] = ['a_suivre', 'estimation'];
export const avantMandat = (e: string | null | undefined) => AVANT_MANDAT.includes(e as EtapeVente);
export const etapeDe = (k: string | null | undefined) => ETAPES_VENTE.find(e => e.k === k) || ETAPES_VENTE[0];
/* « En cours » : ce qui se travaille (le compteur du menu). */
export const EN_COURS: EtapeVente[] = ['mandat', 'offre', 'compromis'];

/* ── Les lignes de la base ─────────────────────────────────────────────── */
export type BienVente = {
  id: string; reference: string | null; etape: EtapeVente; archive: boolean;
  client_id: string | null; document_id: string | null;
  titre: string | null; type_bien: string | null; adresse: string | null; code_postal: string | null; ville: string | null; quartier: string | null;
  prix: number | null; surface: number | null; nb_pieces: number | null; nb_chambres: number | null; etage: number | null;
  mandat_type: string | null; mandat_numero: string | null; mandat_fin: string | null; photo: string | null;
  donnees: Donnees; etape_le: string | null; en_vente_le: string | null; vendu_le: string | null;
  created_at: string; updated_at: string;
};
export type SuiviVente = {
  id: string; bien_id: string; type: 'visite' | 'offre' | 'etape' | 'note' | 'prix'; le: string; qui: string | null;
  client_id: string | null; recherche_id: string | null; montant: number | null; statut: string | null;
  avis: string | null; commentaire: string | null; donnees: Record<string, unknown>; created_at: string;
};
export const tableAbsente = (m: string) => /biens_vente|relation .* does not exist|schema cache/i.test(m);

/* ── Les listes de choix ───────────────────────────────────────────────── */
export const TYPES_BIEN: Option[] = [
  { v: 'appartement', l: 'Appartement', ic: 'immeuble' }, { v: 'maison', l: 'Maison', ic: 'maison' },
  { v: 'duplex', l: 'Duplex', ic: 'escalier' }, { v: 'studio', l: 'Studio', ic: 'canape' },
  { v: 'loft', l: 'Loft', ic: 'vitrine' }, { v: 'terrain', l: 'Terrain', ic: 'terrain' },
  { v: 'local', l: 'Local, bureau', ic: 'agence' }, { v: 'parking', l: 'Parking ou box', ic: 'parking' },
  { v: 'immeuble', l: 'Immeuble', ic: 'lots' }, { v: 'autre', l: 'Autre', ic: 'plus' },
];
export const nomType = (v: unknown) => TYPES_BIEN.find(t => t.v === v)?.l || 'Bien';
const estMaison = (d: Donnees) => d.typeBien === 'maison';
const estTerrain = (d: Donnees) => d.typeBien === 'terrain';
const aDesPieces = (d: Donnees) => !['terrain', 'parking'].includes(String(d.typeBien || ''));
const enImmeuble = (d: Donnees) => !['maison', 'terrain'].includes(String(d.typeBien || ''));
/* Un appartement peut être sur plusieurs niveaux (duplex, triplex). */
const surNiveaux = (d: Donnees) => ['appartement', 'duplex', 'loft'].includes(String(d.typeBien || ''));

export const EXPOSITIONS: Option[] = [
  { v: 'N', l: 'Nord' }, { v: 'NE', l: 'Nord-Est' }, { v: 'E', l: 'Est' }, { v: 'SE', l: 'Sud-Est' },
  { v: 'S', l: 'Sud' }, { v: 'SO', l: 'Sud-Ouest' }, { v: 'O', l: 'Ouest' }, { v: 'NO', l: 'Nord-Ouest' },
];
export const nomExpo = (v: unknown) => EXPOSITIONS.find(e => e.v === v)?.l || (typeof v === 'string' ? v : '');

/* Les niveaux d'une pièce : un appartement de plain-pied n'en a qu'un,
   un duplex en a deux, une maison davantage. */
export const NIVEAUX: string[] = [
  'Niveau principal', 'Niveau bas', 'Niveau haut', 'Sous-sol', 'Rez-de-chaussée', 'Rez-de-jardin',
  '1er étage', '2e étage', '3e étage', '4e étage', '5e étage', 'Combles', 'Extérieur',
];
/* Les pièces qu'on voit le plus : on clique, puis on ajuste. « Autre » laisse
   écrire son propre nom. */
export const PIECES_GROUPES: { g: string; l: string[] }[] = [
  { g: 'Pièces de vie', l: ['Entrée', 'Séjour', 'Séjour double', 'Salon', 'Salle à manger', 'Pièce à vivre', 'Cuisine', 'Cuisine ouverte', 'Kitchenette', 'Bureau', 'Véranda', 'Mezzanine'] },
  { g: 'Nuit', l: ['Chambre', 'Suite parentale', 'Dressing'] },
  { g: 'Eau', l: ['Salle de bains', 'Salle d’eau', 'WC'] },
  { g: 'Circulation et rangement', l: ['Dégagement', 'Couloir', 'Palier', 'Buanderie', 'Cellier', 'Débarras', 'Placard', 'Chaufferie'] },
  { g: 'Annexes', l: ['Cave', 'Grenier', 'Combles aménagés', 'Sous-sol', 'Garage', 'Atelier', 'Parking', 'Box'] },
  { g: 'Extérieur', l: ['Balcon', 'Terrasse', 'Loggia', 'Jardin', 'Cour', 'Patio'] },
];
export const PIECES_RAPIDES = ['Entrée', 'Séjour', 'Cuisine', 'Chambre', 'Salle de bains', 'Salle d’eau', 'WC', 'Dégagement', 'Balcon'];
/* Les tuiles « Ajouter une pièce » de l'éditeur, dans l'ordre d'une visite. */
export const PIECES_TUILES = ['Entrée', 'Séjour', 'Salle à manger', 'Cuisine', 'Chambre', 'Salle de bains', 'Salle d’eau', 'WC', 'Bureau', 'Dégagement', 'Dressing', 'Buanderie', 'Balcon', 'Terrasse', 'Cave', 'Parking'];
/* L'icône d'une pièce, d'après son nom (« Chambre 2 » → le lit). */
const PICTO_PIECE: [RegExp, string][] = [
  [/^entree/, 'porte'], [/^(sejour|salon|piece a vivre)/, 'canape'], [/^salle a manger/, 'table'], [/^(cuisine|kitchenette)/, 'cuisine'],
  [/^bureau/, 'bureau'], [/^veranda/, 'vitrine'], [/^(mezzanine|sous-sol)/, 'escalier'], [/^(chambre|suite)/, 'lit'], [/^dressing/, 'cintre'],
  [/^salle de bain/, 'bain'], [/^salle d.eau/, 'douche'], [/^wc|^toilettes/, 'wc'], [/^(degagement|couloir|palier)/, 'couloir'],
  [/^buanderie/, 'machine'], [/^(cellier|debarras|placard)/, 'placard'], [/^chaufferie/, 'flamme'], [/^cave/, 'cave'],
  [/^(grenier|combles)/, 'toit'], [/^(garage|parking|box)/, 'voiture'], [/^atelier/, 'outil'], [/^(balcon|loggia)/, 'balcon'],
  [/^terrasse/, 'parasol'], [/^(jardin|cour|patio)/, 'terrain'],
];
export function pictoPiece(nom: string): string {
  const n = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'").toLowerCase().trim();
  return PICTO_PIECE.find(([r]) => r.test(n))?.[1] || 'plan';
}
export type Piece = { id: string; niveau: string; nom: string; surface: number | null; expo: string; note: string };
export const lirePieces = (x: unknown): Piece[] => (Array.isArray(x) ? x : []).map((p, i) => {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  const s = typeof o.surface === 'number' ? o.surface : typeof o.surface === 'string' ? parseFloat(String(o.surface).replace(',', '.')) : NaN;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `p${i}`, niveau: typeof o.niveau === 'string' ? o.niveau : '',
    nom: typeof o.nom === 'string' ? o.nom : '', surface: Number.isFinite(s) ? s : null,
    expo: typeof o.expo === 'string' ? o.expo : '', note: typeof o.note === 'string' ? o.note : '',
  };
});

export type Photo = { url: string; chemin: string; legende: string };
export const lirePhotos = (x: unknown): Photo[] => (Array.isArray(x) ? x : [])
  .map(p => (p && typeof p === 'object' ? p : {}) as Record<string, unknown>)
  .filter(o => typeof o.url === 'string' && o.url)
  .map(o => ({ url: String(o.url), chemin: typeof o.chemin === 'string' ? o.chemin : '', legende: typeof o.legende === 'string' ? o.legende : '' }));

/* ── Le dossier : diagnostics et pièces à réunir ──
   `etat` : recu · demande · nc (non concerné). Un fichier déposé va dans le
   bucket privé « mandats », sous biens-vente/<id>/ (voir /api/biens-vente). */
export type EtatPiece = 'recu' | 'demande' | 'nc' | '';
export type PieceDossier = { etat: EtatPiece; date: string; chemin: string; nom: string };
export type LigneDossier = { k: string; l: string; aide?: string; si?: (d: Donnees) => boolean; groupe: 'diag' | 'copro' | 'vendeur' };
export const DOSSIER: LigneDossier[] = [
  { k: 'dpe', l: 'DPE', aide: 'Valable 10 ans', groupe: 'diag' },
  { k: 'amiante', l: 'Amiante', aide: 'Permis de construire avant juillet 1997', groupe: 'diag' },
  { k: 'plomb', l: 'Plomb (CREP)', aide: 'Construit avant 1949', groupe: 'diag' },
  { k: 'electricite', l: 'Électricité', aide: 'Installation de plus de 15 ans, valable 3 ans', groupe: 'diag' },
  { k: 'gaz', l: 'Gaz', aide: 'Installation de plus de 15 ans, valable 3 ans', groupe: 'diag' },
  { k: 'termites', l: 'Termites', aide: 'Zone fixée par arrêté, valable 6 mois', groupe: 'diag' },
  { k: 'erp', l: 'État des risques (ERP)', aide: 'Valable 6 mois', groupe: 'diag' },
  { k: 'carrez', l: 'Mesurage loi Carrez', si: d => d.copro === 'oui', groupe: 'diag' },
  { k: 'assainissement', l: 'Assainissement non collectif', si: d => estMaison(d) || estTerrain(d), groupe: 'diag' },
  { k: 'merule', l: 'Mérule', aide: 'Zone fixée par arrêté', groupe: 'diag' },
  { k: 'bruit', l: 'Bruit (aéroports)', aide: 'Zone de bruit d’un aérodrome', groupe: 'diag' },
  { k: 'audit', l: 'Audit énergétique', aide: 'Maison classée E, F ou G', si: d => estMaison(d) && ['E', 'F', 'G'].includes(String(d.dpe || '')), groupe: 'diag' },
  { k: 'reglement', l: 'Règlement de copropriété et état descriptif', si: d => d.copro === 'oui', groupe: 'copro' },
  { k: 'pvag', l: 'PV d’assemblée générale (3 dernières années)', si: d => d.copro === 'oui', groupe: 'copro' },
  { k: 'fiche', l: 'Fiche synthétique de la copropriété', si: d => d.copro === 'oui', groupe: 'copro' },
  { k: 'carnet', l: 'Carnet d’entretien', si: d => d.copro === 'oui', groupe: 'copro' },
  { k: 'preetat', l: 'Pré-état daté', si: d => d.copro === 'oui', groupe: 'copro' },
  { k: 'dtg', l: 'DTG ou plan pluriannuel de travaux', si: d => d.copro === 'oui', groupe: 'copro' },
  { k: 'titre', l: 'Titre de propriété', groupe: 'vendeur' },
  { k: 'taxe', l: 'Dernier avis de taxe foncière', groupe: 'vendeur' },
  { k: 'factures', l: 'Factures des travaux récents', groupe: 'vendeur' },
];
export const lireDossier = (x: unknown): Record<string, PieceDossier> => {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out: Record<string, PieceDossier> = {};
  for (const [k, v] of Object.entries(o)) {
    const p = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const e = p.etat === 'recu' || p.etat === 'demande' || p.etat === 'nc' ? p.etat : '';
    out[k] = { etat: e, date: typeof p.date === 'string' ? p.date : '', chemin: typeof p.chemin === 'string' ? p.chemin : '', nom: typeof p.nom === 'string' ? p.nom : '' };
  }
  return out;
};
export const lignesDossier = (d: Donnees) => DOSSIER.filter(l => !l.si || l.si(d));

/* ── Les champs propres à cette rubrique (en plus de ceux des documents) ── */
type BaseB = { cle: string; lib: string; aide?: string; si?: (d: Donnees) => boolean; ic?: string };
export type ChampBien = Champ
  | (BaseB & { t: 'lettres'; genre: 'dpe' | 'ges' })
  | (BaseB & { t: 'pieces' })
  | (BaseB & { t: 'photos' })
  | (BaseB & { t: 'dossier' })
  | (BaseB & { t: 'proprio' })
  | (BaseB & { t: 'annonce' })
  | (BaseB & { t: 'eurosAn' })
  /* Un nombre entier au – / + (pièces, chambres, étage…) ; `mots` : ce
     qu'on écrit à côté (0 → « RDC », 2 niveaux → « Duplex »). */
  | (BaseB & { t: 'compteur'; min?: number; max?: number; mots?: (n: number) => string })
  /* L'adresse, proposée pendant la frappe (base adresse nationale) : un
     choix remplit aussi le code postal et la ville. */
  | (BaseB & { t: 'adresse' });
/* Une étape du formulaire. `pour` : les étapes de vente où elle se montre.
   Tout ce qui décrit le bien se remplit dès « à suivre » (V3.15) : seules
   l'estimation (fourchette, prix) attend l'étape « estimation », et la
   visite (clés, codes) le mandat. `avant` : son titre tant que le mandat
   n'est pas signé. */
export type EtapeBien = {
  id: string; titre: string; court: string; sous: string; ic: string; champs: ChampBien[];
  pour?: (e: EtapeVente) => boolean;
  avant?: { titre: string; court: string; sous: string };
};
export const estChampActe = (c: ChampBien): c is Champ => !['lettres', 'pieces', 'photos', 'dossier', 'proprio', 'annonce', 'eurosAn', 'compteur', 'adresse'].includes(c.t);
/* Dans l'éditeur, les données portent l'étape de vente sous `_stade` (jamais
   enregistrée) : un champ réservé au mandat s'efface avant. Sans `_stade`
   (la fiche, l'annonce), tout se montre. */
const sousMandat = (d: Donnees) => !avantMandat(String(d._stade || ''));
const pasASuivre = (e: EtapeVente) => e !== 'a_suivre';

/* ══ Le formulaire : étape par étape, ou tout sur une page ═══════════════ */
export const ETAPES_BIEN: EtapeBien[] = [
  {
    id: 'proprio', titre: 'Le propriétaire', court: 'Propriétaire', sous: 'Qui vend, et pourquoi.', ic: 'personne',
    champs: [
      { t: 'proprio', cle: 'clientId', lib: 'Sa fiche client' },
      { t: 'choix', cle: 'qui', lib: 'Qui vend ?', tuiles: true, options: [
        { v: 'personne', l: 'Une personne', ic: 'personne' }, { v: 'couple', l: 'Un couple', ic: 'couple' },
        { v: 'indivision', l: 'Plusieurs propriétaires', aide: 'Succession, frères et sœurs…', ic: 'groupe' },
        { v: 'sci', l: 'Une société (SCI)', ic: 'immeuble' },
      ] },
      { t: 'texte', cle: 'sciNom', lib: 'Nom de la société', ic: 'immeuble', si: d => d.qui === 'sci' },
      { t: 'personnes', cle: 'proprietaires', lib: 'Les propriétaires', un: 'Propriétaire', min: 1, max: 5,
        bornes: d => (d.qui === 'couple' ? { min: 2, max: 2 } : d.qui === 'indivision' ? { min: 2, max: 6 } : { min: 1, max: 1 }),
        nomCarte: (d, i) => (d.qui === 'sci' ? 'Le gérant' : d.qui === 'couple' ? `Propriétaire ${i + 1}` : d.qui === 'indivision' ? `Propriétaire ${i + 1}` : 'Le propriétaire'),
        ajouter: () => 'Ajouter un propriétaire' },
      { t: 'titre', cle: 't-projet', lib: 'Son projet', ic: 'drapeau' },
      { t: 'choix', cle: 'motif', lib: 'Pourquoi il vend', options: [
        { v: 'achat', l: 'Il achète ailleurs' }, { v: 'succession', l: 'Succession' }, { v: 'separation', l: 'Séparation' },
        { v: 'mutation', l: 'Mutation' }, { v: 'investissement', l: 'Investissement' }, { v: 'autre', l: 'Autre' },
      ] },
      { t: 'choix', cle: 'delai', lib: 'Son délai', options: [
        { v: 'vite', l: 'Dès que possible' }, { v: '3mois', l: 'Sous 3 mois' }, { v: '6mois', l: 'Sous 6 mois' }, { v: 'libre', l: 'Il n’est pas pressé' },
      ] },
      { t: 'choix', cle: 'origine', lib: 'Comment il est venu', options: [
        { v: 'recommandation', l: 'Recommandation' }, { v: 'client', l: 'Ancien client' }, { v: 'estimation', l: 'Estimation en ligne' },
        { v: 'boitage', l: 'Boîtage, affiche' }, { v: 'portail', l: 'Portail, réseaux' }, { v: 'autre', l: 'Autre' },
      ] },
      { t: 'texte', cle: 'notaire', lib: 'Son notaire', ic: 'balance', exemple: 'Maître Durand, Boulogne' },
    ],
  },
  {
    id: 'bien', titre: 'Le bien', court: 'Le bien', sous: 'Où il est, ce qu’il est, ses surfaces.', ic: 'maison',
    champs: [
      { t: 'choix', cle: 'typeBien', lib: 'Type de bien', tuiles: true, requis: true, options: TYPES_BIEN },
      { t: 'titre', cle: 't-adresse', lib: 'Adresse', ic: 'lieu' },
      { t: 'adresse', cle: 'adresse', lib: 'Adresse', ic: 'lieu' },
      { t: 'texte', cle: 'cp', lib: 'Code postal', ic: 'drapeau', exemple: '92100' },
      { t: 'texte', cle: 'ville', lib: 'Ville', ic: 'immeuble', requis: true, exemple: 'Boulogne-Billancourt' },
      { t: 'texte', cle: 'quartier', lib: 'Quartier', ic: 'boussole', exemple: 'Silly-Gallieni' },
      { t: 'texte', cle: 'lot', lib: 'N° de lot', ic: 'lots', si: enImmeuble, exemple: '12' },
      { t: 'texte', cle: 'cadastre', lib: 'Cadastre', ic: 'plan', si: d => estMaison(d) || estTerrain(d), exemple: 'Section AB, parcelle 123' },
      /* Les surfaces, puis juste après les pièces, au – / +. */
      { t: 'titre', cle: 't-surf', lib: 'Les surfaces', ic: 'regle' },
      { t: 'nombre', cle: 'surface', lib: 'Surface habitable', ic: 'regle', unite: 'm²', si: d => !estTerrain(d) },
      { t: 'nombre', cle: 'carrez', lib: 'Surface loi Carrez', ic: 'regle', unite: 'm²', si: enImmeuble },
      { t: 'nombre', cle: 'sejour', lib: 'Séjour', ic: 'canape', unite: 'm²', si: aDesPieces },
      { t: 'nombre', cle: 'terrain', lib: 'Terrain', ic: 'terrain', unite: 'm²', si: d => estMaison(d) || estTerrain(d) },
      { t: 'titre', cle: 't-pieces', lib: 'Les pièces', ic: 'plan', si: aDesPieces },
      { t: 'compteur', cle: 'pieces', lib: 'Pièces', ic: 'plan', si: aDesPieces },
      { t: 'compteur', cle: 'chambres', lib: 'Chambres', ic: 'lit', si: aDesPieces },
      { t: 'compteur', cle: 'sdb', lib: 'Salles de bains', ic: 'bain', si: aDesPieces },
      { t: 'compteur', cle: 'salleseau', lib: 'Salles d’eau', ic: 'douche', si: aDesPieces },
      { t: 'compteur', cle: 'wc', lib: 'WC', ic: 'wc', si: aDesPieces },
      { t: 'compteur', cle: 'niveaux', lib: 'Niveaux', ic: 'escalier', min: 1, max: 4, si: surNiveaux, aide: '2 : duplex · 3 : triplex', mots: n => (n === 2 ? 'Duplex' : n === 3 ? 'Triplex' : '') },
      { t: 'compteur', cle: 'etages', lib: 'Niveaux', ic: 'escalier', min: 1, si: estMaison, aide: '1 : de plain-pied', mots: n => (n === 1 ? 'Plain-pied' : '') },
      { t: 'titre', cle: 't-terrain', lib: 'Le terrain', ic: 'terrain', si: estTerrain },
      { t: 'choix', cle: 'constructible', lib: 'Constructible', si: estTerrain, options: [{ v: 'oui', l: 'Oui' }, { v: 'partiel', l: 'En partie' }, { v: 'non', l: 'Non' }] },
      { t: 'choix', cle: 'viabilise', lib: 'Viabilisé', si: estTerrain, aide: 'Eau, électricité, assainissement en bordure', options: [{ v: 'oui', l: 'Oui' }, { v: 'non', l: 'Non' }] },
      { t: 'titre', cle: 't-imm', lib: 'L’immeuble', ic: 'immeuble', si: enImmeuble },
      { t: 'titre', cle: 't-constr', lib: 'La construction', ic: 'maison', si: estMaison },
      { t: 'compteur', cle: 'etage', lib: 'Étage', ic: 'ascenseur', min: 0, si: enImmeuble, mots: n => (n === 0 ? 'RDC' : '') },
      { t: 'compteur', cle: 'etages', lib: 'Étages en tout', ic: 'immeuble', min: 0, si: enImmeuble },
      { t: 'nombre', cle: 'annee', lib: 'Année de construction', ic: 'calendrier', si: d => !estTerrain(d), exemple: '1968' },
      { t: 'cases', cle: 'immeuble', lib: 'Dans l’immeuble', si: enImmeuble, options: [
        { v: 'ascenseur', l: 'Ascenseur' }, { v: 'gardien', l: 'Gardien' }, { v: 'digicode', l: 'Digicode' },
        { v: 'interphone', l: 'Interphone' }, { v: 'velos', l: 'Local vélos' }, { v: 'fibre', l: 'Fibre' },
      ] },
    ],
  },
  {
    id: 'interieur', titre: 'L’intérieur', court: 'Intérieur', sous: 'État, cuisine, chauffage, équipements.', ic: 'canape',
    champs: [
      { t: 'titre', cle: 't-etat', lib: 'L’état général', ic: 'pinceau' },
      { t: 'choix', cle: 'etat', lib: 'État général', options: [
        { v: 'a_renover', l: 'À rénover' }, { v: 'travaux_legers', l: 'À rafraîchir' }, { v: 'bon_etat', l: 'Bon état' }, { v: 'refait_neuf', l: 'Refait à neuf' },
      ] },
      { t: 'zone', cle: 'travaux', lib: 'Travaux récents ou à prévoir', exemple: 'Cuisine refaite en 2022 ; fenêtres double vitrage en 2019' },
      { t: 'titre', cle: 't-cuis', lib: 'La cuisine', ic: 'canape', si: aDesPieces },
      { t: 'choix', cle: 'cuisine', lib: 'Cuisine', si: aDesPieces, options: [
        { v: 'independante', l: 'Indépendante' }, { v: 'ouverte', l: 'Ouverte' }, { v: 'kitchenette', l: 'Kitchenette' }, { v: 'aucune', l: 'Sans cuisine' },
      ] },
      { t: 'choix', cle: 'cuisineEquip', lib: 'Équipement', si: aDesPieces, options: [
        { v: 'equipee', l: 'Équipée' }, { v: 'amenagee', l: 'Aménagée' }, { v: 'non', l: 'Non équipée' },
      ] },
      { t: 'titre', cle: 't-chauf', lib: 'Chauffage et eau chaude', ic: 'eclair', si: aDesPieces },
      { t: 'choix', cle: 'chauffageMode', lib: 'Chauffage', si: aDesPieces, options: [{ v: 'individuel', l: 'Individuel' }, { v: 'collectif', l: 'Collectif' }] },
      { t: 'choix', cle: 'chauffageEnergie', lib: 'Énergie', si: aDesPieces, options: [
        { v: 'gaz', l: 'Gaz' }, { v: 'electrique', l: 'Électrique' }, { v: 'pac', l: 'Pompe à chaleur' },
        { v: 'fioul', l: 'Fioul' }, { v: 'bois', l: 'Bois' }, { v: 'urbain', l: 'Réseau urbain' },
      ] },
      { t: 'choix', cle: 'chauffageEmetteurs', lib: 'Par', si: aDesPieces, options: [
        { v: 'radiateurs', l: 'Radiateurs' }, { v: 'sol', l: 'Plancher chauffant' }, { v: 'convecteurs', l: 'Convecteurs' }, { v: 'poele', l: 'Poêle' },
      ] },
      { t: 'choix', cle: 'eauChaude', lib: 'Eau chaude', si: aDesPieces, options: [{ v: 'individuelle', l: 'Individuelle' }, { v: 'collective', l: 'Collective' }] },
      { t: 'titre', cle: 't-equip', lib: 'Ce qu’il a', ic: 'check', si: aDesPieces },
      { t: 'cases', cle: 'equipements', lib: 'Équipements et qualités', si: aDesPieces, options: [
        { v: 'traversant', l: 'Traversant' }, { v: 'lumineux', l: 'Lumineux' }, { v: 'calme', l: 'Calme' }, { v: 'dernierEtage', l: 'Dernier étage' },
        { v: 'parquet', l: 'Parquet' }, { v: 'moulures', l: 'Moulures, cachet' }, { v: 'cheminee', l: 'Cheminée' }, { v: 'placards', l: 'Placards, rangements' },
        { v: 'doubleVitrage', l: 'Double vitrage' }, { v: 'voletsElec', l: 'Volets électriques' }, { v: 'clim', l: 'Climatisation' }, { v: 'alarme', l: 'Alarme' },
        { v: 'pmr', l: 'Accessible PMR' }, { v: 'meuble', l: 'Vendu meublé' },
      ] },
      { t: 'zone', cle: 'interieurNote', lib: 'Ce qu’il faut savoir de l’intérieur', exemple: 'Belle hauteur sous plafond, parquet d’origine, séjour en angle' },
    ],
  },
  {
    id: 'exterieur', titre: 'Extérieur et annexes', court: 'Extérieur', sous: 'Balcon, jardin, cave, parking, vue.', ic: 'terrain',
    champs: [
      { t: 'cases', cle: 'annexes', lib: 'Ce qu’il y a', options: [
        { v: 'balcon', l: 'Balcon' }, { v: 'terrasse', l: 'Terrasse' }, { v: 'loggia', l: 'Loggia' }, { v: 'jardin', l: 'Jardin' },
        { v: 'cave', l: 'Cave' }, { v: 'parking', l: 'Parking' }, { v: 'box', l: 'Box' }, { v: 'garage', l: 'Garage' }, { v: 'piscine', l: 'Piscine' },
      ] },
      { t: 'nombre', cle: 'surfBalcon', lib: 'Balcon', unite: 'm²', si: d => liste(d, 'annexes').includes('balcon') },
      { t: 'nombre', cle: 'surfTerrasse', lib: 'Terrasse', unite: 'm²', si: d => liste(d, 'annexes').includes('terrasse') },
      { t: 'nombre', cle: 'surfLoggia', lib: 'Loggia', unite: 'm²', si: d => liste(d, 'annexes').includes('loggia') },
      { t: 'nombre', cle: 'surfJardin', lib: 'Jardin', unite: 'm²', si: d => liste(d, 'annexes').includes('jardin') },
      { t: 'nombre', cle: 'surfCave', lib: 'Cave', unite: 'm²', si: d => liste(d, 'annexes').includes('cave') },
      { t: 'compteur', cle: 'nbParking', lib: 'Places de parking', ic: 'parking', si: d => liste(d, 'annexes').some(x => ['parking', 'box', 'garage'].includes(x)) },
      { t: 'titre', cle: 't-vue', lib: 'Exposition et vue', ic: 'soleil' },
      { t: 'choix', cle: 'expo', lib: 'Exposition principale', options: [...EXPOSITIONS, { v: 'traversant', l: 'Traversant' }] },
      { t: 'choix', cle: 'vue', lib: 'Vue', options: [
        { v: 'degagee', l: 'Dégagée' }, { v: 'jardin', l: 'Sur jardin' }, { v: 'cour', l: 'Sur cour' }, { v: 'rue', l: 'Sur rue' }, { v: 'monument', l: 'Monument, Seine' },
      ] },
      { t: 'choix', cle: 'visAVis', lib: 'Vis-à-vis', options: [{ v: 'aucun', l: 'Aucun' }, { v: 'leger', l: 'Léger' }, { v: 'direct', l: 'Direct' }] },
      { t: 'zone', cle: 'exterieurNote', lib: 'Ce qu’il faut savoir de l’extérieur', exemple: 'Balcon filant plein sud, sans vis-à-vis ; box en sous-sol accessible par la rampe' },
    ],
  },
  {
    id: 'pieces', titre: 'Les pièces', court: 'Pièces', sous: 'Une par une, dans l’ordre de la visite : la pièce, sa surface, son exposition.', ic: 'plan',
    champs: [{ t: 'pieces', cle: 'detailPieces', lib: 'Les pièces' }],
  },
  {
    id: 'energie', titre: 'L’énergie', court: 'Énergie', sous: 'DPE et GES, leurs valeurs, les dépenses estimées.', ic: 'eclair',
    champs: [
      { t: 'choix', cle: 'dpeStatut', lib: 'Le DPE', options: [
        { v: 'fait', l: 'Réalisé' }, { v: 'encours', l: 'Commandé' }, { v: 'vierge', l: 'Vierge' }, { v: 'non', l: 'Non soumis' },
      ] },
      { t: 'lettres', cle: 'dpe', lib: 'Classe énergie (DPE)', genre: 'dpe', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'nombre', cle: 'dpeValeur', lib: 'Consommation', unite: 'kWh/m²/an', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'lettres', cle: 'ges', lib: 'Classe climat (GES)', genre: 'ges', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'nombre', cle: 'gesValeur', lib: 'Émissions', unite: 'kg CO₂/m²/an', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'date', cle: 'dpeDate', lib: 'Date du DPE', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'titre', cle: 't-cout', lib: 'Les dépenses d’énergie écrites sur le DPE', ic: 'euro', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non',
        aide: 'Ce n’est pas la copropriété : c’est l’estimation du DPE pour chauffer et éclairer le logement. Le DPE la donne en fourchette, l’annonce la reprend telle quelle.' },
      { t: 'euros', cle: 'coutMin', lib: 'Montant bas', unite: '€/an', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'euros', cle: 'coutMax', lib: 'Montant haut', unite: '€/an', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'nombre', cle: 'coutAnnee', lib: 'Prix de l’énergie de l’année', exemple: '2023', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non', aide: 'Écrite sur le DPE, à côté des montants' },
    ],
  },
  {
    id: 'copro', titre: 'Copropriété, charges et taxes', court: 'Copro et charges', sous: 'La copropriété, puis ce que le bien coûte chaque année.', ic: 'lots',
    champs: [
      { t: 'titre', cle: 't-copro', lib: 'La copropriété', ic: 'lots' },
      { t: 'choix', cle: 'copro', lib: 'En copropriété ?', options: [{ v: 'oui', l: 'Oui' }, { v: 'non', l: 'Non' }] },
      { t: 'nombre', cle: 'lots', lib: 'Nombre de lots', si: d => d.copro === 'oui', aide: 'Obligatoire dans l’annonce' },
      { t: 'choix', cle: 'procedure', lib: 'Procédure en cours contre le syndicat ?', si: d => d.copro === 'oui', options: [{ v: 'non', l: 'Non' }, { v: 'oui', l: 'Oui' }] },
      { t: 'texte', cle: 'procedureNature', lib: 'Laquelle', large: true, si: d => d.copro === 'oui' && d.procedure === 'oui' },
      { t: 'texte', cle: 'syndic', lib: 'Syndic', si: d => d.copro === 'oui', exemple: 'Foncia Boulogne' },
      { t: 'euros', cle: 'fondsTravaux', lib: 'Fonds de travaux du lot', si: d => d.copro === 'oui' },
      { t: 'zone', cle: 'travauxVotes', lib: 'Travaux votés ou à venir', si: d => d.copro === 'oui', exemple: 'Ravalement voté en AG 2025, 4 800 € à la charge du vendeur' },
      { t: 'titre', cle: 't-fin', lib: 'Charges et taxes', ic: 'euro' },
      { t: 'eurosAn', cle: 'chargesAn', lib: 'Charges de copropriété', ic: 'lots', si: d => d.copro === 'oui', aide: 'Le montant annuel, celui que l’annonce doit donner (loi ALUR). Tape l’un ou l’autre : le second se calcule.' },
      { t: 'cases', cle: 'chargesInclus', lib: 'Elles comprennent', si: d => d.copro === 'oui', options: [
        { v: 'chauffage', l: 'Chauffage' }, { v: 'eauChaude', l: 'Eau chaude' }, { v: 'eauFroide', l: 'Eau froide' }, { v: 'gardien', l: 'Gardien' }, { v: 'ascenseur', l: 'Ascenseur' },
      ] },
      { t: 'euros', cle: 'taxeFonciere', lib: 'Taxe foncière', unite: '€/an' },
    ],
  },
  {
    id: 'prix', titre: 'Prix et mandat', court: 'Prix et mandat', sous: 'Le prix affiché, les honoraires, le mandat.', ic: 'euro', pour: pasASuivre,
    avant: { titre: 'L’estimation et le prix', court: 'Estimation', sous: 'Le rendez-vous, la fourchette, le prix conseillé et les honoraires.' },
    champs: [
      { t: 'titre', cle: 't-estim', lib: 'L’estimation de l’agence', ic: 'regle' },
      { t: 'date', cle: 'rdvEstimation', lib: 'Rendez-vous d’estimation' },
      { t: 'date', cle: 'avisEnvoye', lib: 'Avis de valeur envoyé le' },
      { t: 'euros', cle: 'estimBasse', lib: 'Fourchette basse' },
      { t: 'euros', cle: 'estimHaute', lib: 'Fourchette haute' },
      { t: 'titre', cle: 't-prix', lib: 'Le prix', ic: 'etiquette' },
      { t: 'euros', cle: 'prix', lib: 'Prix affiché', aide: 'Honoraires compris quand ils sont à la charge de l’acquéreur. À l’estimation : le prix conseillé.' },
      { t: 'choix', cle: 'charge', lib: 'Honoraires à la charge de', options: [{ v: 'acquereur', l: 'L’acquéreur' }, { v: 'vendeur', l: 'Le vendeur' }] },
      { t: 'choix', cle: 'honoMode', lib: 'Honoraires', options: [{ v: 'taux', l: 'En pourcentage' }, { v: 'forfait', l: 'Forfait' }] },
      { t: 'nombre', cle: 'taux', lib: 'Taux', unite: '% TTC', si: d => d.honoMode !== 'forfait', aide: 'Du prix net vendeur' },
      { t: 'euros', cle: 'forfait', lib: 'Forfait', unite: '€ TTC', si: d => d.honoMode === 'forfait' },
      { t: 'titre', cle: 't-mandat', lib: 'Le mandat', ic: 'plume', si: sousMandat },
      { t: 'choix', cle: 'mandatType', lib: 'Type de mandat', si: sousMandat, options: [{ v: 'simple', l: 'Simple' }, { v: 'semi', l: 'Semi-exclusif' }, { v: 'exclusif', l: 'Exclusif' }] },
      { t: 'texte', cle: 'mandatNumero', lib: 'N° du registre', exemple: '4331', si: sousMandat },
      { t: 'date', cle: 'mandatDate', lib: 'Signé le', si: sousMandat },
      { t: 'date', cle: 'mandatFin', lib: 'Exclusivité ou mandat jusqu’au', si: sousMandat },
    ],
  },
  {
    id: 'pratique', titre: 'Pour la visite', court: 'Visite', sous: 'Occupation, clés, codes, contact sur place.', ic: 'cle', pour: e => !avantMandat(e),
    champs: [
      { t: 'choix', cle: 'occupation', lib: 'Le bien est', options: [
        { v: 'libre', l: 'Libre' }, { v: 'occupe', l: 'Occupé par le propriétaire' }, { v: 'loue', l: 'Loué' },
      ] },
      { t: 'euros', cle: 'loyer', lib: 'Loyer', unite: '€/mois', si: d => d.occupation === 'loue', aide: 'Hors charges' },
      { t: 'date', cle: 'finBail', lib: 'Fin du bail', si: d => d.occupation === 'loue' },
      { t: 'texte', cle: 'disponible', lib: 'Disponible', exemple: 'à la signature, ou à partir du 1er mars' },
      { t: 'choix', cle: 'cles', lib: 'Les clés', options: [
        { v: 'agence', l: 'À l’agence' }, { v: 'vendeur', l: 'Chez le vendeur' }, { v: 'gardien', l: 'Chez le gardien' }, { v: 'autre', l: 'Ailleurs' },
      ] },
      { t: 'texte', cle: 'trousseau', lib: 'Trousseau', exemple: 'N° 12', si: d => d.cles === 'agence' },
      { t: 'texte', cle: 'digicode', lib: 'Digicode', exemple: '4721B' },
      { t: 'texte', cle: 'interphone', lib: 'Nom sur l’interphone' },
      { t: 'texte', cle: 'porte', lib: 'Bâtiment, étage, porte', exemple: 'Bât. B, 3e gauche' },
      { t: 'texte', cle: 'annexesNum', lib: 'Cave, box', exemple: 'Cave 14 · box 7' },
      { t: 'texte', cle: 'contactNom', lib: 'Contact sur place' },
      { t: 'texte', cle: 'contactTel', lib: 'Son téléphone' },
      { t: 'texte', cle: 'creneaux', lib: 'Heures de visite', large: true, exemple: 'soirs après 18 h, samedi matin' },
      { t: 'zone', cle: 'consignes', lib: 'Consignes', exemple: 'Le box se prend par la rampe rue de Silly ; cave au sous-sol, escalier B' },
    ],
  },
  {
    id: 'annonce', titre: 'L’annonce et les notes', court: 'Annonce', sous: 'Le texte de l’annonce, ce qu’on garde pour soi.', ic: 'megaphone',
    avant: { titre: 'Les notes', court: 'Notes', sous: 'Ce que tu gardes pour toi : le projet, ce qu’il a dit, ce qu’il faut retenir.' },
    champs: [
      { t: 'annonce', cle: 'annonceTexte', lib: 'L’annonce', si: sousMandat },
      { t: 'zone', cle: 'notes', lib: 'Notes internes', ic: 'cadenas', aide: 'Visibles par toi seul, jamais dans un espace client ni une annonce.', exemple: 'Ne pas descendre sous 870 000 € sans l’appeler' },
    ],
  },
  {
    id: 'photos', titre: 'Photos et dossier', court: 'Photos et dossier', sous: 'Les photos, les diagnostics, les pièces à réunir.', ic: 'photo',
    champs: [
      { t: 'photos', cle: 'photos', lib: 'Les photos' },
      { t: 'dossier', cle: 'dossier', lib: 'Le dossier' },
    ],
  },
];

/* Les étapes du formulaire pour un bien à cette étape de vente, avec le
   titre qui lui va (« L'estimation et le prix » tant que rien n'est signé). */
export function etapesDuBien(e: EtapeVente): EtapeBien[] {
  const avant = avantMandat(e);
  return ETAPES_BIEN.filter(x => !x.pour || x.pour(e)).map(x => (avant && x.avant ? { ...x, ...x.avant } : x));
}

/* ══ Les calculs ═══════════════════════════════════════════════════════ */

/* Le prix et les honoraires. `prix` est le prix affiché : honoraires compris
   s'ils sont à la charge de l'acquéreur (le net vendeur s'en déduit), égal au
   net vendeur sinon. */
export function argentBien(d: Donnees) {
  const prix = num(d, 'prix');
  const acq = d.charge !== 'vendeur';
  const forfait = d.honoMode === 'forfait';
  const taux = forfait ? null : num(d, 'taux');
  const f = forfait ? num(d, 'forfait') : null;
  let net: number | null = null, hono: number | null = null;
  if (prix) {
    if (acq) {
      if (forfait && f !== null) { hono = f; net = prix - f; }
      else if (taux !== null) { net = Math.round(prix / (1 + taux / 100)); hono = prix - net; }
    } else {
      net = prix;
      hono = forfait ? f : taux !== null ? Math.round((prix * taux) / 100) : null;
      if (hono !== null) net = prix - hono;
    }
  }
  const tauxNet = hono !== null && net ? (hono / net) * 100 : taux;
  return { prix, net, hono, acq, taux: tauxNet };
}
/* Les honoraires pour un autre prix (une offre, un compromis) : le forfait
   du mandat, ou son taux appliqué à ce prix. */
export function honorairesPour(d: Donnees, prix: number | null): number | null {
  if (!prix) return null;
  if (d.honoMode === 'forfait') return num(d, 'forfait');
  const t = num(d, 'taux');
  if (t === null) return null;
  return d.charge !== 'vendeur' ? Math.round(prix - prix / (1 + t / 100)) : Math.round((prix * t) / 100);
}
export const pourcent = (x: number) => `${(Math.round(x * 100) / 100).toString().replace('.', ',')} %`;
export const m2 = (x: number) => `${String(Math.round(x * 100) / 100).replace('.', ',')} m²`;

const nb = (d: Donnees, k: string) => num(d, k);
/* « Appartement 4 pièces · 92 m² » */
export function titreBien(d: Donnees): string {
  const t = nomType(d.typeBien);
  const p = nb(d, 'pieces'), s = nb(d, 'surface') ?? nb(d, 'terrain');
  const pieces = p && aDesPieces(d) && d.typeBien !== 'studio' ? `${p} pièce${p > 1 ? 's' : ''}` : '';
  return [[d.typeBien ? t : 'Nouveau bien', pieces].filter(Boolean).join(' '), s ? m2(s) : ''].filter(Boolean).join(' · ');
}
export const etageTexte = (e: number | null, total?: number | null) =>
  e === null ? '' : e === 0 ? 'Rez-de-chaussée' : `${e}${e === 1 ? 'er' : 'e'} étage${total ? ` sur ${total}` : ''}`;
/* « 4 pièces · 92 m² · 3e étage » : la ligne des cartes. */
export function specsBien(d: Donnees): string {
  const p = nb(d, 'pieces'), s = nb(d, 'surface') ?? nb(d, 'terrain');
  const e = nb(d, 'etage');
  return [
    d.typeBien === 'studio' ? 'Studio' : d.typeBien === 'maison' ? 'Maison' : d.typeBien === 'terrain' ? 'Terrain' : '',
    p && aDesPieces(d) && d.typeBien !== 'studio' ? `${p} pièce${p > 1 ? 's' : ''}` : '',
    s ? m2(s) : '',
    enImmeuble(d) && e !== null ? etageTexte(e).replace(' étage', ' étage').replace('Rez-de-chaussée', 'RDC') : '',
  ].filter(Boolean).join(' · ');
}
export const proprietairesDe = (d: Donnees): Personne[] => {
  const l = lirePersonnes(d.proprietaires).filter(p => p.nom || p.prenom);
  return l;
};
/* « Claire Dumas », « Paul et Claire Martin », « Paul Martin et Claire Durand » :
   le nom qu'on lit sur une carte. Les documents gardent leur forme
   (« M. et Mme Martin », nomsCourts). */
const etListe = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0] || '');
export const nomProprio = (d: Donnees): string => {
  if (d.qui === 'sci' && txt(d, 'sciNom')) return txt(d, 'sciNom');
  const l = proprietairesDe(d).map(p => ({ p: p.prenom.trim(), n: p.nom.trim() }));
  if (!l.length) return '';
  if (l.length > 1 && l.every(x => x.n && x.p && x.n.toLowerCase() === l[0].n.toLowerCase())) return `${etListe(l.map(x => x.p))} ${l[0].n}`;
  return etListe(l.map(x => `${x.p} ${x.n}`.trim()));
};
export const nomProprioActe = (d: Donnees): string =>
  d.qui === 'sci' && txt(d, 'sciNom') ? txt(d, 'sciNom') : proprietairesDe(d).length ? nomsCourts(proprietairesDe(d)) : '';

/* Les colonnes de la liste, recalculées à chaque enregistrement. */
export function colonnesBien(d: Donnees) {
  const a = argentBien(d);
  const photos = lirePhotos(d.photos);
  return {
    titre: titreBien(d), type_bien: typeof d.typeBien === 'string' ? d.typeBien : null,
    client_id: typeof d.clientId === 'string' && d.clientId ? d.clientId : null,
    adresse: txt(d, 'adresse') || null, code_postal: txt(d, 'cp') || null, ville: txt(d, 'ville') || null, quartier: txt(d, 'quartier') || null,
    prix: a.prix, surface: nb(d, 'surface') ?? nb(d, 'terrain'), nb_pieces: nb(d, 'pieces'), nb_chambres: nb(d, 'chambres'), etage: nb(d, 'etage'),
    mandat_type: typeof d.mandatType === 'string' && d.mandatType ? d.mandatType : null,
    mandat_numero: txt(d, 'mandatNumero') || null, mandat_fin: txt(d, 'mandatFin') || null,
    photo: photos[0]?.url || null,
  };
}

/* La référence du bien : EMI-V-<année>-<numéro>, à la suite des précédentes. */
export function referenceSuivante(dernieres: (string | null)[]): string {
  const an = new Date().getFullYear();
  const n = dernieres.map(r => (r && r.startsWith(`EMI-V-${an}-`) ? parseInt(r.split('-')[3], 10) : 0)).filter(Number.isFinite);
  return `EMI-V-${an}-${String(Math.max(0, ...n) + 1).padStart(3, '0')}`;
}

export const joursDepuis = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : null;
};
export const joursAvant = (ymd: string | null | undefined) => {
  if (!ymd) return null;
  const t = Date.parse(`${ymd}T12:00:00`);
  return Number.isFinite(t) ? Math.ceil((t - Date.now()) / 86_400_000) : null;
};
export const dateCourte = (ymd: string | null | undefined) => {
  if (!ymd) return '';
  const x = new Date(ymd.length <= 10 ? `${ymd}T12:00:00` : ymd);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).replace(/^1 /, '1er ');
};
export const dateLongue = (ymd: string | null | undefined) => (ymd ? jourLong(ymd.slice(0, 10)) : '');

/* La ligne d'état d'une carte : ce qui compte à cette étape. */
export function ligneEtat(b: BienVente, suivi: SuiviVente[]): { t: string; ton: 'neutre' | 'alerte' | 'ok' } {
  const d = b.donnees || {};
  const derniere = (type: string) => suivi.filter(x => x.type === type).sort((x, y) => y.le.localeCompare(x.le))[0];
  const etapeInfo = derniere('etape');
  const ed = (etapeInfo?.donnees || {}) as Record<string, string>;
  if (b.etape === 'vendu') return { t: `Vendu${b.vendu_le ? ` le ${dateCourte(b.vendu_le)}` : ''}`, ton: 'ok' };
  if (b.etape === 'a_suivre') {
    const rdv0 = txt(d, 'rdvEstimation');
    if (rdv0 && (joursAvant(rdv0) ?? -1) >= 0) return { t: `Rendez-vous d’estimation le ${dateCourte(rdv0)}`, ton: 'neutre' };
    const delai: Record<string, string> = { vite: 'vendre dès que possible', '3mois': 'vendre sous 3 mois', '6mois': 'vendre sous 6 mois', libre: 'pas pressé' };
    return { t: typeof d.delai === 'string' && delai[d.delai] ? `Projet : ${delai[d.delai]}` : 'Projet de vente à suivre', ton: 'neutre' };
  }
  if (b.etape === 'retire') return { t: `Retiré de la vente${ed.raison ? ` · ${ed.raison}` : ''}`, ton: 'neutre' };
  if (b.etape === 'suspendu') return { t: [ed.raison || 'Vente en pause', ed.reprise ? `reprise le ${dateCourte(ed.reprise)}` : ''].filter(Boolean).join(' · '), ton: 'neutre' };
  if (b.etape === 'compromis') {
    const pret = ed.pretLimite ? `fin du délai de prêt le ${dateCourte(ed.pretLimite)}` : '';
    const acte = ed.acte ? `acte le ${dateCourte(ed.acte)}` : '';
    const t = [pret, acte].filter(Boolean).join(' · ');
    return { t: t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Compromis signé', ton: 'neutre' };
  }
  if (b.etape === 'offre') {
    const o = suivi.filter(x => x.type === 'offre' && (x.statut === 'en_attente' || x.statut === 'acceptee' || x.statut === 'contre'))
      .sort((x, y) => (y.montant || 0) - (x.montant || 0))[0];
    const jusq = o ? String((o.donnees as Record<string, unknown>).jusquau || '') : '';
    return { t: o ? `Offre à ${euros(o.montant || 0)}${o.statut === 'acceptee' ? ' · acceptée' : jusq ? ` · réponse attendue le ${dateCourte(jusq)}` : ''}` : 'Sous offre', ton: 'alerte' };
  }
  if (b.etape === 'mandat') {
    const j = joursAvant(b.mandat_fin);
    const excl = b.mandat_type === 'exclusif' || b.mandat_type === 'semi';
    if (j !== null && j <= 15 && j >= 0) return { t: `${excl ? 'Exclusivité' : 'Mandat'} : fin dans ${j} jour${j > 1 ? 's' : ''}`, ton: 'alerte' };
    if (j !== null && j < 0) return { t: `${excl ? 'Exclusivité' : 'Mandat'} terminé${excl ? 'e' : ''} depuis le ${dateCourte(b.mandat_fin)}`, ton: 'alerte' };
    if (b.mandat_fin) return { t: `${excl ? 'Exclusivité' : 'Mandat'} jusqu’au ${dateCourte(b.mandat_fin)}`, ton: 'neutre' };
    return { t: 'Mandat en cours', ton: 'neutre' };
  }
  const a = num(d, 'estimBasse'), h = num(d, 'estimHaute');
  const rdv = txt(d, 'rdvEstimation'), avis = txt(d, 'avisEnvoye');
  if (avis) return { t: `Avis de valeur envoyé le ${dateCourte(avis)}`, ton: 'neutre' };
  if (rdv && (joursAvant(rdv) ?? -1) >= 0) return { t: `Rendez-vous d’estimation le ${dateCourte(rdv)}`, ton: 'neutre' };
  if (a || h) return { t: `Estimé ${a && h ? `entre ${euros(a)} et ${euros(h)}` : euros((a || h) as number)}`, ton: 'neutre' };
  return { t: 'À estimer', ton: 'neutre' };
}

/* ══ L'annonce : ce qui est obligatoire, ce qui manque ═══════════════════
   Les mentions qu'une annonce de vente doit porter (loi ALUR, arrêté du
   10 janvier 2017 sur les honoraires, DPE depuis 2022). */
export function controleAnnonce(d: Donnees): { ok: boolean; l: string; aide?: string }[] {
  const a = argentBien(d);
  const copro = d.copro === 'oui';
  const dpeFait = d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non';
  const out: { ok: boolean; l: string; aide?: string }[] = [
    { ok: !!a.prix, l: 'Le prix affiché' },
    { ok: !a.acq || (a.prix !== null && a.net !== null), l: 'Les honoraires et le prix hors honoraires', aide: 'À la charge de l’acquéreur : le % du prix net vendeur et le prix hors honoraires' },
    { ok: !!num(d, 'surface') || estTerrain(d), l: 'La surface habitable' },
    ...(copro && enImmeuble(d) ? [{ ok: !!num(d, 'carrez'), l: 'La surface loi Carrez' }] : []),
    { ok: !dpeFait || (!!d.dpe && !!d.ges), l: 'Les classes DPE et GES' },
    { ok: !dpeFait || (!!num(d, 'dpeValeur') && !!num(d, 'gesValeur')), l: 'Les valeurs du DPE et du GES' },
    { ok: !dpeFait || (!!num(d, 'coutMin') && !!num(d, 'coutMax')), l: 'Les dépenses d’énergie estimées (DPE)' },
    ...(copro ? [
      { ok: !!num(d, 'lots'), l: 'Le nombre de lots de la copropriété' },
      { ok: !!num(d, 'chargesAn'), l: 'Les charges annuelles de copropriété' },
      { ok: d.procedure === 'oui' || d.procedure === 'non', l: 'Une procédure en cours ou non' },
    ] : []),
  ];
  return out;
}
/* Classe F ou G : la mention « logement à consommation énergétique excessive ». */
export const passoire = (d: Donnees) => d.dpe === 'F' || d.dpe === 'G';

/* Un texte d'annonce à partir de la fiche, à retoucher. Aucun mot de métier,
   aucune promesse : les faits de la fiche, dans l'ordre où on les lit. */
export function brouillonAnnonce(d: Donnees): string {
  const a = argentBien(d);
  const t = nomType(d.typeBien).toLowerCase();
  const p = nb(d, 'pieces'), s = nb(d, 'surface'), ch = nb(d, 'chambres'), e = nb(d, 'etage'), et = nb(d, 'etages');
  const lieu = [txt(d, 'ville'), txt(d, 'quartier') ? `quartier ${txt(d, 'quartier')}` : ''].filter(Boolean).join(', ');
  const phrases: string[] = [];
  const debut = `${d.typeBien === 'appartement' || d.typeBien === 'duplex' || d.typeBien === 'loft' ? 'À' : 'À'} ${lieu || '…'}, ${t === 'maison' ? 'une maison' : t === 'terrain' ? 'un terrain' : `un ${t}`}${p && aDesPieces(d) ? ` de ${p} pièce${p > 1 ? 's' : ''}` : ''}${s ? ` de ${m2(s)}` : ''}${enImmeuble(d) && e !== null ? `, au ${e === 0 ? 'rez-de-chaussée' : `${e}${e === 1 ? 'er' : 'e'} étage`}${et ? ` sur ${et}` : ''}${liste(d, 'immeuble').includes('ascenseur') ? ' avec ascenseur' : ''}` : ''}.`;
  phrases.push(debut);
  /* Sur plusieurs niveaux, de plain-pied ; un terrain constructible. */
  const niv = nb(d, 'niveaux');
  if (surNiveaux(d) && niv && niv >= 2) phrases.push(`Il se développe ${niv === 2 ? 'en duplex' : niv === 3 ? 'en triplex' : `sur ${niv} niveaux`}.`);
  if (estMaison(d) && et) phrases.push(et === 1 ? 'Elle est de plain-pied.' : `Elle se développe sur ${et} niveaux.`);
  if (estTerrain(d) && (d.constructible || d.viabilise)) {
    const t2 = [d.constructible === 'oui' ? 'constructible' : d.constructible === 'partiel' ? 'constructible en partie' : d.constructible === 'non' ? 'non constructible' : '', d.viabilise === 'oui' ? 'viabilisé' : d.viabilise === 'non' ? 'non viabilisé' : ''].filter(Boolean);
    if (t2.length) phrases.push(`Le terrain est ${t2.join(' et ')}.`);
  }
  const pieces = lirePieces(d.detailPieces).filter(x => x.nom);
  const sejour = nb(d, 'sejour');
  const vie: string[] = [];
  if (sejour) vie.push(`un séjour de ${m2(sejour)}${d.expo && d.expo !== 'traversant' ? ` exposé ${nomExpo(d.expo).toLowerCase()}` : ''}`);
  if (d.cuisine === 'ouverte') vie.push(`une cuisine ouverte${d.cuisineEquip === 'equipee' ? ' équipée' : ''}`);
  else if (d.cuisine === 'independante') vie.push(`une cuisine indépendante${d.cuisineEquip === 'equipee' ? ' équipée' : ''}`);
  if (ch) vie.push(`${ch} chambre${ch > 1 ? 's' : ''}`);
  const sdb = nb(d, 'sdb'), se = nb(d, 'salleseau');
  if (sdb) vie.push(`${sdb > 1 ? `${sdb} salles` : 'une salle'} de bains`);
  if (se) vie.push(`${se > 1 ? `${se} salles` : 'une salle'} d’eau`);
  if (vie.length) phrases.push(`Il se compose ${d.typeBien === 'maison' ? 'de' : 'de'} ${vie.join(', ').replace(/, ([^,]*)$/, ' et $1')}.`);
  else if (pieces.length) phrases.push(`Il se compose de : ${pieces.map(x => x.nom.toLowerCase()).join(', ')}.`);
  const plus: string[] = [];
  const eq = liste(d, 'equipements');
  if (eq.includes('traversant')) plus.push('traversant');
  if (eq.includes('lumineux')) plus.push('lumineux');
  if (eq.includes('calme')) plus.push('au calme');
  if (plus.length) phrases.push(`Le bien est ${plus.join(', ').replace(/, ([^,]*)$/, ' et $1')}.`);
  const ann = liste(d, 'annexes');
  const ext: string[] = [];
  const sf = (k: string) => (nb(d, k) ? ` de ${m2(nb(d, k) as number)}` : '');
  if (ann.includes('balcon')) ext.push(`un balcon${sf('surfBalcon')}`);
  if (ann.includes('terrasse')) ext.push(`une terrasse${sf('surfTerrasse')}`);
  if (ann.includes('jardin')) ext.push(`un jardin${sf('surfJardin')}`);
  if (ann.includes('cave')) ext.push('une cave');
  if (ann.includes('parking')) ext.push('une place de parking');
  if (ann.includes('box')) ext.push('un box');
  if (ann.includes('garage')) ext.push('un garage');
  if (ext.length) phrases.push(`Avec ${ext.join(', ').replace(/, ([^,]*)$/, ' et $1')}.`);
  if (d.etat === 'refait_neuf') phrases.push('Il a été entièrement refait.');
  else if (d.etat === 'bon_etat') phrases.push('Il est en bon état.');
  const legal: string[] = [];
  if (a.prix) {
    if (a.acq && a.net && a.hono !== null && a.taux !== null) legal.push(`Prix : ${euros(a.prix)} honoraires inclus, dont ${pourcent(a.taux)} TTC à la charge de l’acquéreur (${euros(a.net)} hors honoraires).`);
    else legal.push(`Prix : ${euros(a.prix)}, honoraires à la charge du vendeur.`);
  }
  if (d.copro === 'oui') {
    legal.push(`Copropriété de ${nb(d, 'lots') || '…'} lots${nb(d, 'chargesAn') ? `, charges annuelles de ${euros(nb(d, 'chargesAn') as number)}` : ''}. ${d.procedure === 'oui' ? `Procédure en cours${txt(d, 'procedureNature') ? ` : ${txt(d, 'procedureNature')}` : ''}.` : 'Aucune procédure en cours.'}`);
  }
  if (d.dpeStatut === 'vierge') legal.push('DPE vierge.');
  else if (d.dpe) {
    legal.push(`DPE : classe ${d.dpe}${nb(d, 'dpeValeur') ? ` (${nb(d, 'dpeValeur')} kWh/m²/an)` : ''}, GES : classe ${d.ges || '…'}${nb(d, 'gesValeur') ? ` (${nb(d, 'gesValeur')} kg CO₂/m²/an)` : ''}.${passoire(d) ? ' Logement à consommation énergétique excessive.' : ''}`);
    if (nb(d, 'coutMin') && nb(d, 'coutMax')) legal.push(`Montant estimé des dépenses annuelles d’énergie pour un usage standard : entre ${euros(nb(d, 'coutMin') as number)} et ${euros(nb(d, 'coutMax') as number)}${nb(d, 'coutAnnee') ? ` (prix de l’énergie de ${nb(d, 'coutAnnee')})` : ''}.`);
  }
  legal.push('Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr.');
  return `${phrases.join(' ')}\n\n${legal.join('\n')}`;
}

/* ══ Vers les autres rubriques ══════════════════════════════════════════ */

/* Pour la note de correspondance (src/lib/correspondance.ts). */
export function versCorrespondance(b: BienVente): BienCorr {
  const d = b.donnees || {};
  const ann = liste(d, 'annexes');
  const imm = liste(d, 'immeuble');
  const ext = (nb(d, 'surfBalcon') || 0) + (nb(d, 'surfTerrasse') || 0) + (nb(d, 'surfLoggia') || 0) + (nb(d, 'surfJardin') || 0);
  return {
    prix: argentBien(d).prix, ville: txt(d, 'ville') || null, quartier: txt(d, 'quartier') || null,
    surface: nb(d, 'surface'), pieces: nb(d, 'pieces'), chambres: nb(d, 'chambres'), sejour: nb(d, 'sejour'),
    etage: enImmeuble(d) ? nb(d, 'etage') : null, etageTotal: nb(d, 'etages'),
    expo: d.expo ? nomExpo(d.expo) : null, dpe: typeof d.dpe === 'string' && d.dpe ? d.dpe : null, annee: nb(d, 'annee'),
    terrasse: ann.includes('terrasse') || ann.includes('loggia'), balcon: ann.includes('balcon'), jardin: ann.includes('jardin'),
    parking: ann.some(x => ['parking', 'box', 'garage'].includes(x)), cave: ann.includes('cave'),
    ascenseur: imm.includes('ascenseur'), gardien: imm.includes('gardien'),
    exterieur: ext || null, surfaceTerrasse: nb(d, 'surfTerrasse'), surfaceBalcon: nb(d, 'surfBalcon'),
  };
}
/* Le type de bien tel que les recherches l'écrivent (« Appartement, Maison »). */
export const typeRecherche = (v: unknown) =>
  v === 'maison' ? 'Maison' : v === 'terrain' ? 'Terrain' : v === 'loft' ? 'Loft' : v === 'duplex' ? 'Duplex'
    : v === 'appartement' || v === 'studio' ? 'Appartement' : 'Autre';
/* Une recherche qui ne dit rien du type accepte tout ; un duplex ou un loft
   est aussi un appartement. */
export function typeCompatible(v: unknown, typesRecherche: string | null | undefined): boolean {
  const l = String(typesRecherche || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!l.length) return true;
  const t = typeRecherche(v).toLowerCase();
  if (l.includes(t)) return true;
  return (t === 'duplex' || t === 'loft') && l.includes('appartement');
}

/* Le bien dans le dossier d'un acheteur (table `biens`) : exactement les
   colonnes qu'écrit l'ajout d'un bien depuis la fiche client (FicheClient,
   saveBien), plus le lien vers le bien en vente. */
export function versBienAcheteur(b: BienVente, o: { clientId: string; rechercheId: string; quand: string }) {
  const d = b.donnees || {};
  const a = argentBien(d);
  const ann = liste(d, 'annexes'), eq = liste(d, 'equipements'), imm = liste(d, 'immeuble');
  const photos = lirePhotos(d.photos).map(p => p.url);
  const energie = { gaz: 'Gaz', electrique: 'Électricité', pac: 'Pompe à chaleur', fioul: 'Fioul', bois: 'Bois', urbain: 'Réseau urbain' } as Record<string, string>;
  const chargesAn = nb(d, 'chargesAn');
  return {
    client_id: o.clientId, recherche_id: o.rechercheId, bien_vente_id: b.id,
    etape: 'presente', envoye_le: o.quand, canal_envoi: 'lien', badge_retour: 'propose',
    url: null, titre: b.titre || titreBien(d), ville: txt(d, 'ville') || null, code_postal: txt(d, 'cp') || null, quartier: txt(d, 'quartier') || null,
    type_bien: typeRecherche(d.typeBien),
    surface: nb(d, 'surface'), nb_pieces: nb(d, 'pieces'), nb_chambres: nb(d, 'chambres'),
    nb_salles_bain: (nb(d, 'sdb') || 0) + (nb(d, 'salleseau') || 0) || null, nb_wc: nb(d, 'wc'),
    etage: enImmeuble(d) ? nb(d, 'etage') : null, etage_total: nb(d, 'etages'), annee_construction: nb(d, 'annee'),
    exposition: d.expo ? nomExpo(d.expo) : null,
    dpe: typeof d.dpe === 'string' && d.dpe ? d.dpe : null, dpe_conso: nb(d, 'dpeValeur'),
    ges: typeof d.ges === 'string' && d.ges ? d.ges : null, ges_emissions: nb(d, 'gesValeur'),
    chauffage: d.chauffageMode === 'collectif' ? 'Collectif' : d.chauffageMode === 'individuel' ? 'Individuel' : null,
    source_energie: typeof d.chauffageEnergie === 'string' ? energie[d.chauffageEnergie] || null : null,
    parking: ann.some(x => ['parking', 'box', 'garage'].includes(x)), balcon: ann.includes('balcon'), terrasse: ann.includes('terrasse') || ann.includes('loggia'),
    jardin: ann.includes('jardin'), cave: ann.includes('cave'), ascenseur: imm.includes('ascenseur'), gardien: imm.includes('gardien'),
    cuisine_equipee: d.cuisineEquip === 'equipee', climatisation: eq.includes('clim'), traversant: eq.includes('traversant') || d.expo === 'traversant',
    surface_balcon: nb(d, 'surfBalcon'), surface_terrasse: nb(d, 'surfTerrasse') ?? nb(d, 'surfLoggia'),
    etat_general: typeof d.etat === 'string' && d.etat ? d.etat : null,
    description: txt(d, 'annonceTexte') || brouillonAnnonce(d),
    /* Un bien de l'agence : le prix affiché est celui que paie l'acheteur,
       honoraires de vente compris. Pas d'honoraires de recherche en plus. */
    prix_vendeur: a.net ?? a.prix, commission_type: 'fixe', commission_val: a.acq ? a.hono || 0 : 0, prix_acquereur: a.prix,
    charges_trimestrielles: chargesAn ? Math.round(chargesAn / 4) : null, taxe_fonciere: nb(d, 'taxeFonciere'),
    photos, source_portail: 'Emilio Immobilier', agence_nom: 'Emilio Immobilier', agence_tel: null,
  };
}

/* Le « bien » que les modèles de documents savent lire (Contexte.bien), à
   partir d'un bien en vente. `id` vide : le document n'est pas rattaché à un
   bien d'acheteur ; son lien au bien en vente est `donnees.bienVenteId`. */
export function contexteDocument(b: BienVente) {
  const d = b.donnees || {};
  return {
    id: '', titre: b.titre, adresse: txt(d, 'adresse') || null, code_postal: txt(d, 'cp') || null, ville: txt(d, 'ville') || null,
    quartier: txt(d, 'quartier') || null, type_bien: typeRecherche(d.typeBien), surface: nb(d, 'surface'), nb_pieces: nb(d, 'pieces'),
    etage: nb(d, 'etage'), prix_acquereur: argentBien(d).prix, prix_vendeur: argentBien(d).net, agence_nom: 'Emilio Immobilier', description: null,
  };
}
/* Le mandat de vente prérempli : les vendeurs, le bien, le prix, les honoraires. */
export function versMandatVente(b: BienVente, base: Donnees): Donnees {
  const d = b.donnees || {};
  const vs = lirePersonnes(d.proprietaires);
  const t = d.typeBien;
  const description = [
    t === 'maison' ? 'Une maison' : t === 'terrain' ? 'Un terrain' : 'Un appartement',
    nb(d, 'pieces') && aDesPieces(d) ? `de ${nb(d, 'pieces')} pièces` : '',
    enImmeuble(d) && nb(d, 'etage') !== null ? `au ${etageTexte(nb(d, 'etage')).toLowerCase()}` : '',
    liste(d, 'annexes').length ? `avec ${liste(d, 'annexes').map(x => ({ balcon: 'balcon', terrasse: 'terrasse', loggia: 'loggia', jardin: 'jardin', cave: 'cave', parking: 'parking', box: 'box', garage: 'garage', piscine: 'piscine' } as Record<string, string>)[x] || x).join(', ')}` : '',
  ].filter(Boolean).join(' ');
  const qui = d.qui === 'couple' || d.qui === 'indivision' || d.qui === 'sci' ? d.qui : 'personne';
  return {
    ...base,
    bienVenteId: b.id,
    qui, ...(qui === 'sci' ? { sciNom: txt(d, 'sciNom') } : {}),
    vendeurs: vs.length ? vs : base.vendeurs,
    notaire: txt(d, 'notaire') || base.notaire || '',
    nature: t === 'maison' ? 'maison' : t === 'terrain' ? 'terrain' : ['appartement', 'studio', 'duplex', 'loft'].includes(String(t)) ? 'appartement' : 'autre',
    adresse: txt(d, 'adresse'), cp: txt(d, 'cp'), ville: txt(d, 'ville'), description,
    copro: d.copro === 'oui' ? 'oui' : d.copro === 'non' ? 'non' : base.copro,
    ...(d.copro === 'oui' && txt(d, 'lot') ? { lots: [{ numero: txt(d, 'lot'), nature: nomType(t), tantiemes: '' }] } : {}),
    ...(nb(d, 'carrez') ? { carrez: nb(d, 'carrez') } : {}),
    ...(nb(d, 'surface') && !enImmeuble(d) ? { surfaceHab: nb(d, 'surface') } : {}),
    ...(nb(d, 'terrain') ? { terrain: nb(d, 'terrain') } : {}),
    ...(txt(d, 'cadastre') ? { cadastre: txt(d, 'cadastre') } : {}),
    occupation: d.occupation === 'loue' ? 'loue' : d.occupation === 'occupe' ? 'vendeur' : 'libre',
    type: d.mandatType === 'simple' || d.mandatType === 'semi' || d.mandatType === 'exclusif' ? d.mandatType : base.type,
    prix: num(d, 'prix') ?? base.prix, charge: d.charge === 'vendeur' ? 'vendeur' : 'acquereur',
    honoMode: d.honoMode === 'forfait' ? 'forfait' : 'taux',
    ...(num(d, 'taux') !== null ? { taux: num(d, 'taux') } : {}), ...(num(d, 'forfait') !== null ? { forfait: num(d, 'forfait') } : {}),
    numero: txt(d, 'mandatNumero') || base.numero || '',
  };
}

/* Le propriétaire tel que sa fiche client l'enregistre. */
export function personneDepuisClient(c: { civilite?: string | null; prenom?: string | null; nom?: string | null; adresse?: string | null; emails?: string[] | null; telephones?: string[] | null }): Personne {
  return {
    ...PERSONNE_VIDE, civilite: c.civilite === 'Madame' || c.civilite === 'Monsieur' ? c.civilite : '',
    prenom: c.prenom || '', nom: c.nom || '', adresse: c.adresse || '', email: c.emails?.[0] || '', telephone: c.telephones?.[0] || '',
  };
}
export { nomComplet };
