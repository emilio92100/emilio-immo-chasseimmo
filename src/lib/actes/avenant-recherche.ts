/* ═══ L'avenant au mandat de recherche ════════════════════════════════════
   Le client monte son budget, ajoute une ville, cherche aussi une maison,
   veut plus de temps : le mandat signé ne se réécrit pas, on le modifie par
   un avenant, signé par les mêmes parties. Tout peut changer — le prix
   maximum, le bien recherché, les secteurs, les honoraires, la durée — et
   une clause particulière, en texte libre, s'ajoute à volonté. Le reste du
   mandat reste inchangé.

   Il part d'un mandat de recherche signé : en ligne (depuis l'espace, table
   mandats_signatures) ou sur papier (Documents). La situation « actuelle »
   vient du mandat, et des avenants déjà signés à ce mandat (enchainer) ; la
   situation « nouvelle » vient de la recherche du moment, telle que le
   client l'a fait évoluer. Ce qui diffère est coché d'avance (preparer) :
   Alexandre relit, corrige, envoie.

   Pas de délai de rétractation : l'avenant modifie un mandat dont les 14
   jours ont déjà couru à sa signature, il n'en rouvre pas (choix
   d'Alexandre du 27 septembre 2026, à confirmer par son avocat ; comme
   l'avenant au mandat de vente). Un mandat terminé ne se prolonge pas par
   avenant, et un mandat simple ne devient pas exclusif par avenant : dans
   les deux cas, un nouveau mandat.

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre
   avant le premier usage. */

import {
  euros, jourParis, BAREME, HONORAIRES_TAUX, tauxDe, forfaitDe, prixEtHonoraires, honorairesCourt, seuilForfait,
  decrireRecherche, decrireCourt, rechercheDepuis,
  type Recherche, type Contenu, type Mandant, type Societe, type Partie, type Bloc, type Fiche, type Resume,
} from '@/lib/mandat';
import { lignesMandataire, phraseFonds, type IdentiteAgence } from '@/lib/agence';
import {
  P, Pp, eurosLettres, nbLettres, pourcent, jourLong, aujourdhui, txt, num, liste, plusMois, couper,
  lirePersonnes, nomComplet, nomsCourts, fichePersonne, ficheAgence, blocDonnees, PERSONNE_VIDE,
  blocsSignature, manquesSignature, CHAMP_SIGNATURE, HONO_MODES,
  type Donnees, type Modele, type Etape, type Contexte, type Personne, type Repere, type Source, type CaseSignature,
} from './commun';
import { TYPES_BIEN, typesDepuis } from './mandat-recherche';

type TypeR = 'simple' | 'exclusif';
const typeDe = (d: Donnees): TypeR => (d.type === 'exclusif' ? 'exclusif' : 'simple');
/* Le nom du mandat tel qu'il s'est appelé : « non exclusif » en ligne (son
   titre), « simple » ou « exclusif » sur papier. */
const nomMandat = (d: Donnees) => (typeDe(d) === 'exclusif' ? 'exclusif' : d.origine === 'en_ligne' ? 'non exclusif' : 'simple');
const change = (d: Donnees, k: string) => liste(d, 'objets').includes(k);
const enLigne = (d: Donnees) => d.origine === 'en_ligne';

function acquereursDe(d: Donnees): Personne[] {
  const l = lirePersonnes(d.acquereurs);
  return l.length ? l : [{ ...PERSONNE_VIDE }];
}
const nomMandant = (d: Donnees) => (d.qui === 'sci' ? txt(d, 'sciNom') || 'La société' : nomsCourts(acquereursDe(d)));
/* Les clauses de l'article 78, en caractères très apparents (comme au mandat papier). */
const MAJ = (t: string) => t.toLocaleUpperCase('fr-FR');
/* Les deux mandats s'étendent aux critères que le client donne ensuite :
   l'avenant le rappelle, pour que « remplacée » ne se lise pas comme une
   limite. */
const EXTENSION = 'Le mandat continue de s’étendre à tout bien correspondant aux critères que le MANDANT communique ensuite à l’Agence, comme il le prévoit.';
const decoupe = (t: string) => t.split(/\s*[,;\n]\s*/).map(x => x.trim()).filter(Boolean);
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ── Le bien recherché : l'actuel (clés du mandat) ou le nouveau (suffixe 2,
   seulement pour ce qui change). ── */
function typesLibelles(d: Donnees, s: '' | '2'): string[] {
  return liste(d, 'types' + s).map(v => (v === 'autre' ? txt(d, 'typeAutre' + s) : TYPES_BIEN.find(t => t.v === v)?.l || '')).filter(Boolean);
}
function rechercheDe(d: Donnees, bien: boolean, secteurs: boolean): Recherche {
  const b = bien ? '2' : '';
  return {
    typeBien: typesLibelles(d, b).join(', ') || null,
    piecesMin: num(d, 'pieces' + b),
    chambresMin: num(d, 'chambres' + b),
    surfaceMin: num(d, 'surface' + b),
    secteurs: decoupe(txt(d, secteurs ? 'secteurs2' : 'secteurs')),
    budget: null,
  };
}
const rechercheApres = (d: Donnees) => rechercheDe(d, change(d, 'bien'), change(d, 'secteurs'));

/* ── L'argent ──
   Comme au mandat : un prix maximum HORS honoraires, les honoraires en plus.
   Un forfait ne dépasse jamais le barème au prix maximum. */
type Argent = { prix: number | null; honoraires: number | null; total: number | null; taux: number | null; forfait: number | null };
function argentDe(prix: number | null, mode: unknown, taux: number | null, forfaitV: unknown): Argent {
  const forfait = mode === 'forfait' ? forfaitDe(forfaitV) : null;
  const t = mode === 'forfait' ? null : taux;
  let honoraires: number | null = forfait;
  if (!forfait && prix && t !== null && t >= 0) honoraires = Math.round((prix * t) / 100);
  if (forfait && prix && forfait > (prix * BAREME) / 100) honoraires = Math.round((prix * BAREME) / 100);
  return { prix: prix && prix > 0 ? prix : null, honoraires, total: prix && honoraires !== null ? prix + honoraires : null, taux: t, forfait };
}
const argentAvant = (d: Donnees) => argentDe(num(d, 'prixMax'), d.honoMode, num(d, 'taux'), d.forfait);
function argentApres(d: Donnees): Argent {
  const h = change(d, 'honoraires');
  return argentDe(
    change(d, 'prix') ? num(d, 'nouveauPrixMax') : num(d, 'prixMax'),
    h ? d.honoMode2 : d.honoMode, h ? num(d, 'taux2') : num(d, 'taux'), h ? d.forfait2 : d.forfait,
  );
}

