/* ═══ La délégation de mandat (V3.18, confrère des contacts en V3.19) ══════
   Alexandre confie tout ou partie d'un mandat signé à un confrère : un
   autre professionnel titulaire de la carte « Transactions sur immeubles et
   fonds de commerce ». C'est un contrat entre professionnels, signé par le
   confrère et par l'agence ; le mandant ne signe pas.

   Il part d'un mandat signé (sa fiche › « Déléguer à un confrère », ou
   Nouveau document › Délégation) : numéro, date, type, mandants, bien,
   prix et honoraires sont repris, avenants signés compris. Restent à
   saisir : le confrère, la mission, la durée, le partage des honoraires.

   Trois règles :
   · le mandat doit autoriser la délégation (la clause des pouvoirs, cochée
     d'office depuis la V3.18 ; le mandat en ligne l'a toujours eue) :
     sinon, un avenant d'abord ;
   · la délégation ne dure pas plus longtemps que le mandat ;
   · elle ne prend pas de numéro au registre des mandats : elle s'inscrit en
     observation sur la ligne du mandat, à sa signature.

   Le confrère peut venir de tes contacts (sa fiche › « Déléguer un mandat »,
   ou le choix dans Nouveau document) : ses coordonnées se remplissent, et
   ce que la délégation dit de sa société est gardé sur sa fiche pour la
   suivante (`depuisConfrere`, `juridiqueDepuis`). Elle est rangée sur la
   fiche du mandant et listée sur celle du confrère (`donnees.confrereId`).

   Jamais montrée au client dans son espace (`interne`) : elle dit comment
   les honoraires se partagent.

   ⚠️ Texte écrit pour Emilio à partir de la loi (loi n° 70-9 du 2 janvier
   1970, décret n° 72-678 du 20 juillet 1972, articles 1984 et suivants du
   Code civil), rien n'est repris d'un éditeur de formulaires. À faire
   relire par l'avocat d'Alexandre avant le premier usage. */

import { euros, type Partie, type Bloc, type Fiche, type Resume } from '@/lib/mandat';
import { lignesMandataire, phraseFonds, type IdentiteAgence } from '@/lib/agence';
import {
  P, Pp, eurosLettres, pourcent, jourLong, aujourdhui, txt, num, liste, plusMois, couper,
  nomComplet, lirePersonnes, ficheAgence, blocsSignature, manquesSignature, CHAMP_SIGNATURE, HONO_MODES, PERSONNE_VIDE,
  type Donnees, type Modele, type Etape, type Contexte, type Repere, type Source, type CaseSignature, type Personne,
} from './commun';
import { TYPES as TYPES_VENTE, typeDe, argent as argentVente, registreVente, objetVente } from './mandat-vente';
import { registreRecherche, objetRecherche, argentRecherche } from './mandat-recherche';
import { lirePro, type Juridique } from '@/lib/contacts';

/* Ce qu'on reprend du mandat, pour le décrire et rappeler ses conditions. */
const REPRIS_VENTE = ['qui', 'situation', 'lien', 'vendeurs', 'sciNom', 'sciForme', 'sciSiege', 'sciRcs',
  'adresse', 'cp', 'ville', 'type', 'nature', 'copro', 'description', 'lots', 'tantiemesBase', 'tantiemesTotal',
  'charge', 'honoMode', 'taux', 'forfait', 'prix', 'duree', 'dureeMode', 'periode', 'dureeMax'];
const REPRIS_RECHERCHE = ['qui', 'acquereurs', 'sciNom', 'sciForme', 'sciSiege', 'sciRcs',
  'types', 'typeAutre', 'pieces', 'chambres', 'surface', 'secteurs', 'criteres', 'usage',
  'type', 'prixMax', 'honoMode', 'taux', 'forfait', 'duree', 'dureeMode', 'periode', 'dureeMax'];

const vente = (d: Donnees) => d.sorte !== 'recherche';
const delegataire = (d: Donnees): Personne => lirePersonnes(d.delegataires)[0] || PERSONNE_VIDE;
const nomConfrere = (d: Donnees) => txt(d, 'confNom') || txt(d, 'confSociete');
const typeNom = (d: Donnees) => (vente(d) ? TYPES_VENTE[typeDe(d)].nom : d.type === 'exclusif' ? 'exclusif' : 'simple');
const part = (d: Donnees) => { const n = num(d, 'partage'); return n === null ? null : Math.min(100, Math.max(0, n)); };
const fmtPart = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/* Les missions qu'on peut déléguer, et ce que chacune veut dire selon le
   mandat (vendre un bien, ou en trouver un). */
const MISSIONS: { v: string; l: string; ic: string; vente: string; recherche: string }[] = [
  { v: 'prospecter', l: 'Chercher parmi ses clients', ic: 'groupe',
    vente: 'rechercher des acquéreurs, notamment parmi sa propre clientèle', recherche: 'rechercher des biens répondant à la recherche du MANDANT' },
  { v: 'visites', l: 'Faire visiter', ic: 'cle',
    vente: 'faire visiter le bien aux acquéreurs qu’il présente', recherche: 'organiser les visites des biens qu’il a trouvés, et y accompagner le MANDANT avec l’accord du DÉLÉGANT' },
  { v: 'offres', l: 'Recevoir les offres', ic: 'euro',
    vente: 'recueillir les offres de ses acquéreurs et les transmettre au DÉLÉGANT', recherche: 'recueillir les informations sur les biens trouvés (prix, diagnostics, conditions) et les transmettre au DÉLÉGANT' },
];

