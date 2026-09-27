/* ═══ Le bon de visite ════════════════════════════════════════════════════
   La preuve qu'un bien a été présenté et visité par l'intermédiaire de
   l'Agence : qui a visité, quoi, quand, et quels documents ont été remis
   (état des risques, audit énergétique, diagnostics). Il protège les
   honoraires : un acquéreur présenté ne peut pas acheter en direct pour
   les contourner.

   Deux rôles, selon le dossier :
     · l'Agence détient le mandat de VENDRE : les visiteurs reconnaissent
       que le bien leur a été présenté par elle ;
     · l'Agence cherche pour un ACQUÉREUR (mandat de recherche) : le bon
       trace la visite faite avec son client, auprès du vendeur ou de
       l'agence du vendeur.

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre. */

import { euros, type Partie, type Bloc, type Resume } from '@/lib/mandat';
import { lignesMandataire, type IdentiteAgence } from '@/lib/agence';
import {
  P, nbLettres, jourLong, aujourdhui, txt, num, liste,
  lirePersonnes, nomComplet, nomsCourts, fichePersonne, blocDonnees, ficheAgence,
  PERSONNE_VIDE, blocsSignature, manquesSignature, CHAMP_SIGNATURE,
  type Donnees, type Modele, type Etape, type Contexte, type Personne, type CaseSignature,
} from './commun';

const DOCS: { v: string; l: string; x: string; ic: string }[] = [
  { v: 'erp', ic: 'bouclier', l: 'État des risques', x: 'l’état des risques et pollutions (ERP) du bien' },
  { v: 'dpe', ic: 'eclair', l: 'Diagnostic de performance énergétique', x: 'le diagnostic de performance énergétique (DPE)' },
  { v: 'audit', ic: 'courbe', l: 'Audit énergétique', x: 'l’audit énergétique (logement classé E, F ou G)' },
  { v: 'fiche', ic: 'doc', l: 'Fiche descriptive', x: 'la fiche descriptive du bien, avec son prix' },
  { v: 'copro', ic: 'immeuble', l: 'Informations de copropriété', x: 'les informations sur la copropriété (charges, procédures, travaux votés)' },
];

const ETAPES: Etape[] = [
  {
    id: 'visite', titre: 'La visite', sous: 'Qui a visité, quoi et quand.', vers: 'Entre les soussignés', ic: 'calendrier',
    champs: [
      { t: 'choix', cle: 'role', lib: 'L’agence intervient pour…', tuiles: true, options: [
        { v: 'vendeur', l: 'Le vendeur', aide: 'Tu détiens le mandat de vente.', ic: 'maison' },
        { v: 'acquereur', l: 'L’acquéreur', aide: 'Tu cherches pour lui (mandat de recherche).', ic: 'loupe' },
      ] },
      { t: 'guide', cle: 'g-role', titre: d => (d.role === 'acquereur' ? 'Tu accompagnes ton acquéreur' : 'Tu fais visiter le bien de ton vendeur'),
        points: d => (d.role === 'acquereur' ? [
          { ic: 'loupe', x: 'Il visite dans le cadre de son mandat de recherche : le bon prouve que c’est toi qui lui as fait découvrir ce bien.' },
          { ic: 'agence', x: 'Si le bien est proposé par une autre agence, note son nom : elle transmettra l’offre au vendeur.' },
        ] : [
          { ic: 'personne', x: 'L’identité des visiteurs (une pièce d’identité vérifiée) : le bon protège tes honoraires s’ils achètent ensuite en direct.' },
          { ic: 'bouclier', x: 'L’état des risques se remet dès la première visite ; coche-le à l’étape suivante.' },
        ]) },
      { t: 'personnes', cle: 'visiteurs', lib: 'Les visiteurs', un: 'Visiteur', min: 1, max: 4 },
      { t: 'titre', cle: 't-bien', lib: 'Le bien visité', ic: 'maison' },
      { t: 'texte', cle: 'adresse', lib: 'Adresse du bien', ic: 'lieu', large: true, requis: true },
      { t: 'texte', cle: 'ville', lib: 'Ville', requis: true },
      { t: 'texte', cle: 'description', lib: 'Le bien', ic: 'doc', large: true, exemple: 'appartement de 4 pièces, 92 m², 3e étage' },
      { t: 'euros', cle: 'prix', lib: 'Prix annoncé', ic: 'etiquette' },
      { t: 'texte', cle: 'reference', lib: 'Référence de l’annonce' },
      { t: 'texte', cle: 'agenceVendeur', lib: 'Agence du vendeur', ic: 'agence', si: d => d.role === 'acquereur', exemple: 'Agence du Parc, Boulogne', aide: 'Si le bien est proposé par une autre agence.' },
      { t: 'titre', cle: 't-quand', lib: 'Quand', ic: 'calendrier' },
      { t: 'date', cle: 'dateVisite', lib: 'Date de la visite', ic: 'calendrier', requis: true },
      { t: 'heure', cle: 'heure', lib: 'Heure', ic: 'horloge' },
    ],
  },
  {
    id: 'remis', titre: 'Documents et engagements', sous: 'Ce qui a été remis, et ce que les visiteurs acceptent.', vers: 'La visite', ic: 'doc',
    champs: [
      { t: 'cases', cle: 'docs', lib: 'Documents remis aux visiteurs', ic: 'doc', options: DOCS.map(x => ({ v: x.v, l: x.l, ic: x.ic })),
        aide: 'L’état des risques doit être remis dès la première visite ; l’audit énergétique aussi, pour une maison classée E, F ou G.' },
      { t: 'nombre', cle: 'duree', lib: 'Pas d’achat en direct pendant', ic: 'chrono', unite: 'mois', si: d => d.role !== 'acquereur' },
      { t: 'zone', cle: 'note', lib: 'Une remarque ?', ic: 'plume', large: true },
      CHAMP_SIGNATURE,
      { t: 'texte', cle: 'faitA', lib: 'Fait à', ic: 'lieu', requis: true },
      { t: 'date', cle: 'date', lib: 'Le', ic: 'calendrier', requis: true },
    ],
  },
];