/* ══ Les questions ══════════════════════════════════════════════════════ */
const ETAPES: Etape[] = [
  {
    id: 'mandat', titre: 'Le mandat', court: 'Le mandat', sous: 'Repris du mandat signé : vérifie, c’est tout.', vers: 'Entre les soussignés', ic: 'doc',
    champs: [
      { t: 'texte', cle: 'mandatNumero', lib: 'N° du mandat', ic: 'livre', requis: true },
      { t: 'date', cle: 'mandatDate', lib: 'Signé le', ic: 'calendrier', requis: true },
      { t: 'choix', cle: 'origine', lib: 'Il a été signé', ic: 'plume', options: [{ v: 'en_ligne', l: 'En ligne', ic: 'mail' }, { v: 'papier', l: 'Sur papier', ic: 'doc' }] },
      { t: 'choix', cle: 'type', lib: 'Mandat', ic: 'cadenas', options: [{ v: 'simple', l: 'Simple', ic: 'ouvert' }, { v: 'exclusif', l: 'Exclusif', ic: 'cadenas' }] },
      { t: 'nombre', cle: 'avenantNo', lib: 'Avenant n°', ic: 'plume', aide: 'Compté tout seul d’après les avenants déjà faits à ce mandat.' },
    ],
  },
  {
    id: 'parties', titre: 'Les acheteurs', court: 'Les acheteurs', sous: 'Les mêmes que sur le mandat : chacun signe l’avenant.', vers: 'Entre les soussignés', ic: 'couple',
    champs: [
      { t: 'titre', cle: 't-a', lib: 'Les acheteurs', ic: 'personne', aide: 'Les mêmes que sur le mandat : chacun signe l’avenant.' },
      { t: 'choix', cle: 'qui', lib: 'Qui achète ?', ic: 'personne', options: [
        { v: 'personne', l: 'Une personne', ic: 'personne' }, { v: 'couple', l: 'Un couple', ic: 'couple' }, { v: 'plusieurs', l: 'Plusieurs acheteurs', ic: 'groupe' }, { v: 'sci', l: 'Une société', ic: 'immeuble' },
      ] },
      { t: 'texte', cle: 'sciNom', lib: 'Nom de la société', ic: 'immeuble', requis: true, si: d => d.qui === 'sci' },
      { t: 'texte', cle: 'sciForme', lib: 'Forme', ic: 'doc', si: d => d.qui === 'sci', exemple: 'Société civile immobilière' },
      { t: 'texte', cle: 'sciSiege', lib: 'Siège social', ic: 'lieu', large: true, si: d => d.qui === 'sci' },
      { t: 'texte', cle: 'sciRcs', lib: 'Immatriculation', ic: 'livre', si: d => d.qui === 'sci', exemple: 'RCS de Nanterre n° 123 456 789' },
      { t: 'personnes', cle: 'acquereurs', lib: 'Les acheteurs', ic: 'personne', un: 'Acheteur', min: 1, max: 6, complet: d => d.qui !== 'sci',
        bornes: d => (d.qui === 'couple' ? { min: 2, max: 2 } : d.qui === 'plusieurs' ? { min: 2, max: 6 } : { min: 1, max: 1 }),
        nomCarte: (d, i) => (d.qui === 'sci' ? 'Celui qui signe pour la société' : d.qui === 'personne' ? 'L’acheteur' : `Acheteur ${i + 1}`),
        ajouter: () => 'Ajouter un acheteur' },
      { t: 'texte', cle: 'sciPouvoir', lib: 'Sa qualité', ic: 'plume', large: true, si: d => d.qui === 'sci', exemple: 'gérant' },
    ],
  },
  {
    id: 'changements', titre: 'Ce qui change', court: 'Ce qui change', sous: 'Ce qui a bougé dans sa recherche est déjà coché : relis, corrige, ajoute.', vers: 'Il a été convenu ce qui suit', reperesApres: 'nouveauPrixMax', ic: 'plume',
    champs: [
      { t: 'cases', cle: 'objets', lib: 'L’avenant modifie', ic: 'plume', options: [
        { v: 'prix', l: 'Le prix maximum', ic: 'etiquette' }, { v: 'bien', l: 'Le bien recherché', ic: 'maison' },
        { v: 'secteurs', l: 'Les secteurs', ic: 'lieu' }, { v: 'honoraires', l: 'Les honoraires', ic: 'euro' },
        { v: 'duree', l: 'La durée', ic: 'calendrier' }, { v: 'clause', l: 'Une clause particulière', ic: 'plume' },
      ] },
      { t: 'guide', cle: 'g-av', si: d => change(d, 'clause') || change(d, 'duree'), titre: () => 'Un avenant ne change pas tout', points: () => [
        { ic: 'cadenas', x: 'Passer d’un mandat simple à un mandat exclusif : signe un nouveau mandat, avec un nouveau numéro de registre.' },
        { ic: 'calendrier', x: 'Un mandat déjà terminé ne se prolonge pas : il faut un nouveau mandat.' },
      ] },
      { t: 'titre', cle: 't-prix', lib: 'Le prix maximum', ic: 'etiquette', si: d => change(d, 'prix') },
      { t: 'euros', cle: 'prixMax', lib: 'Prix maximum actuel', ic: 'etiquette', unite: '€ hors honoraires', si: d => change(d, 'prix'), aide: 'Celui du mandat, ou du dernier avenant signé.' },
      { t: 'euros', cle: 'nouveauPrixMax', lib: 'Nouveau prix maximum', ic: 'etiquette', unite: '€ hors honoraires', requis: true, si: d => change(d, 'prix'),
        aide: 'Hors honoraires : ils viennent en plus. Le repère ci-dessous donne son nouveau budget total.' },
      { t: 'titre', cle: 't-bien', lib: 'Le bien recherché', ic: 'maison', si: d => change(d, 'bien'), aide: 'La nouvelle description remplace celle du mandat : corrige ce qui change.' },
      { t: 'cases', cle: 'types2', lib: 'Il cherche', ic: 'maison', si: d => change(d, 'bien'), options: TYPES_BIEN },
      { t: 'texte', cle: 'typeAutre2', lib: 'Précisez', ic: 'plume', large: true, si: d => change(d, 'bien') && liste(d, 'types2').includes('autre'), exemple: 'un loft, un local à transformer…' },
      { t: 'nombre', cle: 'pieces2', lib: 'Pièces', ic: 'plan', unite: 'pièces environ', si: d => change(d, 'bien') },
      { t: 'nombre', cle: 'chambres2', lib: 'Dont chambres', ic: 'lit', unite: 'chambres', si: d => change(d, 'bien') },
      { t: 'nombre', cle: 'surface2', lib: 'Surface', ic: 'regle', unite: 'm² environ ou plus', si: d => change(d, 'bien') },
      { t: 'zone', cle: 'criteres2', lib: 'Ses critères essentiels', ic: 'etoile', large: true, si: d => change(d, 'bien'),
        exemple: 'un extérieur, pas de rez-de-chaussée', aide: 'Facultatif, imprimé tel quel.' },
      { t: 'titre', cle: 't-sect', lib: 'Les secteurs', ic: 'lieu', si: d => change(d, 'secteurs') },
      { t: 'zone', cle: 'secteurs2', lib: 'Où il cherche désormais', ic: 'lieu', large: true, requis: true, si: d => change(d, 'secteurs'),
        exemple: 'Boulogne-Billancourt, Paris 16e, Issy-les-Moulineaux', aide: 'Tous les secteurs, anciens et nouveaux, séparés par des virgules : la liste remplace celle du mandat.' },
      { t: 'titre', cle: 't-hono', lib: 'Les honoraires', ic: 'euro', si: d => change(d, 'honoraires') },
      { t: 'choix', cle: 'honoMode2', lib: 'Honoraires', ic: 'euro', si: d => change(d, 'honoraires'), options: HONO_MODES },
      { t: 'nombre', cle: 'taux2', lib: 'Nouveau taux', ic: 'pourcent', unite: '% TTC', si: d => change(d, 'honoraires') && d.honoMode2 !== 'forfait',
        aide: `Ton barème : ${String(BAREME).replace('.', ',')} % TTC au plus.` },
      { t: 'euros', cle: 'forfait2', lib: 'Nouveau forfait', ic: 'euro', unite: '€ TTC', si: d => change(d, 'honoraires') && d.honoMode2 === 'forfait' },
      { t: 'titre', cle: 't-duree', lib: 'La durée', ic: 'calendrier', si: d => change(d, 'duree') },
      { t: 'date', cle: 'finActuelle', lib: 'Il devait finir le', ic: 'calendrier', si: d => change(d, 'duree') },
      { t: 'date', cle: 'finNouvelle', lib: 'Il finira le', ic: 'chrono', requis: true, si: d => change(d, 'duree') },
      { t: 'titre', cle: 't-clause', lib: 'La clause particulière', ic: 'plume', si: d => change(d, 'clause') },
      { t: 'zone', cle: 'clause', lib: 'Le texte', ic: 'plume', large: true, requis: true, si: d => change(d, 'clause'),
        exemple: 'La recherche est étendue aux biens nécessitant des travaux de rénovation.', aide: 'Une condition, une précision, toute autre modification : imprimée telle quelle.' },
    ],
  },
  {
    id: 'signature', titre: 'Signature', court: 'Signature', sous: 'Comment, où et quand il sera signé.', vers: 'Date et signatures', ic: 'plume',
    champs: [
      CHAMP_SIGNATURE,
      { t: 'texte', cle: 'faitA', lib: 'Fait à', ic: 'lieu', requis: true },
      { t: 'date', cle: 'date', lib: 'Le', ic: 'calendrier', requis: true },
    ],
  },
];