/* Ce à quoi le confrère s'engage (toutes cochées d'office). */
const ENGAGEMENTS: { v: string; l: string; ic: string }[] = [
  { v: 'prix', l: 'Respecter le prix et les conditions', ic: 'etiquette' },
  { v: 'bons', l: 'Un bon de visite à chaque visite', ic: 'doc' },
  { v: 'offres', l: 'Tout te transmettre, par écrit', ic: 'envoyer' },
  { v: 'sous', l: 'Ne pas déléguer à son tour', ic: 'rompu' },
  { v: 'contact', l: 'Ne pas contacter le client directement', ic: 'tel' },
];
const engage = (d: Donnees, k: string) => liste(d, 'engagements').includes(k);

/* ══ Les questions ══════════════════════════════════════════════════════ */
const ETAPES: Etape[] = [
  {
    id: 'mandat', titre: 'Le mandat délégué', court: 'Le mandat', sous: 'Repris du mandat signé : vérifie, c’est tout.', vers: 'Il est d’abord rappelé que', ic: 'doc',
    champs: [
      { t: 'guide', cle: 'g-autorise', si: d => d.autorise === 'non', titre: () => 'Ce mandat ne permet pas de déléguer',
        points: () => [
          { ic: 'plume', x: 'Fais d’abord signer au client un avenant qui t’autorise à déléguer (Avenant › Autre chose) : la délégation se fera ensuite.' },
          { ic: 'info', x: 'Les mandats faits dans le CRM depuis la V3.18 l’autorisent d’office, comme le mandat de recherche signé en ligne.' },
        ] },
      { t: 'choix', cle: 'sorte', lib: 'Un mandat de', ic: 'doc', tuiles: true, options: [
        { v: 'vente', l: 'Vente', aide: 'Un bien à vendre.', ic: 'maison' },
        { v: 'recherche', l: 'Recherche', aide: 'Un bien à trouver pour un acheteur.', ic: 'loupe' },
      ] },
      { t: 'texte', cle: 'mandatNumero', lib: 'N° du mandat', ic: 'livre', requis: true },
      { t: 'date', cle: 'mandatDate', lib: 'Signé le', ic: 'calendrier', requis: true },
      { t: 'choix', cle: 'type', lib: 'Mandat', ic: 'cadenas', options: [
        { v: 'simple', l: 'Simple', ic: 'ouvert' }, { v: 'semi', l: 'Semi-exclusif', ic: 'bouclier' }, { v: 'exclusif', l: 'Exclusif', ic: 'cadenas' },
      ] },
      { t: 'date', cle: 'finActuelle', lib: 'Il prend fin le', ic: 'chrono', requis: true, aide: 'Avenants compris. La délégation ne pourra pas aller au-delà.' },
      { t: 'choix', cle: 'autorise', lib: 'Le mandat t’autorise-t-il à déléguer ?', ic: 'accord', large: true, options: [
        { v: 'oui', l: 'Oui, il le prévoit', ic: 'check' }, { v: 'non', l: 'Non', ic: 'croix' },
      ], aide: 'La clause des pouvoirs : « déléguer tout ou partie de sa mission à un autre professionnel titulaire de la carte ».' },
    ],
  },
  {
    id: 'bien', titre: 'Ce que porte le mandat', court: 'Le bien', sous: 'Les mandants, le bien et ses conditions, tels que le confrère les lira.', vers: 'Il est d’abord rappelé que', reperesApres: 'forfait', ic: 'maison',
    champs: [
      { t: 'zone', cle: 'mandantsTexte', lib: 'Les mandants', ic: 'personne', large: true, requis: true, exemple: 'Monsieur Paul MARTIN, 12 rue des Lilas, 92100 Boulogne-Billancourt' },
      { t: 'zone', cle: 'objetTexte', lib: 'Le bien', ic: 'maison', large: true, requis: true, exemple: '12 rue des Lilas, 92100 Boulogne-Billancourt · appartement de 4 pièces au 3e étage',
        aide: 'Pour un mandat de recherche : le bien recherché (« Recherche : appartement de 3 pièces, Paris 16e… »).' },
      { t: 'titre', cle: 't-cond', lib: 'Le prix et les honoraires du mandat', ic: 'euro' },
      { t: 'euros', cle: 'prix', lib: 'Prix de présentation', ic: 'etiquette', requis: true, si: vente },
      { t: 'euros', cle: 'prixMax', lib: 'Prix d’achat maximum', ic: 'etiquette', si: d => !vente(d), aide: 'Hors honoraires.' },
      { t: 'choix', cle: 'charge', lib: 'Honoraires à la charge', ic: 'euro', si: vente, options: [
        { v: 'acquereur', l: 'De l’acquéreur', ic: 'cle' }, { v: 'vendeur', l: 'Du vendeur', ic: 'maison' },
      ] },
      { t: 'choix', cle: 'honoMode', lib: 'Honoraires', ic: 'euro', options: HONO_MODES },
      { t: 'nombre', cle: 'taux', lib: 'Taux', ic: 'pourcent', unite: '% TTC', si: d => d.honoMode !== 'forfait' },
      { t: 'euros', cle: 'forfait', lib: 'Forfait', ic: 'euro', unite: '€ TTC', si: d => d.honoMode === 'forfait' },
    ],
  },
  {
    id: 'confrere', titre: 'Le confrère', court: 'Le confrère', sous: 'L’agence à qui tu confies le mandat, sa carte et ses garanties.', vers: 'Entre les soussignés', ic: 'accord',
    champs: [
      /* Choisi dans les contacts (V3.19) : d'où viennent les réponses. */
      { t: 'guide', cle: 'g-fiche', si: d => !!txt(d, 'confrereId'), titre: d => `Repris de la fiche de ${txt(d, 'confrereNom') || 'ton contact'}`,
        points: d => [
          { ic: 'check', x: txt(d, 'confrereDe') ? `Sa société, sa carte et ses garanties viennent de la délégation du ${jourLong(txt(d, 'confrereDe'))} : vérifie qu’elles sont toujours à jour.` : 'Son agence, son adresse et ses coordonnées viennent de sa fiche. Complète le reste : ce sera gardé sur sa fiche pour la prochaine fois.' },
        ] },
      { t: 'guide', cle: 'g-mandataire', si: d => d.confStatut === 'mandataire', titre: () => 'Un mandataire n’a pas de carte à son nom',
        points: () => [
          { ic: 'carte', x: 'C’est son réseau (IAD, SAFTI, Capifrance…) qui détient la carte : mets la société du réseau, sa carte, sa garantie et son assurance.' },
          { ic: 'plume', x: 'Lui signe comme agent commercial habilité par le réseau : demande-lui son attestation d’habilitation.' },
        ] },
      { t: 'titre', cle: 't-ag', lib: 'Son agence', ic: 'agence' },
      { t: 'texte', cle: 'confNom', lib: 'Nom de l’agence', ic: 'agence', requis: true, exemple: 'Agence du Parc' },
      { t: 'texte', cle: 'confSociete', lib: 'Société', ic: 'immeuble', requis: true, exemple: 'PARC IMMOBILIER' },
      { t: 'texte', cle: 'confForme', lib: 'Forme', ic: 'immeuble', exemple: 'SARL' },
      { t: 'texte', cle: 'confCapital', lib: 'Capital', ic: 'euro', exemple: '10 000 €' },
      { t: 'texte', cle: 'confSiege', lib: 'Siège', ic: 'lieu', large: true, requis: true, exemple: '4 place du Parc, 92100 Boulogne-Billancourt' },
      { t: 'texte', cle: 'confRcs', lib: 'RCS', ic: 'doc', exemple: 'RCS Nanterre 812 345 678' },
      { t: 'titre', cle: 't-carte', lib: 'Sa carte et ses garanties', ic: 'carte' },
      { t: 'texte', cle: 'confCarte', lib: 'Carte professionnelle n°', ic: 'carte', requis: true, exemple: 'CPI 9201 2019 000 012 345' },
      { t: 'texte', cle: 'confCci', lib: 'Délivrée par', ic: 'immeuble', requis: true, exemple: 'la CCI Paris Île-de-France' },
      { t: 'choix', cle: 'confFonds', lib: 'L’argent des clients', ic: 'banque', options: [
        { v: 'garantie', l: 'Il a une garantie financière', ic: 'bouclier' }, { v: 'aucun', l: 'Il ne détient aucuns fonds', ic: 'croix' },
      ] },
      { t: 'texte', cle: 'confGarant', lib: 'Garantie financière', ic: 'bouclier', large: true, requis: true, si: d => d.confFonds !== 'aucun', exemple: 'Galian, 89 rue La Boétie, 75008 Paris, pour 120 000 €' },
      { t: 'texte', cle: 'confRcp', lib: 'Assurance de responsabilité civile professionnelle', ic: 'balance', large: true, requis: true, exemple: 'MMA IARD, police n° 123 456 789' },
      { t: 'titre', cle: 't-sig', lib: 'Qui signe pour elle', ic: 'plume' },
      { t: 'personnes', cle: 'delegataires', lib: 'Le signataire', ic: 'personne', un: 'Signataire', min: 1, max: 1, complet: false, nomCarte: () => 'Celui qui signe pour le confrère' },
      { t: 'texte', cle: 'confQualite', lib: 'Sa qualité', ic: 'bureau', exemple: 'gérant' },
    ],
  },
  {
    id: 'mission', titre: 'La mission et sa durée', court: 'La mission', sous: 'Ce que tu lui confies, jusqu’à quand, et ce à quoi il s’engage.', vers: 'Objet de la délégation', reperesApres: 'fin', ic: 'partage',
    champs: [
      { t: 'choix', cle: 'portee', lib: 'Tu lui confies', ic: 'partage', tuiles: true, options: [
        { v: 'totale', l: 'Toute la mission', aide: 'Aux mêmes conditions que le mandat.', ic: 'accord' },
        { v: 'partielle', l: 'Une partie', aide: 'Tu choisis ce qu’il fait.', ic: 'partage' },
      ] },
      { t: 'cases', cle: 'missions', lib: 'Ce qu’il fait', ic: 'partage', si: d => d.portee === 'partielle', options: MISSIONS.map(m => ({ v: m.v, l: m.l, ic: m.ic })) },
      { t: 'date', cle: 'fin', lib: 'La délégation prend fin le', ic: 'chrono', requis: true, aide: 'Au plus tard à la fin du mandat. Elle s’arrête aussi d’elle-même si le mandat finit plus tôt.' },
      { t: 'titre', cle: 't-eng', lib: 'Ses engagements', ic: 'etoile' },
      { t: 'cases', cle: 'engagements', lib: 'Le confrère s’engage à', ic: 'etoile', options: ENGAGEMENTS },
      { t: 'choix', cle: 'publicite', lib: 'Les annonces', ic: 'megaphone', si: vente, options: [
        { v: 'non', l: 'Pas d’annonce', aide: 'Il présente le bien à ses propres acquéreurs.', ic: 'croix' },
        { v: 'oui', l: 'Annonces validées par toi', aide: 'Il te soumet chaque annonce avant de la diffuser.', ic: 'megaphone' },
      ] },
    ],
  },
  {
    id: 'honoraires', titre: 'Le partage des honoraires', court: 'Les honoraires', sous: 'Ce qui revient au confrère quand l’acquéreur vient de lui, et qui encaisse.', vers: 'Honoraires', reperesApres: 'encaisse', ic: 'euro',
    champs: [
      { t: 'nombre', cle: 'partage', lib: 'Part du confrère', ic: 'pourcent', unite: '% des honoraires HT', requis: true, aide: 'Le reste te revient. 50 % est l’usage le plus courant.' },
      { t: 'choix', cle: 'encaisse', lib: 'Qui encaisse les honoraires ?', ic: 'banque', tuiles: true, options: [
        { v: 'delegant', l: 'Toi', aide: 'Tu reverses sa part sur sa facture. Le plus sûr : c’est toi qui détiens le mandat.', ic: 'agence' },
        { v: 'delegataire', l: 'Le confrère', aide: 'Il te reverse ta part sur ta facture.', ic: 'accord' },
      ] },
    ],
  },
  {
    id: 'signature', titre: 'La signature', court: 'Signature', sous: 'Comment, où et quand elle sera signée.', vers: 'Date et signatures', ic: 'plume',
    champs: [
      CHAMP_SIGNATURE,
      { t: 'texte', cle: 'faitA', lib: 'Fait à', ic: 'lieu', requis: true },
      { t: 'date', cle: 'date', lib: 'Le', ic: 'calendrier', requis: true },
    ],
  },
];

