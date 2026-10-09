/* ═══ Le bon de visite ════════════════════════════════════════════════════
   La preuve qu'un bien a été présenté et visité par l'intermédiaire de
   l'Agence : qui a visité, quoi, et quand. Il protège les honoraires : un
   acquéreur présenté ne peut pas acheter en direct pour les contourner.

   Deux rôles, selon le dossier :
     · l'Agence détient le mandat de VENDRE : les visiteurs reconnaissent
       que le bien leur a été présenté par elle ;
     · l'Agence cherche pour un ACQUÉREUR (mandat de recherche) : le bon
       trace la visite faite avec son client, auprès du vendeur ou de
       l'agence du vendeur.

   V3.154 (Alexandre : « le but, c'est juste un bon de visite, sans lister
   les documents remis » ; « plusieurs biens sur un même bon ») :
     · plus de « documents remis » : un bon d'avant qui en cochait ne les
       imprime plus ;
     · jusqu'à six biens sur un même bon : le premier garde ses réponses
       d'avant (`adresse`, `ville`, `description`, `prix`, `reference`,
       `agenceVendeur`, `dateVisite`, `heure`), les autres vont dans
       `autresBiens` — un tableau des mêmes clés, plus, quand ils viennent
       du CRM, `bienId` (la copie du bien chez l'acheteur), `bienVenteId`
       (le bien en vente de l'agence) et `visiteId` (la visite). Le premier
       porte les mêmes trois clés à la racine. Un bon d'avant (un seul bien)
       reste valable tel quel.

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre. */

import { euros, type Partie, type Bloc, type Fiche, type Resume } from '@/lib/mandat';
import { lignesMandataire, type IdentiteAgence } from '@/lib/agence';
import { prixDuBien } from '@/lib/honoraires-bien';
import {
  P, nbLettres, jourLong, aujourdhui, txt, num,
  lirePersonnes, nomComplet, nomsCourts, fichePersonne, blocDonnees, ficheAgence,
  PERSONNE_VIDE, blocsSignature, manquesSignature, CHAMP_SIGNATURE_VISITE,
  type Donnees, type Modele, type Etape, type Contexte, type Personne, type CaseSignature, type ChampSimple,
} from './commun';

/* ── Les biens d'un bon (V3.154) ── */
/* Le premier, plus cinq autres au plus : six biens sur un même bon. */
export const MAX_AUTRES_BIENS = 5;

export type BienVisite = {
  adresse: string; ville: string; description: string; prix: number | null; reference: string; agenceVendeur: string;
  dateVisite: string; heure: string;
  /* D'où il vient, quand il est dans le CRM ('' sinon). */
  bienId: string; bienVenteId: string; visiteId: string;
};
const lireBien = (o: Donnees): BienVisite => ({
  adresse: txt(o, 'adresse'), ville: txt(o, 'ville'), description: txt(o, 'description'), prix: num(o, 'prix'),
  reference: txt(o, 'reference'), agenceVendeur: txt(o, 'agenceVendeur'), dateVisite: txt(o, 'dateVisite'), heure: txt(o, 'heure'),
  bienId: txt(o, 'bienId'), bienVenteId: txt(o, 'bienVenteId'), visiteId: txt(o, 'visiteId'),
});
/* Tous les biens du bon, le premier d'abord. Une carte vide compte : elle
   est à l'écran, elle doit se remplir ou se retirer (les cartes gardent
   leur rang, comme dans l'éditeur). */
export function biensDuBon(d: Donnees): BienVisite[] {
  const autres = Array.isArray(d.autresBiens) ? (d.autresBiens as unknown[]).slice(0, MAX_AUTRES_BIENS) : [];
  return [lireBien(d), ...autres.map(x => lireBien(x && typeof x === 'object' && !Array.isArray(x) ? x as Donnees : {}))];
}
const plusieurs = (d: Donnees) => biensDuBon(d).length > 1;
const lieu = (b: BienVisite) => [b.adresse, b.ville].filter(Boolean).join(', ');
/* « le 9 octobre 2026 à 14 h 30 » */
const quand = (b: BienVisite) => `${b.dateVisite ? `le ${jourLong(b.dateVisite)}` : 'le ……………'}${b.heure ? ` à ${b.heure.replace(':', ' h ')}` : ''}`;
/* « du 9 octobre 2026 », « du 9 au 11 octobre 2026 », « du 30 septembre au
   2 octobre 2026 », ou rien. */