/* ══ Le texte ═══════════════════════════════════════════════════════════ */
function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const as = acquereursDe(d);
  const no = num(d, 'avenantNo') || 1;
  const numero = txt(d, 'mandatNumero');
  const date = txt(d, 'mandatDate');
  const sci = d.qui === 'sci';
  const [g, ...autres] = as;

  /* ── Les parties : les mêmes qu'au mandat ── */
  const fiches: Fiche[] = [];
  if (sci) {
    fiches.push({ ic: 'agence', titre: (txt(d, 'sciNom') || 'La société').toUpperCase(), lignes: [
      txt(d, 'sciForme'), txt(d, 'sciSiege') ? `Siège : ${txt(d, 'sciSiege')}` : '', txt(d, 'sciRcs'),
      `Représentée par ${nomComplet(g)}${txt(d, 'sciPouvoir') ? `, ${txt(d, 'sciPouvoir')}` : ''}.`,
    ].filter(Boolean), ...(autres.length ? {} : { pied: 'Ci-après « le MANDANT »' }) });
    autres.forEach((p, i) => fiches.push(fichePersonne(p, 'personne', i === autres.length - 1 ? 'Ci-après ensemble « le MANDANT »' : undefined)));
  } else {
    /* Sur papier, un couple ou plusieurs acheteurs signent « solidairement »
       (le mandat le dit) ; en ligne, la solidarité ne porte que sur les
       honoraires d'un achat commun : l'avenant n'en redit rien. */
    const ensemble = !enLigne(d) && as.length > 1 ? 'Ci-après ensemble « le MANDANT », agissant solidairement' : 'Ci-après ensemble « le MANDANT »';
    as.forEach((p, i) => fiches.push(fichePersonne(p, 'personne',
      i === as.length - 1 ? (as.length > 1 ? ensemble : 'Ci-après « le MANDANT »') : undefined)));
  }
  fiches.push(ficheAgence(A, lignesMandataire(A), phraseFonds(A), 'Ci-après « l’Agence » ou « le MANDATAIRE »'));
  const entre: Bloc[] = [{ t: 'fiches', items: fiches }];
  if (sci && d.sciPerso === true) entre.push(P(`${nomComplet(g)} signe le présent avenant tant pour la société qu’en son nom personnel, comme au mandat.`));

  const sections: Partie['sections'] = [
    { titre: 'Entre les soussignés', blocs: entre },
    { titre: 'Il a été convenu ce qui suit', blocs: [
      P(`Par un mandat de recherche ${nomMandat(d)}${numero ? ` n° ${numero}` : ' n° ……'}, signé ${enLigne(d) ? 'en ligne ' : ''}le ${date ? jourLong(date) : '……………'}, le MANDANT a confié au MANDATAIRE la mission de rechercher pour son compte un bien à acquérir, et de l’assister jusqu’à son acquisition. Les parties conviennent de modifier ce mandat comme suit.`, true),
    ] },
  ];

  const av = argentAvant(d), ap = argentApres(d);
  if (change(d, 'prix')) {
    const blocs: Bloc[] = [];
    if (ap.prix) {
      const verbe = av.prix && ap.prix < av.prix ? 'ramené' : 'porté';
      const fixe = (num(d, 'avenantNo') || 1) > 1 ? 'fixé en dernier lieu à' : 'fixé au mandat à';
      blocs.push(P(`Le prix d’achat maximum, hors honoraires${av.prix ? `, ${fixe} ${euros(av.prix)},` : ''} est ${verbe} à ${eurosLettres(ap.prix)}.`, true));
      if (ap.total) blocs.push(P(`Honoraires de l’Agence compris, le budget du MANDANT est donc de ${euros(ap.total)} au plus.`));
      if (!change(d, 'honoraires') && ap.honoraires !== null) {
        blocs.push(P(ap.forfait
          ? `Les honoraires restent ceux du mandat : un forfait de ${euros(ap.forfait)} TTC${ap.honoraires < ap.forfait ? `, ramené à ${euros(ap.honoraires)} TTC à ce prix par le barème de l’Agence` : ''}.`
          : `Les honoraires restent calculés comme prévu au mandat, soit ${euros(ap.honoraires)} TTC à ce prix maximum.`));
      }
    } else blocs.push(P('Nouveau prix d’achat maximum : à compléter.', true));
    sections.push({ titre: 'Prix', ic: 'etiquette', blocs });
  }

  if (change(d, 'bien')) {
    const r = rechercheApres(d);
    const phrase = decrireRecherche(r);
    const blocs: Bloc[] = [
      P(`La description du bien recherché figurant au mandat est remplacée par la suivante : ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`, true),
    ];
    if (txt(d, 'criteres2')) blocs.push(P(`Critères essentiels pour le MANDANT : ${txt(d, 'criteres2').replace(/\.$/, '')}.`));
    else if (txt(d, 'criteres')) blocs.push(P('Les critères essentiels cités au mandat ne s’appliquent plus.'));
    blocs.push(P(EXTENSION));
    sections.push({ titre: 'Le bien recherché', ic: 'maison', blocs });
  } else if (change(d, 'secteurs')) {
    const nouveaux = decoupe(txt(d, 'secteurs2'));
    const anciens = decoupe(txt(d, 'secteurs'));
    sections.push({ titre: 'Les secteurs', ic: 'loupe', blocs: [
      P(nouveaux.length
        ? `Le MANDANT recherche désormais un bien situé à ${nouveaux.join(', ').replace(/, ([^,]*)$/, ' ou $1')}, ou à proximité.`
        : 'Les secteurs de recherche : à compléter.', true),
      ...(anciens.length ? [P(`Ces secteurs remplacent ceux cités au mandat (${anciens.join(', ')}). Le reste de la description du bien recherché est inchangé.`)] : []),
      P(EXTENSION),
    ] });
  }

  if (change(d, 'honoraires')) {
    const blocs: Bloc[] = [];
    if (ap.forfait) {
      blocs.push(P(`Les honoraires de l’Agence sont désormais un forfait de ${eurosLettres(ap.forfait)} TTC, à la charge du MANDANT, en plus du prix.`, true));
      blocs.push(P(`Conformément au barème de l’Agence (${pourcent(BAREME)} TTC du prix au plus), ils ne peuvent dépasser ${pourcent(BAREME)} du prix d’acquisition : si ce prix est inférieur à ${euros(seuilForfait(ap.forfait))}, ils sont ramenés à ${pourcent(BAREME)} de ce prix.`));
    } else {
      /* L'assiette reste celle du mandat : « du prix d'achat » en ligne, « du
         prix d'acquisition, hors honoraires… » sur papier. */
      const assiette = enLigne(d) ? 'du prix d’achat' : 'du prix d’acquisition (hors honoraires de l’Agence et de tout autre intermédiaire)';
      blocs.push(P(`Les honoraires de l’Agence sont désormais de ${ap.taux !== null ? `${pourcent(ap.taux)} TTC ${assiette}${ap.prix && ap.honoraires ? `, soit ${euros(ap.honoraires)} TTC au prix maximum` : ''}` : '……'}.`, true));
      blocs.push(P('Ils sont à la charge du MANDANT, en plus du prix.'));
    }
    blocs.push(P('Ils restent dus dans les conditions prévues au mandat. Aucune somme n’est due, ni ne peut être versée à l’Agence, avant la signature de l’acte authentique (l’article 6 de la loi du 2 janvier 1970 interdit tout versement avant que l’opération soit effectivement conclue).'));
    /* Le mandat papier prévoit des indemnités égales aux honoraires (clause
       de suite, clause pénale), en capitales : elles suivent le changement. */
    if (!enLigne(d)) blocs.push(P(MAJ('Toute indemnité prévue au mandat et égale aux honoraires est calculée sur les honoraires ainsi modifiés.'), true));
    sections.push({ titre: 'Honoraires', ic: 'euro', blocs });
  }

  if (change(d, 'duree')) {
    const fin = txt(d, 'finNouvelle'), avant = txt(d, 'finActuelle');
    const blocs: Bloc[] = d.dureeMode === 'prorogation'
      ? [P(`La limite de la durée totale du mandat est reportée au ${fin ? jourLong(fin) : '……………'}${avant ? `, au lieu du ${jourLong(avant)}` : ''}. Les autres règles de durée prévues au mandat sont inchangées.`, true)]
      : [P(`Le mandat est prolongé : il prendra fin le ${fin ? jourLong(fin) : '……………'}${avant ? `, au lieu du ${jourLong(avant)}` : ''}. Il prend fin de plein droit à cette date, sans reconduction.`, true)];
    if (typeDe(d) === 'exclusif') blocs.push(P(MAJ('L’exclusivité prévue au mandat s’applique jusqu’à cette nouvelle date.'), true));
    blocs.push(typeDe(d) === 'exclusif'
      ? P('Passé un délai de trois mois à compter de la signature du mandat, chaque partie peut y mettre fin à tout moment, par lettre recommandée avec avis de réception, avec un préavis de quinze jours (article 78 du décret du 20 juillet 1972).')
      : P('Chaque partie conserve la faculté d’y mettre fin à tout moment, avec un préavis de quinze jours, dans les formes prévues au mandat.'));
    sections.push({ titre: 'Durée', ic: 'calendrier', blocs });
  }

  if (change(d, 'clause')) sections.push({ titre: 'Clause particulière', ic: 'plume', blocs: [P(txt(d, 'clause') || 'À compléter.')] });

  sections.push({ titre: 'Le reste du mandat', ic: 'doc', blocs: [
    P(`Toutes les autres clauses du mandat demeurent inchangées. Le présent avenant en fait partie intégrante et se rattache à son numéro d’inscription au registre des mandats de l’Agence${numero ? ` (n° ${numero})` : ''}.`),
  ] });

  sections.push({ titre: 'Informations', ic: 'info', blocs: [
    blocDonnees(A),
    Pp(`Textes applicables : loi n° 70-9 du 2 janvier 1970 (dite loi Hoguet, art. 6 et 7) et décret n° 72-678 du 20 juillet 1972 (art. 72 et 78). Le présent avenant est soumis à la loi française.`),
  ] });

  const nbSig = (sci ? 1 + autres.length : as.length) + 1;
  sections.push({ titre: 'Date et signatures', ic: 'plume', blocs: blocsSignature(d, {
    papier: `Fait à ${txt(d, 'faitA') || '……………'}, le ${txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………'}, en ${nbLettres(nbSig)} exemplaires originaux, dont un remis à chaque partie.`,
    mention: 'Chaque signataire date et signe, précédé de la mention manuscrite « Lu et approuvé ».',
    cases: casesAvenant(d, A),
  }) });

  const parties: Partie[] = [{
    titre: `Avenant n° ${no} au mandat de recherche${numero ? ` n° ${numero}` : ''}`,
    court: 'L’avenant',
    sous: `Au mandat de recherche ${nomMandat(d)}${date ? ` du ${jourLong(date)}` : ''}`,
    ic: 'doc',
    sections,
  }];
  return parties;
}