/* ══ Le texte ═══════════════════════════════════════════════════════════ */

/* Le prix et les honoraires du mandat, en une phrase. */
function conditions(d: Donnees): string {
  if (vente(d)) {
    const a = argentVente(d);
    const hono = a.forfait ? `un forfait de ${euros(a.forfait)} TTC`
      : a.taux !== null ? `${pourcent(a.taux)} TTC du ${a.charge === 'acquereur' ? 'prix net vendeur' : 'prix de vente'}` : 'montant à préciser';
    if (!a.prix) return `Le Mandat prévoit des honoraires de ${hono}, à la charge ${a.charge === 'acquereur' ? 'de l’acquéreur' : 'du MANDANT'}.`;
    return `Le Mandat prévoit un prix de présentation de ${eurosLettres(a.prix)}${a.charge === 'acquereur' ? `, honoraires compris${a.net ? `, soit un prix net vendeur de ${euros(a.net)}` : ''}` : ''}, et des honoraires de ${hono}${a.honoraires !== null ? `, soit ${euros(a.honoraires)} TTC à ce prix` : ''}, à la charge ${a.charge === 'acquereur' ? 'de l’acquéreur' : 'du MANDANT'}.`;
  }
  const a = argentRecherche(d);
  const hono = a.forfait ? `un forfait de ${euros(a.forfait)} TTC` : a.taux !== null ? `${pourcent(a.taux)} TTC du prix d’achat` : 'montant à préciser';
  return `Le Mandat prévoit ${a.prix ? `un prix d’achat maximum de ${eurosLettres(a.prix)} hors honoraires, et ` : ''}des honoraires de ${hono}${a.honoraires !== null && a.prix ? `, soit ${euros(a.honoraires)} TTC au prix maximum` : ''}, à la charge du MANDANT.`;
}