function periode(d: Donnees): string {
  const l = biensDuBon(d).map(b => b.dateVisite).filter(x => /^\d{4}-\d{2}-\d{2}/.test(x)).sort();
  if (!l.length) return '';
  const a = l[0], z = l[l.length - 1];
  if (a.slice(0, 10) === z.slice(0, 10)) return `du ${jourLong(a)}`;
  const [jour, mois] = jourLong(a).split(' ');
  return a.slice(0, 7) === z.slice(0, 7) ? `du ${jour} au ${jourLong(z)}`
    : a.slice(0, 4) === z.slice(0, 4) ? `du ${jour} ${mois} au ${jourLong(z)}` : `du ${jourLong(a)} au ${jourLong(z)}`;
}

/* Les questions d'un autre bien : celles du premier, dans une carte. */
const CHAMPS_AUTRE_BIEN: ChampSimple[] = [
  { t: 'texte', cle: 'adresse', lib: 'Adresse du bien', large: true, requis: true },
  { t: 'texte', cle: 'ville', lib: 'Ville', requis: true },
  { t: 'euros', cle: 'prix', lib: 'Prix annoncé' },
  { t: 'texte', cle: 'description', lib: 'Le bien', large: true, exemple: 'appartement de 3 pièces, 64 m², 2e étage' },
  { t: 'texte', cle: 'reference', lib: 'Référence de l’annonce' },
  { t: 'texte', cle: 'agenceVendeur', lib: 'Agence du vendeur', si: d => d.role === 'acquereur', exemple: 'Agence du Parc, Boulogne' },
  { t: 'date', cle: 'dateVisite', lib: 'Date de la visite', requis: true },
  { t: 'heure', cle: 'heure', lib: 'Heure' },
];

