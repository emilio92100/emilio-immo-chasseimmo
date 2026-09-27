/* ═══ L'avenant au mandat de vente ════════════════════════════════════════
   Un mandat signé ne se réécrit pas : on le modifie par un avenant, signé
   par les mêmes parties. Les cas courants : le prix (une baisse, le plus
   souvent), les honoraires, la durée (une prolongation), ou autre chose.
   Tout le reste du mandat reste inchangé.

   Il part d'un mandat de vente finalisé (Nouveau document › Avenant, ou
   « Préparer un avenant » depuis la fiche du mandat) : vendeurs, bien,
   numéro, date, prix et honoraires sont repris ; seul ce qui change est à
   saisir.

   Signé hors de l'agence ou à distance, un avenant est un contrat comme un
   autre : il ouvre le droit de rétractation, avec le formulaire, quel que
   soit son objet (relecture du 27 septembre 2026). Un mandat terminé ne se
   prolonge pas par avenant, et un mandat simple ne devient pas exclusif par
   avenant : dans les deux cas, un nouveau mandat, avec un nouveau numéro.

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre
   avant le premier usage. */

import { euros, BAREME_VENTE, type Partie, type Bloc, type Fiche, type Resume } from '@/lib/mandat';
import { lignesMandataire, phraseFonds, type IdentiteAgence } from '@/lib/agence';
import {
  P, Pp, eurosLettres, nbLettres, pourcent, jourLong, aujourdhui, txt, num, liste, lignes, plusMois, couper,
  nomComplet, nomsCourts, fichePersonne, ficheAgence, blocDonnees, formulaireType,
  type Donnees, type Modele, type Etape, type Contexte, type Repere, type Source,
} from './commun';
import { TYPES, typeDe, argent, vendeursDe, aConjoint, ACTIONS, RYTHMES, baseTantiemes, tantiemes, iconeLot } from './mandat-vente';

/* Les réponses reprises du mandat d'origine. */
const REPRIS = ['qui', 'situation', 'logementFamille', 'conjoint', 'lien', 'regime', 'vendeurs', 'represente',
  'sciNom', 'sciForme', 'sciSiege', 'sciRcs', 'sciPouvoir', 'adresse', 'cp', 'ville', 'type',
  'nature', 'copro', 'description', 'lots', 'tantiemesBase', 'actions', 'rythme', 'penale',
  'charge', 'honoMode', 'taux', 'forfait', 'prix', 'duree', 'dureeMode', 'periode', 'dureeMax'];