function ficheConfrere(d: Donnees): Fiche {
  const p = delegataire(d);
  const societe = [txt(d, 'confSociete'), txt(d, 'confForme')].filter(Boolean).join(', ');
  return {
    ic: 'agence',
    titre: (nomConfrere(d) || '……………').toUpperCase(),
    lignes: [
      [societe, txt(d, 'confCapital') ? `au capital de ${txt(d, 'confCapital')}` : '', txt(d, 'confRcs')].filter(Boolean).join(', ') + (societe ? '.' : ''),
      txt(d, 'confSiege') ? `Siège : ${txt(d, 'confSiege')}.` : '',
      `Carte professionnelle « Transactions sur immeubles et fonds de commerce » n° ${txt(d, 'confCarte') || '……………'}, délivrée par ${txt(d, 'confCci') || '……………'}.`,
      d.confFonds === 'aucun' ? 'Ne reçoit ni ne détient aucuns fonds autres que sa rémunération.' : `Garantie financière : ${txt(d, 'confGarant') || '……………'}.`,
      `Responsabilité civile professionnelle : ${txt(d, 'confRcp') || '……………'}.`,
      `Représentée par ${nomComplet(p)}${txt(d, 'confQualite') ? `, ${txt(d, 'confQualite')}` : ''}.`,
    ].filter(Boolean),
    pied: 'Ci-après « le DÉLÉGATAIRE »',
  };
}

