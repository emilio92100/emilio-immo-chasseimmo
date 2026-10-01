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

/* ══ Ce qu'on peut faire d'un bien, selon son étape (V3.48) ══════════════
   Alexandre : « est-ce qu'on peut faire des visites quand le bien est
   vendu ? ». Avant, tout était possible à toute étape : une offre notée sur
   un bien vendu le repassait « Sous offre », une visite se calait sur un
   bien retiré. Un seul endroit décide, pour la fiche, ses fenêtres, l'onglet
   Acheteurs et les cartes d'offre :
     · avant le mandat : ni visite, ni offre, ni prix (c'est l'estimation) ;
     · en vente, sous offre : tout ;
     · sous compromis, en pause : on peut encore, mais on le confirme ;
     · vendu, retiré, archivé : plus de visite, d'offre, de prix ni de
       réponse aux offres — on archive, on remet en vente, on revend. */
export type PermisBien = {
  visite: boolean; offre: boolean; prix: boolean; repondreOffre: boolean; presenter: boolean;
  /* Sous compromis, en pause : la phrase de la confirmation avant une visite,
     une offre ou un envoi à un acheteur. */
  attention: string | null;
  /* « Une offre est arrivée » peut faire passer le bien « Sous offre ». */
  passerSousOffre: boolean;
  archiver: boolean;
  /* Le prix et les honoraires ne se changent plus dans l'éditeur (FenPrix). */
  prixFige: boolean;
};
export function permisBien(b: { etape: EtapeVente; archive?: boolean | null }): PermisBien {
  const e = b.etape;
  const ferme = e === 'vendu' || e === 'retire' || !!b.archive;
  const ouvert = !ferme && !avantMandat(e);
  return {
    visite: ouvert, offre: ouvert, prix: ouvert, repondreOffre: !ferme, presenter: ouvert,
    attention: e === 'compromis' ? 'Le bien est sous compromis. Continuer quand même ?'
      : e === 'suspendu' ? 'La vente est en pause. Continuer quand même ?' : null,
    passerSousOffre: e === 'mandat' || e === 'suspendu',
    archiver: e === 'vendu' || e === 'retire' || !!b.archive,
    prixFige: e === 'offre' || e === 'compromis' || e === 'vendu',
  };
}

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
  id: string; bien_id: string; type: 'visite' | 'offre' | 'etape' | 'note' | 'prix' | 'envoi'; le: string; qui: string | null;
  client_id: string | null; recherche_id: string | null; montant: number | null; statut: string | null;
  avis: string | null; commentaire: string | null; donnees: Record<string, unknown>; created_at: string;
};
export const tableAbsente = (m: string) => /biens_vente|relation .* does not exist|schema cache/i.test(m);

/* ── La négociation d'une offre (V3.45) ───────────────────────────────────
   Alexandre : « s'il y a quatre contre-offres sur la même offre, ça fait
   quatre blocs ? ». Non : une offre = un acquéreur = un bloc, et ses
   allers-retours vivent dans `donnees.echanges`, dans l'ordre. Le statut
   dit qui doit répondre : 'en_attente' (le vendeur), 'contre' (l'acquéreur).
   Les offres d'avant n'ont pas la liste : elle se déduit du montant et de
   la dernière contre-offre (`donnees.contre`). */
export type Echange = { le: string; par: 'acquereur' | 'vendeur'; montant: number };
export function echangesDe(o: SuiviVente): Echange[] {
  const d = (o.donnees || {}) as Record<string, unknown>;
  const l = Array.isArray(d.echanges)
    ? (d.echanges as unknown[]).filter((x): x is Echange => !!x && typeof x === 'object' && typeof (x as Echange).montant === 'number' && ((x as Echange).par === 'acquereur' || (x as Echange).par === 'vendeur'))
    : [];
  if (l.length) return l;
  /* Avant la V3.45, `contre` restait posé après « Remettre en attente » ou
     « Acceptée » : il ne compte que tant que l'offre attend l'acquéreur. */
  const out: Echange[] = [{ le: (o.le || '').slice(0, 10), par: 'acquereur', montant: o.montant || 0 }];
  if (o.statut === 'contre' && typeof d.contre === 'number' && d.contre > 0) out.push({ le: typeof d.reponse_le === 'string' ? d.reponse_le : (o.le || '').slice(0, 10), par: 'vendeur', montant: d.contre });
  return out;
}
/* Le montant sur la table : celui convenu, sinon la dernière proposition. */
export function montantActuel(o: SuiviVente): number {
  const d = (o.donnees || {}) as Record<string, unknown>;
  if (o.statut === 'acceptee' && typeof d.accepte_a === 'number' && d.accepte_a > 0) return d.accepte_a;
  const l = echangesDe(o);
  return l[l.length - 1]?.montant || o.montant || 0;
}
export type Reponse =
  | { k: 'accepte' } | { k: 'refuse' } | { k: 'renonce' } | { k: 'retire' } | { k: 'rouvrir' }
  | { k: 'contre'; montant: number } | { k: 'propose'; montant: number };
/* Ce que devient l'offre après une réponse, sans rien écrire : le statut et
   les réponses à poser. `jour` : la date du jour (AAAA-MM-JJ). */
export function apresReponse(o: SuiviVente, r: Reponse, jour: string): { statut: string; donnees: Record<string, unknown> } {
  const avant = { ...((o.donnees || {}) as Record<string, unknown>) };
  delete avant.accepte_a;
  /* `contre` : la contre-offre qui attend l'acquéreur, rien d'autre. */
  delete avant.contre;
  const l = echangesDe(o);
  const dernier = l[l.length - 1];
  const tour = dernier?.par === 'vendeur' ? 'contre' : 'en_attente';
  switch (r.k) {
    case 'contre': {
      const echanges = [...l, { le: jour, par: 'vendeur' as const, montant: r.montant }];
      return { statut: 'contre', donnees: { ...avant, echanges, contre: r.montant, reponse_le: jour } };
    }
    case 'propose': {
      const echanges = [...l, { le: jour, par: 'acquereur' as const, montant: r.montant }];
      return { statut: 'en_attente', donnees: { ...avant, echanges, reponse_le: jour } };
    }
    case 'accepte':
      return { statut: 'acceptee', donnees: { ...avant, echanges: l, reponse_le: jour, ...(dernier && dernier.montant !== o.montant ? { accepte_a: dernier.montant } : {}) } };
    case 'refuse': case 'renonce': case 'retire':
      return { statut: r.k === 'refuse' ? 'refusee' : 'retiree', donnees: { ...avant, echanges: l, reponse_le: jour } };
    case 'rouvrir':
      return { statut: tour, donnees: { ...avant, echanges: l, ...(tour === 'contre' ? { contre: dernier.montant } : {}) } };
  }
}

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
/* `etat`, `sol`, `atouts` : notés pendant la visite sur place (V3.16). */
export type Piece = { id: string; niveau: string; nom: string; surface: number | null; expo: string; note: string; etat?: string; sol?: string; atouts?: string[] };
export const lirePieces = (x: unknown): Piece[] => (Array.isArray(x) ? x : []).map((p, i) => {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  const s = typeof o.surface === 'number' ? o.surface : typeof o.surface === 'string' ? parseFloat(String(o.surface).replace(',', '.')) : NaN;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `p${i}`, niveau: typeof o.niveau === 'string' ? o.niveau : '',
    nom: typeof o.nom === 'string' ? o.nom : '', surface: Number.isFinite(s) ? s : null,
    expo: typeof o.expo === 'string' ? o.expo : '', note: typeof o.note === 'string' ? o.note : '',
    ...(typeof o.etat === 'string' && o.etat ? { etat: o.etat } : {}),
    ...(typeof o.sol === 'string' && o.sol ? { sol: o.sol } : {}),
    ...(Array.isArray(o.atouts) && o.atouts.length ? { atouts: o.atouts.filter((a): a is string => typeof a === 'string') } : {}),
  };
});