const ETAPES: Etape[] = [
  {
    id: 'visite', titre: 'Qui visite', court: 'Qui visite', sous: 'Pour qui tu interviens, et les visiteurs.', vers: 'Entre les soussignés', ic: 'groupe',
    champs: [
      { t: 'choix', cle: 'role', lib: 'L’agence intervient pour…', ic: 'agence', tuiles: true, options: [
        { v: 'vendeur', l: 'Le vendeur', aide: 'Tu détiens le mandat de vente.', ic: 'maison' },
        { v: 'acquereur', l: 'L’acquéreur', aide: 'Tu cherches pour lui (mandat de recherche).', ic: 'loupe' },
      ] },
      { t: 'guide', cle: 'g-role', titre: d => (d.role === 'acquereur' ? 'Tu accompagnes ton acquéreur' : 'Tu fais visiter le bien de ton vendeur'),
        points: d => (d.role === 'acquereur' ? [
          { ic: 'loupe', x: 'Il visite dans le cadre de son mandat de recherche : le bon prouve que c’est toi qui lui as fait découvrir ce bien.' },
          { ic: 'agence', x: 'Si le bien est proposé par une autre agence, note son nom : elle transmettra l’offre au vendeur.' },
          { ic: 'lots', x: 'Plusieurs biens visités ? Ils vont tous sur ce bon, à l’étape suivante.' },
        ] : [
          { ic: 'personne', x: 'L’identité des visiteurs (une pièce d’identité vérifiée) : le bon protège tes honoraires s’ils achètent ensuite en direct.' },
          { ic: 'lots', x: 'Plusieurs biens visités ? Ils vont tous sur ce bon, à l’étape suivante.' },
        ]) },
      { t: 'personnes', cle: 'visiteurs', lib: 'Les visiteurs', ic: 'personne', un: 'Visiteur', min: 1, max: 4 },
    ],
  },
  {
    /* V3.154 : le premier bien comme avant ; les autres en cartes, dessous.
       Avec plusieurs biens, la date du premier rejoint son bloc (chaque bien
       a la sienne). */
    id: 'bien', titre: 'Le bien et le rendez-vous', court: 'Le bien et la date', sous: 'Ce qui a été visité, et quand.', ic: 'maison',
    vers: d => (plusieurs(d) ? 'Les biens visités' : 'Le bien visité'),
    champs: [
      { t: 'titre', cle: 't-bien', lib: 'Le bien visité', ic: 'maison', si: d => !plusieurs(d) },
      { t: 'titre', cle: 't-bien1', lib: 'Le premier bien', ic: 'maison', si: plusieurs },
      { t: 'texte', cle: 'adresse', lib: 'Adresse du bien', ic: 'lieu', large: true, requis: true },
      { t: 'texte', cle: 'ville', lib: 'Ville', ic: 'immeuble', requis: true },
      { t: 'texte', cle: 'description', lib: 'Le bien', ic: 'doc', large: true, exemple: 'appartement de 4 pièces, 92 m², 3e étage' },
      { t: 'euros', cle: 'prix', lib: 'Prix annoncé', ic: 'etiquette' },
      { t: 'texte', cle: 'reference', lib: 'Référence de l’annonce', ic: 'liste' },
      { t: 'texte', cle: 'agenceVendeur', lib: 'Agence du vendeur', ic: 'agence', si: d => d.role === 'acquereur', exemple: 'Agence du Parc, Boulogne', aide: 'Si le bien est proposé par une autre agence.' },
      { t: 'titre', cle: 't-quand', lib: 'Quand', ic: 'calendrier', si: d => !plusieurs(d) },
      { t: 'date', cle: 'dateVisite', lib: 'Date de la visite', ic: 'calendrier', requis: true },
      { t: 'heure', cle: 'heure', lib: 'Heure', ic: 'horloge' },
      { t: 'titre', cle: 't-autres', lib: 'Les autres biens visités', ic: 'lots', aide: 'Les mêmes visiteurs ont vu d’autres biens ? Ajoute-les : ils vont tous sur ce bon, jusqu’à six.' },
      { t: 'groupes', cle: 'autresBiens', lib: 'Les autres biens visités', ic: 'maison', un: 'Bien', max: MAX_AUTRES_BIENS, champs: CHAMPS_AUTRE_BIEN, crm: 'biens',
        nomCarte: (_d, i) => `Bien ${i + 2}`, ajouter: () => 'Ajouter un bien',
        /* Le même jour que le premier, le plus souvent. */
        nouveau: d => ({ dateVisite: txt(d, 'dateVisite') }) },
    ],
  },
  {
    /* V3.154 : plus de documents remis, seulement les engagements. */
    id: 'engagements', titre: 'Engagements', court: 'Engagements', sous: 'Ce que les visiteurs acceptent en signant.', vers: 'Engagements', ic: 'accord',
    champs: [
      { t: 'nombre', cle: 'duree', lib: 'Pas d’achat en direct pendant', ic: 'chrono', unite: 'mois', si: d => d.role !== 'acquereur' },
      { t: 'zone', cle: 'note', lib: 'Une remarque ?', ic: 'plume', large: true },
    ],
  },
  {
    id: 'signature', titre: 'La signature', court: 'Signature', sous: 'Comment, où et quand il sera signé.', vers: 'Date et signatures', ic: 'plume',
    champs: [
      /* V3.154 : sur place, chacun signe dans son cadre, sans code. */
      CHAMP_SIGNATURE_VISITE,
      { t: 'texte', cle: 'faitA', lib: 'Fait à', ic: 'lieu', requis: true },
      { t: 'date', cle: 'date', lib: 'Le', ic: 'calendrier', requis: true },
    ],
  },
];

function visiteursDe(d: Donnees): Personne[] {
  const l = lirePersonnes(d.visiteurs);
  return l.length ? l : [{ ...PERSONNE_VIDE }];
}

/* Un bien dans la liste d'un bon à plusieurs biens : son adresse, ce qu'il
   est, son prix, et quand il a été visité. */
function ficheBien(b: BienVisite, role: 'vendeur' | 'acquereur'): Fiche {
  return {
    ic: 'maison', titre: lieu(b) || 'Adresse à compléter',
    lignes: [
      b.description ? b.description.charAt(0).toUpperCase() + b.description.slice(1) : '',
      b.prix ? `Prix annoncé : ${euros(b.prix)}` : '',
      /* Une ligne à elle : une référence longue ne se coupe pas au tiret. */
      b.reference ? `Annonce ${b.reference}` : '',
      role === 'acquereur' && b.agenceVendeur ? `Proposé par : ${b.agenceVendeur}` : '',
      `Visité ${quand(b)}`,
    ].filter(Boolean),
  };
}