const change = (d: Donnees, k: string) => liste(d, 'objets').includes(k);
const nomMandant = (d: Donnees) => (d.qui === 'sci' ? txt(d, 'sciNom') || 'La société' : nomsCourts(vendeursDe(d)));
const adresseBien = (d: Donnees) => [txt(d, 'adresse'), [txt(d, 'cp'), txt(d, 'ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
/* Signé hors de l'agence ou à distance : droit de rétractation. */
const retractation = (d: Donnees) => d.lieu === 'domicile' || d.lieu === 'distance';
const estCopro = (d: Donnees) => d.nature !== 'terrain' && d.copro === 'oui';

/* L'argent au nouveau prix, avec les honoraires du mandat ou les nouveaux. */
function argentNouveau(d: Donnees) {
  const h = change(d, 'honoraires');
  return argent({
    prix: change(d, 'prix') ? d.nouveauPrix : d.prix,
    charge: h ? d.charge2 : d.charge,
    honoMode: h ? d.honoMode2 : d.honoMode,
    taux: h ? d.taux2 : d.taux,
    forfait: h ? d.forfait2 : d.forfait,
  });
}

/* ══ Les questions ══════════════════════════════════════════════════════ */
const ETAPES: Etape[] = [
  {
    id: 'mandat', titre: 'Le mandat', sous: 'Repris du mandat signé : vérifie, c’est tout.', vers: 'Entre les soussignés', ic: 'doc',
    champs: [
      { t: 'texte', cle: 'mandatNumero', lib: 'N° du mandat', ic: 'livre', requis: true },
      { t: 'date', cle: 'mandatDate', lib: 'Signé le', ic: 'calendrier', requis: true },
      { t: 'choix', cle: 'type', lib: 'Mandat', ic: 'cadenas', options: [
        { v: 'simple', l: 'Simple' }, { v: 'semi', l: 'Semi-exclusif' }, { v: 'exclusif', l: 'Exclusif' },
      ] },
      { t: 'nombre', cle: 'avenantNo', lib: 'Avenant n°', ic: 'plume', aide: 'Le premier avenant à ce mandat : 1. Le suivant : 2.' },
      { t: 'titre', cle: 't-v', lib: 'Les vendeurs', ic: 'personne' },
      { t: 'choix', cle: 'qui', lib: 'Qui vend ?', options: [
        { v: 'personne', l: 'Une personne' }, { v: 'couple', l: 'Un couple' }, { v: 'indivision', l: 'Plusieurs propriétaires' }, { v: 'sci', l: 'Une société' },
      ] },
      { t: 'texte', cle: 'sciNom', lib: 'Nom de la société', si: d => d.qui === 'sci' },
      { t: 'personnes', cle: 'vendeurs', lib: 'Les vendeurs', un: 'Vendeur', min: 1, max: 6,
        bornes: d => (d.qui === 'couple' ? { min: 2, max: 2 } : d.qui === 'indivision' ? { min: 2, max: 6 } : { min: 1, max: 1 }),
        nomCarte: (d, i) => (d.qui === 'sci' ? 'Le gérant qui signe' : d.qui === 'personne' ? 'Le vendeur' : `Vendeur ${i + 1}`),
        ajouter: () => 'Ajouter un vendeur' },
      { t: 'texte', cle: 'conjoint', lib: 'Le conjoint, qui avait donné son accord', ic: 'couple', large: true, si: aConjoint,
        aide: 'Le bien est le logement de la famille : le conjoint signe aussi l’avenant.' },
      { t: 'titre', cle: 't-b', lib: 'Le bien', ic: 'maison' },
      { t: 'texte', cle: 'adresse', lib: 'Adresse', ic: 'lieu', large: true, requis: true },
      { t: 'texte', cle: 'cp', lib: 'Code postal' },
      { t: 'texte', cle: 'ville', lib: 'Ville', requis: true },
    ],
  },
  {
    id: 'changements', titre: 'Ce qui change', sous: 'Coche ce qui change : le reste du mandat ne bouge pas.', vers: 'Il a été convenu ce qui suit', reperesApres: 'autreTexte', ic: 'plume',
    champs: [
      { t: 'cases', cle: 'objets', lib: 'L’avenant modifie', options: [
        { v: 'prix', l: 'Le prix', ic: 'etiquette' }, { v: 'honoraires', l: 'Les honoraires', ic: 'euro' },
        { v: 'duree', l: 'La durée', ic: 'calendrier' }, { v: 'bien', l: 'Le bien, les lots', ic: 'lots' },
        { v: 'engagements', l: 'Tes actions', ic: 'etoile' }, { v: 'autre', l: 'Autre chose', ic: 'plume' },
      ] },
      { t: 'guide', cle: 'g-av', si: d => change(d, 'autre'), titre: () => 'Un avenant ne change pas tout', points: () => [
        { ic: 'cadenas', x: 'Passer d’un mandat simple à un mandat exclusif (ou semi-exclusif) : signe un nouveau mandat, avec un nouveau numéro de registre.' },
        { ic: 'calendrier', x: 'Un mandat déjà terminé ne se prolonge pas : il faut un nouveau mandat.' },
      ] },
      { t: 'titre', cle: 't-prix', lib: 'Le prix', ic: 'etiquette', si: d => change(d, 'prix') },
      { t: 'euros', cle: 'prix', lib: 'Prix actuel', si: d => change(d, 'prix'), aide: 'Celui du mandat (ou du dernier avenant).' },
      { t: 'euros', cle: 'nouveauPrix', lib: 'Nouveau prix de présentation', ic: 'etiquette', requis: true, si: d => change(d, 'prix') },
      { t: 'titre', cle: 't-hono', lib: 'Les honoraires', ic: 'euro', si: d => change(d, 'honoraires') },
      { t: 'choix', cle: 'charge2', lib: 'À la charge', si: d => change(d, 'honoraires'), options: [
        { v: 'acquereur', l: 'De l’acquéreur' }, { v: 'vendeur', l: 'Du vendeur' },
      ] },
      { t: 'choix', cle: 'honoMode2', lib: 'Honoraires', si: d => change(d, 'honoraires'), options: [{ v: 'taux', l: 'Un pourcentage' }, { v: 'forfait', l: 'Un forfait' }] },
      { t: 'nombre', cle: 'taux2', lib: 'Nouveau taux', ic: 'pourcent', unite: '% TTC', si: d => change(d, 'honoraires') && d.honoMode2 !== 'forfait' },
      { t: 'euros', cle: 'forfait2', lib: 'Nouveau forfait', unite: '€ TTC', si: d => change(d, 'honoraires') && d.honoMode2 === 'forfait' },
      { t: 'titre', cle: 't-duree', lib: 'La durée', ic: 'calendrier', si: d => change(d, 'duree') },
      { t: 'date', cle: 'finActuelle', lib: 'Il devait finir le', si: d => change(d, 'duree') },
      { t: 'date', cle: 'finNouvelle', lib: 'Il finira le', ic: 'chrono', requis: true, si: d => change(d, 'duree') },
      { t: 'titre', cle: 't-bien', lib: 'Le bien', ic: 'maison', si: d => change(d, 'bien') },
      { t: 'zone', cle: 'description', lib: 'Description', large: true, si: d => change(d, 'bien'), aide: 'Reprise du mandat : corrige-la ou complète-la.' },
      { t: 'choix', cle: 'tantiemesBase', lib: 'Les tantièmes sont comptés sur', si: d => change(d, 'bien') && estCopro(d), options: [
        { v: '1000', l: '1 000 (millièmes)' }, { v: '10000', l: '10 000' }, { v: '100000', l: '100 000' },
      ] },
      { t: 'lignes', cle: 'lots', lib: 'Les lots vendus', un: 'Lot', max: 12, large: true, si: d => change(d, 'bien') && estCopro(d), icone: iconeLot, colonnes: [
        { cle: 'numero', lib: 'N° du lot', exemple: '12' },
        { cle: 'nature', lib: 'Ce que c’est', exemple: 'l’appartement, une cave, un parking…' },
        { cle: 'tantiemes', lib: 'Tantièmes', exemple: '145', nombre: true, suffixe: d => `/ ${baseTantiemes(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}` },
      ], aide: 'La liste complète après l’avenant (elle remplace celle du mandat).' },
      { t: 'titre', cle: 't-eng', lib: 'Tes actions', ic: 'etoile', si: d => change(d, 'engagements') },
      { t: 'cases', cle: 'actions', lib: 'Ce que tu t’engages à faire désormais', si: d => change(d, 'engagements'), options: ACTIONS.map(a => ({ v: a.v, l: a.l, ic: a.ic })) },
      { t: 'choix', cle: 'rythme', lib: 'Comptes rendus', ic: 'horloge', si: d => change(d, 'engagements'), options: Object.entries(RYTHMES).map(([v, l]) => ({ v, l: l.charAt(0).toUpperCase() + l.slice(1) })) },
      { t: 'titre', cle: 't-autre', lib: 'Autre chose', ic: 'plume', si: d => change(d, 'autre') },
      { t: 'zone', cle: 'autreTexte', lib: 'La modification', large: true, requis: true, si: d => change(d, 'autre'),
        exemple: 'Le MANDANT autorise désormais la pose d’un panneau « À vendre ».', aide: 'Imprimée telle quelle.' },
    ],
  },
  {
    id: 'signature', titre: 'Signature', sous: 'Où et quand il sera signé.', vers: 'Date et signatures', ic: 'plume',
    champs: [
      { t: 'choix', cle: 'lieu', lib: 'Où sera-t-il signé ?', tuiles: true, options: [
        { v: 'agence', l: 'À l’agence', ic: 'agence' }, { v: 'domicile', l: 'Chez le vendeur', ic: 'maison' }, { v: 'distance', l: 'À distance', ic: 'ecran' },
      ], aide: 'Hors de l’agence ou à distance, l’avenant ouvre 14 jours de rétractation : il le dit, avec le formulaire.' },
      { t: 'choix', cle: 'execution', lib: 'Appliquer avant la fin des 14 jours ?', si: retractation, options: [
        { v: 'oui', l: 'Oui, il le demande' }, { v: 'non', l: 'Non, il attend' }, { v: '', l: 'Il cochera sur place' },
      ] },
      { t: 'texte', cle: 'faitA', lib: 'Fait à', ic: 'lieu', requis: true },
      { t: 'date', cle: 'date', lib: 'Le', ic: 'calendrier', requis: true },
    ],
  },
];

/* ══ Le texte ═══════════════════════════════════════════════════════════ */
function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const T = TYPES[typeDe(d)];
  const vs = vendeursDe(d);
  const no = num(d, 'avenantNo') || 1;
  const numero = txt(d, 'mandatNumero');
  const adresse = adresseBien(d);
  const retr = retractation(d);

  const fiches: Fiche[] = d.qui === 'sci'
    ? [{ ic: 'agence', titre: (txt(d, 'sciNom') || 'La société').toUpperCase(), lignes: [
      txt(d, 'sciSiege') ? `Siège : ${txt(d, 'sciSiege')}` : '', txt(d, 'sciRcs'), `Représentée par ${nomComplet(vs[0])}.`,
    ].filter(Boolean), pied: 'Ci-après « le MANDANT »' }]
    : vs.map((p, i) => fichePersonne(p, 'personne', i === vs.length - 1 ? (vs.length > 1 ? 'Ci-après ensemble « le MANDANT »' : 'Ci-après « le MANDANT »') : undefined));
  fiches.push(ficheAgence(A, lignesMandataire(A), phraseFonds(A), 'Ci-après « l’Agence » ou « le MANDATAIRE »'));
  const entre: Bloc[] = [{ t: 'fiches', items: fiches }];
  if (aConjoint(d)) entre.push(P(`Le bien constituant le logement de la famille, ${txt(d, 'conjoint') || '……………'}, conjoint du MANDANT, intervient au présent avenant pour y donner son accord (article 215 du Code civil).`));

  const sections: Partie['sections'] = [
    { titre: 'Entre les soussignés', blocs: entre },
    { titre: 'Il a été convenu ce qui suit', blocs: [
      P(`Par un mandat de vente ${T.nom}${numero ? ` n° ${numero}` : ' n° ……'}, signé le ${txt(d, 'mandatDate') ? jourLong(txt(d, 'mandatDate')) : '……………'}, le MANDANT a confié au MANDATAIRE la mission de rechercher un acquéreur pour le bien situé ${adresse || '……………'}. Les parties conviennent de modifier ce mandat comme suit.`, true),
    ] },
  ];

  const a = argentNouveau(d);
  if (change(d, 'prix')) {
    const ancien = num(d, 'prix'), nouveau = num(d, 'nouveauPrix');
    const blocs: Bloc[] = [];
    if (nouveau) {
      const verbe = ancien && nouveau < ancien ? 'ramené' : 'porté';
      blocs.push(P(`Le prix de présentation${ancien ? `, fixé jusqu’ici à ${euros(ancien)},` : ''} est ${verbe} à ${eurosLettres(nouveau)}${a.charge === 'acquereur' ? ', honoraires de l’Agence compris' : ''}.`, true));
      if (a.charge === 'acquereur' && a.net) blocs.push(P(`Soit un prix net revenant au MANDANT de ${euros(a.net)}.`));
      if (!change(d, 'honoraires') && a.honoraires !== null) blocs.push(P(`Les honoraires de l’Agence, calculés comme prévu au mandat, s’établissent à ${euros(a.honoraires)} TTC à ce prix, à la charge ${a.charge === 'acquereur' ? 'de l’acquéreur' : 'du MANDANT'}.`));
      blocs.push(P('Toute indemnité prévue au mandat et égale aux honoraires (clause de suite, clause pénale) est calculée sur les honoraires ainsi recalculés.'));
    } else blocs.push(P('Nouveau prix de présentation : à compléter.', true));
    sections.push({ titre: 'Prix', ic: 'etiquette', blocs });
  }
  if (change(d, 'honoraires')) {
    const combien = a.forfait
      ? `un forfait de ${eurosLettres(a.forfait)} TTC`
      : a.taux !== null ? `${pourcent(a.taux)} TTC du ${a.charge === 'acquereur' ? 'prix net vendeur' : 'prix de vente'}${a.honoraires ? `, soit ${euros(a.honoraires)} TTC au prix de présentation` : ''}` : 'à préciser';
    sections.push({ titre: 'Honoraires', ic: 'euro', blocs: [
      P(`Les honoraires de l’Agence sont désormais de ${combien}, à la charge ${a.charge === 'acquereur' ? 'de l’acquéreur' : 'du MANDANT'}.`, true),
      P('Ils restent dus dans les conditions prévues au mandat : aucune somme n’est due, ni ne peut être versée à l’Agence, avant la signature de l’acte authentique (l’article 6 de la loi du 2 janvier 1970 interdit tout versement avant que l’opération soit effectivement conclue).'),
    ] });
  }
  if (change(d, 'duree')) {
    const fin = txt(d, 'finNouvelle');
    sections.push({ titre: 'Durée', ic: 'calendrier', blocs: [
      P(`Le mandat est prolongé : il prendra fin le ${fin ? jourLong(fin) : '……………'}${txt(d, 'finActuelle') ? `, au lieu du ${jourLong(txt(d, 'finActuelle'))}` : ''}.`, true),
      P('Passé les trois premiers mois du mandat, chaque partie conserve la faculté d’y mettre fin à tout moment, par lettre recommandée avec avis de réception et avec un préavis de quinze jours (article 78 du décret du 20 juillet 1972).'),
    ] });
  }
  if (change(d, 'bien')) {
    const lots = estCopro(d) ? lignes(d, 'lots') : [];
    sections.push({ titre: 'Le bien', ic: 'maison', blocs: [
      P(`La désignation du bien est désormais la suivante : ${txt(d, 'description') || 'à compléter'}${/[.!?]$/.test(txt(d, 'description')) ? '' : '.'}`, true),
      ...(lots.length ? [
        P(`Il comprend ${lots.length > 1 ? `les ${nbLettres(lots.length)} lots suivants` : 'le lot suivant'}, qui remplace${lots.length > 1 ? 'nt' : ''} ceux désignés au mandat :`),
        { t: 'l' as const, items: lots.map(l => `Lot n° ${l.numero || '…'}${l.nature ? ` : ${l.nature}` : ''}${l.tantiemes ? `, et les ${tantiemes(d, l.tantiemes)} des parties communes générales` : ''}.`) },
      ] : []),
    ] });
  }
  if (change(d, 'engagements')) {
    const acts = ACTIONS.filter(x => liste(d, 'actions').includes(x.v));
    sections.push({ titre: 'Engagements de l’Agence', ic: 'etoile', blocs: [
      P('Les engagements de l’Agence prévus au mandat sont remplacés par les suivants. Le MANDATAIRE s’engage à :', true),
      { t: 'etapes', items: [
        ...acts.map(x => ({ titre: x.titre, x: x.x })),
        { titre: 'Rendre compte', x: `Informer le MANDANT de chaque visite et de ses suites, et lui adresser un compte rendu écrit de ses actions ${RYTHMES[String(d.rythme)] || RYTHMES.semaine}.` },
      ] },
    ] });
  }
  if (change(d, 'autre')) sections.push({ titre: 'Autre modification', ic: 'plume', blocs: [P(txt(d, 'autreTexte') || 'À compléter.')] });
  sections.push({ titre: 'Le reste du mandat', ic: 'doc', blocs: [
    P(`Toutes les autres clauses du mandat demeurent inchangées. Le présent avenant en fait partie intégrante et se rattache à son numéro d’inscription au registre des mandats de l’Agence${numero ? ` (n° ${numero})` : ''}.`),
  ] });
  if (retr) {
    const ex = d.execution === 'oui' ? true : d.execution === 'non' ? false : null;
    sections.push({ titre: 'Droit de rétractation', ic: 'retour', blocs: [
      P(`Le présent avenant étant signé ${d.lieu === 'distance' ? 'à distance' : 'hors des locaux de l’Agence'}, le MANDANT peut se rétracter sans avoir à se justifier pendant ${nbLettres(14)} jours à compter du lendemain de sa signature (délai prolongé jusqu’au premier jour ouvrable s’il finit un samedi, un dimanche ou un jour férié), par une déclaration écrite dénuée d’ambiguïté — lettre, e-mail, ou le formulaire joint — adressée à l’Agence, ${A.adresse}, ${A.cp} ${A.ville}, ${A.mail}. Le mandat continue alors aux conditions d’avant l’avenant.`, true),
      { t: 'case', coche: ex === true, x: 'Le MANDANT DEMANDE que l’avenant s’applique dès sa signature, sans attendre la fin du délai de rétractation.' },
      { t: 'case', coche: ex === false, x: 'Le MANDANT préfère que l’avenant s’applique à la fin du délai de rétractation.' },
    ] });
  }
  sections.push({ titre: 'Informations', ic: 'info', blocs: [
    blocDonnees(A),
    Pp(`Textes applicables : loi n° 70-9 du 2 janvier 1970 (dite loi Hoguet) et décret n° 72-678 du 20 juillet 1972${retr ? ' ; Code de la consommation (art. L221-5, L221-18 et suivants)' : ''}. Le présent avenant est soumis à la loi française.`),
  ] });
  const repr = d.qui === 'couple' && (d.represente === '0' || d.represente === '1') ? Number(d.represente) : -1;
  const nbEx = (d.qui === 'sci' ? 1 : repr >= 0 ? 1 : vs.length) + 1 + (aConjoint(d) ? 1 : 0);
  sections.push({ titre: 'Date et signatures', ic: 'plume', blocs: [
    P(`Fait à ${txt(d, 'faitA') || '……………'}, le ${txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………'}, en ${nbLettres(nbEx)} exemplaires originaux, dont un remis à chaque partie.`),
    Pp('Mots rayés nuls : ______   ·   Lignes rayées nulles : ______'),
    { t: 'sigs', mention: 'Chaque signataire date et signe, précédé de la mention manuscrite « Lu et approuvé ».', cases: [
      ...(d.qui === 'sci'
        ? [{ qui: 'Le mandant', nom: txt(d, 'sciNom') || 'La société', lignes: [`Représentée par ${nomComplet(vs[0])}`] }]
        : vs.map(p => ({ qui: 'Le mandant', nom: nomComplet(p), lignes: [] as string[] }))
          .filter((_, i) => repr < 0 || i === repr)
          .map(c => (repr >= 0 ? { ...c, lignes: [`En son nom et pour ${nomComplet(vs[1 - repr])}, par procuration`] } : c))),
      ...(aConjoint(d) ? [{ qui: 'Le conjoint', nom: txt(d, 'conjoint') || '……………', lignes: ['Pour accord (article 215 du Code civil)'] }] : []),
      { qui: 'Le mandataire', nom: A.nom.toUpperCase(), lignes: [`Représentée par ${A.signataireNom}, ${A.signataireQualite}`] },
    ] },
  ] });

  const parties: Partie[] = [{
    titre: `Avenant n° ${no} au mandat de vente${numero ? ` n° ${numero}` : ''}`,
    court: 'L’avenant',
    sous: `Au mandat ${T.nom}${txt(d, 'mandatDate') ? ` du ${jourLong(txt(d, 'mandatDate'))}` : ''}`,
    ic: 'doc',
    sections,
  }];
  if (retr) parties.push(formulaireType(A, {
    contrat: `avenant n° ${no} au mandat de vente${numero ? ` n° ${numero}` : ''}, pour le bien situé ${adresse || '……………'}`,
    conclu: txt(d, 'date') ? jourLong(txt(d, 'date')) : '',
    noms: d.qui === 'sci' ? txt(d, 'sciNom') : vs.map(nomComplet).join(', '),
    adresse: d.qui === 'sci' ? txt(d, 'sciSiege') : vs[0]?.adresse || '',
  }));
  return parties;
}

/* « Prix : 640 000 € · Durée : jusqu’au 30 juin 2027 » */
function changements(d: Donnees): string[] {
  const a = argentNouveau(d);
  const out: string[] = [];
  if (change(d, 'prix')) out.push(`Prix : ${num(d, 'nouveauPrix') ? euros(num(d, 'nouveauPrix') || 0) : '…'}`);
  if (change(d, 'honoraires')) out.push(`Honoraires : ${a.forfait ? `${euros(a.forfait)} TTC` : a.taux !== null ? `${pourcent(a.taux)} TTC` : '…'}`);
  if (change(d, 'duree')) out.push(`Fin : ${txt(d, 'finNouvelle') ? jourLong(txt(d, 'finNouvelle')) : '…'}`);
  if (change(d, 'bien')) out.push('Le bien');
  if (change(d, 'engagements')) out.push('Les actions de l’agence');
  if (change(d, 'autre')) out.push('Autre modification');
  return out;
}

function resume(d: Donnees): Resume {
  const ch = changements(d);
  return [
    { titre: 'Le mandat', valeur: txt(d, 'mandatNumero') ? `N° ${txt(d, 'mandatNumero')}` : 'À compléter', detail: `mandat ${TYPES[typeDe(d)].nom}${txt(d, 'mandatDate') ? `, signé le ${jourLong(txt(d, 'mandatDate'))}` : ''}` },
    { titre: 'Le bien', valeur: txt(d, 'adresse') || 'À compléter', detail: txt(d, 'ville') || '—' },
    { titre: 'Ce qui change', valeur: ch[0] || 'À compléter', detail: ch.slice(1).join(' · ') || '—' },
    { titre: 'Le reste', valeur: 'Inchangé', detail: 'toutes les autres clauses du mandat' },
  ];
}

function reperes(d: Donnees, etape: string): Repere[] {
  const out: Repere[] = [];
  if (etape !== 'changements') return out;
  const a = argentNouveau(d);
  if ((change(d, 'prix') || change(d, 'honoraires')) && a.prix) {
    out.push({ l: 'Prix de présentation', v: euros(a.prix) });
    if (a.honoraires !== null) out.push({ l: a.forfait ? 'Honoraires (forfait)' : `Honoraires (${pourcent(a.taux || 0)} TTC)`, v: euros(a.honoraires) });
    if (a.net !== null) out.push({ l: 'Net vendeur', v: euros(a.net), ton: 'ok' });
    if (!a.forfait && a.taux !== null && a.taux > BAREME_VENTE) out.push({ l: 'Au-dessus de ton barème', v: `Ton barème affiché est de ${pourcent(BAREME_VENTE)} TTC au plus.`, ton: 'alerte' });
  }
  if (change(d, 'duree') && txt(d, 'finNouvelle') && txt(d, 'finActuelle') && txt(d, 'finNouvelle') <= txt(d, 'finActuelle')) {
    out.push({ l: 'Durée', v: 'La nouvelle fin doit venir après l’ancienne.', ton: 'alerte' });
  }
  if (!liste(d, 'objets').length) out.push({ l: 'Rien à modifier', v: 'Coche au moins une modification.', ton: 'alerte' });
  return out;
}

function manques(d: Donnees): string[] {
  const out: string[] = [];
  if (!txt(d, 'mandatNumero') || !txt(d, 'mandatDate')) out.push('Le numéro et la date du mandat');
  vendeursDe(d).forEach((p, i, l) => { if (!p.nom || !p.prenom) out.push(`Le nom ${l.length > 1 ? `du vendeur ${i + 1}` : d.qui === 'sci' ? 'du gérant' : 'du vendeur'}`); });
  if (d.qui === 'sci' && !txt(d, 'sciNom')) out.push('Le nom de la société');
  if (aConjoint(d) && !txt(d, 'conjoint')) out.push('Le nom du conjoint');
  if (!txt(d, 'adresse') || !txt(d, 'ville')) out.push('L’adresse du bien');
  if (!liste(d, 'objets').length) out.push('Ce que l’avenant modifie');
  if (change(d, 'prix') && !num(d, 'nouveauPrix')) out.push('Le nouveau prix');
  else if (change(d, 'prix') && num(d, 'nouveauPrix') === num(d, 'prix')) out.push('Un nouveau prix différent du prix actuel');
  if (change(d, 'honoraires') && (d.honoMode2 === 'forfait' ? !num(d, 'forfait2') : num(d, 'taux2') === null)) out.push('Les nouveaux honoraires');
  if (change(d, 'duree') && !txt(d, 'finNouvelle')) out.push('La nouvelle date de fin');
  if (change(d, 'autre') && !txt(d, 'autreTexte')) out.push('La modification à écrire');
  if (change(d, 'bien') && !txt(d, 'description')) out.push('La description du bien');
  if (change(d, 'engagements') && typeDe(d) === 'exclusif' && !liste(d, 'actions').length) out.push('Au moins une action (obligatoire pour un mandat exclusif)');
  if (txt(d, 'finActuelle') && txt(d, 'date') && txt(d, 'date') >= txt(d, 'finActuelle')) out.push(`Un mandat en cours : celui-ci a pris fin le ${jourLong(txt(d, 'finActuelle'))}, il faut en signer un nouveau`);
  if (!txt(d, 'faitA') || !txt(d, 'date')) out.push('Le lieu et la date de signature');
  return out;
}

function defaut(c: Contexte): Donnees {
  const cl = c.client;
  const b = c.bien;
  return {
    mandatNumero: '', mandatDate: '', type: 'exclusif', avenantNo: 1,
    qui: 'personne', vendeurs: [{ civilite: '', prenom: cl?.prenom || '', nom: cl?.nom || '', nomNaissance: '', naissanceDate: '', naissanceLieu: '', adresse: cl?.adresse || '', email: cl?.emails?.[0] || '', telephone: cl?.telephones?.[0] || '' }],
    adresse: b?.adresse || '', cp: b?.code_postal || '', ville: b?.ville || '',
    charge: 'acquereur', honoMode: 'taux', taux: BAREME_VENTE, prix: b?.prix_acquereur || null,
    objets: ['prix'], nouveauPrix: null, charge2: 'acquereur', honoMode2: 'taux', taux2: BAREME_VENTE, forfait2: null,
    finActuelle: '', finNouvelle: '', autreTexte: '',
    lieu: 'agence', execution: '', faitA: c.identite.ville, date: aujourdhui(),
  };
}

/* Depuis le mandat : tout ce qu'il savait, et sa date de fin actuelle. */
function deriver(src: Source): Donnees {
  const s = src.donnees || {};
  const out: Donnees = {};
  for (const k of REPRIS) if (k in s) out[k] = s[k];
  const jour = String(src.signe_le || s.date || '').slice(0, 10);
  const total = s.dureeMode === 'prorogation' ? (num(s, 'dureeMax') ?? 12) : (num(s, 'duree') ?? 3);
  return {
    ...out,
    mandatNumero: src.numero || txt(s, 'numero'), mandatDate: jour,
    nouveauPrix: null, charge2: s.charge || 'acquereur', honoMode2: s.honoMode || 'taux', taux2: s.taux ?? null, forfait2: s.forfait ?? null,
    finActuelle: /^\d{4}-\d{2}-\d{2}$/.test(jour) ? plusMois(jour, total) : '',
    finNouvelle: /^\d{4}-\d{2}-\d{2}$/.test(jour) ? plusMois(jour, total + 3) : '',
  };
}

/* Un avenant déjà signé à ce mandat : son prix, ses honoraires, sa date de
   fin deviennent la situation actuelle du suivant. */
function enchainer(d: Donnees, a: Donnees): Donnees {
  const x: Donnees = { ...d };
  const ch = (k: string) => liste(a, 'objets').includes(k);
  if (ch('prix') && num(a, 'nouveauPrix')) x.prix = num(a, 'nouveauPrix');
  if (ch('honoraires')) {
    x.charge = a.charge2; x.honoMode = a.honoMode2; x.taux = a.taux2; x.forfait = a.forfait2;
    x.charge2 = a.charge2; x.honoMode2 = a.honoMode2; x.taux2 = a.taux2; x.forfait2 = a.forfait2;
  }
  if (ch('duree') && txt(a, 'finNouvelle')) { x.finActuelle = txt(a, 'finNouvelle'); x.finNouvelle = plusMois(txt(a, 'finNouvelle'), 3); }
  if (ch('bien')) { x.description = a.description; x.lots = a.lots; x.tantiemesBase = a.tantiemesBase; }
  if (ch('engagements')) { x.actions = a.actions; x.rythme = a.rythme; }
  return x;
}

export const AVENANT_VENTE: Modele = {
  id: 'avenant_vente',
  categorie: 'mandats_vente',
  titre: 'Avenant au mandat de vente',
  description: 'Baisse de prix, honoraires, prolongation : il reprend le mandat signé et ne change que ce que tu coches.',
  ic: 'plume',
  signataires: 'Les mêmes signataires que le mandat',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Avenant n° ${num(d, 'avenantNo') || 1} · ${nomMandant(d)}`,
  sousTitre: d => couper([txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ') + (changements(d).length ? ` · ${changements(d).join(' · ')}` : ''), 120),
  pour: nomMandant,
  rediger,
  resume,
  garde: d => ({
    titre: 'Avenant',
    sous: `au mandat de vente ${TYPES[typeDe(d)].nom}`,
    etiquette: `AVENANT N° ${num(d, 'avenantNo') || 1}${txt(d, 'mandatNumero') ? ` · MANDAT N° ${txt(d, 'mandatNumero')}` : ''}`,
    pour: 'ÉTABLI POUR',
    ics: ['doc', 'maison', 'plume', 'check'],
  }),
  entete: d => `Avenant n° ${num(d, 'avenantNo') || 1} au mandat${txt(d, 'mandatNumero') ? ` n° ${txt(d, 'mandatNumero')}` : ''}`,
  manques,
  badge: () => 'Avenant',
  reperes,
  lien: 'mandat',
  deriver: { de: ['mandat_vente'], fn: deriver },
  enchainer,
};