function visiteursDe(d: Donnees): Personne[] {
  const l = lirePersonnes(d.visiteurs);
  return l.length ? l : [{ ...PERSONNE_VIDE }];
}

function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const vs = visiteursDe(d);
  const role = d.role === 'acquereur' ? 'acquereur' : 'vendeur';
  const docs = liste(d, 'docs');
  const duree = num(d, 'duree') ?? 12;
  const adresse = [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ');
  const prix = num(d, 'prix');
  const quand = `${txt(d, 'dateVisite') ? `le ${jourLong(txt(d, 'dateVisite'))}` : 'le ……………'}${txt(d, 'heure') ? ` à ${txt(d, 'heure').replace(':', ' h ')}` : ''}`;
  const pl = vs.length > 1;

  const entre: Bloc[] = [{ t: 'fiches', items: [
    ...vs.map((p, i) => fichePersonne(p, 'personne', i === vs.length - 1 ? `Ci-après ${pl ? 'ensemble ' : ''}« le VISITEUR »` : undefined)),
    ficheAgence(A, lignesMandataire(A).slice(0, 3), undefined,
      role === 'vendeur' ? 'Ci-après « l’Agence », mandataire du vendeur' : 'Ci-après « l’Agence », mandataire de l’acquéreur'),
  ] }];

  const bien: Bloc[] = [
    P(`${adresse || 'Adresse à compléter'}${txt(d, 'description') ? ` : ${txt(d, 'description')}` : ''}.`, true),
    ...(prix ? [P(`Prix annoncé : ${euros(prix)}${txt(d, 'reference') ? ` (annonce ${txt(d, 'reference')})` : ''}.`)] : txt(d, 'reference') ? [P(`Annonce ${txt(d, 'reference')}.`)] : []),
    ...(role === 'acquereur' && txt(d, 'agenceVendeur') ? [P(`Bien proposé par : ${txt(d, 'agenceVendeur')}.`)] : []),
  ];

  const visite: Bloc[] = [
    P(`${pl ? 'Les visiteurs soussignés reconnaissent' : 'Le visiteur soussigné reconnaît'} avoir visité ce bien ${quand}, accompagné${pl ? 's' : ''} par ${A.signataireNom}, pour le compte de l’Agence${role === 'vendeur' ? ', qui leur a présenté ce bien pour la première fois' : ''}.`, true),
  ];
  if (docs.length) {
    visite.push(P(`${pl ? 'Ils reconnaissent' : 'Il reconnaît'} avoir reçu, lors de cette visite :`));
    visite.push({ t: 'coches', items: DOCS.filter(x => docs.includes(x.v)).map(x => x.x.charAt(0).toUpperCase() + x.x.slice(1)) });
  }

  const engagements: Bloc[] = role === 'vendeur'
    ? [
      P(`${pl ? 'Les visiteurs s’engagent' : 'Le visiteur s’engage'}, s’${pl ? 'ils souhaitent' : 'il souhaite'} acheter ce bien, à le faire par l’intermédiaire de l’Agence, et à ne pas traiter directement avec le vendeur, ni par un autre intermédiaire, pendant ${nbLettres(duree)} mois à compter de ce jour.`, true),
      P('S’il le faisait, il priverait l’Agence de la rémunération prévue par son mandat, et pourrait être tenu de l’en indemniser.'),
    ]
    : [
      P(`Cette visite est faite dans le cadre du mandat de recherche confié à l’Agence par ${pl ? 'les visiteurs' : 'le visiteur'} : ${pl ? 's’ils achètent' : 's’il achète'} ce bien, l’Agence ${pl ? 'les ' : 'l’'}accompagne jusqu’à l’acte, et ses honoraires sont ceux de ce mandat.`, true),
      P(`${pl ? 'Ils s’engagent' : 'Il s’engage'} à informer l’Agence de ${pl ? 'leur' : 'son'} intention de faire une offre, pour qu’elle la présente et la négocie.`),
    ];
  if (txt(d, 'note')) engagements.push(P(`Remarque : ${txt(d, 'note')}`));

  return [{
    titre: 'Bon de visite',
    court: 'Le bon de visite',
    sous: adresse || 'Visite accompagnée',
    ic: 'calendrier',
    sections: [
      { titre: 'Entre les soussignés', blocs: entre },
      { titre: 'Le bien visité', ic: 'maison', blocs: bien },
      { titre: 'La visite', ic: 'calendrier', blocs: visite },
      { titre: 'Engagements', ic: 'accord', blocs: engagements },
      { titre: 'Informations', ic: 'info', blocs: [blocDonnees(A)] },
      { titre: 'Date et signatures', ic: 'plume', blocs: blocsSignature(d, {
        papier: `Fait à ${txt(d, 'faitA') || '……………'}, le ${txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………'}, en ${nbLettres(2)} exemplaires.`,
        cases: casesVisite(d, A),
      }) },
    ],
  }];
}

