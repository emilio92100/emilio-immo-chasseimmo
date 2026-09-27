/* ═══ Le mandat de recherche sur papier : simple ou exclusif ══════════════
   Le mandat de recherche EN LIGNE (src/lib/mandat.ts : bloc Mandat de la
   fiche client, signé depuis l'espace avec un code) reste la voie rapide :
   une personne, mandat simple, douze mois. Celui-ci couvre le reste :
     · un couple, plusieurs acheteurs ou une société ;
     · l'exclusivité : les actions promises et la façon d'en rendre compte
       (art. 6 de la loi Hoguet), la clause d'exclusivité en caractères très
       apparents et la fin possible après trois mois (art. 78 du décret) ;
     · une durée au choix, et les échéances de l'article L215-1 ;
     · la signature sur place, à l'agence ou chez le client (rétractation
       et formulaire seulement hors de l'agence).
   Signé (« Il est signé »), il remplit le bloc Mandat de la recherche
   (surRecherche) : l'espace voit un mandat valide et ne propose plus d'en
   signer un en ligne.

   La clause pénale ne joue que si une acquisition a réellement eu lieu en
   méconnaissance du mandat : un client qui n'a rien acheté ne doit rien.
   Les clauses de l'article 78 (exclusivité, engagement exclusif, clause de
   suite, clause pénale) sont en CAPITALES : le reste du texte a déjà ses
   encadrés, elles doivent se distinguer d'eux (caractères très apparents).
   Relu par un second agent le 27 septembre 2026 (préemption, non-cumul,
   déclenchement de la clause pénale, double rémunération).

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre
   avant le premier usage. */

import {
  euros, BAREME, HONORAIRES_TAUX, tauxDe, forfaitDe, prixEtHonoraires, honorairesCourt, seuilForfait,
  decrireRecherche, decrireCourt, rechercheDepuis, type Recherche, type Partie, type Bloc, type Fiche, type Resume,
} from '@/lib/mandat';
import { lignesMandataire, phraseFonds, type IdentiteAgence } from '@/lib/agence';
import {
  P, Pp, eurosLettres, nbLettres, pourcent, jourLong, aujourdhui, txt, num, liste, vrai, plusMois, couper,
  lirePersonnes, nomComplet, nomsCourts, fichePersonne, lignesPersonne, blocsInformations, ficheAgence, formulaireType, annexeL215,
  PERSONNE_VIDE, blocsSignature, manquesSignature, lieuDe, modeSignature, electronique, CHAMP_SIGNATURE, MANQUE_EXECUTION,
  type Donnees, type Modele, type Etape, type Contexte, type Personne, type Repere, type CaseSignature,
} from './commun';
import { echeances } from './mandat-vente';

type TypeR = 'simple' | 'exclusif';
const TYPES: Record<TypeR, { court: string; nom: string; maj: string }> = {
  simple: { court: 'Simple', nom: 'simple', maj: 'NON EXCLUSIF' },
  exclusif: { court: 'Exclusif', nom: 'exclusif', maj: 'EXCLUSIF' },
};
const typeDe = (d: Donnees): TypeR => (d.type === 'exclusif' ? 'exclusif' : 'simple');
/* Les clauses de l'article 78, en caractères très apparents. */
const MAJ = (t: string) => t.toLocaleUpperCase('fr-FR');


/* Ce que l'Agence promet de faire : cases à cocher, dans cet ordre. */
const ACTIONS: { v: string; ic: string; l: string; titre: string; x: string }[] = [
  { v: 'annonces', ic: 'loupe', l: 'Veille des annonces', titre: 'Rechercher', x: 'Suivre chaque jour les annonces correspondant à la recherche du MANDANT, y compris celles des particuliers.' },
  { v: 'reseau', ic: 'groupe', l: 'Réseau et hors marché', titre: 'Chercher hors marché', x: 'Rechercher des biens qui ne sont pas encore annoncés, auprès de son réseau de confrères et de ses contacts.' },
  { v: 'selection', ic: 'cle', l: 'Visites préalables', titre: 'Visiter et sélectionner', x: 'Visiter les biens susceptibles de convenir avant de les proposer, et ne présenter que ceux qui correspondent à la recherche.' },
  { v: 'visites', ic: 'calendrier', l: 'Visites accompagnées', titre: 'Faire visiter', x: 'Organiser les visites du MANDANT et l’y accompagner.' },
  { v: 'dossier', ic: 'doc', l: 'Étude du dossier', titre: 'Vérifier', x: 'Obtenir et étudier le dossier de chaque bien retenu avant toute offre : diagnostics, documents de copropriété, charges et travaux votés.' },
  { v: 'avis', ic: 'courbe', l: 'Avis sur le prix', titre: 'Conseiller', x: 'Donner au MANDANT un avis argumenté sur le prix de chaque bien retenu, fondé sur les ventes récentes du secteur.' },
  { v: 'negociation', ic: 'accord', l: 'Offres et négociation', titre: 'Négocier', x: 'Préparer et transmettre ses offres d’achat, et négocier le prix et les conditions pour son compte.' },
  { v: 'suivi', ic: 'plume', l: 'Suivi jusqu’à l’acte', titre: 'Accompagner jusqu’à l’acte', x: 'L’accompagner jusqu’à la signature de l’acte authentique, en lien avec le notaire.' },
  { v: 'espace', ic: 'ecran', l: 'Espace personnel en ligne', titre: 'Tenir informé', x: 'Tenir à jour, dans l’espace personnel en ligne du MANDANT, le suivi de sa recherche et les biens présentés.' },
];
const ACTIONS_DEFAUT = ACTIONS.map(a => a.v);

const RYTHMES: Record<string, string> = {
  semaine: 'chaque semaine',
  quinzaine: 'toutes les deux semaines',
  mois: 'chaque mois',
};

export const TYPES_BIEN: { v: string; l: string; ic: string }[] = [
  { v: 'appartement', l: 'Appartement', ic: 'immeuble' },
  { v: 'maison', l: 'Maison', ic: 'maison' },
  { v: 'terrain', l: 'Terrain', ic: 'terrain' },
  { v: 'autre', l: 'Autre', ic: 'plus' },
];

const USAGES: Record<string, string> = {
  principale: 'Le bien est destiné à devenir la résidence principale du MANDANT.',
  secondaire: 'Le bien est destiné à devenir une résidence secondaire du MANDANT.',
  locatif: 'Le bien est destiné à être mis en location (investissement locatif).',
};

/* ── Qui achète ── */
function acquereursDe(d: Donnees): Personne[] {
  const l = lirePersonnes(d.acquereurs);
  const nb = d.qui === 'couple' ? 2 : d.qui === 'plusieurs' ? Math.max(2, l.length) : 1;
  const out = l.slice(0, nb);
  while (out.length < nb) out.push({ ...PERSONNE_VIDE });
  return out;
}
const plusieurs = (d: Donnees) => d.qui === 'couple' || d.qui === 'plusieurs';
const nomMandant = (d: Donnees) => (d.qui === 'sci' ? txt(d, 'sciNom') || 'La société' : nomsCourts(acquereursDe(d)));