function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const vs = visiteursDe(d);
  const role = d.role === 'acquereur' ? 'acquereur' : 'vendeur';
  const duree = num(d, 'duree') ?? 12;
  const biens = biensDuBon(d);
  const b0 = biens[0];
  const adresse = lieu(b0);
  const pl = vs.length > 1;
  /* V3.154 : plusieurs biens → une liste, et des engagements pour chacun. */
  const multi = biens.length > 1;

  const entre: Bloc[] = [{ t: 'fiches', items: [
    ...vs.map((p, i) => fichePersonne(p, 'personne', i === vs.length - 1 ? `Ci-après ${pl ? 'ensemble ' : ''}« le VISITEUR »` : undefined)),
    ficheAgence(A, lignesMandataire(A).slice(0, 3), undefined,
      role === 'vendeur' ? 'Ci-après « l’Agence », mandataire du vendeur' : 'Ci-après « l’Agence », mandataire de l’acquéreur'),
  ] }];

  const bien: Bloc[] = [
    P(`${adresse || 'Adresse à compléter'}${b0.description ? ` : ${b0.description}` : ''}.`, true),
    ...(b0.prix ? [P(`Prix annoncé : ${euros(b0.prix)}${b0.reference ? ` (annonce ${b0.reference})` : ''}.`)] : b0.reference ? [P(`Annonce ${b0.reference}.`)] : []),
    ...(role === 'acquereur' && b0.agenceVendeur ? [P(`Bien proposé par : ${b0.agenceVendeur}.`)] : []),
  ];

  const visite: Bloc[] = [
    P(`${pl ? 'Les visiteurs soussignés reconnaissent' : 'Le visiteur soussigné reconnaît'} avoir visité ce bien ${quand(b0)}, accompagné${pl ? 's' : ''} par ${A.signataireNom}, pour le compte de l’Agence${role === 'vendeur' ? `, qui ${pl ? 'leur' : 'lui'} a présenté ce bien pour la première fois` : ''}.`, true),
  ];

  /* Les biens visités, quand il y en a plusieurs : la phrase, puis la liste. */
  const liste: Bloc[] = [
    P(`${pl ? 'Les visiteurs soussignés reconnaissent' : 'Le visiteur soussigné reconnaît'} avoir visité les biens suivants, accompagné${pl ? 's' : ''} par ${A.signataireNom}, pour le compte de l’Agence${role === 'vendeur' ? `, qui ${pl ? 'les leur' : 'les lui'} a présentés pour la première fois` : ''} :`, true),
    { t: 'fiches', items: biens.map(b => ficheBien(b, role)) },
  ];

  const ce = multi ? 'l’un de ces biens' : 'ce bien';
  const engagements: Bloc[] = role === 'vendeur'
    ? [
      P(`${pl ? 'Les visiteurs s’engagent' : 'Le visiteur s’engage'}, s’${pl ? 'ils souhaitent' : 'il souhaite'} acheter ${ce}, à le faire par l’intermédiaire de l’Agence, et à ne pas traiter directement avec ${multi ? 'son' : 'le'} vendeur, ni par un autre intermédiaire, pendant ${nbLettres(duree)} mois à compter de ce jour.`, true),
      ...(multi ? [P('Cet engagement vaut pour chacun des biens visités ci-dessus.')] : []),
      P(`${pl ? 'S’ils le faisaient, ils priveraient' : 'S’il le faisait, il priverait'} l’Agence de la rémunération prévue par son mandat, et ${pl ? 'pourraient être tenus' : 'pourrait être tenu'} de l’en indemniser.`),
    ]
    : [
      P(`${multi ? 'Ces visites sont faites' : 'Cette visite est faite'} dans le cadre du mandat de recherche confié à l’Agence par ${pl ? 'les visiteurs' : 'le visiteur'} : ${pl ? 's’ils achètent' : 's’il achète'} ${ce}, l’Agence ${pl ? 'les ' : 'l’'}accompagne jusqu’à l’acte, et ses honoraires sont ceux de ce mandat.`, true),
      P(`${pl ? 'Ils s’engagent' : 'Il s’engage'} à informer l’Agence de ${pl ? 'leur' : 'son'} intention de faire une offre${multi ? ' sur l’un de ces biens' : ''}, pour qu’elle la présente et la négocie.`),
    ];
  if (txt(d, 'note')) engagements.push(P(`Remarque : ${txt(d, 'note')}`));

  return [{
    titre: 'Bon de visite',
    court: 'Le bon de visite',
    sous: multi ? `${biens.length} biens visités` : adresse || 'Visite accompagnée',
    ic: 'calendrier',
    sections: [
      { titre: 'Entre les soussignés', blocs: entre },
      ...(multi
        ? [{ titre: 'Les biens visités', ic: 'maison' as const, blocs: liste }]
        : [{ titre: 'Le bien visité', ic: 'maison' as const, blocs: bien }, { titre: 'La visite', ic: 'calendrier' as const, blocs: visite }]),
      { titre: 'Engagements', ic: 'accord', blocs: engagements },
      { titre: 'Informations', ic: 'info', blocs: [blocDonnees(A)] },
      { titre: 'Date et signatures', ic: 'plume', blocs: blocsSignature(d, {
        papier: `Fait à ${txt(d, 'faitA') || '……………'}, le ${txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………'}, en ${nbLettres(2)} exemplaires.`,
        cases: casesVisite(d, A), sansCode: true,
      }) },
    ],
  }];
}