function resume(d: Donnees): Resume {
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
  if (!txt(d, 'adresse') || !txt(d, 'ville')) out.push('L’adresse du bien');
  if (!txt(d, 'dateVisite')) out.push('La date de la visite');
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
    adresse: b?.adresse || '', ville: b?.ville || '', description: desc, prix: b?.prix_acquereur || null, reference: '',
    agenceVendeur: b?.agence_nom || '',
    dateVisite: c.visite?.date_visite ? String(c.visite.date_visite).slice(0, 10) : aujourdhui(),
    heure: c.visite?.heure ? String(c.visite.heure).slice(0, 5) : '',
    docs: ['erp'], duree: 12, note: '', signature: 'sur_place', faitA: c.identite.ville, date: aujourdhui(),
  };
}

export const BON_VISITE: Modele = {
  id: 'bon_visite',
  categorie: 'bons_visite',
  titre: 'Bon de visite',
  description: 'La preuve de la visite, avec les documents remis. Il protège tes honoraires.',
  ic: 'calendrier',
  signataires: 'Les visiteurs et l’agence',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Bon de visite · ${nomsCourts(visiteursDe(d))}`,
  sousTitre: d => [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', '),
  pour: d => nomsCourts(visiteursDe(d)),
  rediger,
  resume,
  garde: d => ({
    titre: 'Bon de visite',
    sous: 'd’un bien présenté par l’Agence',
    etiquette: `VISITE${txt(d, 'dateVisite') ? ` DU ${jourLong(txt(d, 'dateVisite')).toUpperCase()}` : ''}`,
    pour: 'VISITEURS',
    ics: ['maison', 'calendrier', 'etiquette'],
  }),
  entete: d => `Bon de visite${txt(d, 'dateVisite') ? ` du ${jourLong(txt(d, 'dateVisite'))}` : ''}`,
  manques,
  cases: casesVisite,
  accepter: () => 'J’ai lu le bon de visite : j’ai bien visité ce bien, qui m’a été présenté par l’Agence, et je prends les engagements qu’il contient.',
};