/* « Prix maximum : 520 000 € · Secteurs : Boulogne, Issy » */
function changements(d: Donnees): string[] {
  const ap = argentApres(d);
  const out: string[] = [];
  if (change(d, 'prix')) out.push(`Prix maximum : ${num(d, 'nouveauPrixMax') ? euros(num(d, 'nouveauPrixMax') || 0) : '…'}`);
  if (change(d, 'bien')) out.push('Le bien recherché');
  if (change(d, 'secteurs')) {
    /* Ce qui s'ajoute ou disparaît, plutôt que toute la liste. */
    const avant = decoupe(txt(d, 'secteurs')), apres = decoupe(txt(d, 'secteurs2'));
    const plus = apres.filter(x => !avant.some(y => sansAccent(y) === sansAccent(x)));
    const moins = avant.filter(x => !apres.some(y => sansAccent(y) === sansAccent(x)));
    const ecart = [plus.length ? `+ ${plus.join(', ')}` : '', moins.length ? `− ${moins.join(', ')}` : ''].filter(Boolean).join(' ; ');
    out.push(`Secteurs : ${couper(ecart || apres.join(', '), 48) || '…'}`);
  }
  if (change(d, 'honoraires')) out.push(`Honoraires : ${ap.forfait ? `${euros(ap.forfait)} TTC` : ap.taux !== null ? `${pourcent(ap.taux)} TTC` : '…'}`);
  if (change(d, 'duree')) out.push(`Fin : ${txt(d, 'finNouvelle') ? jourLong(txt(d, 'finNouvelle')) : '…'}`);
  if (change(d, 'clause')) out.push('Une clause particulière');
  return out;
}