function guideTitre(d: Donnees): string {
  return d.qui === 'sci' ? 'Une société : ce qu’il te faut'
    : d.qui === 'couple' ? 'Un couple : ce qu’il te faut'
      : d.qui === 'plusieurs' ? 'Plusieurs acheteurs : ce qu’il te faut'
        : 'Une personne : ce qu’il te faut';
}
function guidePoints(d: Donnees): { ic?: string; x: string }[] {
  if (d.qui === 'sci') return [
    { ic: 'immeuble', x: 'Le nom de la société, sa forme, son siège et son numéro RCS : tout est sur l’extrait Kbis (moins de 3 mois).' },
    { ic: 'personne', x: 'L’identité du gérant qui signe pour elle.' },
    { ic: 'livre', x: 'Les statuts : ils disent si le gérant peut engager la société seul. Sinon, demande la décision des associés et joins-la au mandat.' },
    { ic: 'info', x: 'La société n’existe pas encore ? Choisis plutôt « Une personne » ou « Un couple » : le mandat couvre aussi un achat par une société qu’ils créeront pour cet achat.' },
  ];
  if (d.qui === 'couple') return [
    { ic: 'couple', x: 'L’état civil complet des deux : nom, prénoms, date et lieu de naissance, adresse.' },
    { ic: 'plume', x: 'Les deux signent : le mandat les engage ensemble. Si l’un ne peut pas être là, une procuration écrite de sa part, jointe au mandat.' },
  ];
  if (d.qui === 'plusieurs') return [
    { ic: 'groupe', x: 'Chaque acheteur, avec son état civil complet : tous signent.' },
    { ic: 'plus', x: 'Deux fiches sont ouvertes ; « Ajouter un acheteur » en ajoute d’autres.' },
  ];
  return [
    { ic: 'personne', x: 'Son état civil complet : nom, prénoms, date et lieu de naissance, adresse.' },
    { ic: 'couple', x: 'Il achètera à deux ? Choisis « Un couple » : les deux signent, et les honoraires restent dus quel que soit celui qui achète.' },
  ];
}

/* ── L'argent ──
   Le mandat fixe un prix d'achat maximum HORS honoraires ; les honoraires
   viennent en plus, à la charge du mandant. Un forfait ne dépasse jamais le
   barème (5 % du prix) : le mandat le dit. */
type Argent = { prix: number | null; honoraires: number | null; total: number | null; taux: number | null; forfait: number | null };
function argent(d: Donnees): Argent {
  const prix = num(d, 'prixMax');
  const forfait = d.honoMode === 'forfait' ? forfaitDe(d.forfait) : null;
  const taux = d.honoMode === 'forfait' ? null : num(d, 'taux');
  let honoraires: number | null = forfait;
  if (!forfait && prix && taux !== null && taux >= 0) honoraires = Math.round((prix * taux) / 100);
  if (forfait && prix && forfait > (prix * BAREME) / 100) honoraires = Math.round((prix * BAREME) / 100);
  return { prix: prix && prix > 0 ? prix : null, honoraires, total: prix && honoraires !== null ? prix + honoraires : null, taux, forfait };
}

export const retractation = (d: Donnees) => lieuDe(d) === 'domicile' || lieuDe(d) === 'distance';

/* La recherche telle que decrireRecherche() l'attend (la même phrase que
   le mandat en ligne). */
function rechercheDe(d: Donnees): Recherche {
  const types = liste(d, 'types').map(v => (v === 'autre' ? txt(d, 'typeAutre') : TYPES_BIEN.find(t => t.v === v)?.l || '')).filter(Boolean);
  return {
    typeBien: types.join(', ') || null,
    piecesMin: num(d, 'pieces'),
    chambresMin: num(d, 'chambres'),
    surfaceMin: num(d, 'surface'),
    secteurs: txt(d, 'secteurs').split(/\s*[,;\n]\s*/).map(x => x.trim()).filter(Boolean),
    budget: null,
  };
}