function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const numero = txt(d, 'mandatNumero');
  const v = vente(d);
  const pc = part(d);
  const finM = txt(d, 'finActuelle');

  const sections: Partie['sections'] = [
    { titre: 'Entre les soussignés', blocs: [{ t: 'fiches', items: [
      ficheAgence(A, lignesMandataire(A), phraseFonds(A), 'Ci-après « le DÉLÉGANT »'),
      ficheConfrere(d),
    ] }] },
    { titre: 'Il est d’abord rappelé que', ic: 'doc', blocs: [
      P(`Le DÉLÉGANT est titulaire d’un mandat ${v ? 'de vente' : 'de recherche'} ${typeNom(d)} n° ${numero || '……'}, signé le ${txt(d, 'mandatDate') ? jourLong(txt(d, 'mandatDate')) : '……………'}, inscrit sous ce numéro à son registre des mandats${finM ? ` et valable jusqu’au ${jourLong(finM)}` : ''} (ci-après « le Mandat »), par lequel ${txt(d, 'mandantsTexte') || '……………'} (ci-après « le MANDANT ») lui a confié la mission ${v ? `de rechercher un acquéreur pour le bien suivant : ${txt(d, 'objetTexte') || '……………'}` : `de rechercher pour son compte un bien répondant à la description suivante : ${txt(d, 'objetTexte').replace(/^Recherche\s*:\s*/i, '') || '……………'}`}.`, true),
      P(conditions(d)),
      P('Le Mandat autorise expressément le DÉLÉGANT à déléguer tout ou partie de sa mission à un autre professionnel titulaire de la carte « Transactions sur immeubles et fonds de commerce ». Le DÉLÉGANT demeure responsable envers le MANDANT de la personne qu’il se substitue (article 1994 du Code civil).'),
      P('Le DÉLÉGATAIRE reconnaît avoir reçu une copie du Mandat et en connaître toutes les conditions.'),
    ] },
  ];

  /* ── L'objet ── */
  const missions = MISSIONS.filter(m => liste(d, 'missions').includes(m.v));
  const objet: Bloc[] = d.portee === 'partielle'
    ? [P('Le DÉLÉGANT délègue au DÉLÉGATAIRE, qui l’accepte, la partie suivante de la mission que lui confie le Mandat :', true),
      { t: 'l', items: missions.length ? missions.map(m => `${v ? m.vente : m.recherche} ;`) : ['à préciser.'] }]
    : [P('Le DÉLÉGANT délègue au DÉLÉGATAIRE, qui l’accepte, l’exécution de la mission que lui confie le Mandat, aux mêmes conditions.', true)];
  objet.push(
    P('Le DÉLÉGATAIRE agit au nom et pour le compte du MANDANT, dans les strictes limites du Mandat. Le DÉLÉGANT reste le seul titulaire du Mandat et le seul interlocuteur du MANDANT : la présente délégation ne crée aucun lien contractuel entre le DÉLÉGATAIRE et le MANDANT, sous réserve de l’action directe que l’article 1994 du Code civil ouvre à ce dernier.'),
    P(`Le Mandat demeure inscrit au registre des mandats du DÉLÉGANT, sous le n° ${numero || '……'} ; la présente délégation y est mentionnée en observation.`),
  );
  sections.push({ titre: 'Objet de la délégation', ic: 'accord', blocs: objet });

  /* ── La durée ── */
  sections.push({ titre: 'Durée', ic: 'calendrier', blocs: [
    P(`La délégation prend effet à sa signature et prend fin le ${txt(d, 'fin') ? jourLong(txt(d, 'fin')) : '……………'}. Elle prend fin de plein droit et sans indemnité si le Mandat lui-même prend fin plus tôt, pour quelque cause que ce soit : arrivée de son terme, résiliation, révocation, ${v ? 'vente conclue par le MANDANT lui-même ou par un autre intermédiaire' : 'acquisition réalisée par le MANDANT sans l’intervention du DÉLÉGATAIRE'}. Le DÉLÉGANT en informe alors le DÉLÉGATAIRE sans délai.`, true),
    P('Chaque partie peut aussi y mettre fin à tout moment, par lettre recommandée avec avis de réception ou par courrier électronique avec accusé de réception, moyennant un préavis de quinze jours.'),
    P('Toute modification du Mandat (avenant sur le prix, les honoraires ou la durée) est portée par écrit à la connaissance du DÉLÉGATAIRE et s’impose à lui dès qu’il en a été informé.'),
  ] });

  /* ── Les engagements ── */
  const eng: string[] = [
    'exercer la mission dans le respect de la loi n° 70-9 du 2 janvier 1970, de son décret d’application, du code de déontologie des professionnels de l’immobilier et des règles de lutte contre le blanchiment, et justifier à première demande de sa carte professionnelle, de sa garantie financière et de son assurance de responsabilité civile professionnelle en cours de validité ;',
  ];
  if (engage(d, 'prix')) eng.push(v
    ? 'respecter le prix, les honoraires et les conditions du Mandat, et ne proposer ni n’accepter aucune autre condition sans l’accord écrit du DÉLÉGANT ;'
    : 'respecter les critères, le prix maximum et les honoraires du Mandat, et ne proposer au MANDANT aucun bien qui s’en écarte sans l’accord écrit du DÉLÉGANT ;');
  if (engage(d, 'bons')) eng.push(v
    ? 'faire signer un bon de visite à chaque visiteur, mentionnant le numéro du Mandat et le nom du DÉLÉGANT, et en adresser copie au DÉLÉGANT dans les quarante-huit heures ;'
    : 'faire signer un bon de visite pour chaque bien visité, mentionnant le numéro du Mandat et le nom du DÉLÉGANT, et en adresser copie au DÉLÉGANT dans les quarante-huit heures ;');
  if (engage(d, 'offres')) eng.push(v
    ? 'transmettre sans délai au DÉLÉGANT, par écrit, toute offre ou proposition reçue, que seul le DÉLÉGANT présente au MANDANT ;'
    : 'signaler sans délai au DÉLÉGANT, par écrit, tout bien trouvé et toute information utile, le DÉLÉGANT restant seul à les présenter au MANDANT ;');
  if (engage(d, 'sous')) eng.push('ne pas déléguer à son tour tout ou partie de la mission ;');
  if (engage(d, 'contact')) eng.push('ne pas entrer en relation directe avec le MANDANT, sauf accord écrit du DÉLÉGANT ;');
  if (v) eng.push(d.publicite === 'oui'
    ? 'ne diffuser d’annonce du bien qu’après l’accord écrit du DÉLÉGANT sur son texte, en y faisant figurer le prix, les honoraires et leur charge, ainsi que les mentions obligatoires, notamment le classement énergétique ;'
    : 'ne diffuser aucune annonce du bien, sur quelque support que ce soit ;');
  eng.push('ne recevoir de quiconque aucun versement, effet ou valeur à l’occasion de l’opération ;',
    'garder confidentielles les informations reçues sur le MANDANT et sur le bien, ne les utiliser que pour la mission déléguée, et les effacer à la fin de la délégation, sauf obligation légale de conservation.');
  sections.push({ titre: 'Engagements du DÉLÉGATAIRE', ic: 'etoile', blocs: [P('Le DÉLÉGATAIRE s’engage à :', true), { t: 'l', items: eng }] });
  sections.push({ titre: 'Engagements du DÉLÉGANT', ic: 'agence', blocs: [
    P('Le DÉLÉGANT s’engage à :', true),
    { t: 'l', items: [
      `remettre au DÉLÉGATAIRE une copie du Mandat et les éléments utiles à la mission (${v ? 'description du bien, photographies, diagnostics' : 'description précise de la recherche'}) ;`,
      `l’informer sans délai de toute modification du Mandat, de toute ${v ? 'offre acceptée' : 'acquisition en cours'} et de la fin du Mandat ;`,
      'lui verser sa part des honoraires dans les conditions ci-dessous.',
    ] },
  ] });

  /* ── Les honoraires ── */
  const qui = v ? 'avec un acquéreur présenté par le DÉLÉGATAIRE' : 'sur un bien trouvé par le DÉLÉGATAIRE';
  sections.push({ titre: 'Honoraires', ic: 'euro', blocs: [
    P('Les honoraires restent ceux prévus au Mandat. Ils ne sont dus qu’après la signature de l’acte authentique constatant l’opération, et aucune somme ne peut être exigée ni reçue auparavant (article 6 de la loi du 2 janvier 1970, article 74 du décret du 20 juillet 1972).', true),
    P(`Si l’opération est conclue ${qui}, les honoraires effectivement encaissés sont partagés comme suit : ${pc === null ? '…… %' : `${fmtPart(pc)} %`} pour le DÉLÉGATAIRE et ${pc === null ? '…… %' : `${fmtPart(100 - pc)} %`} pour le DÉLÉGANT, calculés hors taxes ; chaque partie facture sa part, TVA en sus s’il y a lieu.`),
    P(v
      ? 'Un acquéreur est présenté par le DÉLÉGATAIRE lorsqu’il a visité le bien avec lui, bon de visite à l’appui, ou lorsque le DÉLÉGATAIRE a transmis son offre au DÉLÉGANT.'
      : 'Un bien est trouvé par le DÉLÉGATAIRE lorsqu’il l’a signalé par écrit au DÉLÉGANT avant que celui-ci ou le MANDANT en ait eu connaissance par une autre voie.'),
    P(d.encaisse === 'delegataire'
      ? 'Le DÉLÉGATAIRE encaisse les honoraires pour le compte du DÉLÉGANT et lui verse sa part, sur présentation de sa facture, dans les quinze jours de leur encaissement.'
      : 'Le DÉLÉGANT encaisse les honoraires et verse au DÉLÉGATAIRE sa part, sur présentation de sa facture, dans les quinze jours de leur encaissement.'),
    P('Aucune rémunération n’est due au DÉLÉGATAIRE pour une opération conclue sans son intervention.'),
  ] });

  sections.push({ titre: 'Informations', ic: 'info', blocs: [
    P('Données personnelles : chaque partie traite les informations sur le MANDANT et les visiteurs qu’elle reçoit pour la seule exécution de la mission, en responsable de traitement pour ce qui la concerne, dans le respect du règlement (UE) 2016/679.'),
    Pp('Textes applicables : loi n° 70-9 du 2 janvier 1970 (dite loi Hoguet) et décret n° 72-678 du 20 juillet 1972 ; articles 1984 et suivants du Code civil, notamment l’article 1994 ; code de déontologie des professionnels de l’immobilier. Le présent contrat est soumis à la loi française. À défaut d’accord amiable, tout différend est porté devant les juridictions du ressort du siège du DÉLÉGANT.'),
  ] });
  sections.push({ titre: 'Date et signatures', ic: 'plume', blocs: blocsSignature(d, {
    papier: `Fait à ${txt(d, 'faitA') || '……………'}, le ${txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………'}, en deux exemplaires originaux, dont un remis à chaque partie.`,
    mention: 'Chaque signataire date et signe, précédé de la mention manuscrite « Lu et approuvé ».',
    cases: casesDelegation(d, A),
  }) });

  return [{
    titre: `Délégation du mandat${numero ? ` n° ${numero}` : ''}`,
    court: 'La délégation',
    sous: `Mandat ${v ? 'de vente' : 'de recherche'} ${typeNom(d)}${txt(d, 'mandatDate') ? ` du ${jourLong(txt(d, 'mandatDate'))}` : ''}`,
    ic: 'accord',
    sections,
  }];
}