/* ── La visite sur place (V3.16) : ce qu'on note d'une pièce, d'un coup
   d'œil, et ce qu'on retient du bien. ── */
export const ETATS_PIECE: { v: string; l: string; c: string }[] = [
  { v: 'a_renover', l: 'À rénover', c: '#dc2626' }, { v: 'rafraichir', l: 'À rafraîchir', c: '#f59e0b' },
  { v: 'bon', l: 'Bon état', c: '#10b981' }, { v: 'neuf', l: 'Refait à neuf', c: '#0ea5a4' },
];
export const SOLS = ['Parquet', 'Carrelage', 'Stratifié', 'Moquette', 'Béton ciré', 'Tomettes', 'Vinyle'];
export const ATOUTS_PIECE = ['Lumineuse', 'Calme', 'Vue dégagée', 'Placards', 'Moulures', 'Cheminée', 'Parquet d’origine', 'Belle hauteur', 'Double vitrage', 'Sur jardin', 'Sur cour'];
export const ATOUTS_BIEN = ['Lumineux', 'Calme', 'Traversant', 'Vue dégagée', 'Sans vis-à-vis', 'Beaux volumes', 'Cachet de l’ancien', 'Rénové récemment', 'Extérieur', 'Étage élevé', 'Ascenseur', 'Gardien', 'Parking', 'Cave', 'Proche transports', 'Proche écoles', 'Commerces à pied'];
export const DEFAUTS_BIEN = ['Travaux à prévoir', 'Rez-de-chaussée', 'Sans ascenseur', 'Vis-à-vis', 'Bruit de la rue', 'Pièces sombres', 'Petite cuisine', 'Salle d’eau à refaire', 'Électricité à revoir', 'Pas d’extérieur', 'Charges élevées', 'DPE F ou G'];

export type Photo = { url: string; chemin: string; legende: string };
export const lirePhotos = (x: unknown): Photo[] => (Array.isArray(x) ? x : [])
  .map(p => (p && typeof p === 'object' ? p : {}) as Record<string, unknown>)
  .filter(o => typeof o.url === 'string' && o.url)
  .map(o => ({ url: String(o.url), chemin: typeof o.chemin === 'string' ? o.chemin : '', legende: typeof o.legende === 'string' ? o.legende : '' }));

/* ── Le dossier : diagnostics et pièces à réunir ──
   `etat` : recu · demande · nc (non concerné). Un fichier déposé va dans le
   bucket privé « mandats », sous biens-vente/<id>/ (voir /api/biens-vente). */
export type EtatPiece = 'recu' | 'demande' | 'nc' | '';
/* `taille` (V3.30) : en octets, notée au dépôt — l'envoi par mail dit à
   l'avance si les fichiers partiront en pièces jointes ou en liens. */
/* `dans` (V3.31) : l'id d'un fichier de `donnees.fichiers` qui contient
   cette pièce — un dossier de diagnostic technique (DDT) d'un seul PDF couvre
   le DPE, l'amiante, le plomb… Le fichier n'est stocké qu'une fois. */
export type PieceDossier = { etat: EtatPiece; date: string; chemin: string; nom: string; taille?: number; dans?: string };
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
  /* V3.32 : ce que le notaire demandera selon le bien. */
  { k: 'bail', l: 'Bail en cours et dernier avis d’échéance', aide: 'Le bien est loué', si: d => d.occupation === 'loue', groupe: 'vendeur' },
  { k: 'permis', l: 'Permis de construire et certificat de conformité', aide: 'La maison, une extension, une véranda', si: d => estMaison(d), groupe: 'vendeur' },
  { k: 'piscine', l: 'Dispositif de sécurité de la piscine', aide: 'Sa notice ou son attestation', si: d => Array.isArray(d.annexes) && d.annexes.includes('piscine'), groupe: 'vendeur' },
];
export const lireDossier = (x: unknown): Record<string, PieceDossier> => {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out: Record<string, PieceDossier> = {};
  for (const [k, v] of Object.entries(o)) {
    const p = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const e = p.etat === 'recu' || p.etat === 'demande' || p.etat === 'nc' ? p.etat : '';
    out[k] = {
      etat: e, date: typeof p.date === 'string' ? p.date : '', chemin: typeof p.chemin === 'string' ? p.chemin : '', nom: typeof p.nom === 'string' ? p.nom : '',
      ...(typeof p.taille === 'number' && p.taille > 0 ? { taille: p.taille } : {}),
      ...(typeof p.dans === 'string' && p.dans ? { dans: p.dans } : {}),
    };
  }
  return out;
};
/* Les autres documents du bien (V3.30) : ceux qui ne sont pas une ligne du
   dossier — un DDT complet, un bail, un plan, un courrier du syndic. Même
   stockage privé, rangés dans `donnees.fichiers`. */
/* `sorte` (V3.31) : 'ddt' pour un dossier de diagnostics en un seul fichier ;
   les lignes qu'il couvre portent son id dans `dans`. */
export type FichierBien = { id: string; titre: string; chemin: string; nom: string; taille?: number; le: string; sorte?: 'ddt' };
export const lireFichiers = (x: unknown): FichierBien[] => (Array.isArray(x) ? x : [])
  .map(f => (f && typeof f === 'object' ? f : {}) as Record<string, unknown>)
  .filter(o => typeof o.chemin === 'string' && o.chemin)
  .map((o, i) => ({
    id: typeof o.id === 'string' && o.id ? o.id : `f${i}`, titre: typeof o.titre === 'string' ? o.titre : '',
    chemin: String(o.chemin), nom: typeof o.nom === 'string' ? o.nom : '', le: typeof o.le === 'string' ? o.le : '',
    ...(typeof o.taille === 'number' && o.taille > 0 ? { taille: o.taille } : {}),
    ...(o.sorte === 'ddt' ? { sorte: 'ddt' as const } : {}),
  }));
/* Les pièces ajoutées à la main (V3.31) : un Kbis, les statuts d'une SCI, un
   bail… avec leur nom et leur groupe. Rangées dans `donnees.piecesPerso`,
   elles se comportent comme les autres : reçu, demandé, non concerné, un
   fichier. */
export type LignePerso = { k: string; l: string; groupe: LigneDossier['groupe'] };
export const lirePiecesPerso = (x: unknown): LignePerso[] => (Array.isArray(x) ? x : [])
  .map(o => (o && typeof o === 'object' ? o : {}) as Record<string, unknown>)
  .filter(o => typeof o.k === 'string' && o.k && typeof o.l === 'string' && o.l.trim())
  .map(o => ({ k: String(o.k), l: String(o.l).trim(), groupe: o.groupe === 'copro' || o.groupe === 'vendeur' ? o.groupe : 'diag' as LigneDossier['groupe'] }));