/* ══ Les questions ══════════════════════════════════════════════════════ */
const ETAPES: Etape[] = [
  {
    id: 'qui', titre: 'Qui achète', sous: 'Ce que la fiche client connaissait est déjà rempli.', vers: 'Entre les soussignés', ic: 'personne',
    champs: [
      { t: 'choix', cle: 'qui', lib: 'Qui achète ?', tuiles: true, options: [
        { v: 'personne', l: 'Une personne', aide: 'Elle achète seule.', ic: 'personne' },
        { v: 'couple', l: 'Un couple', aide: 'Mariés, pacsés, ou ni l’un ni l’autre.', ic: 'couple' },
        { v: 'plusieurs', l: 'Plusieurs acheteurs', aide: 'Une famille, des amis…', ic: 'groupe' },
        { v: 'sci', l: 'Une société (SCI)', aide: 'Le gérant signe pour elle.', ic: 'immeuble' },
      ] },
      { t: 'guide', cle: 'g-qui', titre: guideTitre, points: guidePoints },
      { t: 'titre', cle: 't-sci', lib: 'La société', ic: 'immeuble', si: d => d.qui === 'sci' },
      { t: 'texte', cle: 'sciNom', lib: 'Nom de la société', requis: true, si: d => d.qui === 'sci', exemple: 'SCI DES LILAS' },
      { t: 'texte', cle: 'sciForme', lib: 'Forme et capital', si: d => d.qui === 'sci', exemple: 'Société civile immobilière au capital de 1 000 €' },
      { t: 'texte', cle: 'sciSiege', lib: 'Siège social', ic: 'lieu', large: true, requis: true, si: d => d.qui === 'sci' },
      { t: 'texte', cle: 'sciRcs', lib: 'Immatriculation', si: d => d.qui === 'sci', exemple: 'RCS de Nanterre n° 123 456 789', aide: 'Sur l’extrait Kbis.' },
      { t: 'personnes', cle: 'acquereurs', lib: 'Les acheteurs', un: 'Acheteur', min: 1, max: 6, complet: d => d.qui !== 'sci',
        bornes: d => (d.qui === 'couple' ? { min: 2, max: 2 } : d.qui === 'plusieurs' ? { min: 2, max: 6 } : { min: 1, max: 1 }),
        nomCarte: (d, i) => (d.qui === 'sci' ? 'Le gérant qui signe' : d.qui === 'personne' ? 'L’acheteur' : `Acheteur ${i + 1}`),
        ajouter: () => 'Ajouter un acheteur' },
      { t: 'texte', cle: 'sciPouvoir', lib: 'Qualité du signataire', large: true, si: d => d.qui === 'sci', exemple: 'gérant, en vertu des statuts' },
      { t: 'choix', cle: 'represente', lib: 'L’un représente l’autre ?', ic: 'plume', si: d => d.qui === 'couple', options: [
        { v: 'non', l: 'Non, les deux signent' }, { v: '0', l: 'Le premier représente le second' }, { v: '1', l: 'Le second représente le premier' },
      ], aide: 'Seulement avec une procuration écrite, jointe au mandat.' },
      { t: 'zone', cle: 'noteAcquereurs', lib: 'Une précision ?', ic: 'plume', large: true, aide: 'Note libre, imprimée sous les acheteurs.' },
    ],
  },
  {
    id: 'recherche', titre: 'Le bien recherché', sous: 'Repris de sa recherche : l’essentiel, sans l’enfermer.', vers: 'Le bien recherché', ic: 'loupe',
    champs: [
      { t: 'cases', cle: 'types', lib: 'Il cherche', ic: 'maison', options: TYPES_BIEN },
      { t: 'texte', cle: 'typeAutre', lib: 'Précisez', large: true, si: d => liste(d, 'types').includes('autre'), exemple: 'un loft, un local à transformer…' },
      { t: 'nombre', cle: 'pieces', lib: 'Pièces', ic: 'plan', unite: 'pièces environ' },
      { t: 'nombre', cle: 'chambres', lib: 'Dont chambres', unite: 'chambres' },
      { t: 'nombre', cle: 'surface', lib: 'Surface', ic: 'regle', unite: 'm² environ ou plus' },
      { t: 'zone', cle: 'secteurs', lib: 'Où', ic: 'lieu', large: true, requis: true, exemple: 'Boulogne-Billancourt, Paris 16e', aide: 'Séparés par des virgules. Le mandat ajoute « ou à proximité ».' },
      { t: 'zone', cle: 'criteres', lib: 'Ses critères essentiels', ic: 'etoile', large: true, exemple: 'un extérieur, pas de rez-de-chaussée', aide: 'Facultatif, imprimé tel quel. Seulement l’essentiel : le reste vit dans son espace et peut évoluer.' },
      { t: 'choix', cle: 'usage', lib: 'Pour en faire', ic: 'cle', options: [
        { v: 'principale', l: 'Sa résidence principale' }, { v: 'secondaire', l: 'Une résidence secondaire' }, { v: 'locatif', l: 'Un investissement locatif' }, { v: '', l: 'Ne pas le dire' },
      ] },
    ],
  },
  {
    id: 'prix', titre: 'Prix et mandat', sous: 'Le type de mandat, le prix maximum, les honoraires, la durée.', vers: 'Prix', reperesApres: 'forfait', ic: 'euro',
    champs: [
      { t: 'choix', cle: 'type', lib: 'Quel mandat ?', tuiles: true, options: [
        { v: 'simple', l: 'Simple', aide: 'Il reste libre de chercher seul et par d’autres agences.', ic: 'ouvert' },
        { v: 'exclusif', l: 'Exclusif', aide: 'Toi seul cherches pour lui pendant le mandat.', ic: 'cadenas' },
      ] },
      { t: 'euros', cle: 'prixMax', lib: 'Prix d’achat maximum', ic: 'etiquette', unite: '€ hors honoraires', requis: true, aide: 'Hors honoraires : ils viennent en plus. Le repère ci-dessous donne son budget total.' },
      { t: 'choix', cle: 'financement', lib: 'Il achètera', ic: 'banque', options: [
        { v: 'pret', l: 'Avec un prêt' }, { v: 'comptant', l: 'Sans prêt' }, { v: '', l: 'Ne pas le dire' },
      ] },
      { t: 'choix', cle: 'honoMode', lib: 'Honoraires', ic: 'euro', options: [{ v: 'taux', l: 'Un pourcentage' }, { v: 'forfait', l: 'Un forfait' }] },
      { t: 'nombre', cle: 'taux', lib: 'Taux', ic: 'pourcent', unite: '% TTC', si: d => d.honoMode !== 'forfait',
        aide: `Ton taux habituel : ${String(HONORAIRES_TAUX).replace('.', ',')} % TTC. Ton barème : ${String(BAREME).replace('.', ',')} % TTC au plus.` },
      { t: 'euros', cle: 'forfait', lib: 'Forfait', ic: 'euro', unite: '€ TTC', si: d => d.honoMode === 'forfait' },
      { t: 'titre', cle: 't-duree', lib: 'La durée', ic: 'calendrier' },
      { t: 'nombre', cle: 'duree', lib: 'Durée', ic: 'chrono', unite: 'mois', requis: true },
      { t: 'choix', cle: 'dureeMode', lib: 'À son terme', tuiles: true, options: [
        { v: 'fixe', l: 'Il prend fin', aide: 'Sans suite : on en signe un autre si besoin.', ic: 'drapeau' },
        { v: 'prorogation', l: 'Il se poursuit', aide: 'Par périodes, jusqu’à une limite totale.', ic: 'boucle' },
      ] },
      { t: 'nombre', cle: 'periode', lib: 'Par périodes de', unite: 'mois', si: d => d.dureeMode === 'prorogation' },
      { t: 'nombre', cle: 'dureeMax', lib: 'Dans la limite de', unite: 'mois au total', si: d => d.dureeMode === 'prorogation' },
      { t: 'titre', cle: 't-sig', lib: 'La signature', ic: 'plume' },
      CHAMP_SIGNATURE,
      { t: 'choix', cle: 'lieu', lib: 'Où sera-t-il signé ?', tuiles: true, si: d => modeSignature(d) !== 'en_ligne', options: [
        { v: 'agence', l: 'À l’agence', ic: 'agence' }, { v: 'domicile', l: 'Chez lui', ic: 'maison' }, { v: 'distance', l: 'À distance', ic: 'ecran' },
      ], aide: 'Hors de l’agence ou à distance, il a 14 jours pour se rétracter : le mandat le dit, avec le formulaire.' },
      { t: 'choix', cle: 'execution', lib: 'Commencer avant la fin des 14 jours ?', si: retractation, options: [
        { v: 'oui', l: 'Oui, il le demande' }, { v: 'non', l: 'Non, il attend' }, { v: '', l: 'Il cochera sur place' },
      ], aide: 'En ligne ou sur place, « Oui » lui fait cocher lui-même une case à part en signant : c’est sa demande expresse.' },
      { t: 'texte', cle: 'numero', lib: 'N° du registre des mandats', ic: 'livre', requis: true, aide: 'Celui que tu réserves dans ton registre (ImmoFacile). Il doit figurer sur le mandat avant la signature.' },
      { t: 'texte', cle: 'faitA', lib: 'Fait à', ic: 'lieu', requis: true },
      { t: 'date', cle: 'date', lib: 'Le', ic: 'calendrier', requis: true },
    ],
  },
  {
    id: 'engagements', titre: 'Engagements', sous: 'Ce que tu fais pour lui, et comment tu en rends compte.', vers: 'Engagements de l’Agence', ic: 'etoile',
    champs: [
      { t: 'cases', cle: 'actions', lib: 'Ce que tu t’engages à faire', ic: 'etoile', options: ACTIONS.map(a => ({ v: a.v, l: a.l, ic: a.ic })) },
      { t: 'choix', cle: 'rythme', lib: 'Comptes rendus, en plus d’un après chaque visite', ic: 'horloge', options: Object.entries(RYTHMES).map(([v, l]) => ({ v, l: l.charAt(0).toUpperCase() + l.slice(1) })) },
      { t: 'choix', cle: 'penale', lib: 'Clause pénale', ic: 'balance', si: d => d.type === 'exclusif', options: [{ v: 'oui', l: 'Oui' }, { v: 'non', l: 'Non' }],
        aide: 'S’il achète en chargeant une autre agence de sa recherche pendant le mandat, il doit une indemnité égale à tes honoraires. Elle ne joue que s’il achète réellement. Il reste libre d’acheter seul un bien trouvé par lui-même.' },
      { t: 'nombre', cle: 'suite', lib: 'Pas d’achat sans toi d’un bien présenté, pendant le mandat et', unite: 'mois après', aide: 'Un bien que tu lui as présenté ou fait visiter. 12 mois au plus.' },
      { t: 'cases', cle: 'pouvoirs', lib: 'Pouvoirs donnés à l’agence', ic: 'cle', options: [
        { v: 'renseignements', l: 'Demander les documents aux vendeurs', ic: 'doc' }, { v: 'offres', l: 'Transmettre ses offres écrites', ic: 'accord' }, { v: 'delegation', l: 'Déléguer à un confrère', ic: 'groupe' },
      ] },
      { t: 'choix', cle: 'infoJointe', lib: 'Joindre l’information précontractuelle', ic: 'info', options: [{ v: 'oui', l: 'Oui' }, { v: 'non', l: 'Non, remise à part' }],
        aide: 'Avec un particulier, elle est obligatoire avant la signature. Jointe, elle forme la 2e partie du document.' },
      { t: 'zone', cle: 'clause', lib: 'Clause particulière', ic: 'plume', large: true, aide: 'Imprimée telle quelle, avant les signatures.' },
    ],
  },
];