function resume(d: Donnees): Resume {
  const biens = biensDuBon(d);
  if (biens.length > 1) {
    /* V3.154 : plusieurs biens — combien, où, quand, et leurs prix. */
    const villes = [...new Set(biens.map(b => b.ville).filter(Boolean))];
    const prix = biens.map(b => b.prix).filter((x): x is number => !!x).sort((a, b) => a - b);
    const p = periode(d);
    return [
      { titre: 'Les biens', valeur: `${biens.length} biens visités`, detail: villes.join(' · ') || '—' },
      { titre: 'Les visites', valeur: !p ? 'À compléter' : p.includes(' au ') ? `D${p.slice(1)}` : p.replace(/^du /, ''), detail: 'accompagnées par l’Agence' },
    ].concat(prix.length ? [{
      titre: 'Prix annoncés', valeur: prix[0] === prix[prix.length - 1] ? euros(prix[0]) : `${euros(prix[0])} à ${euros(prix[prix.length - 1])}`,
      detail: prix.length < biens.length ? `pour ${prix.length} des ${biens.length} biens` : 'selon le bien',
    }] : []);
  }
  const prix = num(d, 'prix');
  return [
    { titre: 'Le bien', valeur: txt(d, 'adresse') || 'À compléter', detail: [txt(d, 'ville'), txt(d, 'description')].filter(Boolean).join(' · ') || '—' },
    { titre: 'La visite', valeur: txt(d, 'dateVisite') ? jourLong(txt(d, 'dateVisite')) : 'À compléter', detail: txt(d, 'heure') ? `à ${txt(d, 'heure').replace(':', ' h ')}` : 'accompagnée par l’Agence' },
  ].concat(prix ? [{ titre: 'Prix annoncé', valeur: euros(prix), detail: txt(d, 'reference') ? `annonce ${txt(d, 'reference')}` : '—' }] : []);
}

/* Les cadres de signature : chaque visiteur, puis l'agence. */
function casesVisite(d: Donnees, A?: IdentiteAgence): CaseSignature[] {
  const out: CaseSignature[] = visiteursDe(d).map((p, i) => ({ cle: `a${i}`, qui: 'Le visiteur', nom: nomComplet(p), lignes: [] as string[], personne: p }));
  if (A) out.push({ cle: 'agence', qui: 'L’agence', nom: A.nom.toUpperCase(), lignes: [`${A.signataireNom}, ${A.signataireQualite}`], agence: true });
  return out;
}