export function casesDelegation(d: Donnees, A?: IdentiteAgence): CaseSignature[] {
  const p = delegataire(d);
  const out: CaseSignature[] = [{
    cle: 'c0', qui: 'Le délégataire', nom: (nomConfrere(d) || '……………').toUpperCase(),
    lignes: [`Représentée par ${nomComplet(p)}${txt(d, 'confQualite') ? `, ${txt(d, 'confQualite')}` : ''}`], personne: p,
  }];
  if (A) out.push({ cle: 'agence', qui: 'Le délégant', nom: A.nom.toUpperCase(), lignes: [`Représentée par ${A.signataireNom}, ${A.signataireQualite}`], agence: true });
  return out;
}

function resume(d: Donnees): Resume {
  const pc = part(d);
  return [
    { titre: 'Le mandat', valeur: txt(d, 'mandatNumero') ? `N° ${txt(d, 'mandatNumero')}` : 'À compléter', detail: `${vente(d) ? 'vente' : 'recherche'} ${typeNom(d)}${txt(d, 'finActuelle') ? `, jusqu’au ${jourLong(txt(d, 'finActuelle'))}` : ''}` },
    { titre: 'Le confrère', valeur: nomConfrere(d) || 'À compléter', detail: txt(d, 'confCarte') ? `carte n° ${txt(d, 'confCarte')}` : '—' },
    { titre: 'La mission', valeur: d.portee === 'partielle' ? 'Une partie' : 'Toute la mission', detail: txt(d, 'fin') ? `jusqu’au ${jourLong(txt(d, 'fin'))}` : '—' },
    { titre: 'Les honoraires', valeur: pc === null ? 'À compléter' : `${fmtPart(pc)} % pour le confrère`, detail: d.encaisse === 'delegataire' ? 'encaissés par le confrère' : 'encaissés par l’agence' },
  ];
}