/* ══ Le texte ═══════════════════════════════════════════════════════════ */
function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const type = typeDe(d);
  const T = TYPES[type];
  const as = acquereursDe(d);
  const a = argent(d);
  const retr = retractation(d);
  const actions = liste(d, 'actions');
  const pouvoirs = liste(d, 'pouvoirs');
  const suite = num(d, 'suite') ?? 12;
  const duree = num(d, 'duree') ?? 3;
  const periode = num(d, 'periode') ?? 3;
  const dureeMax = num(d, 'dureeMax') ?? 12;
  const numero = txt(d, 'numero');

  /* ── Les parties ── */
  const fiches: Fiche[] = [];
  if (d.qui === 'sci') {
    const g = as[0];
    fiches.push({ ic: 'agence', titre: (txt(d, 'sciNom') || 'La société').toUpperCase(), lignes: [
      txt(d, 'sciForme'), txt(d, 'sciSiege') ? `Siège : ${txt(d, 'sciSiege')}` : '', txt(d, 'sciRcs'),
      `Représentée par ${nomComplet(g)}${txt(d, 'sciPouvoir') ? `, ${txt(d, 'sciPouvoir')}` : ''}.`,
      [g.telephone, g.email].filter(Boolean).join(' · '),
    ].filter(Boolean), pied: 'Ci-après « le MANDANT »' });
  } else if (d.qui === 'couple') {
    const [p1, p2] = as;
    fiches.push({ ic: 'personne', titre: `${nomComplet(p1)} et ${nomComplet(p2)}`, lignes: [
      ...lignesPersonne(p1).map((l, i) => (i === 0 ? `${p1.prenom || 'Le premier'} : ${l.charAt(0).toLowerCase()}${l.slice(1)}` : l)),
      ...lignesPersonne(p2).map((l, i) => (i === 0 ? `${p2.prenom || 'Le second'} : ${l.charAt(0).toLowerCase()}${l.slice(1)}` : l)),
    ], pied: 'Ci-après ensemble « le MANDANT », agissant solidairement' });
  } else {
    as.forEach((p, i) => fiches.push(fichePersonne(p, 'personne',
      as.length > 1 ? (i === as.length - 1 ? 'Ci-après ensemble « le MANDANT », agissant solidairement' : undefined) : 'Ci-après « le MANDANT »')));
  }
  fiches.push(ficheAgence(A, lignesMandataire(A), phraseFonds(A), 'Ci-après « l’Agence » ou « le MANDATAIRE »'));
  const entre: Bloc[] = [{ t: 'fiches', items: fiches }];
  const repr = d.qui === 'couple' && (d.represente === '0' || d.represente === '1') ? Number(d.represente) : -1;
  if (repr >= 0) entre.push(Pp(`${nomComplet(as[repr])} agit tant en son nom personnel qu’au nom de ${nomComplet(as[1 - repr])}, en vertu d’une procuration écrite annexée au présent mandat.`));
  if (txt(d, 'noteAcquereurs')) entre.push(P(`Précision : ${txt(d, 'noteAcquereurs')}`));

  /* ── L'objet ── */
  const objet: Bloc[] = type === 'exclusif'
    ? [
      P('Le MANDANT confie au MANDATAIRE, qui l’accepte, un mandat EXCLUSIF de rechercher pour son compte un bien à acquérir correspondant à la description ci-après, et de l’assister jusqu’à son acquisition.', true),
      P(MAJ('Clause d’exclusivité : pendant toute la durée du mandat, le MANDANT s’interdit de confier la recherche d’un tel bien à un autre intermédiaire. Il reste libre d’acquérir lui-même, directement auprès de son propriétaire et sans aucun intermédiaire, un bien qu’il aurait trouvé seul.'), true),
    ]
    : [P('Le MANDANT confie au MANDATAIRE, qui l’accepte, un mandat NON EXCLUSIF de rechercher pour son compte un bien à acquérir correspondant à la description ci-après, et de l’assister jusqu’à son acquisition. Il reste libre de chercher lui-même et de confier d’autres mandats non exclusifs.', true)];

  /* ── Le bien recherché ── */
  const r = rechercheDe(d);
  const cherche: Bloc[] = [
    P(r.typeBien || r.secteurs.length || r.piecesMin || r.surfaceMin ? decrireRecherche(r) : 'Description du bien recherché : à compléter.', true),
  ];
  if (txt(d, 'criteres')) cherche.push(P(`Critères essentiels pour le MANDANT : ${txt(d, 'criteres').replace(/\.$/, '')}.`));
  if (USAGES[String(d.usage || '')]) cherche.push(P(USAGES[String(d.usage)]));
  cherche.push(P('Le mandat s’étend à tout bien correspondant aux critères que le MANDANT communiquera ensuite par écrit à l’Agence, notamment depuis son espace personnel en ligne.'));

  /* ── Le prix ── */
  const prix: Bloc[] = a.prix
    ? [
      P(`Prix d’achat maximum, hors honoraires : ${eurosLettres(a.prix)}.`, true),
      ...(a.total ? [P(`Honoraires de l’Agence compris, le budget du MANDANT est donc de ${euros(a.total)} au plus.`)] : []),
    ]
    : [P('Prix d’achat maximum, hors honoraires : à compléter.', true)];
  if (d.financement === 'pret') prix.push(P('Le MANDANT prévoit de financer cette acquisition, en tout ou partie, au moyen d’un prêt.'));
  if (d.financement === 'comptant') prix.push(P('Le MANDANT prévoit de financer cette acquisition sans recourir à un prêt.'));
  prix.push(P('Le MANDANT peut modifier ce prix à tout moment par écrit (un simple e-mail suffit).'));

  /* ── Les honoraires ── */
  const hono: Bloc[] = [];
  if (a.forfait) {
    hono.push(P(`Honoraires de l’Agence : un forfait de ${eurosLettres(a.forfait)} TTC, à la charge du MANDANT, en plus du prix.`, true));
    hono.push(P(`Conformément au barème de l’Agence (${pourcent(BAREME)} TTC du prix au plus), ils ne peuvent dépasser ${pourcent(BAREME)} du prix d’acquisition : si ce prix est inférieur à ${euros(seuilForfait(a.forfait))}, ils sont ramenés à ${pourcent(BAREME)} de ce prix.`));
  } else {
    hono.push(P(`Honoraires de l’Agence : ${a.taux !== null ? `${pourcent(a.taux)} TTC du prix d’acquisition, hors honoraires de l’Agence et de tout autre intermédiaire${a.prix && a.honoraires ? `, soit ${euros(a.honoraires)} TTC au prix maximum` : ''}` : 'à préciser'}, à la charge du MANDANT, en plus du prix.`, true));
  }
  hono.push(P('Ils ne sont dus que si l’acquisition se réalise par l’entremise de l’Agence. L’acquisition s’entend aussi de celle réalisée par le MANDANT avec d’autres personnes, ou par une société qu’il constitue ou contrôle pour cet achat.'));
  hono.push(P('Aucune somme n’est due, ni ne peut être versée à l’Agence, avant la signature de l’acte authentique (l’article 6 de la loi du 2 janvier 1970 interdit tout versement avant que l’opération soit effectivement conclue) ; les honoraires sont alors réglés par l’intermédiaire du notaire.'));
  hono.push(P('En cas d’exercice d’un droit de préemption, le MANDANT, qui n’acquiert pas, ne doit aucun honoraire ; lorsque leur montant et leur charge figurent dans l’avant-contrat et la déclaration d’intention d’aliéner, ils sont dus par le titulaire du droit de préemption, substitué à l’acquéreur.'));
  hono.push(P('Si le bien fait l’objet d’un mandat de vente confié à l’Agence, elle en informe le MANDANT par écrit avant de le lui présenter ; elle ne perçoit alors qu’une seule rémunération pour cette acquisition, et le MANDANT ne paie au plus que les honoraires prévus au présent mandat.'));

  /* ── La durée ── */
  const dur: Bloc[] = [];
  if (d.dureeMode === 'prorogation') {
    dur.push(P(`Le mandat prend effet à sa signature pour une durée de ${nbLettres(duree)} mois. À ce terme, il se poursuit par périodes de ${nbLettres(periode)} mois, dans la limite de ${nbLettres(dureeMax)} mois au total, sauf si l’une des parties y met fin. Chaque partie peut s’opposer à cette poursuite par écrit (lettre ou e-mail), au plus tard la veille de l’échéance ; le mandat prend alors fin à l’échéance.`));
    dur.push(P('Avant chaque échéance, au plus tôt trois mois et au plus tard un mois avant, l’Agence rappelle par écrit au MANDANT qu’il peut ne pas poursuivre le mandat (article L215-1 du Code de la consommation, reproduit en annexe avec les articles L215-1-1 à L215-3 et L241-3).'));
  } else {
    dur.push(P(`Le mandat prend effet à sa signature et dure ${nbLettres(duree)} mois. Il prend fin de plein droit à son terme, sans reconduction.`));
  }
  dur.push(type === 'exclusif'
    ? P('Passé un délai de trois mois à compter de sa signature, chaque partie peut y mettre fin à tout moment, par lettre recommandée avec avis de réception, avec un préavis de quinze jours (article 78 du décret du 20 juillet 1972).', true)
    : P('Chaque partie peut y mettre fin à tout moment, par lettre recommandée avec avis de réception ou par e-mail, avec un préavis de quinze jours.', true));

  /* ── Les engagements de l'Agence ── */
  const acts = ACTIONS.filter(x => actions.includes(x.v));
  const rythme = RYTHMES[String(d.rythme)] || RYTHMES.semaine;
  const engA: Bloc[] = [
    P('Le MANDATAIRE s’engage à :'),
    { t: 'etapes', items: [
      ...acts.map(x => ({ titre: x.titre, x: x.x })),
      { titre: 'Rendre compte', x: `Adresser au MANDANT un compte rendu écrit après chaque visite, et un point sur l’avancement de sa recherche ${rythme}, par e-mail ou dans son espace personnel.` },
    ] },
  ];

  /* ── Les engagements du mandant ── */
  const engM: Bloc[] = [
    P(d.qui === 'sci'
      ? 'Le MANDANT, par son représentant, déclare que ses statuts l’autorisent à acquérir et que son représentant a le pouvoir de signer le présent mandat.'
      : `Le MANDANT déclare avoir la capacité d’acquérir${plusieurs(d) ? ' ; chacun des signataires s’engage solidairement' : ''}.`),
  ];
  if (type === 'exclusif') {
    engM.push(P(MAJ('Pendant toute la durée du mandat, le MANDANT ne charge aucun autre intermédiaire de rechercher un bien pour lui.'), true));
    engM.push(P('S’il s’intéresse à un bien proposé par un autre professionnel, il le signale à l’Agence, qui l’accompagne pour la visite et la négociation.'));
  } else {
    engM.push(P('Il déclare n’avoir confié aucun mandat exclusif de recherche portant sur les mêmes biens.'));
  }
  engM.push(P('S’il acquiert un bien, avec ou sans l’Agence, il l’en informe sans délai et lui indique, à sa demande, le vendeur, le prix et le notaire chargé de la vente. Il communique à l’Agence les informations utiles à sa recherche, notamment sur sa capacité de financement.'));
  engM.push(P(MAJ(`Pendant le mandat et les ${nbLettres(suite)} mois qui suivent sa fin, le MANDANT s’interdit d’acquérir sans l’Agence, directement ou par personne interposée, un bien qu’elle lui a présenté ou fait visiter. S’il le fait, il doit à l’Agence, à titre de clause pénale, une indemnité forfaitaire égale aux honoraires prévus au présent mandat, calculés sur le prix d’acquisition. Il s’en porte fort pour son conjoint, son partenaire de PACS, son concubin, toute personne avec qui il achèterait et toute société qu’il constituerait ou contrôlerait pour cet achat.`), true));

  /* ── Les pouvoirs ── */
  const pvs: string[] = [
    'rechercher des biens correspondant à la recherche du MANDANT, et les visiter ;',
    ...(pouvoirs.includes('renseignements') ? ['demander aux vendeurs, à leurs mandataires et aux syndics de copropriété les renseignements et documents utiles ;'] : []),
    ...(pouvoirs.includes('offres') ? ['transmettre aux vendeurs, ou à leurs mandataires, les offres d’achat écrites et signées du MANDANT ;'] : []),
    ...(pouvoirs.includes('delegation') ? ['se faire assister d’un autre professionnel habilité, sans frais supplémentaires pour le MANDANT et sous sa propre responsabilité ;'] : []),
    'négocier pour son compte le prix et les conditions de l’acquisition.',
  ];
  const pouvoirsBlocs: Bloc[] = [
    P('Le MANDANT donne au MANDATAIRE le pouvoir de :'),
    { t: 'l', items: pvs },
    P('L’Agence ne peut pas engager le MANDANT : aucune offre ni aucun avant-contrat ne l’engage sans sa propre signature.'),
  ];

  /* ── La partie 1 ── */
  const sections: Partie['sections'] = [
    { titre: 'Entre les soussignés', blocs: entre },
    { titre: 'Il a été convenu ce qui suit', blocs: objet },
    { titre: 'Le bien recherché', ic: 'maison', blocs: cherche },
    { titre: 'Prix', ic: 'etiquette', blocs: prix },
    { titre: 'Honoraires', ic: 'euro', blocs: hono },
    { titre: 'Durée', ic: 'calendrier', blocs: dur },
    { titre: 'Engagements de l’Agence', ic: 'etoile', blocs: engA },
    { titre: 'Engagements du mandant', ic: 'personne', blocs: engM },
    { titre: 'Pouvoirs', ic: 'doc', blocs: pouvoirsBlocs },
  ];
  if (type === 'exclusif' && vrai(d, 'penale')) {
    sections.push({ titre: 'Clause pénale', ic: 'balance', blocs: [
      P(MAJ('Si, pendant la durée du mandat, le MANDANT signe un avant-contrat portant sur un bien correspondant à sa recherche par l’entremise d’un autre intermédiaire qu’il aurait chargé de sa recherche, et que l’acquisition se réalise, il devra à l’Agence, à titre de clause pénale, une indemnité forfaitaire égale aux honoraires prévus au présent mandat, calculés sur le prix d’acquisition.'), true),
      Pp('Cette indemnité n’est due que si l’acquisition a effectivement lieu, et ne se cumule pas avec celle prévue aux engagements du mandant pour un bien présenté par l’Agence. Le juge peut la modérer ou l’augmenter si elle est manifestement excessive ou dérisoire (article 1231-5 du Code civil).'),
    ] });
  }
  if (retr) {
    const ex = d.execution === 'oui' ? true : d.execution === 'non' ? false : null;
    sections.push({ titre: 'Droit de rétractation', ic: 'retour', blocs: [
      P(`Le mandat étant signé ${lieuDe(d) === 'distance' ? 'à distance' : 'hors des locaux de l’Agence'}, le MANDANT peut se rétracter sans avoir à se justifier pendant ${nbLettres(14)} jours à compter du lendemain de sa signature (délai prolongé jusqu’au premier jour ouvrable s’il finit un samedi, un dimanche ou un jour férié), par une déclaration écrite dénuée d’ambiguïté — lettre, e-mail, ou le formulaire joint — adressée à l’Agence, ${A.adresse}, ${A.cp} ${A.ville}, ${A.mail}.`, true),
      P('L’Agence ne commence sa mission qu’à la fin de ce délai, sauf demande expresse du MANDANT. S’il demande qu’elle commence plus tôt, il garde son droit de rétractation tant que la mission n’est pas entièrement exécutée ; aucun honoraire n’est dû s’il se rétracte avant d’avoir acquis.'),
      { t: 'case', coche: ex === true, x: 'Le MANDANT DEMANDE que la mission commence dès la signature, sans attendre la fin du délai de rétractation.' },
      { t: 'case', coche: ex === false, x: 'Le MANDANT préfère que la mission commence à la fin du délai de rétractation.' },
    ] });
  }
  sections.push({ titre: 'Informations', ic: 'info', blocs: [
    ...(numero ? [P(`Le présent mandat est inscrit sous le numéro ${numero} au registre des mandats de l’Agence.`)] : [P('Numéro au registre des mandats : ……………')]),
    P(`Le MANDANT reconnaît avoir reçu, avant de signer, l’information précontractuelle prévue par le Code de la consommation${retr ? ' et le formulaire de rétractation' : ''}${vrai(d, 'infoJointe') ? ', qui forme' + (retr ? 'nt' : '') + ' la suite du présent document' : ''}.`),
    ...blocsInformations(A, 'le MANDANT', {
      lcbft: 'Le MANDANT s’engage à lui fournir les justificatifs demandés à ce titre, notamment sur l’origine des fonds.',
      textes: [
        'loi n° 70-9 du 2 janvier 1970 (dite loi Hoguet, art. 6 et 7) et décret n° 72-678 du 20 juillet 1972 (art. 72 et 78)',
        `Code de la consommation (art. L111-1${d.dureeMode === 'prorogation' ? ', L215-1 à L215-3' : ''}${retr ? ', L221-5, L221-18 et suivants' : ''}, L612-1)`,
        ...(type === 'exclusif' && vrai(d, 'penale') ? ['Code civil (art. 1231-5)'] : []),
      ].join(' ; '),
    }),
  ] });
  if (txt(d, 'clause')) sections.push({ titre: 'Clause particulière', ic: 'plume', blocs: [P(txt(d, 'clause'))] });
  const signataires = d.qui === 'sci' ? 1 : repr >= 0 ? 1 : as.length;
  sections.push({ titre: 'Date et signatures', ic: 'plume', blocs: blocsSignature(d, {
    papier: `Fait à ${txt(d, 'faitA') || '……………'}, le ${txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………'}, en ${nbLettres(signataires + 1)} exemplaires originaux, dont un remis à chaque partie.`,
    mention: 'Chaque signataire date et signe, précédé de la mention manuscrite « Lu et approuvé, bon pour mandat ».',
    cases: casesRecherche(d, A),
  }) });

  const parties: Partie[] = [{
    titre: `Mandat de recherche ${T.nom}${numero ? ` n° ${numero}` : ''}`,
    court: 'Le mandat de recherche',
    sous: type === 'exclusif' ? 'Mandat exclusif, d’un bien à acquérir' : 'Mandat simple, non exclusif, d’un bien à acquérir',
    ic: 'doc',
    sections,
  }];
  if (d.dureeMode === 'prorogation') parties.push(annexeL215());
  if (vrai(d, 'infoJointe')) parties.push(infoPrecontractuelle(d, A));
  if (retr) parties.push(formulaireType(A, {
    contrat: `mandat de recherche${numero ? ` n° ${numero}` : ''}`,
    /* Signé en ligne ou sur place : conclu à la dernière signature. */
    conclu: electronique(d) ? '……………… (la date de la dernière signature, sur le certificat joint)' : txt(d, 'date') ? jourLong(txt(d, 'date')) : '',
    noms: d.qui === 'sci' ? txt(d, 'sciNom') : as.map(nomComplet).join(', '),
    adresse: d.qui === 'sci' ? txt(d, 'sciSiege') : as[0]?.adresse || '',
  }));
  return parties;
}