function manques(d: Donnees): string[] {
  const out: string[] = [];
  visiteursDe(d).forEach((p, i) => { if (!p.nom) out.push(`Le nom du visiteur ${i + 1}`); });
  const biens = biensDuBon(d);
  /* V3.154 : chaque bien, son adresse et sa date. */
  if (biens.length > 1) {
    biens.forEach((b, i) => {
      if (!b.adresse || !b.ville) out.push(`L’adresse du bien ${i + 1}`);
      if (!b.dateVisite) out.push(`La date de la visite du bien ${i + 1}`);
    });
  } else {
    if (!txt(d, 'adresse') || !txt(d, 'ville')) out.push('L’adresse du bien');
    if (!txt(d, 'dateVisite')) out.push('La date de la visite');
  }
  if (!txt(d, 'faitA') || !txt(d, 'date')) out.push('Le lieu et la date');
  out.push(...manquesSignature(d, casesVisite(d)));
  return out;
}

function defaut(c: Contexte): Donnees {
  const cl = c.client, b = c.bien;
  const p: Personne = { ...PERSONNE_VIDE, prenom: cl?.prenom || '', nom: cl?.nom || '', adresse: cl?.adresse || '', email: cl?.emails?.[0] || '', telephone: cl?.telephones?.[0] || '' };
  const desc = b ? [b.type_bien, b.nb_pieces ? `${b.nb_pieces} pièces` : '', b.surface ? `${b.surface} m²` : '', b.etage != null ? (b.etage === 0 ? 'rez-de-chaussée' : `${b.etage}e étage`) : ''].filter(Boolean).join(', ').toLowerCase() : '';
  return {
    role: cl ? 'acquereur' : 'vendeur',
    visiteurs: [p],
    adresse: b?.adresse || '', ville: b?.ville || '', description: desc, prix: prixDuBien(b).demande, reference: '',   // V3.145 : le prix de l'annonce
    agenceVendeur: b?.agence_nom || '',
    dateVisite: c.visite?.date_visite ? String(c.visite.date_visite).slice(0, 10) : aujourdhui(),
    heure: c.visite?.heure ? String(c.visite.heure).slice(0, 5) : '',
    duree: 12, note: '', signature: 'sur_place', faitA: c.identite.ville, date: aujourdhui(),
  };
}

export const BON_VISITE: Modele = {
  id: 'bon_visite',
  categorie: 'bons_visite',
  titre: 'Bon de visite',
  description: 'La preuve de la visite, d’un ou de plusieurs biens. Il protège tes honoraires.',
  ic: 'calendrier',
  signataires: 'Les visiteurs et l’agence',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Bon de visite · ${nomsCourts(visiteursDe(d))}${plusieurs(d) ? ` · ${biensDuBon(d).length} biens` : ''}`,
  sousTitre: d => {
    const l = biensDuBon(d);
    const a = lieu(l[0]);
    return l.length > 1 ? `${a || 'Adresse à compléter'} et ${l.length - 1} autre${l.length > 2 ? 's' : ''} bien${l.length > 2 ? 's' : ''}` : a;
  },
  pour: d => nomsCourts(visiteursDe(d)),
  rediger,
  resume,
  garde: d => (plusieurs(d) ? {
    titre: 'Bon de visite',
    sous: `de ${biensDuBon(d).length} biens présentés par l’Agence`,
    etiquette: `VISITES${periode(d) ? ` ${periode(d).toUpperCase()}` : ''}`,
    pour: 'VISITEURS',
    ics: ['maison', 'calendrier', 'etiquette'],
  } : {
    titre: 'Bon de visite',
    sous: 'd’un bien présenté par l’Agence',
    etiquette: `VISITE${txt(d, 'dateVisite') ? ` DU ${jourLong(txt(d, 'dateVisite')).toUpperCase()}` : ''}`,
    pour: 'VISITEURS',
    ics: ['maison', 'calendrier', 'etiquette'],
  }),
  entete: d => (plusieurs(d)
    ? `Bon de visite${periode(d) ? ` ${periode(d)}` : ''}`
    : `Bon de visite${txt(d, 'dateVisite') ? ` du ${jourLong(txt(d, 'dateVisite'))}` : ''}`),
  manques,
  cases: casesVisite,
  accepter: d => (plusieurs(d)
    ? 'J’ai lu le bon de visite : j’ai bien visité ces biens, qui m’ont été présentés par l’Agence, et je prends les engagements qu’il contient.'
    : 'J’ai lu le bon de visite : j’ai bien visité ce bien, qui m’a été présenté par l’Agence, et je prends les engagements qu’il contient.'),
};