function resume(d: Donnees): Resume {
  const ch = changements(d);
  const court = decrireCourt(rechercheApres(d));
  return [
    { titre: 'Le mandat', valeur: txt(d, 'mandatNumero') ? `N° ${txt(d, 'mandatNumero')}` : 'À compléter',
      detail: `mandat ${nomMandat(d)}${enLigne(d) ? ' signé en ligne' : ''}${txt(d, 'mandatDate') ? `${enLigne(d) ? '' : ', signé'} le ${jourLong(txt(d, 'mandatDate'))}` : ''}` },
    { titre: 'Le bien recherché', valeur: court.valeur, detail: court.detail },
    { titre: 'Ce qui change', valeur: ch[0] || 'À compléter', detail: ch.slice(1).join(' · ') || '—' },
    { titre: 'Le reste', valeur: 'Inchangé', detail: 'toutes les autres clauses du mandat' },
  ];
}

function reperes(d: Donnees, etape: string): Repere[] {
  const out: Repere[] = [];
  if (etape !== 'changements') return out;
  const ap = argentApres(d);
  if ((change(d, 'prix') || change(d, 'honoraires')) && ap.prix) {
    out.push({ l: 'Prix maximum, hors honoraires', v: euros(ap.prix) });
    if (ap.honoraires !== null) out.push({ l: ap.forfait ? 'Honoraires (forfait)' : `Honoraires (${pourcent(ap.taux || 0)} TTC)`, v: euros(ap.honoraires) });
    if (ap.total) out.push({ l: 'Son budget total', v: euros(ap.total), ton: 'ok' });
    const budget = num(d, 'budgetFiche');
    if (ap.total && budget && ap.total > budget) out.push({ l: 'Au-dessus de sa fiche', v: `Son budget enregistré est de ${euros(budget)}, honoraires compris.`, ton: 'alerte' });
  }
  if (change(d, 'honoraires')) {
    if (!ap.forfait && ap.taux !== null && ap.taux > BAREME) out.push({ l: 'Au-dessus de ton barème', v: `Ton barème affiché est de ${pourcent(BAREME)} TTC au plus : un taux supérieur ne peut pas être appliqué.`, ton: 'alerte' });
    if (ap.forfait && ap.prix && ap.forfait > (ap.prix * BAREME) / 100) out.push({ l: 'Au-dessus de ton barème', v: `Ce forfait dépasse ${pourcent(BAREME)} du prix maximum : l’avenant le ramènera à ${pourcent(BAREME)} du prix.`, ton: 'alerte' });
  }
  if (change(d, 'duree') && txt(d, 'finNouvelle') && txt(d, 'finActuelle') && txt(d, 'finNouvelle') <= txt(d, 'finActuelle')) {
    out.push({ l: 'Durée', v: 'La nouvelle fin doit venir après l’ancienne.', ton: 'alerte' });
  }
  if (!liste(d, 'objets').length) out.push({ l: 'Rien à modifier', v: 'Coche au moins une modification.', ton: 'alerte' });
  const clause = sansAccent(txt(d, 'clause'));
  if (change(d, 'clause') && /exclusi/.test(clause)) out.push({ l: 'Exclusivité', v: 'Un mandat simple ne devient pas exclusif par avenant : il faut un nouveau mandat.', ton: 'alerte' });
  if (change(d, 'clause') && /prolong|reconduc|prorog/.test(clause)) out.push({ l: 'Durée', v: 'Pour prolonger le mandat, coche plutôt « La durée » : la date s’y écrit proprement.', ton: 'alerte' });
  return out;
}

/* Les cadres de signature : les mêmes signataires qu'au mandat (la société
   par son représentant, puis ceux qui signent en leur nom), puis l'agence. */