/* ── L'information précontractuelle (L111-1 et L221-5 du Code de la
   consommation) : ce qu'il faut savoir avant de signer, en fiches. ── */
function infoPrecontractuelle(d: Donnees, A: IdentiteAgence): Partie {
  const type = typeDe(d);
  const a = argent(d);
  const retr = retractation(d);
  const duree = num(d, 'duree') ?? 3;
  const combien = a.forfait
    ? `Un forfait de ${euros(a.forfait)} TTC`
    : a.taux !== null ? `${pourcent(a.taux)} TTC du prix d’acquisition${a.prix && a.honoraires ? ` (${euros(a.honoraires)} TTC au prix maximum)` : ''}` : 'À préciser';
  return {
    titre: 'Information précontractuelle',
    court: 'Information précontractuelle',
    sous: 'Ce qu’il faut savoir avant de signer',
    ic: 'info',
    sections: [{ blocs: [
      { t: 'fiches', items: [
        { ic: 'agence', titre: 'Qui nous sommes', lignes: [
          `${A.nom} — ${A.societe}, ${A.forme}, ${A.rcs}${A.tva ? `, TVA ${A.tva}` : ''}.`,
          `${A.adresse}, ${A.cp} ${A.ville} · ${A.tel} · ${A.mail}`,
          `Carte professionnelle « ${A.carteMention} » n° ${A.carte}, délivrée par ${A.carteDelivree}.`,
          `Assurance de responsabilité civile professionnelle : ${A.assureur}, police n° ${A.police}.`,
        ], note: phraseFonds(A) },
        { ic: 'loupe', titre: 'Le service proposé', lignes: [
          'Rechercher pour vous le bien à acheter : veille des annonces et recherche hors marché, visites préalables, étude des dossiers, négociation, suivi jusqu’à l’acte chez le notaire.',
          type === 'exclusif' ? 'Mandat exclusif : l’Agence est seule chargée de votre recherche pendant la durée du mandat.'
            : 'Mandat simple : vous restez libre de chercher vous-même et par d’autres agences.',
        ] },
        { ic: 'euro', titre: 'Le prix du service', lignes: [
          `${combien}, à votre charge, en plus du prix du bien.`,
          'Dus uniquement si vous achetez grâce à l’Agence, le jour de l’acte chez le notaire : rien n’est versé avant.',
          type === 'exclusif'
            ? 'Si vous achetez sans l’Agence un bien qu’elle vous a présenté, pendant le mandat et les mois qui suivent, ou par un autre intermédiaire chargé de votre recherche pendant le mandat, une indemnité égale à ces honoraires est due.'
            : 'Si vous achetez sans l’Agence un bien qu’elle vous a présenté, pendant le mandat et les mois qui suivent, une indemnité égale à ces honoraires est due.',
          `Barème de l’Agence : jusqu’à ${pourcent(BAREME)} TTC du prix, affiché à l’Agence et sur son site.`,
        ] },
        { ic: 'calendrier', titre: 'La durée', lignes: [
          d.dureeMode === 'prorogation'
            ? `${duree} mois, puis par périodes de ${num(d, 'periode') ?? 3} mois, dans la limite de ${num(d, 'dureeMax') ?? 12} mois.`
            : `${duree} mois, sans reconduction.`,
          type === 'exclusif' ? 'Après trois mois, chacun peut y mettre fin avec quinze jours de préavis, par lettre recommandée.'
            : 'Chacun peut y mettre fin à tout moment, avec quinze jours de préavis.',
        ] },
        { ic: 'retour', titre: 'Votre droit de rétractation', lignes: retr
          ? ['Signé hors de l’Agence ou à distance, le mandat vous permet de vous rétracter sans motif pendant 14 jours, avec le formulaire joint ou par tout écrit clair.',
            'Vous pouvez demander que la mission commence avant la fin de ce délai.']
          : ['Signé dans les locaux de l’Agence, le mandat n’ouvre pas de droit de rétractation.'] },
        { ic: 'balance', titre: 'En cas de litige', lignes: [
          'Écrivez d’abord à l’Agence. Sans réponse satisfaisante sous 30 jours, vous pouvez saisir gratuitement le médiateur de la consommation :',
          `${A.mediateurNom}, ${A.mediateurAdresse}, ${A.mediateurSite}.`,
        ] },
      ] },
    ] }],
  };
}