function reperes(d: Donnees, etape: string): Repere[] {
  const out: Repere[] = [];
  if (etape === 'mandat' && d.autorise === 'non') out.push({ l: 'Pas de délégation possible', v: 'Le mandat ne l’autorise pas : un avenant d’abord.', ton: 'alerte' });
  if (etape === 'mission' && txt(d, 'fin') && txt(d, 'finActuelle') && txt(d, 'fin') > txt(d, 'finActuelle')) {
    out.push({ l: 'Trop longue', v: `Le mandat finit le ${jourLong(txt(d, 'finActuelle'))} : la délégation ne peut pas aller au-delà.`, ton: 'alerte' });
  }
  if (etape === 'honoraires') {
    const pc = part(d);
    const h = vente(d) ? argentVente(d).honoraires : argentRecherche(d).honoraires;
    if (pc !== null && h) {
      out.push({ l: 'Honoraires du mandat', v: `${euros(h)} TTC` });
      out.push({ l: `Au confrère (${fmtPart(pc)} %)`, v: `${euros(Math.round((h * pc) / 100))} TTC` });
      out.push({ l: `À toi (${fmtPart(100 - pc)} %)`, v: `${euros(h - Math.round((h * pc) / 100))} TTC`, ton: 'ok' });
    }
    if (pc !== null && (pc <= 0 || pc >= 100)) out.push({ l: 'Le partage', v: 'Entre 1 et 99 % pour le confrère.', ton: 'alerte' });
  }
  return out;
}

function manques(d: Donnees): string[] {
  const out: string[] = [];
  if (!txt(d, 'mandatNumero') || !txt(d, 'mandatDate')) out.push('Le numéro et la date du mandat');
  if (d.autorise !== 'oui') out.push('Un mandat qui autorise la délégation : sinon, fais d’abord signer un avenant qui l’ajoute');
  if (!txt(d, 'finActuelle')) out.push('La date de fin du mandat');
  if (!txt(d, 'mandantsTexte')) out.push('Les mandants');
  if (!txt(d, 'objetTexte')) out.push(vente(d) ? 'Le bien' : 'Le bien recherché');
  if (vente(d) && !num(d, 'prix')) out.push('Le prix de présentation');
  if (!nomConfrere(d) || !txt(d, 'confSociete') || !txt(d, 'confSiege')) out.push('Le nom, la société et le siège du confrère');
  if (!txt(d, 'confCarte') || !txt(d, 'confCci')) out.push('Sa carte professionnelle (numéro et CCI)');
  if (d.confFonds !== 'aucun' && !txt(d, 'confGarant')) out.push('Sa garantie financière');
  if (!txt(d, 'confRcp')) out.push('Son assurance de responsabilité civile professionnelle');
  const p = delegataire(d);
  if (!p.nom || !p.prenom) out.push('Le nom de celui qui signe pour le confrère');
  if (d.portee === 'partielle' && !liste(d, 'missions').length) out.push('Ce que tu lui confies');
  if (!txt(d, 'fin')) out.push('La date de fin de la délégation');
  else if (txt(d, 'finActuelle') && txt(d, 'fin') > txt(d, 'finActuelle')) out.push(`Une fin au plus tard à celle du mandat (le ${jourLong(txt(d, 'finActuelle'))})`);
  if (txt(d, 'finActuelle') && txt(d, 'date') && txt(d, 'date') >= txt(d, 'finActuelle')) out.push(`Un mandat en cours : celui-ci a pris fin le ${jourLong(txt(d, 'finActuelle'))}`);
  const pc = part(d);
  if (pc === null || pc <= 0 || pc >= 100) out.push('La part du confrère (entre 1 et 99 %)');
  if (!txt(d, 'faitA') || !txt(d, 'date')) out.push('Le lieu et la date de signature');
  out.push(...manquesSignature({ ...d, lieu: '' }, casesDelegation(d)));
  return out;
}

function defaut(c: Contexte): Donnees {
  return {
    sorte: 'vente', mandatNumero: '', mandatDate: '', type: 'exclusif', finActuelle: '', autorise: 'oui',
    mandantsTexte: '', objetTexte: '', prix: null, charge: 'acquereur', honoMode: 'taux', taux: null, forfait: null, prixMax: null,
    confNom: '', confSociete: '', confForme: '', confCapital: '', confSiege: '', confRcs: '', confCarte: '', confCci: '',
    confFonds: 'garantie', confGarant: '', confRcp: '', delegataires: [{ ...PERSONNE_VIDE }], confQualite: '',
    portee: 'totale', missions: [], fin: '', engagements: ENGAGEMENTS.map(e => e.v), publicite: 'non',
    partage: 50, encaisse: 'delegant',
    signature: 'en_ligne', faitA: c.identite.ville, date: aujourdhui(),
  };
}

/* ── Le confrère, depuis sa fiche de contact (V3.19) ──
   Son agence, son adresse, lui (nom, e-mail, téléphone) ; et ce qu'une
   délégation précédente a gardé sur sa fiche (société, carte, garanties). */