export const estPerso = (k: string) => k.startsWith('perso');
export const lignesDossier = (d: Donnees): LigneDossier[] => [
  ...DOSSIER.filter(l => !l.si || l.si(d)),
  ...lirePiecesPerso(d.piecesPerso).map(p => ({ k: p.k, l: p.l, groupe: p.groupe })),
];

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
  | (BaseB & { t: 'adresse' })
  /* Une liste d'observations (V3.16) : des travaux, un sinistre, ce que dit
     un PV d'AG. Chaque ligne : sa nature, sa date, un commentaire ; `idees` :
     les natures proposées d'un clic ; `enCours` : « réglé » ou « en cours ». */
  | (BaseB & { t: 'journal'; un: string; idees: string[]; enCours?: boolean });
export type Observation = { id: string; nature: string; quand: string; note: string; enCours?: boolean };
export const lireObservations = (x: unknown): Observation[] => (Array.isArray(x) ? x : [])
  .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
  .map((o, i) => ({
    id: typeof o.id === 'string' && o.id ? o.id : `o${i}`, nature: typeof o.nature === 'string' ? o.nature : '',
    quand: typeof o.quand === 'string' ? o.quand : '', note: typeof o.note === 'string' ? o.note : '',
    ...(typeof o.enCours === 'boolean' ? { enCours: o.enCours } : {}),
  }));
/* Une étape du formulaire. `pour` : les étapes de vente où elle se montre.
   Tout ce qui décrit le bien se remplit dès « à suivre » (V3.15), et les
   indications de visite (clés, codes) aussi depuis la V3.16 : seule
   l'estimation (fourchette, prix) attend l'étape « estimation ». `avant` :
   son titre tant que le mandat
   n'est pas signé. */
export type EtapeBien = {
  id: string; titre: string; court: string; sous: string; ic: string; champs: ChampBien[];
  pour?: (e: EtapeVente) => boolean;
  avant?: { titre: string; court: string; sous: string };
};
export const estChampActe = (c: ChampBien): c is Champ => !['lettres', 'pieces', 'photos', 'dossier', 'proprio', 'annonce', 'eurosAn', 'compteur', 'adresse', 'journal'].includes(c.t);
/* Dans l'éditeur, les données portent l'étape de vente sous `_stade` (jamais
   enregistrée) : un champ réservé au mandat s'efface avant. Sans `_stade`
   (la fiche, l'annonce), tout se montre. */