function casesAvenant(d: Donnees, A?: IdentiteAgence): CaseSignature[] {
  const as = acquereursDe(d);
  const [g, ...autres] = as;
  const out: CaseSignature[] = d.qui === 'sci'
    ? [
      { cle: 'sci', qui: 'Le mandant', nom: txt(d, 'sciNom') || 'La société', lignes: [`Représentée par ${nomComplet(g)}`, ...(d.sciPerso === true ? ['et en son nom personnel'] : [])], personne: g },
      ...autres.map((p, i): CaseSignature => ({ cle: `a${i + 1}`, qui: 'Le mandant', nom: nomComplet(p), lignes: [] as string[], personne: p })),
    ]
    : as.map((p, i): CaseSignature => ({ cle: `a${i}`, qui: 'Le mandant', nom: nomComplet(p), lignes: [] as string[], personne: p }));
  if (A) out.push({ cle: 'agence', qui: 'Le mandataire', nom: A.nom.toUpperCase(), lignes: [`Représentée par ${A.signataireNom}, ${A.signataireQualite}`], agence: true });
  return out;
}

function manques(d: Donnees): string[] {
  const out: string[] = [];
  if (!txt(d, 'mandatNumero') || !txt(d, 'mandatDate')) out.push('Le numéro et la date du mandat');
  if (d.mandatSigne === false) out.push('Un mandat signé : celui-ci ne l’est pas encore, il se modifie avant signature');
  if (d.mandatPartiel === true) out.push('Toutes les signatures du mandat : quelqu’un doit encore le signer (ou clos son invitation) avant l’avenant');
  if (enLigne(d) && typeDe(d) === 'exclusif') out.push('Un mandat simple : un mandat signé en ligne n’est jamais exclusif');
  if (txt(d, 'date') && txt(d, 'mandatDate') && txt(d, 'date') < txt(d, 'mandatDate')) out.push('Une date de signature après celle du mandat');
  const as = acquereursDe(d);
  as.forEach((p, i) => {
    if (!p.nom || !p.prenom) out.push(`Le nom ${d.qui === 'sci' && i === 0 ? 'de celui qui signe pour la société' : as.length > 1 ? `de l’acheteur ${i + 1}` : 'de l’acheteur'}`);
  });
  if (d.qui === 'sci' && !txt(d, 'sciNom')) out.push('Le nom de la société');
  if (!liste(d, 'objets').length) out.push('Ce que l’avenant modifie');
  if (change(d, 'prix') && !num(d, 'nouveauPrixMax')) out.push('Le nouveau prix maximum');
  else if (change(d, 'prix') && num(d, 'nouveauPrixMax') === num(d, 'prixMax')) out.push('Un nouveau prix maximum différent de l’actuel');
  if (change(d, 'bien') && !typesLibelles(d, '2').length) out.push('Le type de bien recherché');
  if (change(d, 'secteurs') && !decoupe(txt(d, 'secteurs2')).length) out.push('Les secteurs où il cherche');
  if (change(d, 'honoraires')) {
    const ap = argentApres(d);
    if (d.honoMode2 === 'forfait' ? !ap.forfait : ap.taux === null) out.push('Les nouveaux honoraires');
    else if (!ap.forfait && ap.taux !== null && ap.taux > BAREME) out.push(`Des honoraires dans ton barème (${pourcent(BAREME)} TTC au plus)`);
  }
  if (change(d, 'duree') && !txt(d, 'finActuelle')) out.push('La date de fin actuelle du mandat');
  if (change(d, 'duree') && !txt(d, 'finNouvelle')) out.push('La nouvelle date de fin');
  else if (change(d, 'duree') && txt(d, 'finActuelle') && txt(d, 'finNouvelle') <= txt(d, 'finActuelle')) out.push('Une nouvelle date de fin après l’ancienne');
  if (change(d, 'clause') && !txt(d, 'clause')) out.push('Le texte de la clause particulière');
  if (txt(d, 'finActuelle') && txt(d, 'date') && txt(d, 'date') >= txt(d, 'finActuelle')) out.push(`Un mandat en cours : celui-ci a pris fin le ${jourLong(txt(d, 'finActuelle'))}, il faut en signer un nouveau`);
  if (!txt(d, 'faitA') || !txt(d, 'date')) out.push('Le lieu et la date de signature');
  /* Pas de « lieu » dans l'avenant : un ancien choix ne bloque rien. */
  out.push(...manquesSignature({ ...d, lieu: '' }, casesAvenant(d)));
  return out;
}

/* ══ D'où partent les réponses ═══════════════════════════════════════════ */

/* Les réponses du « nouveau » : ce que la recherche du moment dit. */
function nouveauDepuis(r: Recherche | null): Donnees {
  if (!r) return {};
  const { types, autre } = typesDepuis(r.typeBien);
  const forfait = forfaitDe(r.forfait);
  const taux = tauxDe(r.taux);
  return {
    nouveauPrixMax: prixEtHonoraires(r.budget, { taux, forfait }).prixMax,
    types2: types, typeAutre2: autre, pieces2: r.piecesMin, chambres2: r.chambresMin, surface2: r.surfaceMin,
    secteurs2: r.secteurs.join(', '),
    honoMode2: forfait ? 'forfait' : 'taux', taux2: forfait ? HONORAIRES_TAUX : taux, forfait2: forfait,
    budgetFiche: r.budget,
  };
}

/* Sans mandat choisi : le client et sa recherche. */
function defaut(c: Contexte): Donnees {
  const cl = c.client;
  const p: Personne = { ...PERSONNE_VIDE, prenom: cl?.prenom || '', nom: cl?.nom || '', adresse: cl?.adresse || '', email: cl?.emails?.[0] || '', telephone: cl?.telephones?.[0] || '' };
  const r = c.recherche || null;
  const rech = r ? rechercheDepuis(r) : null;
  const { types, autre } = typesDepuis(rech?.typeBien);
  const forfait = rech ? forfaitDe(rech.forfait) : null;
  const taux = rech ? tauxDe(rech.taux) : HONORAIRES_TAUX;
  const jour = r && typeof r.mandat_date_signature === 'string' ? r.mandat_date_signature.slice(0, 10) : '';
  const fin = r && typeof r.mandat_date_expiration === 'string' ? r.mandat_date_expiration.slice(0, 10) : '';
  return {
    mandatNumero: r && typeof r.mandat_numero === 'string' ? r.mandat_numero.trim() : '', mandatDate: jour,
    origine: 'en_ligne', type: r?.mandat_type === 'exclusif' ? 'exclusif' : 'simple', avenantNo: 1,
    qui: 'personne', acquereurs: [p], sciNom: '', sciForme: '', sciSiege: '', sciRcs: '', sciPouvoir: '',
    types: types.length ? types : ['appartement'], typeAutre: autre,
    pieces: rech?.piecesMin ?? null, chambres: rech?.chambresMin ?? null, surface: rech?.surfaceMin ?? null,
    secteurs: rech?.secteurs.join(', ') || '', criteres: '',
    prixMax: rech ? prixEtHonoraires(rech.budget, { taux, forfait }).prixMax : null,
    honoMode: forfait ? 'forfait' : 'taux', taux: forfait ? HONORAIRES_TAUX : taux, forfait,
    dureeMode: 'fixe', finActuelle: fin,
    objets: [], ...nouveauDepuis(rech), criteres2: '', finNouvelle: '', clause: '',
    signature: 'en_ligne', faitA: c.identite.ville, date: aujourdhui(),
  };
}