/* ── Le résumé de la page de garde ── */
function resume(d: Donnees): Resume {
  const a = argent(d);
  const duree = num(d, 'duree') ?? 3;
  const r = rechercheDe(d);
  const court = decrireCourt(r);
  return [
    { titre: 'Le bien recherché', valeur: r.typeBien || r.piecesMin ? court.valeur : 'À compléter', detail: r.secteurs.length || r.surfaceMin ? court.detail : '—' },
    { titre: 'Prix maximum', valeur: a.prix ? `${euros(a.prix)} hors honoraires` : 'À compléter', detail: a.total ? `soit ${euros(a.total)} honoraires compris` : '—' },
    { titre: 'Honoraires', valeur: a.forfait ? `${euros(a.forfait)} TTC, au forfait` : a.taux !== null ? `${pourcent(a.taux)} TTC du prix` : 'À compléter', detail: 'à la charge de l’acquéreur · dus à l’acte seulement' },
    { titre: 'Durée', valeur: `${duree} mois`, detail: d.dureeMode === 'prorogation' ? `puis par périodes, ${num(d, 'dureeMax') ?? 12} mois au plus` : typeDe(d) === 'exclusif' ? 'sans reconduction · fin possible après 3 mois' : 'sans reconduction · fin possible à tout moment' },
  ];
}