const sousMandat = (d: Donnees) => !avantMandat(String(d._stade || ''));
const pasASuivre = (e: EtapeVente) => e !== 'a_suivre';
/* Des réponses qui reviennent : chacune avec son dessin (V3.16). */
const OUI_NON: Option[] = [{ v: 'oui', l: 'Oui', ic: 'check' }, { v: 'non', l: 'Non', ic: 'croix' }];
export const DELAIS: Option[] = [
  { v: 'vite', l: 'Dès que possible', ic: 'eclair' }, { v: '3mois', l: 'Sous 3 mois', ic: 'chrono' },
  { v: '6mois', l: 'Sous 6 mois', ic: 'calendrier' }, { v: 'libre', l: 'Il n’est pas pressé', ic: 'horloge' },
];

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
      /* V3.29 : « pour plus grand », « pour plus petit » à part, à la demande
         d'Alexandre ; « Il achète ailleurs » (valeur `achat`) reste pour le reste. */
      { t: 'choix', cle: 'motif', lib: 'Pourquoi il vend', ic: 'drapeau', tuiles: true, options: [
        { v: 'plusGrand', l: 'Pour plus grand', aide: 'La famille s’agrandit', ic: 'agrandir' },
        { v: 'plusPetit', l: 'Pour plus petit', aide: 'Les enfants partis, la retraite', ic: 'reduire' },
        { v: 'achat', l: 'Il achète ailleurs', aide: 'Même taille, un autre quartier', ic: 'cle' },
        { v: 'mutation', l: 'Mutation', aide: 'Un travail dans une autre ville', ic: 'valise' },
        { v: 'succession', l: 'Succession', aide: 'Un bien reçu en héritage', ic: 'bail' },
        { v: 'separation', l: 'Séparation', aide: 'Divorce, fin de PACS', ic: 'separation' },
        { v: 'investissement', l: 'Investissement', aide: 'Il vend un bien qu’il louait', ic: 'courbe' },
        { v: 'autre', l: 'Autre', ic: 'points' },
      ] },
      { t: 'choix', cle: 'delai', lib: 'Son délai', ic: 'chrono', options: DELAIS },
      { t: 'choix', cle: 'origine', lib: 'Comment il est venu', ic: 'boussole', options: [
        { v: 'recommandation', l: 'Recommandation', ic: 'bulle' }, { v: 'client', l: 'Ancien client', ic: 'etoile' }, { v: 'estimation', l: 'Estimation en ligne', ic: 'ecran' },
        { v: 'boitage', l: 'Boîtage, affiche', ic: 'mail' }, { v: 'portail', l: 'Portail, réseaux', ic: 'globe' }, { v: 'autre', l: 'Autre', ic: 'points' },
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
      { t: 'choix', cle: 'constructible', lib: 'Constructible', ic: 'maison', si: estTerrain, options: [{ v: 'oui', l: 'Oui', ic: 'check' }, { v: 'partiel', l: 'En partie', ic: 'plan' }, { v: 'non', l: 'Non', ic: 'croix' }] },
      { t: 'choix', cle: 'viabilise', lib: 'Viabilisé', ic: 'eclair', si: estTerrain, aide: 'Eau, électricité, assainissement en bordure', options: OUI_NON },
      { t: 'titre', cle: 't-imm', lib: 'L’immeuble', ic: 'immeuble', si: enImmeuble },
      { t: 'titre', cle: 't-constr', lib: 'La construction', ic: 'maison', si: estMaison },
      { t: 'compteur', cle: 'etage', lib: 'Étage', ic: 'ascenseur', min: 0, si: enImmeuble, mots: n => (n === 0 ? 'RDC' : '') },
      { t: 'compteur', cle: 'etages', lib: 'Étages en tout', ic: 'immeuble', min: 0, si: enImmeuble },
      { t: 'nombre', cle: 'annee', lib: 'Année de construction', ic: 'calendrier', si: d => !estTerrain(d), exemple: '1968' },
      { t: 'cases', cle: 'immeuble', lib: 'Dans l’immeuble', ic: 'immeuble', si: enImmeuble, options: [
        { v: 'ascenseur', l: 'Ascenseur', ic: 'ascenseur' }, { v: 'gardien', l: 'Gardien', ic: 'personne' }, { v: 'digicode', l: 'Digicode', ic: 'clavier' },
        { v: 'interphone', l: 'Interphone', ic: 'interphone' }, { v: 'velos', l: 'Local vélos', ic: 'velo' }, { v: 'fibre', l: 'Fibre', ic: 'wifi' },
      ] },
    ],
  },
  {
    id: 'interieur', titre: 'L’intérieur', court: 'Intérieur', sous: 'État, cuisine, chauffage, équipements.', ic: 'canape',
    champs: [
      { t: 'titre', cle: 't-etat', lib: 'L’état général', ic: 'pinceau' },
      { t: 'choix', cle: 'etat', lib: 'Dans quel état ?', ic: 'pinceau', tuiles: true, options: [
        { v: 'a_renover', l: 'À rénover', aide: 'Gros travaux', ic: 'outil' }, { v: 'travaux_legers', l: 'À rafraîchir', aide: 'Peintures, sols', ic: 'pinceau' },
        { v: 'bon_etat', l: 'Bon état', aide: 'Rien d’urgent', ic: 'check' }, { v: 'refait_neuf', l: 'Refait à neuf', aide: 'Travaux récents', ic: 'etincelle' },
      ] },
      { t: 'titre', cle: 't-cuis', lib: 'La cuisine', ic: 'cuisine', si: aDesPieces },
      { t: 'choix', cle: 'cuisine', lib: 'Cuisine', ic: 'cuisine', si: aDesPieces, options: [
        { v: 'independante', l: 'Indépendante', ic: 'porte' }, { v: 'ouverte', l: 'Ouverte', ic: 'canape' }, { v: 'kitchenette', l: 'Kitchenette', ic: 'cuisine' }, { v: 'aucune', l: 'Sans cuisine', ic: 'croix' },
      ] },
      { t: 'choix', cle: 'cuisineEquip', lib: 'Équipement', ic: 'four', si: aDesPieces, options: [
        { v: 'equipee', l: 'Équipée', ic: 'four' }, { v: 'amenagee', l: 'Aménagée', ic: 'placard' }, { v: 'non', l: 'Non équipée', ic: 'croix' },
      ] },
      { t: 'titre', cle: 't-chauf', lib: 'Chauffage et eau chaude', ic: 'flamme', si: aDesPieces },
      { t: 'choix', cle: 'chauffageMode', lib: 'Chauffage', ic: 'radiateur', si: aDesPieces, options: [{ v: 'individuel', l: 'Individuel', ic: 'personne' }, { v: 'collectif', l: 'Collectif', ic: 'immeuble' }] },
      { t: 'choix', cle: 'chauffageEnergie', lib: 'Énergie', ic: 'eclair', si: aDesPieces, options: [
        { v: 'gaz', l: 'Gaz', ic: 'flamme' }, { v: 'electrique', l: 'Électrique', ic: 'eclair' }, { v: 'pac', l: 'Pompe à chaleur', ic: 'pac' },
        { v: 'fioul', l: 'Fioul', ic: 'fioul' }, { v: 'bois', l: 'Bois', ic: 'bois' }, { v: 'urbain', l: 'Réseau urbain', ic: 'usine' },
      ] },
      { t: 'choix', cle: 'chauffageEmetteurs', lib: 'Par', ic: 'radiateur', si: aDesPieces, options: [
        { v: 'radiateurs', l: 'Radiateurs', ic: 'radiateur' }, { v: 'sol', l: 'Plancher chauffant', ic: 'sol' }, { v: 'convecteurs', l: 'Convecteurs', ic: 'convecteur' }, { v: 'poele', l: 'Poêle', ic: 'poele' },
      ] },
      { t: 'choix', cle: 'eauChaude', lib: 'Eau chaude', ic: 'eau', si: aDesPieces, options: [{ v: 'individuelle', l: 'Individuelle', ic: 'ballon' }, { v: 'collective', l: 'Collective', ic: 'immeuble' }] },
      { t: 'titre', cle: 't-equip', lib: 'Ce qu’il a', ic: 'etoile', si: aDesPieces },
      { t: 'cases', cle: 'equipements', lib: 'Équipements et qualités', ic: 'etoile', si: aDesPieces, options: [
        { v: 'traversant', l: 'Traversant', ic: 'traversant' }, { v: 'lumineux', l: 'Lumineux', ic: 'soleil' }, { v: 'calme', l: 'Calme', ic: 'lune' }, { v: 'dernierEtage', l: 'Dernier étage', ic: 'toit' },
        { v: 'parquet', l: 'Parquet', ic: 'parquet' }, { v: 'moulures', l: 'Moulures, cachet', ic: 'colonne' }, { v: 'cheminee', l: 'Cheminée', ic: 'cheminee' }, { v: 'placards', l: 'Placards, rangements', ic: 'placard' },
        { v: 'doubleVitrage', l: 'Double vitrage', ic: 'fenetre' }, { v: 'voletsElec', l: 'Volets électriques', ic: 'volet' }, { v: 'clim', l: 'Climatisation', ic: 'flocon' }, { v: 'alarme', l: 'Alarme', ic: 'alarme' },
        { v: 'pmr', l: 'Accessible PMR', ic: 'pmr' }, { v: 'meuble', l: 'Vendu meublé', ic: 'canape' },
      ] },
      { t: 'zone', cle: 'interieurNote', lib: 'Ce qu’il faut savoir de l’intérieur', ic: 'bulle', exemple: 'Belle hauteur sous plafond, parquet d’origine, séjour en angle' },
    ],
  },
  {
    id: 'exterieur', titre: 'Extérieur et annexes', court: 'Extérieur', sous: 'Balcon, jardin, cave, parking, vue.', ic: 'terrain',
    champs: [
      { t: 'cases', cle: 'annexes', lib: 'Ce qu’il y a', ic: 'parasol', options: [
        { v: 'balcon', l: 'Balcon', ic: 'balcon' }, { v: 'terrasse', l: 'Terrasse', ic: 'parasol' }, { v: 'loggia', l: 'Loggia', ic: 'loggia' }, { v: 'jardin', l: 'Jardin', ic: 'terrain' },
        { v: 'cave', l: 'Cave', ic: 'cave' }, { v: 'parking', l: 'Parking', ic: 'parking' }, { v: 'box', l: 'Box', ic: 'box' }, { v: 'garage', l: 'Garage', ic: 'voiture' }, { v: 'piscine', l: 'Piscine', ic: 'piscine' },
      ] },
      { t: 'nombre', cle: 'surfBalcon', lib: 'Balcon', ic: 'balcon', unite: 'm²', si: d => liste(d, 'annexes').includes('balcon') },
      { t: 'nombre', cle: 'surfTerrasse', lib: 'Terrasse', ic: 'parasol', unite: 'm²', si: d => liste(d, 'annexes').includes('terrasse') },
      { t: 'nombre', cle: 'surfLoggia', lib: 'Loggia', ic: 'loggia', unite: 'm²', si: d => liste(d, 'annexes').includes('loggia') },
      { t: 'nombre', cle: 'surfJardin', lib: 'Jardin', ic: 'terrain', unite: 'm²', si: d => liste(d, 'annexes').includes('jardin') },
      { t: 'nombre', cle: 'surfCave', lib: 'Cave', ic: 'cave', unite: 'm²', si: d => liste(d, 'annexes').includes('cave') },
      { t: 'compteur', cle: 'nbParking', lib: 'Places de parking', ic: 'parking', si: d => liste(d, 'annexes').some(x => ['parking', 'box', 'garage'].includes(x)) },
      { t: 'titre', cle: 't-vue', lib: 'Exposition et vue', ic: 'soleil' },
      { t: 'choix', cle: 'expo', lib: 'Exposition principale', ic: 'boussole', options: [...EXPOSITIONS.map(e => ({ ...e, ic: `dir${e.v}` })), { v: 'traversant', l: 'Traversant', ic: 'traversant' }] },
      { t: 'choix', cle: 'vue', lib: 'Vue', ic: 'oeil', options: [
        { v: 'degagee', l: 'Dégagée', ic: 'horizon' }, { v: 'jardin', l: 'Sur jardin', ic: 'terrain' }, { v: 'cour', l: 'Sur cour', ic: 'cour' }, { v: 'rue', l: 'Sur rue', ic: 'couloir' }, { v: 'monument', l: 'Monument, Seine', ic: 'colonne' },
      ] },
      { t: 'choix', cle: 'visAVis', lib: 'Vis-à-vis', ic: 'fenetre', options: [{ v: 'aucun', l: 'Aucun', ic: 'oeilBarre' }, { v: 'leger', l: 'Léger', ic: 'oeil' }, { v: 'direct', l: 'Direct', ic: 'immeuble' }] },
      { t: 'zone', cle: 'exterieurNote', lib: 'Ce qu’il faut savoir de l’extérieur', ic: 'bulle', exemple: 'Balcon filant plein sud, sans vis-à-vis ; box en sous-sol accessible par la rampe' },
    ],
  },
  {
    id: 'pieces', titre: 'Les pièces', court: 'Pièces', sous: 'Une par une, dans l’ordre de la visite : la pièce, sa surface, son exposition.', ic: 'plan',
    champs: [{ t: 'pieces', cle: 'detailPieces', lib: 'Les pièces' }],
  },
  {
    id: 'energie', titre: 'L’énergie', court: 'Énergie', sous: 'DPE et GES, leurs valeurs, les dépenses estimées.', ic: 'eclair',
    champs: [
      { t: 'choix', cle: 'dpeStatut', lib: 'Le DPE', ic: 'doc', options: [
        { v: 'fait', l: 'Réalisé', ic: 'check' }, { v: 'encours', l: 'Commandé', ic: 'horloge' }, { v: 'vierge', l: 'Vierge', ic: 'fiscal' }, { v: 'non', l: 'Non soumis', ic: 'croix' },
      ] },
      { t: 'lettres', cle: 'dpe', lib: 'Classe énergie (DPE)', ic: 'eclair', genre: 'dpe', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'nombre', cle: 'dpeValeur', lib: 'Consommation', ic: 'eclair', unite: 'kWh/m²/an', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'lettres', cle: 'ges', lib: 'Classe climat (GES)', ic: 'nuage', genre: 'ges', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'nombre', cle: 'gesValeur', lib: 'Émissions', ic: 'nuage', unite: 'kg CO₂/m²/an', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'date', cle: 'dpeDate', lib: 'Date du DPE', ic: 'calendrier', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'titre', cle: 't-cout', lib: 'Les dépenses d’énergie écrites sur le DPE', ic: 'euro', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non',
        aide: 'Ce n’est pas la copropriété : c’est l’estimation du DPE pour chauffer et éclairer le logement. Le DPE la donne en fourchette, l’annonce la reprend telle quelle.' },
      { t: 'euros', cle: 'coutMin', lib: 'Montant bas', ic: 'bas', unite: '€/an', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'euros', cle: 'coutMax', lib: 'Montant haut', ic: 'haut', unite: '€/an', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non' },
      { t: 'nombre', cle: 'coutAnnee', lib: 'Prix de l’énergie de l’année', ic: 'calendrier', exemple: '2023', si: d => d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non', aide: 'Écrite sur le DPE, à côté des montants' },
    ],
  },
  {
    id: 'copro', titre: 'Copropriété, charges et taxes', court: 'Copro et charges', sous: 'La copropriété, puis ce que le bien coûte chaque année.', ic: 'lots',
    champs: [
      { t: 'titre', cle: 't-copro', lib: 'La copropriété', ic: 'lots' },
      { t: 'choix', cle: 'copro', lib: 'En copropriété ?', ic: 'lots', options: OUI_NON },
      { t: 'nombre', cle: 'lots', lib: 'Nombre de lots', ic: 'lots', si: d => d.copro === 'oui', aide: 'Obligatoire dans l’annonce' },
      { t: 'choix', cle: 'procedure', lib: 'Procédure en cours contre le syndicat ?', ic: 'balance', si: d => d.copro === 'oui', options: [{ v: 'non', l: 'Non', ic: 'croix' }, { v: 'oui', l: 'Oui', ic: 'check' }] },
      { t: 'texte', cle: 'procedureNature', lib: 'Laquelle', ic: 'balance', large: true, si: d => d.copro === 'oui' && d.procedure === 'oui' },
      { t: 'texte', cle: 'syndic', lib: 'Syndic', ic: 'agence', si: d => d.copro === 'oui', exemple: 'Foncia Boulogne' },
      { t: 'euros', cle: 'fondsTravaux', lib: 'Fonds de travaux du lot', ic: 'banque', si: d => d.copro === 'oui' },
      { t: 'titre', cle: 't-fin', lib: 'Charges et taxes', ic: 'euro' },
      { t: 'eurosAn', cle: 'chargesAn', lib: 'Charges de copropriété', ic: 'lots', si: d => d.copro === 'oui', aide: 'Le montant annuel, celui que l’annonce doit donner (loi ALUR). Tape l’un ou l’autre : le second se calcule.' },
      { t: 'cases', cle: 'chargesInclus', lib: 'Elles comprennent', ic: 'liste', si: d => d.copro === 'oui', options: [
        { v: 'chauffage', l: 'Chauffage', ic: 'radiateur' }, { v: 'eauChaude', l: 'Eau chaude', ic: 'ballon' }, { v: 'eauFroide', l: 'Eau froide', ic: 'eau' }, { v: 'gardien', l: 'Gardien', ic: 'personne' }, { v: 'ascenseur', l: 'Ascenseur', ic: 'ascenseur' },
      ] },
      { t: 'euros', cle: 'taxeFonciere', lib: 'Taxe foncière', ic: 'fiscal', unite: '€/an' },
    ],
  },
  {
    /* V3.16 : ce qu'on garde pour soi, dès l'ajout du bien. Les travaux et
       les sinistres du logement, ce que disent les PV d'AG, les notes. Jamais
       dans une annonce ni dans un espace client. */
    id: 'observations', titre: 'Les observations', court: 'Observations', sous: 'Pour toi seul : les travaux, les sinistres, ce que disent les PV d’AG, tes notes.', ic: 'loupe',
    champs: [
      { t: 'titre', cle: 't-obs-log', lib: 'Le logement : travaux et sinistres', ic: 'outil', aide: 'Jamais dans l’annonce ni dans un espace client.' },
      { t: 'journal', cle: 'travauxFaits', lib: 'Travaux réalisés', ic: 'outil', un: 'des travaux',
        idees: ['Cuisine', 'Salle de bains', 'Électricité', 'Plomberie', 'Fenêtres', 'Chaudière', 'Peintures', 'Sols', 'Toiture', 'Isolation'] },
      { t: 'choix', cle: 'sinistre', lib: 'Un sinistre, un dégât des eaux ?', ic: 'eau', options: [
        { v: 'non', l: 'Aucun, à sa connaissance', ic: 'check' }, { v: 'oui', l: 'Oui', ic: 'eau' },
      ] },
      { t: 'journal', cle: 'sinistres', lib: 'Les sinistres', ic: 'eau', un: 'un sinistre', enCours: true, si: d => d.sinistre === 'oui',
        idees: ['Dégât des eaux', 'Infiltration', 'Humidité', 'Fissures', 'Incendie', 'Canalisation'] },
      { t: 'zone', cle: 'travaux', lib: 'Autres remarques sur les travaux', ic: 'crayon', exemple: 'Tableau électrique à changer ; devis de 3 200 € pour les fenêtres de la chambre' },
      { t: 'titre', cle: 't-obs-copro', lib: 'La copropriété : ce que disent les PV d’AG', ic: 'lots', si: d => d.copro === 'oui' },
      { t: 'journal', cle: 'coproVotes', lib: 'Gros travaux votés', ic: 'accord', un: 'des travaux votés', si: d => d.copro === 'oui',
        idees: ['Ravalement', 'Toiture', 'Ascenseur', 'Chaufferie', 'Colonnes d’eau', 'Canalisations', 'Cage d’escalier', 'Mise aux normes'] },
      { t: 'journal', cle: 'coproFaits', lib: 'Gros travaux réalisés', ic: 'check', un: 'des travaux réalisés', si: d => d.copro === 'oui',
        idees: ['Ravalement', 'Toiture', 'Ascenseur', 'Chaufferie', 'Colonnes d’eau', 'Canalisations', 'Cage d’escalier', 'Mise aux normes'] },
      { t: 'journal', cle: 'coproAVenir', lib: 'Gros travaux à venir', ic: 'horloge', un: 'des travaux à venir', si: d => d.copro === 'oui', aide: 'Évoqués dans les derniers PV d’AG, pas encore votés.',
        idees: ['Ravalement', 'Toiture', 'Ascenseur', 'Chaufferie', 'Colonnes d’eau', 'Canalisations', 'Cage d’escalier', 'Mise aux normes'] },
      { t: 'zone', cle: 'travauxVotes', lib: 'Autres remarques sur la copropriété', ic: 'crayon', si: d => d.copro === 'oui', exemple: 'Ravalement voté en AG 2025 : 4 800 € de quote-part, à la charge du vendeur' },
      { t: 'titre', cle: 't-obs-notes', lib: 'Tes notes', ic: 'cadenas' },
      { t: 'zone', cle: 'notes', lib: 'Notes internes', ic: 'cadenas', aide: 'Visibles par toi seul, jamais dans un espace client ni une annonce.', exemple: 'Ne pas descendre sous 870 000 € sans l’appeler' },
    ],
  },
  {
    id: 'prix', titre: 'Prix et mandat', court: 'Prix et mandat', sous: 'Le prix affiché, les honoraires, le mandat.', ic: 'euro', pour: pasASuivre,
    avant: { titre: 'L’estimation et le prix', court: 'Estimation', sous: 'Le rendez-vous, la fourchette, le prix conseillé et les honoraires.' },
    champs: [
      { t: 'titre', cle: 't-estim', lib: 'L’estimation de l’agence', ic: 'regle' },
      { t: 'date', cle: 'rdvEstimation', lib: 'Rendez-vous d’estimation', ic: 'calendrier' },
      { t: 'date', cle: 'avisEnvoye', lib: 'Avis de valeur envoyé le', ic: 'envoyer' },
      { t: 'euros', cle: 'estimBasse', lib: 'Fourchette basse', ic: 'bas' },
      { t: 'euros', cle: 'estimHaute', lib: 'Fourchette haute', ic: 'haut' },
      { t: 'euros', cle: 'prixSouhaite', lib: 'Prix espéré par le propriétaire', ic: 'personne', si: d => !sousMandat(d) },
      { t: 'titre', cle: 't-prix', lib: 'Le prix', ic: 'etiquette' },
      { t: 'euros', cle: 'prix', lib: 'Prix affiché', ic: 'etiquette', aide: 'Honoraires compris quand ils sont à la charge de l’acquéreur. À l’estimation : le prix conseillé.' },
      { t: 'choix', cle: 'charge', lib: 'Honoraires à la charge de', ic: 'personne', options: [{ v: 'acquereur', l: 'L’acquéreur', ic: 'cle' }, { v: 'vendeur', l: 'Le vendeur', ic: 'maison' }] },
      { t: 'choix', cle: 'honoMode', lib: 'Honoraires', ic: 'euro', options: [{ v: 'taux', l: 'En pourcentage', ic: 'pourcent' }, { v: 'forfait', l: 'Forfait', ic: 'euro' }] },
      { t: 'nombre', cle: 'taux', lib: 'Taux', ic: 'pourcent', unite: '% TTC', si: d => d.honoMode !== 'forfait', aide: 'Du prix net vendeur' },
      { t: 'euros', cle: 'forfait', lib: 'Forfait', ic: 'euro', unite: '€ TTC', si: d => d.honoMode === 'forfait' },
      { t: 'titre', cle: 't-mandat', lib: 'Le mandat', ic: 'plume', si: sousMandat },
      { t: 'choix', cle: 'mandatType', lib: 'Type de mandat', ic: 'plume', si: sousMandat, options: [{ v: 'simple', l: 'Simple', ic: 'doc' }, { v: 'semi', l: 'Semi-exclusif', ic: 'accord' }, { v: 'exclusif', l: 'Exclusif', ic: 'etoile' }] },
      { t: 'texte', cle: 'mandatNumero', lib: 'N° du registre', ic: 'liste', exemple: '4331', si: sousMandat },
      { t: 'date', cle: 'mandatDate', lib: 'Signé le', ic: 'calendrier', si: sousMandat },
      { t: 'date', cle: 'mandatFin', lib: 'Exclusivité ou mandat jusqu’au', ic: 'calendrier', si: sousMandat },
    ],
  },
  {
    /* V3.16 : ouvert dès l'ajout du bien (occupé ou libre, clés, codes),
       plus seulement au mandat. */
    id: 'pratique', titre: 'Les indications de visite', court: 'Indications', sous: 'Occupé ou libre, les clés, les codes, qui appeler sur place.', ic: 'cle',
    champs: [
      { t: 'titre', cle: 't-occup', lib: 'L’occupation', ic: 'porte' },
      { t: 'choix', cle: 'occupation', lib: 'Le bien est', ic: 'porte', options: [
        { v: 'libre', l: 'Libre', ic: 'ouvert' }, { v: 'occupe', l: 'Occupé par le propriétaire', ic: 'personne' }, { v: 'loue', l: 'Loué', ic: 'bail' },
      ] },
      { t: 'euros', cle: 'loyer', lib: 'Loyer', ic: 'euro', unite: '€/mois', si: d => d.occupation === 'loue', aide: 'Hors charges' },
      { t: 'date', cle: 'finBail', lib: 'Fin du bail', ic: 'calendrier', si: d => d.occupation === 'loue' },
      { t: 'texte', cle: 'disponible', lib: 'Disponible', ic: 'calendrier', exemple: 'à la signature, ou à partir du 1er mars' },
      { t: 'titre', cle: 't-cles', lib: 'Les clés', ic: 'cle' },
      { t: 'choix', cle: 'cles', lib: 'Où sont-elles ?', ic: 'cle', options: [
        { v: 'agence', l: 'À l’agence', ic: 'agence' }, { v: 'vendeur', l: 'Chez le vendeur', ic: 'personne' }, { v: 'gardien', l: 'Chez le gardien', ic: 'immeuble' }, { v: 'autre', l: 'Ailleurs', ic: 'lieu' },
      ] },
      { t: 'texte', cle: 'trousseau', lib: 'Trousseau', ic: 'cle', exemple: 'N° 12', si: d => d.cles === 'agence' },
      /* V3.16 : les consignes d'accès, de la rue jusqu'à la porte. */
      { t: 'titre', cle: 't-acces', lib: 'Pour arriver jusqu’à la porte', ic: 'carte' },
      { t: 'cases', cle: 'accesBas', lib: 'En bas', ic: 'immeuble', options: [
        { v: 'gardien', l: 'Un gardien', ic: 'personne' }, { v: 'vigile', l: 'Un vigile, un accueil', ic: 'bouclier' }, { v: 'interphone', l: 'Un interphone', ic: 'interphone' },
        { v: 'digicode', l: 'Un digicode', ic: 'clavier' }, { v: 'badge', l: 'Un badge', ic: 'cle' }, { v: 'libre', l: 'Porte ouverte', ic: 'ouvert' },
      ] },
      { t: 'texte', cle: 'interphone', lib: 'Nom sur l’interphone', ic: 'interphone' },
      { t: 'texte', cle: 'digicode', lib: 'Digicode', ic: 'clavier', exemple: '4721B' },
      { t: 'texte', cle: 'porte', lib: 'Bâtiment, étage, porte', ic: 'porte', exemple: 'Bât. B, 3e gauche' },
      { t: 'choix', cle: 'accesAscenseur', lib: 'En sortant de l’ascenseur', ic: 'ascenseur', si: d => enImmeuble(d) || !d.typeBien, options: [
        { v: 'gauche', l: 'À gauche', ic: 'gauche' }, { v: 'droite', l: 'À droite', ic: 'droite' }, { v: 'face', l: 'En face', ic: 'haut' }, { v: 'aucun', l: 'Pas d’ascenseur', ic: 'escalier' },
      ] },
      { t: 'zone', cle: 'itineraire', lib: 'Le chemin jusqu’à la porte', ic: 'carte', exemple: 'Bât. B au fond de la cour, 3e étage : à gauche en sortant de l’ascenseur, puis la 2e porte à droite' },
      { t: 'texte', cle: 'annexesNum', lib: 'Cave, box', ic: 'cave', exemple: 'Cave 14 · box 7' },
      { t: 'titre', cle: 't-contact', lib: 'Sur place', ic: 'telephone' },
      { t: 'texte', cle: 'contactNom', lib: 'Contact sur place', ic: 'personne' },
      { t: 'texte', cle: 'contactTel', lib: 'Son téléphone', ic: 'tel' },
      { t: 'texte', cle: 'creneaux', lib: 'Heures de visite', ic: 'horloge', large: true, exemple: 'soirs après 18 h, samedi matin' },
      { t: 'zone', cle: 'consignes', lib: 'Consignes de visite', ic: 'info', exemple: 'Prévenir la veille ; un chat, bien refermer les portes ; le box se prend par la rampe rue de Silly' },
    ],
  },
  {
    /* Les notes sont parties dans « Les observations » (V3.16) : l'annonce
       n'a plus rien à dire avant le mandat. */
    id: 'annonce', titre: 'L’annonce', court: 'Annonce', sous: 'Le texte de l’annonce, prêt à copier.', ic: 'megaphone', pour: e => !avantMandat(e),
    champs: [
      { t: 'annonce', cle: 'annonceTexte', lib: 'L’annonce' },
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
  /* Le pourcentage affiché : sur le prix hors honoraires quand l'acquéreur
     paie (la mention légale de l'annonce), sur le prix quand c'est le vendeur
     (V3.43 : un mandat à 5 % vendeur s'affichait « 5,26 % »). */
  const tauxNet = hono !== null && prix && !acq ? (hono / prix) * 100 : hono !== null && net ? (hono / net) * 100 : taux;
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
/* V3.45 : avec l'année (« 12 février 2026 ») — Alexandre : « il n'y a pas
   l'année, il faut la mettre ». Les fiches reprises d'Immofacile ont des
   dates d'autres années. */
export const dateCourte = (ymd: string | null | undefined) => {
  if (!ymd) return '';
  const x = new Date(ymd.length <= 10 ? `${ymd}T12:00:00` : ymd);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/^1 /, '1er ');
};
export const dateLongue = (ymd: string | null | undefined) => (ymd ? jourLong(ymd.slice(0, 10)) : '');

/* Où en est le mandat de vente du bien dans Documents (V3.42) : le plus
   avancé de ceux qui ne sont pas annulés. Lu avec la liste des biens. */
export type EtatMandatDoc = { id: string; statut: 'brouillon' | 'pret' | 'signe'; enSignature: boolean; numero: string | null };
/* Le même, en deux mots (une puce de la liste, le bandeau de la fiche). */
export function motMandat(m: EtatMandatDoc): string {
  return m.statut === 'brouillon' ? 'Mandat en préparation' : m.statut === 'signe' ? 'Mandat signé' : m.enSignature ? 'Mandat en signature' : 'Mandat prêt à signer';
}

/* La ligne d'état d'une carte : ce qui compte à cette étape, et son dessin.
   V3.42 : « En vente » sans mandat signé noté, elle dit où en est le mandat
   dans Documents (en préparation, en signature) au lieu de « Mandat en
   cours ». */
export type LigneEtat = { t: string; ton: 'neutre' | 'alerte' | 'ok'; ic: string };
export function ligneEtat(b: BienVente, suivi: SuiviVente[], mandat: EtatMandatDoc | null = null): LigneEtat {
  const e = ligneEtatBrute(b, suivi, mandat);
  return { ...e, ic: e.ic || 'drapeau' };
}
function ligneEtatBrute(b: BienVente, suivi: SuiviVente[], mandat: EtatMandatDoc | null): { t: string; ton: LigneEtat['ton']; ic?: string } {
  const d = b.donnees || {};
  const derniere = (type: string) => suivi.filter(x => x.type === type).sort((x, y) => y.le.localeCompare(x.le))[0];
  const etapeInfo = derniere('etape');
  const ed = (etapeInfo?.donnees || {}) as Record<string, string>;
  if (b.etape === 'vendu') return { t: `Vendu${b.vendu_le ? ` le ${dateCourte(b.vendu_le)}` : ''}`, ton: 'ok', ic: 'check' };
  if (b.etape === 'a_suivre') {
    const rdv0 = txt(d, 'rdvEstimation');
    /* V3.48 : mis en attente, il ne montre plus son ancien rendez-vous. */
    const enAttente = etapeInfo?.statut === 'a_suivre' && ed.de === 'estimation';
    if (rdv0 && !enAttente && (joursAvant(rdv0) ?? -1) >= 0) return { t: `Rendez-vous d’estimation le ${dateCourte(rdv0)}`, ton: 'neutre', ic: 'calendrier' };
    /* Mis en attente à l'estimation (V3.32) : pourquoi, et quand le rappeler. */
    if (etapeInfo?.statut === 'a_suivre' && ed.de === 'estimation') return { t: ['En attente', ed.raison, ed.reprise ? `à recontacter vers le ${dateCourte(ed.reprise)}` : ''].filter(Boolean).join(' · '), ton: 'neutre', ic: 'pause' };
    const delai: Record<string, string> = { vite: 'vendre dès que possible', '3mois': 'vendre sous 3 mois', '6mois': 'vendre sous 6 mois', libre: 'pas pressé' };
    return { t: typeof d.delai === 'string' && delai[d.delai] ? `Projet : ${delai[d.delai]}` : 'Projet de vente à suivre', ton: 'neutre' };
  }
  if (b.etape === 'retire') return { t: `Retiré de la vente${ed.raison ? ` · ${ed.raison}` : ''}`, ton: 'neutre', ic: 'archive' };
  if (b.etape === 'suspendu') return { t: [ed.raison || 'Vente en pause', ed.reprise ? `reprise le ${dateCourte(ed.reprise)}` : ''].filter(Boolean).join(' · '), ton: 'neutre', ic: 'pause' };
  if (b.etape === 'compromis') {
    const pret = ed.pretLimite ? `fin du délai de prêt le ${dateCourte(ed.pretLimite)}` : '';
    const acte = ed.acte ? `acte le ${dateCourte(ed.acte)}` : '';
    const t = [pret, acte].filter(Boolean).join(' · ');
    return { t: t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Compromis signé', ton: 'neutre', ic: 'accord' };
  }
  if (b.etape === 'offre') {
    const o = suivi.filter(x => x.type === 'offre' && (x.statut === 'en_attente' || x.statut === 'acceptee' || x.statut === 'contre'))
      .sort((x, y) => (y.montant || 0) - (x.montant || 0))[0];
    const jusq = o ? String((o.donnees as Record<string, unknown>).jusquau || '') : '';
    return { t: o ? `Offre à ${euros(montantActuel(o))}${o.statut === 'acceptee' ? ' · acceptée' : jusq ? ` · réponse attendue le ${dateCourte(jusq)}` : ''}` : 'Sous offre', ton: 'alerte', ic: 'euro' };
  }
  if (b.etape === 'mandat') {
    /* En vente sans mandat signé noté (V3.42) : où il en est dans Documents. */
    const signe = txt(d, 'mandatDate');
    if (!signe && !b.mandat_fin) {
      if (mandat) return { t: motMandat(mandat), ton: mandat.statut === 'signe' ? 'ok' : 'neutre', ic: 'plume' };
      return { t: 'Mandat pas encore signé', ton: 'alerte', ic: 'plume' };
    }
    const j = joursAvant(b.mandat_fin);
    const excl = b.mandat_type === 'exclusif' || b.mandat_type === 'semi';
    if (j !== null && j <= 15 && j >= 0) return { t: `${excl ? 'Exclusivité' : 'Mandat'} : fin dans ${j} jour${j > 1 ? 's' : ''}`, ton: 'alerte', ic: 'horloge' };
    if (j !== null && j < 0) return { t: `${excl ? 'Exclusivité' : 'Mandat'} terminé${excl ? 'e' : ''} depuis le ${dateCourte(b.mandat_fin)}`, ton: 'alerte', ic: 'horloge' };
    if (b.mandat_fin) return { t: `${excl ? 'Exclusivité' : 'Mandat'} jusqu’au ${dateCourte(b.mandat_fin)}`, ton: 'neutre', ic: 'plume' };
    return { t: `Mandat signé le ${dateCourte(signe)}`, ton: 'neutre', ic: 'plume' };
  }
  /* L'estimation (V3.16) : le rendez-vous, puis le montant, puis l'avis
     de valeur. Le montant lui-même est sur la carte (prixCarte). */
  const a = num(d, 'estimBasse'), h = num(d, 'estimHaute'), p = num(d, 'prix');
  const rdv = txt(d, 'rdvEstimation'), avis = txt(d, 'avisEnvoye');
  const j = joursAvant(rdv);
  if (avis) return { t: `Avis de valeur envoyé le ${dateCourte(avis)}`, ton: 'ok', ic: 'check' };
  if (rdv && (j ?? -1) >= 0) return { t: j === 0 ? 'Rendez-vous d’estimation aujourd’hui' : `Rendez-vous d’estimation le ${dateCourte(rdv)}`, ton: 'neutre', ic: 'calendrier' };
  if (a || h || p) return { t: p && (a || h) ? `Conseillé ${euros(p)} · avis de valeur à envoyer` : 'Avis de valeur à envoyer', ton: 'neutre', ic: 'etiquette' };
  return { t: rdv ? `Vu le ${dateCourte(rdv)} · montant à définir` : 'Pas encore de rendez-vous', ton: 'neutre', ic: rdv ? 'etiquette' : 'calendrier' };
}

/* ══ L'estimation (V3.16) ══════════════════════════════════════════════
   Le montant se donne en passant le bien « estimation », ou plus tard avec
   « Définir l'estimation » : la fourchette (estimBasse, estimHaute) et le
   prix conseillé, rangé dans `prix` (il deviendra le prix affiché au
   mandat). Rien ne s'efface quand le bien change d'étape : en pause ou
   retiré, la carte garde son montant. */
export const estimationFaite = (d: Donnees) => !!(num(d, 'estimBasse') || num(d, 'estimHaute') || num(d, 'prix'));
/* Pour bien estimer : ce que la fiche dit déjà, et ce qui manque encore. */
export function pretPourEstimer(d: Donnees): { l: string; ic: string; ok: boolean }[] {
  const terr = estTerrain(d);
  const etage = d.etage;
  return [
    { l: 'La surface', ic: 'regle', ok: terr ? !!num(d, 'terrain') : !!num(d, 'surface') },
    ...(aDesPieces(d) ? [{ l: 'Les pièces', ic: 'plan', ok: !!num(d, 'pieces') }] : []),
    ...(!terr ? [{ l: 'L’état général', ic: 'pinceau', ok: !!d.etat }] : []),
    ...(enImmeuble(d) ? [{ l: 'L’étage', ic: 'ascenseur', ok: etage !== undefined && etage !== null && etage !== '' }] : []),
    ...(!terr ? [{ l: 'L’exposition', ic: 'boussole', ok: !!d.expo }] : []),
    ...(!terr ? [{ l: 'Le DPE', ic: 'eclair', ok: !!d.dpe || d.dpeStatut === 'vierge' || d.dpeStatut === 'non' }] : []),
    ...(d.copro === 'oui' ? [{ l: 'Les charges', ic: 'lots', ok: !!num(d, 'chargesAn') }] : []),
    { l: 'La taxe foncière', ic: 'fiscal', ok: !!num(d, 'taxeFonciere') },
    /* V3.48 : une nouvelle vente reprend les pièces d'avant ; seule la visite de cette vente-ci compte. */
    { l: 'La visite', ic: 'tablette', ok: !!txt(d, 'visiteLe') || (!d.venteAvant && lirePieces(d.detailPieces).length > 0) },
  ];
}
/* Une ligne d'historique : « Estimation : 850 000 € à 900 000 €, prix
   conseillé 875 000 € ». */
export function texteEstimation(x: { basse: number | null; haute: number | null; prix: number | null }): string {
  const f = x.basse && x.haute ? `${euros(x.basse)} à ${euros(x.haute)}` : x.basse || x.haute ? euros((x.basse || x.haute) as number) : '';
  const p = x.prix ? `prix conseillé ${euros(x.prix)}` : '';
  return `Estimation : ${[f, p].filter(Boolean).join(', ') || 'montant retiré'}`;
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
    /* V3.48 : « à la charge du vendeur » seulement quand c'est vrai — à la
       charge de l'acquéreur sans taux saisi, on ne l'invente pas. */
    else if (d.charge === 'vendeur') legal.push(`Prix : ${euros(a.prix)}, honoraires à la charge du vendeur.`);
    else legal.push(`Prix : ${euros(a.prix)} honoraires inclus (le pourcentage à la charge de l’acquéreur est à compléter).`);
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
    equipConnus: { annexes: ann.length > 0, immeuble: imm.length > 0 },
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

/* Le prix que voit l'acheteur dans son espace, tiré du bien en vente. Un
   bien de l'agence : le prix affiché est celui que paie l'acheteur,
   honoraires de vente compris. Pas d'honoraires de recherche en plus.
   Servi à la création de la copie (versBienAcheteur) et à chaque changement
   de prix ou d'honoraires (repercuterPrix, biens/outils). */
export function prixCopie(d: Donnees) {
  const a = argentBien(d);
  return { prix_vendeur: a.net ?? a.prix, commission_type: 'fixe', commission_val: a.acq ? a.hono || 0 : 0, prix_acquereur: a.prix };
}

/* Le bien dans le dossier d'un acheteur (table `biens`) : exactement les
   colonnes qu'écrit l'ajout d'un bien depuis la fiche client (FicheClient,
   saveBien), plus le lien vers le bien en vente. */
export function versBienAcheteur(b: BienVente, o: { clientId: string; rechercheId: string; quand: string }) {
  const d = b.donnees || {};
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
    ...prixCopie(d),
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