/* Les réponses « actuelles », reprises d'un mandat de recherche papier. */
const REPRIS_PAPIER = ['type', 'qui', 'acquereurs', 'sciNom', 'sciForme', 'sciSiege', 'sciRcs', 'sciPouvoir',
  'types', 'typeAutre', 'pieces', 'chambres', 'surface', 'secteurs', 'criteres',
  'prixMax', 'honoMode', 'taux', 'forfait', 'dureeMode'];

function deriver(src: Source): Donnees {
  const s = src.donnees || {};
  const out: Donnees = {};
  const reprises = src.modele === 'mandat_en_ligne' ? [...REPRIS_PAPIER, 'sciPerso', 'finActuelle'] : REPRIS_PAPIER;
  for (const k of reprises) if (k in s) out[k] = s[k];
  /* V3.50 : le jour de la signature à l'heure de Paris, pas en heure universelle. */
  const jour = src.signe_le ? jourParis(src.signe_le) : String(s.date || '').slice(0, 10);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(jour);
  if (src.modele !== 'mandat_en_ligne') {
    const total = s.dureeMode === 'prorogation' ? (num(s, 'dureeMax') ?? 12) : (num(s, 'duree') ?? 12);
    out.finActuelle = ok ? plusMois(jour, total) : '';
  }
  return {
    ...out,
    origine: src.modele === 'mandat_en_ligne' ? 'en_ligne' : 'papier',
    mandatNumero: src.numero || txt(s, 'numero'), mandatDate: ok ? jour : '',
    mandatSigne: !!src.signe_le, mandatPartiel: src.modele === 'mandat_en_ligne' && s.statut === 'partiel',
  };
}

/* Un avenant déjà signé à ce mandat : ce qu'il a changé devient la
   situation actuelle du suivant. */
function enchainer(d: Donnees, a: Donnees): Donnees {
  const x: Donnees = { ...d };
  const ch = (k: string) => liste(a, 'objets').includes(k);
  if (ch('prix') && num(a, 'nouveauPrixMax')) x.prixMax = num(a, 'nouveauPrixMax');
  if (ch('bien')) {
    x.types = liste(a, 'types2'); x.typeAutre = txt(a, 'typeAutre2');
    x.pieces = num(a, 'pieces2'); x.chambres = num(a, 'chambres2'); x.surface = num(a, 'surface2'); x.criteres = txt(a, 'criteres2');
  }
  if (ch('secteurs') && txt(a, 'secteurs2')) x.secteurs = txt(a, 'secteurs2');
  if (ch('honoraires')) { x.honoMode = a.honoMode2; x.taux = a.taux2; x.forfait = a.forfait2; }
  if (ch('duree') && txt(a, 'finNouvelle')) x.finActuelle = txt(a, 'finNouvelle');
  return x;
}

/* Une fois tout repris : le « nouveau » manquant copie l'actuel, et ce qui
   diffère (sa recherche a bougé) est coché d'avance. */
function preparer(d: Donnees): Donnees {
  const x: Donnees = { ...d };
  const vide = (k: string) => x[k] === null || x[k] === undefined || x[k] === '' || (Array.isArray(x[k]) && !(x[k] as unknown[]).length);
  for (const [n, a] of [['types2', 'types'], ['typeAutre2', 'typeAutre'], ['pieces2', 'pieces'], ['chambres2', 'chambres'],
    ['surface2', 'surface'], ['criteres2', 'criteres'], ['secteurs2', 'secteurs'], ['nouveauPrixMax', 'prixMax'],
    ['honoMode2', 'honoMode'], ['taux2', 'taux'], ['forfait2', 'forfait']] as const) {
    if (vide(n)) x[n] = x[a] ?? null;
  }
  if (!txt(x, 'finNouvelle') && txt(x, 'finActuelle')) x.finNouvelle = plusMois(txt(x, 'finActuelle'), 6);
  const objets: string[] = [];
  const pa = num(x, 'prixMax'), pn = num(x, 'nouveauPrixMax');
  if (pa && pn && pa !== pn) objets.push('prix');
  const memeListe = (a: string[], b: string[]) => a.map(sansAccent).sort().join('|') === b.map(sansAccent).sort().join('|');
  const autre = (k: string) => (num(x, k + '2') ?? null) !== (num(x, k) ?? null);
  if (!memeListe(typesLibelles(x, ''), typesLibelles(x, '2')) || autre('pieces') || autre('chambres') || autre('surface')) objets.push('bien');
  if (!memeListe(decoupe(txt(x, 'secteurs')), decoupe(txt(x, 'secteurs2')))) objets.push('secteurs');
  const hA = x.honoMode === 'forfait' ? `f${forfaitDe(x.forfait) ?? ''}` : `t${num(x, 'taux') ?? ''}`;
  const hN = x.honoMode2 === 'forfait' ? `f${forfaitDe(x.forfait2) ?? ''}` : `t${num(x, 'taux2') ?? ''}`;
  if (hA !== hN) objets.push('honoraires');
  x.objets = objets;
  return x;
}

/* Signé (sur papier, « Il est signé ») : la fin du mandat et ses honoraires
   sur la recherche, s'ils changent. Le numéro et la date du mandat, eux, ne
   bougent pas. */
function surRecherche(d: Donnees): Record<string, unknown> {
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change(d, 'duree') && txt(d, 'finNouvelle')) {
    out.mandat_date_expiration = txt(d, 'finNouvelle');
    const debut = txt(d, 'mandatDate');
    if (debut) {
      const [a1, m1] = debut.split('-').map(Number), [a2, m2] = txt(d, 'finNouvelle').split('-').map(Number);
      out.mandat_duree = Math.max(1, (a2 - a1) * 12 + (m2 - m1));
    }
  }
  if (change(d, 'honoraires')) {
    const ap = argentApres(d);
    out.mandat_honoraires = honorairesCourt({ taux: ap.taux, forfait: ap.forfait });
    out.mandat_taux = ap.forfait ? null : tauxDe(ap.taux);
    out.mandat_forfait = ap.forfait || null;
  }
  return out;
}