function reperes(d: Donnees, etape: string): Repere[] {
  const out: Repere[] = [];
  if (etape === 'prix') {
    const a = argent(d);
    if (a.prix) out.push({ l: 'Prix maximum, hors honoraires', v: euros(a.prix) });
    if (a.honoraires !== null && a.prix) out.push({ l: a.forfait ? 'Honoraires (forfait)' : `Honoraires (${pourcent(a.taux || 0)} TTC)`, v: euros(a.honoraires) });
    if (a.total) out.push({ l: 'Son budget total', v: euros(a.total), ton: 'ok' });
    const budget = num(d, 'budgetFiche');
    if (a.total && budget && a.total > budget) out.push({ l: 'Au-dessus de sa fiche', v: `Son budget enregistré est de ${euros(budget)}, honoraires compris.`, ton: 'alerte' });
    if (!a.forfait && a.taux !== null && a.taux > BAREME) out.push({ l: 'Au-dessus de ton barème', v: `Ton barème affiché est de ${pourcent(BAREME)} TTC au plus : un taux supérieur ne peut pas être appliqué.`, ton: 'alerte' });
    if (a.forfait && a.prix && a.forfait > (a.prix * BAREME) / 100) out.push({ l: 'Au-dessus de ton barème', v: `Ce forfait dépasse ${pourcent(BAREME)} du prix maximum : le mandat le ramènera à ${pourcent(BAREME)} du prix.`, ton: 'alerte' });
    const duree = num(d, 'duree');
    if (duree !== null && d.dureeMode === 'prorogation' && (num(d, 'dureeMax') ?? 12) < duree) out.push({ l: 'Durée', v: 'La limite totale est plus courte que la première période.', ton: 'alerte' });
    if (!txt(d, 'numero')) out.push({ l: 'Registre des mandats', v: 'Réserve le numéro avant de faire signer : il doit figurer sur le mandat.', ton: 'alerte' });
  }
  if (etape === 'engagements' && typeDe(d) === 'exclusif' && !liste(d, 'actions').length) {
    out.push({ l: 'Mandat exclusif', v: 'La loi impose de dire ce que tu feras pour lui : coche au moins une action.', ton: 'alerte' });
  }
  return out;
}

/* Les cadres de signature : chaque acheteur (ou celui qui représente
   l'autre, ou le gérant pour la société), puis l'agence. */
export function casesRecherche(d: Donnees, A?: IdentiteAgence): CaseSignature[] {
  const as = acquereursDe(d);
  const repr = d.qui === 'couple' && (d.represente === '0' || d.represente === '1') ? Number(d.represente) : -1;
  const out: CaseSignature[] = d.qui === 'sci'
    ? [{ cle: 'sci', qui: 'Le mandant', nom: txt(d, 'sciNom') || 'La société', lignes: [`Représentée par ${nomComplet(as[0])}`], personne: as[0] }]
    : as.map((p, i): CaseSignature => ({ cle: `a${i}`, qui: 'Le mandant', nom: nomComplet(p), lignes: [] as string[], personne: p }))
      .filter((_, i) => repr < 0 || i === repr)
      .map(c => (repr >= 0 ? { ...c, lignes: [`En son nom et pour ${nomComplet(as[1 - repr])}, par procuration`] } : c));
  if (A) out.push({ cle: 'agence', qui: 'Le mandataire', nom: A.nom.toUpperCase(), lignes: [`Représentée par ${A.signataireNom}, ${A.signataireQualite}`], agence: true });
  return out;
}