export type ContactConfrere = {
  id: string; civilite?: string | null; prenom?: string | null; nom?: string | null;
  emails?: string[] | null; telephones?: string[] | null; pro?: unknown;
};
export function depuisConfrere(c: ContactConfrere): Donnees {
  const p = lirePro(c.pro);
  const j: Juridique = p.juridique && typeof p.juridique === 'object' ? p.juridique : {};
  const civ = c.civilite === 'Madame' || c.civilite === 'Monsieur' ? c.civilite : '';
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ').trim();
  return {
    confrereId: c.id, confrereNom: nom, confrereDe: j.le || '', confStatut: p.statutPro || '',
    confNom: p.agence || '', confSiege: j.siege || p.adresseAgence || '',
    confSociete: j.societe || '', confForme: j.forme || '', confCapital: j.capital || '', confRcs: j.rcs || '',
    confCarte: j.carte || '', confCci: j.cci || '', confFonds: j.fonds === 'aucun' ? 'aucun' : 'garantie',
    confGarant: j.garant || '', confRcp: j.rcp || '', confQualite: j.qualite || '',
    delegataires: [{ ...PERSONNE_VIDE, civilite: civ, prenom: c.prenom || '', nom: c.nom || '', email: (c.emails?.[0] || '').toLowerCase(), telephone: c.telephones?.[0] || '' }],
  };
}
/* Ce qu'on garde sur sa fiche, une fois la délégation finalisée. */
export function juridiqueDepuis(d: Donnees, le: string): Juridique {
  return {
    societe: txt(d, 'confSociete'), forme: txt(d, 'confForme'), capital: txt(d, 'confCapital'), siege: txt(d, 'confSiege'),
    rcs: txt(d, 'confRcs'), carte: txt(d, 'confCarte'), cci: txt(d, 'confCci'), fonds: d.confFonds === 'aucun' ? 'aucun' : 'garantie',
    garant: txt(d, 'confGarant'), rcp: txt(d, 'confRcp'), qualite: txt(d, 'confQualite'), le,
  };
}

/* Depuis le mandat : ce qu'il dit, sa date de fin, et s'il permet de
   déléguer. Le mandat en ligne l'a toujours permis (« se faire assister ou
   substituer par un autre professionnel habilité »). */
function deriver(src: Source): Donnees {
  const s = src.donnees || {};
  const v = src.modele === 'mandat_vente';
  const out: Donnees = {};
  for (const k of v ? REPRIS_VENTE : REPRIS_RECHERCHE) if (k in s) out[k] = s[k];
  const jour = String(src.signe_le || s.date || '').slice(0, 10);
  const total = s.dureeMode === 'prorogation' ? (num(s, 'dureeMax') ?? 12) : (num(s, 'duree') ?? (v ? 3 : 12));
  return {
    ...out,
    sorte: v ? 'vente' : 'recherche',
    mandatNumero: src.numero || txt(s, 'numero'), mandatDate: jour,
    finActuelle: txt(s, 'finActuelle') || (/^\d{4}-\d{2}-\d{2}$/.test(jour) ? plusMois(jour, total) : ''),
    autorise: src.modele === 'mandat_en_ligne' || liste(s, 'pouvoirs').includes('delegation') ? 'oui' : 'non',
  };
}

/* Une fois le mandat repris et ses avenants signés appliqués : les
   mandants et le bien en toutes lettres, la fin de la délégation à celle
   du mandat. */
function preparer(d: Donnees): Donnees {
  const x: Donnees = { ...d };
  if (!txt(x, 'mandantsTexte')) x.mandantsTexte = (vente(x) ? registreVente(x) : registreRecherche(x)).mandants;
  if (!txt(x, 'objetTexte')) x.objetTexte = vente(x) ? objetVente(x) : objetRecherche(x);
  if (!txt(x, 'fin')) x.fin = txt(x, 'finActuelle');
  return x;
}

export const DELEGATION: Modele = {
  id: 'delegation',
  categorie: 'delegations',
  titre: 'Délégation de mandat',
  description: 'Confier un mandat signé à un confrère : il reprend le mandat, tu fixes la mission, la durée et le partage des honoraires.',
  ic: 'accord',
  signataires: 'Le confrère, puis l’agence',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Délégation à ${nomConfrere(d) || 'un confrère'}`,
  sousTitre: d => couper([txt(d, 'mandatNumero') ? `Mandat n° ${txt(d, 'mandatNumero')}` : '', txt(d, 'objetTexte').replace(/^Recherche\s*:\s*/i, '')].filter(Boolean).join(' · '), 120),
  pour: d => nomConfrere(d) || 'Le confrère',
  rediger,
  resume,
  garde: d => ({
    titre: 'Délégation',
    sous: `de mandat ${vente(d) ? 'de vente' : 'de recherche'}`,
    etiquette: txt(d, 'mandatNumero') ? `MANDAT N° ${txt(d, 'mandatNumero')}` : 'DÉLÉGATION DE MANDAT',
    pour: 'CONVENUE AVEC',
    ics: ['accord', 'doc', 'euro', 'plume'],
  }),
  entete: d => `Délégation du mandat${txt(d, 'mandatNumero') ? ` n° ${txt(d, 'mandatNumero')}` : ''}`,
  manques,
  badge: () => 'Délégation',
  reperes,
  lien: 'mandat',
  deriver: { de: ['mandat_vente', 'mandat_recherche', 'mandat_en_ligne'], fn: deriver },
  avenantsDe: d => (vente(d) ? 'avenant_vente' : 'avenant_recherche'),
  preparer,
  interne: true,
  cases: casesDelegation,
  accepter: d => `J’ai lu la délégation en entier et je l’accepte au nom de ${txt(d, 'confSociete') || nomConfrere(d) || 'ma société'}.`,
};