/* ══ Le mandat signé en ligne, vu comme une source ═══════════════════════
   La ligne de mandats_signatures et ceux qui ont signé avec lui : les
   réponses « actuelles », dans les clés du mandat papier. */
export type MandatEnLigneSource = {
  id: string; numero: string | null; statut: string; signe_le: string | null;
  client_id: string | null; recherche_id: string | null;
  mandant: Mandant | null; societe?: Societe | null;
  contenu: Pick<Contenu, 'recherche' | 'prixMax' | 'taux'> & { forfait?: number | null } | null;
};
const personneDe = (m: Partial<Mandant> | null | undefined): Personne => ({
  ...PERSONNE_VIDE, civilite: m?.civilite === 'Madame' || m?.civilite === 'Monsieur' ? m.civilite : '',
  prenom: m?.prenom || '', nom: m?.nom || '', naissanceDate: m?.naissanceDate || '', naissanceLieu: m?.naissanceLieu || '',
  adresse: m?.adresse || '', email: m?.email || '', telephone: m?.telephone || '',
});
export function donneesMandatEnLigne(l: MandatEnLigneSource, signataires: Partial<Mandant>[]): Donnees {
  const r = l.contenu?.recherche || null;
  const { types, autre } = typesDepuis(r?.typeBien);
  const forfait = forfaitDe(l.contenu?.forfait);
  const acquereurs = [personneDe(l.mandant), ...signataires.map(personneDe)];
  const s = l.societe || null;
  const siren = s?.siren ? s.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : '';
  const jour = l.signe_le ? jourParis(l.signe_le) : '';
  return {
    type: 'simple', qui: s ? 'sci' : acquereurs.length === 1 ? 'personne' : acquereurs.length === 2 ? 'couple' : 'plusieurs',
    acquereurs,
    sciNom: s?.denomination || '', sciForme: s?.forme && s.forme !== 'Autre' ? s.forme : '', sciSiege: s?.siege || '',
    sciRcs: s ? [s.rcsVille ? `RCS de ${s.rcsVille}` : '', siren ? `n° ${siren}` : ''].filter(Boolean).join(' ') : '',
    sciPouvoir: s?.qualite ? s.qualite.toLowerCase() : '', sciPerso: !!s,
    types, typeAutre: autre, pieces: r?.piecesMin ?? null, chambres: r?.chambresMin ?? null, surface: r?.surfaceMin ?? null,
    secteurs: (r?.secteurs || []).join(', '), criteres: '',
    prixMax: l.contenu?.prixMax ?? null, honoMode: forfait ? 'forfait' : 'taux', taux: forfait ? HONORAIRES_TAUX : tauxDe(l.contenu?.taux), forfait,
    dureeMode: 'fixe', finActuelle: /^\d{4}-\d{2}-\d{2}$/.test(jour) ? plusMois(jour, 12) : '',
    date: jour, statut: l.statut,
  };
}

/* Les limites du mandat en ligne, avenants signés compris : ce que
   « Sa recherche dépasse son mandat signé » compare à la recherche. */
export function contenuApresAvenants(c: Contenu, avenants: Donnees[]): Contenu {
  let x: Contenu = { ...c, recherche: { ...c.recherche, secteurs: [...(c.recherche.secteurs || [])] } };
  for (const a of [...avenants].sort((p, q) => (num(p, 'avenantNo') ?? 0) - (num(q, 'avenantNo') ?? 0))) {
    const ch = (k: string) => liste(a, 'objets').includes(k);
    const r = { ...x.recherche };
    if (ch('bien')) {
      r.typeBien = typesLibelles(a, '2').join(', ') || null;
      r.piecesMin = num(a, 'pieces2'); r.chambresMin = num(a, 'chambres2'); r.surfaceMin = num(a, 'surface2');
    }
    if (ch('secteurs')) r.secteurs = decoupe(txt(a, 'secteurs2'));
    const hono = ch('honoraires')
      ? { taux: a.honoMode2 === 'forfait' ? x.taux : tauxDe(a.taux2), forfait: a.honoMode2 === 'forfait' ? forfaitDe(a.forfait2) : null }
      : { taux: x.taux, forfait: x.forfait ?? null };
    x = { ...x, recherche: r, taux: hono.taux, forfait: hono.forfait, prixMax: ch('prix') && num(a, 'nouveauPrixMax') ? num(a, 'nouveauPrixMax') : x.prixMax };
  }
  return x;
}

export const AVENANT_RECHERCHE: Modele = {
  id: 'avenant_recherche',
  categorie: 'mandats_recherche',
  titre: 'Avenant au mandat de recherche',
  description: 'Budget, bien recherché, secteurs, honoraires, durée, ou une clause libre : il reprend le mandat signé, en ligne ou sur papier.',
  ic: 'plume',
  signataires: 'Les mêmes signataires que le mandat',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Avenant n° ${num(d, 'avenantNo') || 1} · ${nomMandant(d)}`,
  sousTitre: d => couper([txt(d, 'mandatNumero') ? `Mandat n° ${txt(d, 'mandatNumero')}` : '', ...changements(d)].filter(Boolean).join(' · '), 120),
  pour: nomMandant,
  rediger,
  resume,
  garde: d => ({
    titre: 'Avenant',
    sous: `au mandat de recherche ${nomMandat(d)}`,
    etiquette: `AVENANT N° ${num(d, 'avenantNo') || 1}${txt(d, 'mandatNumero') ? ` · MANDAT N° ${txt(d, 'mandatNumero')}` : ''}`,
    pour: 'ÉTABLI POUR',
    ics: ['doc', 'loupe', 'plume', 'check'],
  }),
  entete: d => `Avenant n° ${num(d, 'avenantNo') || 1} au mandat${txt(d, 'mandatNumero') ? ` n° ${txt(d, 'mandatNumero')}` : ''}`,
  manques,
  badge: () => 'Avenant',
  reperes,
  lien: 'mandat',
  deriver: { de: ['mandat_recherche', 'mandat_en_ligne'], fn: deriver },
  enchainer,
  preparer,
  surRecherche,
  cases: casesAvenant,
  accepter: () => 'J’ai lu l’avenant en entier et je l’accepte.',
};