function manques(d: Donnees): string[] {
  const out: string[] = [];
  const as = acquereursDe(d);
  as.forEach((p, i) => {
    const qui = as.length > 1 ? `l’acheteur ${i + 1}` : d.qui === 'sci' ? 'le gérant' : 'l’acheteur';
    if (!p.nom || !p.prenom) out.push(`Le nom de ${qui}`);
    else if (d.qui !== 'sci' && (!p.naissanceDate || !p.naissanceLieu)) out.push(`La date et le lieu de naissance de ${nomComplet(p)}`);
    else if (d.qui !== 'sci' && !p.adresse) out.push(`L’adresse de ${nomComplet(p)}`);
  });
  if (d.qui === 'sci' && (!txt(d, 'sciNom') || !txt(d, 'sciSiege'))) out.push('Le nom et le siège de la société');
  if (!liste(d, 'types').length) out.push('Le type de bien recherché');
  if (!txt(d, 'secteurs')) out.push('Où il cherche');
  if (!num(d, 'prixMax')) out.push('Le prix d’achat maximum');
  if (d.honoMode === 'forfait' ? !forfaitDe(d.forfait) : num(d, 'taux') === null) out.push('Les honoraires');
  if (!num(d, 'duree')) out.push('La durée');
  if (d.dureeMode === 'prorogation' && (num(d, 'dureeMax') ?? 12) < (num(d, 'duree') ?? 0)) out.push('Une limite totale au moins égale à la première durée');
  const suite = num(d, 'suite');
  if (suite === null || suite < 1 || suite > 12) out.push('La durée d’interdiction d’achat sans toi après le mandat : de 1 à 12 mois');
  if (!txt(d, 'numero')) out.push('Le numéro du registre des mandats');
  if (!txt(d, 'faitA') || !txt(d, 'date')) out.push('Le lieu et la date de signature');
  if (typeDe(d) === 'exclusif' && !liste(d, 'actions').length) out.push('Les actions promises (obligatoires pour un mandat exclusif)');
  if (electronique(d) && retractation(d) && d.execution !== 'oui' && d.execution !== 'non') out.push(MANQUE_EXECUTION);
  out.push(...manquesSignature(d, casesRecherche(d)));
  return out;
}

/* Les types de la fiche (« Appartement, Maison ») vers les cases. */
export function typesDepuis(t: unknown): { types: string[]; autre: string } {
  const types: string[] = [], autres: string[] = [];
  for (const x of String(t || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const v = /appart|studio|duplex|loft/i.test(x) ? 'appartement' : /maison|villa|pavillon/i.test(x) ? 'maison' : /terrain/i.test(x) ? 'terrain' : '';
    if (v) { if (!types.includes(v)) types.push(v); } else autres.push(x.toLowerCase());
  }
  if (autres.length) types.push('autre');
  return { types, autre: autres.join(', ') };
}

function defaut(c: Contexte): Donnees {
  const cl = c.client;
  const p: Personne = { ...PERSONNE_VIDE, prenom: cl?.prenom || '', nom: cl?.nom || '', adresse: cl?.adresse || '', email: cl?.emails?.[0] || '', telephone: cl?.telephones?.[0] || '' };
  const r = c.recherche || null;
  const rech = r ? rechercheDepuis(r) : null;
  const forfait = r ? forfaitDe(r.mandat_forfait) : null;
  const taux = r ? tauxDe(r.mandat_taux) : HONORAIRES_TAUX;
  const { types, autre } = typesDepuis(rech?.typeBien);
  const prixMax = rech ? prixEtHonoraires(rech.budget, { taux, forfait }).prixMax : null;
  /* Un numéro déjà réservé sur la recherche (pour le mandat en ligne), pas
     encore signé : c'est le même mandat, il le garde. */
  const numero = r && !r.mandat_date_signature && typeof r.mandat_numero === 'string' ? r.mandat_numero.trim() : '';
  return {
    qui: 'personne', acquereurs: [p], represente: 'non',
    types: types.length ? types : ['appartement'], typeAutre: autre,
    pieces: rech?.piecesMin ?? null, chambres: rech?.chambresMin ?? null, surface: rech?.surfaceMin ?? null,
    secteurs: rech?.secteurs.join(', ') || '', criteres: '', usage: 'principale',
    type: 'simple', prixMax, budgetFiche: rech?.budget ?? null, financement: '',
    honoMode: forfait ? 'forfait' : 'taux', taux: forfait ? HONORAIRES_TAUX : taux, forfait,
    duree: 12, dureeMode: 'fixe', periode: 3, dureeMax: 12,
    signature: 'papier', lieu: 'agence', execution: '', numero, faitA: c.identite.ville, date: aujourdhui(),
    actions: ACTIONS_DEFAUT, rythme: 'semaine', penale: 'non', suite: 12,
    pouvoirs: ['renseignements', 'offres'], infoJointe: 'oui',
  };
}

/* Signé : le bloc Mandat de la recherche se remplit, comme après une
   signature en ligne (/api/espace/mandat). La date de fin est la limite
   totale quand le mandat se poursuit par périodes. */
function surRecherche(d: Donnees, jour: string): Record<string, unknown> {
  const a = argent(d);
  const total = d.dureeMode === 'prorogation' ? (num(d, 'dureeMax') ?? 12) : (num(d, 'duree') ?? 12);
  const numero = txt(d, 'numero');
  return {
    mandat_date_signature: jour, mandat_duree: Math.round(total), mandat_date_expiration: plusMois(jour, Math.round(total)),
    mandat_honoraires: honorairesCourt({ taux: a.taux, forfait: a.forfait }), sans_mandat: false,
    mandat_type: typeDe(d), mandat_taux: a.forfait ? null : tauxDe(a.taux), mandat_forfait: a.forfait || null,
    ...(numero ? { mandat_numero: numero } : {}),
    updated_at: new Date().toISOString(),
  };
}

export const MANDAT_RECHERCHE: Modele = {
  id: 'mandat_recherche',
  categorie: 'mandats_recherche',
  titre: 'Mandat de recherche',
  description: 'Simple ou exclusif, signé à la main, en ligne ou sur place : un couple, une SCI. Signé, il remplit le bloc Mandat de sa recherche.',
  ic: 'loupe',
  signataires: 'Le ou les acheteurs, puis l’agence',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Mandat de recherche ${TYPES[typeDe(d)].nom} · ${nomMandant(d)}`,
  sousTitre: d => couper(rechercheDe(d).secteurs.join(', '), 80),
  pour: nomMandant,
  rediger,
  resume,
  garde: d => {
    const t = typeDe(d);
    return {
      titre: 'Mandat de recherche',
      sous: t === 'exclusif' ? 'exclusif, d’un bien à acquérir' : 'simple, d’un bien à acquérir',
      etiquette: `MANDAT ${TYPES[t].maj}${txt(d, 'numero') ? ` · N° ${txt(d, 'numero')}` : ''}`,
      pour: 'ÉTABLI POUR',
      ics: ['loupe', 'etiquette', 'euro', 'calendrier'],
    };
  },
  entete: d => `Mandat de recherche ${TYPES[typeDe(d)].nom}${txt(d, 'numero') ? ` n° ${txt(d, 'numero')}` : ''}`,
  manques,
  numero: true,
  badge: d => TYPES[typeDe(d)].court,
  reperes,
  echeances,
  lien: 'recherche',
  surRecherche,
  cases: casesRecherche,
  accepter: () => 'J’ai lu le mandat en entier, y compris les clauses écrites en capitales, et je l’accepte : bon pour mandat.',
};
