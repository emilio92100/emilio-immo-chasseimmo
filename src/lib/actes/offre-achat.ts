/* ═══ L'offre d'achat ═════════════════════════════════════════════════════
   L'acquéreur propose un prix, pour un temps donné. Ce que la loi encadre,
   et que le texte dit en clair :
     · aucune somme ne peut être versée à l'occasion d'une offre (article
       1589-1 du Code civil) ;
     · une offre assortie d'un délai ne se retire pas avant ce délai
       (article 1116 du Code civil) ;
     · acceptée, elle forme l'accord sur le bien et le prix, que les parties
       constatent ensuite dans un avant-contrat chez le notaire ;
     · l'acquéreur non professionnel a alors dix jours pour se rétracter
       (article L271-1 du Code de la construction et de l'habitation) ;
     · s'il finance par un prêt, l'avant-contrat le prévoit comme condition
       suspensive (article L313-41 du Code de la consommation).
   La dernière partie laisse au vendeur la place de répondre : il accepte,
   refuse, ou fait une contre-proposition, et signe.

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre. */

import { euros, type Partie, type Bloc, type Resume } from '@/lib/mandat';
import { lignesMandataire, type IdentiteAgence } from '@/lib/agence';
import {
  P, Pp, eurosLettres, nbLettres, pourcent, jourLong, aujourdhui, txt, num, liste, vrai, couper,
  lirePersonnes, nomComplet, nomsCourts, fichePersonne, blocDonnees, ficheAgence,
  PERSONNE_VIDE, blocsSignature, manquesSignature, electronique, CHAMP_SIGNATURE,
  type Donnees, type Modele, type Etape, type Contexte, type Personne, type Repere, type CaseSignature,
} from './commun';

const ETAPES: Etape[] = [
  {
    id: 'qui', titre: 'L’acquéreur', court: 'L’acquéreur', sous: 'Qui fait l’offre : son état civil complet.', vers: 'Entre les soussignés', ic: 'personne',
    champs: [
      { t: 'personnes', cle: 'acquereurs', lib: 'Les acquéreurs', ic: 'personne', un: 'Acquéreur', min: 1, max: 4, complet: true },
    ],
  },
  {
    id: 'bien', titre: 'Le bien', court: 'Le bien', sous: 'Le bien visé, son vendeur, son prix annoncé.', vers: 'Le bien', ic: 'maison',
    champs: [
      { t: 'titre', cle: 't-bien', lib: 'Le bien', ic: 'maison' },
      { t: 'texte', cle: 'adresse', lib: 'Adresse du bien', ic: 'lieu', large: true, requis: true },
      { t: 'texte', cle: 'ville', lib: 'Ville', ic: 'immeuble', requis: true },
      { t: 'zone', cle: 'description', lib: 'Le bien', ic: 'doc', large: true, exemple: 'un appartement de 4 pièces au 3e étage, avec une cave (lots n° 12 et 31)' },
      { t: 'titre', cle: 't-vendeur', lib: 'Le vendeur', ic: 'personne' },
      { t: 'texte', cle: 'vendeurNom', lib: 'Le vendeur', ic: 'personne', exemple: 'M. et Mme Dubois', aide: 'Si tu le connais. Sinon, l’offre s’adresse « au propriétaire ».' },
      { t: 'texte', cle: 'agenceVendeur', lib: 'Agence du vendeur', ic: 'agence', exemple: 'Agence du Parc, Boulogne', aide: 'Si le bien est proposé par une autre agence : c’est elle qui transmet l’offre au vendeur.' },
      { t: 'euros', cle: 'prixAffiche', lib: 'Prix annoncé', ic: 'etiquette' },
    ],
  },
  {
    id: 'prix', titre: 'Le prix et le financement', court: 'Prix et financement', sous: 'Ce qu’il propose, et comment il paie.', vers: 'Le prix offert', reperesApres: 'honoRecherche', ic: 'euro',
    champs: [
      { t: 'euros', cle: 'prix', lib: 'Prix offert', ic: 'euro', requis: true },
      { t: 'choix', cle: 'forme', lib: 'Ce prix s’entend…', ic: 'etiquette', options: [
        { v: 'fai', l: 'Honoraires de l’agence du vendeur compris', ic: 'agence' }, { v: 'net', l: 'Net vendeur (sans agence côté vendeur)', ic: 'maison' },
      ] },
      { t: 'euros', cle: 'honoVendeur', lib: 'Dont honoraires de l’agence du vendeur', ic: 'agence', si: d => d.forme === 'fai' },
      { t: 'euros', cle: 'honoRecherche', lib: 'Tes honoraires, en plus du prix', ic: 'loupe', aide: 'Ceux de son mandat de recherche, s’il y en a un. Laisse vide sinon.' },
      { t: 'titre', cle: 't-fin', lib: 'Le financement', ic: 'banque' },
      { t: 'euros', cle: 'apport', lib: 'Apport personnel', ic: 'euro' },
      { t: 'choix', cle: 'pret', lib: 'Un prêt ?', ic: 'banque', options: [{ v: 'oui', l: 'Oui', ic: 'banque' }, { v: 'non', l: 'Non, sans prêt', ic: 'euro' }] },
      { t: 'euros', cle: 'pretMontant', lib: 'Montant du prêt', ic: 'banque', si: d => d.pret === 'oui' },
      { t: 'nombre', cle: 'pretDuree', lib: 'Durée', ic: 'chrono', unite: 'ans', si: d => d.pret === 'oui' },
      { t: 'nombre', cle: 'pretTaux', lib: 'Taux maximum', ic: 'pourcent', unite: '% hors assurance', si: d => d.pret === 'oui' },
      { t: 'titre', cle: 't-cond', lib: 'Les conditions', ic: 'check' },
      { t: 'cases', cle: 'conditions', lib: 'Autres conditions', ic: 'check', options: [
        { v: 'vente', l: 'La vente de son bien actuel', ic: 'maison' }, { v: 'autre', l: 'Une autre condition', ic: 'plus' },
      ] },
      { t: 'zone', cle: 'venteBien', lib: 'Son bien à vendre', ic: 'maison', large: true, si: d => Array.isArray(d.conditions) && (d.conditions as string[]).includes('vente'), exemple: 'appartement situé 3 rue Gallieni à Boulogne, au prix minimum de 480 000 €' },
      { t: 'zone', cle: 'conditionAutre', lib: 'L’autre condition', ic: 'plume', large: true, si: d => Array.isArray(d.conditions) && (d.conditions as string[]).includes('autre') },
    ],
  },
  {
    id: 'delais', titre: 'Les délais', court: 'Délais', sous: 'Combien de temps l’offre tient, et la suite.', vers: 'Ce que l’offre engage', ic: 'calendrier',
    champs: [
      { t: 'guide', cle: 'g-offre', titre: () => 'Ce que l’offre engage', points: () => [
        { ic: 'euro', x: 'Aucune somme ne peut être versée avec une offre d’achat (article 1589-1 du Code civil).' },
        { ic: 'calendrier', x: 'Jusqu’à la date de validité, l’acquéreur ne peut pas la retirer. Si le vendeur ne répond pas à temps, elle tombe d’elle-même.' },
        { ic: 'retour', x: 'Acceptée, elle mène à l’avant-contrat chez le notaire ; l’acquéreur y aura encore dix jours pour se rétracter.' },
      ] },
      { t: 'date', cle: 'validite', lib: 'Offre valable jusqu’au', ic: 'calendrier', requis: true },
      { t: 'heure', cle: 'validiteHeure', lib: 'À', ic: 'horloge' },
      { t: 'nombre', cle: 'delai', lib: 'Avant-contrat signé dans les', ic: 'chrono', unite: 'jours suivant l’acceptation' },
      { t: 'texte', cle: 'notaire', lib: 'Notaire de l’acquéreur', ic: 'balance', large: true, exemple: 'Me Leroy, notaire à Paris' },
      { t: 'zone', cle: 'note', lib: 'Une précision ?', ic: 'plume', large: true },
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

function acquereursDe(d: Donnees): Personne[] {
  const l = lirePersonnes(d.acquereurs);
  return l.length ? l : [{ ...PERSONNE_VIDE }];
}

function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const as = acquereursDe(d);
  const pl = as.length > 1;
  const ACQ = pl ? 'les ACQUÉREURS' : 'l’ACQUÉREUR';
  const Acq = pl ? 'Les ACQUÉREURS' : 'L’ACQUÉREUR';
  const adresse = [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ');
  const prix = num(d, 'prix');
  const hv = num(d, 'honoVendeur');
  const hr = num(d, 'honoRecherche');
  const conds = liste(d, 'conditions');
  const delai = num(d, 'delai') ?? 30;
  const jusquau = `${txt(d, 'validite') ? jourLong(txt(d, 'validite')) : '……………'}${txt(d, 'validiteHeure') ? ` à ${txt(d, 'validiteHeure').replace(':', ' h ')}` : ''}`;

  const destinataire = txt(d, 'vendeurNom')
    ? `${txt(d, 'vendeurNom')}, propriétaire${/ et /.test(txt(d, 'vendeurNom')) ? 's' : ''} du bien`
    : 'le propriétaire du bien';
  const entre: Bloc[] = [
    { t: 'fiches', items: [
      ...as.map((p, i) => fichePersonne(p, 'personne', i === as.length - 1 ? `Ci-après ${pl ? 'ensemble « les ACQUÉREURS »' : '« l’ACQUÉREUR »'}` : undefined)),
      ficheAgence(A, lignesMandataire(A).slice(0, 3), undefined, 'Ci-après « l’Agence », qui transmet l’offre'),
    ] },
    P(`${Acq} ${pl ? 'adressent' : 'adresse'} la présente offre à ${destinataire}${txt(d, 'agenceVendeur') ? `, par l’intermédiaire de ${txt(d, 'agenceVendeur')}` : ''}, ci-après « le VENDEUR ».`),
  ];

  const bien: Bloc[] = [P(`${adresse || 'Adresse à compléter'}${txt(d, 'description') ? ` : ${txt(d, 'description')}` : ''}.`, true)];
  if (num(d, 'prixAffiche')) bien.push(P(`Prix annoncé : ${euros(num(d, 'prixAffiche') || 0)}.`));

  const prixB: Bloc[] = [
    P(`${Acq} ${pl ? 'offrent' : 'offre'} d’acheter ce bien au prix de ${prix ? eurosLettres(prix) : '……………'}${d.forme === 'fai' ? ', honoraires de l’agence du vendeur compris' : ', net vendeur'}.`, true),
  ];
  if (d.forme === 'fai' && prix && hv) prixB.push(P(`Soit un prix net revenant au VENDEUR de ${euros(prix - hv)} et des honoraires de ${euros(hv)} TTC, à la charge de ${ACQ}.`));
  if (hr) prixB.push(P(`En plus de ce prix, ${ACQ} ${pl ? 'règlent' : 'règle'} à l’Agence les honoraires prévus par ${pl ? 'leur' : 'son'} mandat de recherche : ${euros(hr)} TTC, le jour de l’acte authentique, par l’intermédiaire du notaire.`));
  prixB.push(P('Les frais de l’acte (droits de mutation et émoluments du notaire) sont en sus, à la charge de l’acquéreur, comme l’usage le veut.'));

  const fin: Bloc[] = [];
  const apport = num(d, 'apport');
  if (vrai(d, 'pret')) {
    const m = num(d, 'pretMontant'), n = num(d, 'pretDuree'), t = num(d, 'pretTaux');
    fin.push(P(`${Acq} ${pl ? 'financent' : 'finance'} cette acquisition ${apport ? `par un apport personnel de ${euros(apport)} et ` : ''}par un ou plusieurs prêts${m ? ` d’un montant total de ${euros(m)}` : ''}${n ? `, sur ${nbLettres(n)} ans au plus` : ''}${t !== null && t > 0 ? `, au taux maximum de ${pourcent(t)} hors assurance` : ''}.`, true));
    fin.push(P('L’avant-contrat sera conclu sous la condition suspensive de l’obtention de ce financement (article L313-41 du Code de la consommation).'));
  } else if (d.pret === 'non') {
    fin.push(P(`${Acq} ${pl ? 'déclarent' : 'déclare'} financer cette acquisition sans recourir à un prêt${apport ? `, au moyen de ${pl ? 'leurs' : 'ses'} fonds propres (${euros(apport)})` : ''}. ${pl ? 'Ils le confirmeront' : 'Il le confirmera'} de sa main dans l’avant-contrat, comme la loi l’exige.`, true));
  } else {
    fin.push(P('Le financement sera précisé dans l’avant-contrat.'));
  }

  const conditions: string[] = [
    ...(vrai(d, 'pret') ? ['l’obtention du financement décrit ci-dessus ;'] : []),
    ...(conds.includes('vente') ? [`la vente par ${ACQ} de ${pl ? 'leur' : 'son'} bien actuel${txt(d, 'venteBien') ? ` (${txt(d, 'venteBien')})` : ''} ;`] : []),
    ...(conds.includes('autre') && txt(d, 'conditionAutre') ? [`${txt(d, 'conditionAutre')} ;`] : []),
    'les conditions suspensives d’usage : absence de servitude ou de charge grave, urbanisme compatible, purge des droits de préemption, et situation hypothécaire permettant une vente libre.',
  ];

  const engage: Bloc[] = [
    P(`Cette offre est valable jusqu’au ${jusquau}. Elle ne peut être retirée avant cette date (article 1116 du Code civil). Sans acceptation écrite du VENDEUR à cette date, elle devient caduque, sans aucune formalité.`, true),
    P(`Si le VENDEUR l’accepte par écrit dans ce délai, l’accord sur le bien et sur le prix est formé. Les parties s’engagent à le constater dans un avant-contrat (compromis ou promesse de vente) signé chez le notaire dans les ${nbLettres(delai)} jours suivant l’acceptation, reprenant les conditions ci-dessus.`),
    P(`À compter de la notification de l’avant-contrat, ${ACQ}, ${pl ? 's’ils ne sont' : 's’il n’est'} pas ${pl ? 'des professionnels' : 'un professionnel'} de l’immobilier, ${pl ? 'disposeront' : 'disposera'} d’un délai de rétractation de dix jours (article L271-1 du Code de la construction et de l’habitation).`),
    P('Aucune somme n’est versée à l’occasion de la présente offre : la loi l’interdit (article 1589-1 du Code civil). Le dépôt de garantie éventuel sera prévu par l’avant-contrat et versé entre les mains du notaire.', true),
  ];
  if (txt(d, 'notaire')) engage.push(P(`Notaire de ${ACQ} : ${txt(d, 'notaire')}.`));
  if (txt(d, 'note')) engage.push(P(`Précision : ${txt(d, 'note')}`));

  return [{
    titre: 'Offre d’achat',
    court: 'L’offre d’achat',
    sous: adresse || 'Offre ferme',
    ic: 'euro',
    sections: [
      { titre: 'Entre les soussignés', blocs: entre },
      { titre: 'Le bien', ic: 'maison', blocs: bien },
      { titre: 'Le prix offert', ic: 'etiquette', blocs: prixB },
      { titre: 'Le financement', ic: 'banque', blocs: fin },
      { titre: 'Les conditions', ic: 'check', blocs: [P('L’avant-contrat sera conclu sous les conditions suspensives suivantes :'), { t: 'l', items: conditions }] },
      { titre: 'Ce que l’offre engage', ic: 'balance', blocs: engage },
      { titre: 'Informations', ic: 'info', blocs: [blocDonnees(A), P('Lutte contre le blanchiment : l’acquéreur fournira à l’Agence et au notaire les justificatifs d’identité et d’origine des fonds qui lui seront demandés (articles L561-1 et suivants du Code monétaire et financier).')] },
      { titre: 'Date et signatures', ic: 'plume', blocs: blocsSignature(d, {
        papier: `Fait à ${txt(d, 'faitA') || '……………'}, le ${txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………'}.`,
        mention: 'Chaque acquéreur date et signe, précédé de la mention manuscrite « Bon pour offre d’achat au prix de ______ euros ».',
        cases: casesOffre(d, A),
      }) },
      /* Signée en ligne ou sur place, l'offre part au vendeur en PDF : il
         répond par écrit, sans cadres à remplir à la main. */
      electronique(d) ? { titre: 'Réponse du vendeur', ic: 'accord', blocs: [
        P(`Le VENDEUR adresse sa réponse par écrit à l’Agence avant le ${jusquau} : il accepte la présente offre au prix de ${prix ? euros(prix) : '……………'}, aux conditions ci-dessus, la refuse, ou fait une contre-proposition. Une contre-proposition vaut refus de la présente offre ; elle n’engage l’acquéreur qu’une fois signée par lui.`),
        Pp('L’acquéreur charge l’Agence de recevoir cette réponse : l’acceptation reçue par l’Agence dans le délai forme l’accord. L’Agence la transmet à l’acquéreur par écrit (un e-mail suffit), le jour même.'),
      ] } : { titre: 'Réponse du vendeur', ic: 'accord', blocs: [
        P(`À remplir par le VENDEUR avant le ${jusquau}, puis à retourner signé à l’Agence.`),
        { t: 'case', coche: false, x: `Le VENDEUR ACCEPTE la présente offre au prix de ${prix ? euros(prix) : '……………'}, aux conditions ci-dessus.` },
        { t: 'case', coche: false, x: 'Le VENDEUR REFUSE la présente offre.' },
        { t: 'case', coche: false, x: 'Le VENDEUR fait la contre-proposition suivante : ____________________________ (elle ne vaut acceptation qu’une fois contresignée par l’acquéreur).' },
        Pp('Mots rayés nuls : ______   ·   Lignes rayées nulles : ______'),
        { t: 'sigs', mention: 'Le ou les vendeurs datent et signent, précédé de la mention « Bon pour acceptation » s’ils acceptent.', cases: [
          { qui: 'Le vendeur', nom: txt(d, 'vendeurNom') || '________________', lignes: ['Le __________ à ____ h ____'] },
          { qui: 'Le vendeur', nom: '________________', lignes: ['Le __________ à ____ h ____'] },
        ] },
        Pp('L’acceptation est portée à la connaissance de l’acquéreur par l’Agence, par écrit (un e-mail suffit), le jour même.'),
      ] },
    ],
  }];
}

function resume(d: Donnees): Resume {
  const prix = num(d, 'prix');
  return [
    { titre: 'Le bien', valeur: txt(d, 'adresse') || 'À compléter', detail: couper([txt(d, 'ville'), txt(d, 'description')].filter(Boolean).join(' · '), 90) || '—' },
    { titre: 'Prix offert', valeur: prix ? euros(prix) : 'À compléter', detail: d.forme === 'fai' ? 'honoraires de l’agence du vendeur compris' : 'net vendeur' },
    { titre: 'Financement', valeur: vrai(d, 'pret') ? `Prêt${num(d, 'pretMontant') ? ` de ${euros(num(d, 'pretMontant') || 0)}` : ''}` : d.pret === 'non' ? 'Sans prêt' : 'À préciser',
      detail: num(d, 'apport') ? `apport de ${euros(num(d, 'apport') || 0)}` : '—' },
    { titre: 'Valable jusqu’au', valeur: txt(d, 'validite') ? jourLong(txt(d, 'validite')) : 'À compléter', detail: txt(d, 'validiteHeure') ? `à ${txt(d, 'validiteHeure').replace(':', ' h ')}` : 'sans retrait possible avant' },
  ];
}

/* Les cadres de signature : chaque acquéreur, puis l'agence qui transmet. */
function casesOffre(d: Donnees, A?: IdentiteAgence): CaseSignature[] {
  const out: CaseSignature[] = acquereursDe(d).map((p, i) => ({ cle: `a${i}`, qui: 'L’acquéreur', nom: nomComplet(p), lignes: [] as string[], personne: p }));
  if (A) out.push({ cle: 'agence', qui: 'Transmise par', nom: A.nom.toUpperCase(), lignes: [`${A.signataireNom}, ${A.signataireQualite}`], agence: true });
  return out;
}

function manques(d: Donnees): string[] {
  const out: string[] = [];
  acquereursDe(d).forEach((p, i) => {
    if (!p.nom || !p.prenom) out.push(`Le nom de l’acquéreur ${i + 1}`);
    else if (!p.adresse) out.push(`L’adresse de ${nomComplet(p)}`);
  });
  if (!txt(d, 'adresse') || !txt(d, 'ville')) out.push('L’adresse du bien');
  if (!num(d, 'prix')) out.push('Le prix offert');
  if (!d.pret) out.push('Le financement (avec ou sans prêt)');
  if (!txt(d, 'validite')) out.push('La date de validité de l’offre');
  if (!txt(d, 'faitA') || !txt(d, 'date')) out.push('Le lieu et la date');
  out.push(...manquesSignature(d, casesOffre(d)));
  return out;
}

/* Les repères de l'éditeur : l'écart avec le prix annoncé, et le plan de
   financement qui doit tomber juste. */
function reperes(d: Donnees, etape: string): Repere[] {
  const out: Repere[] = [];
  if (etape !== 'prix') return out;
  const prix = num(d, 'prix'), affiche = num(d, 'prixAffiche');
  if (prix && affiche) {
    const ecart = ((prix - affiche) / affiche) * 100;
    out.push({ l: 'Par rapport au prix annoncé', v: `${ecart > 0 ? '+' : ''}${pourcent(ecart)} (${ecart < 0 ? '−' : '+'}${euros(Math.abs(prix - affiche))})` });
  }
  const recherche = num(d, 'honoRecherche') || 0;
  if (prix) {
    const total = prix + recherche;
    out.push({ l: 'Budget, hors frais de notaire', v: euros(total) });
    const apport = num(d, 'apport') || 0, pret = d.pret === 'oui' ? num(d, 'pretMontant') || 0 : 0;
    if (apport || pret) {
      const reste = total - apport - pret;
      out.push(reste > 0
        ? { l: 'Financement', v: `Apport et prêt couvrent ${euros(apport + pret)} : il manque ${euros(reste)}, sans compter les frais de notaire.`, ton: 'alerte' }
        : { l: 'Financement', v: `Apport et prêt couvrent le prix${recherche ? ' et tes honoraires' : ''} ; reste à prévoir les frais de notaire.`, ton: 'ok' });
    }
  }
  if (d.forme === 'fai' && prix && num(d, 'honoVendeur') && (num(d, 'honoVendeur') || 0) >= prix) out.push({ l: 'Honoraires', v: 'Les honoraires dépassent le prix offert : vérifie les montants.', ton: 'alerte' });
  return out;
}

function defaut(c: Contexte): Donnees {
  const cl = c.client, b = c.bien;
  const p: Personne = { ...PERSONNE_VIDE, prenom: cl?.prenom || '', nom: cl?.nom || '', adresse: cl?.adresse || '', email: cl?.emails?.[0] || '', telephone: cl?.telephones?.[0] || '' };
  const desc = b ? [b.type_bien, b.nb_pieces ? `${b.nb_pieces} pièces` : '', b.surface ? `${b.surface} m²` : '', b.etage != null ? (b.etage === 0 ? 'rez-de-chaussée' : `${b.etage}e étage`) : ''].filter(Boolean).join(', ').toLowerCase() : '';
  const dans = (j: number) => new Date(Date.now() + j * 86_400_000).toISOString().slice(0, 10);
  return {
    acquereurs: [p],
    adresse: b?.adresse || '', ville: b?.ville || '', description: desc, vendeurNom: '', agenceVendeur: b?.agence_nom || '',
    prixAffiche: b?.prix_acquereur || null, prix: null, forme: 'fai', honoVendeur: null, honoRecherche: null,
    apport: null, pret: 'oui', pretMontant: null, pretDuree: 25, pretTaux: null, conditions: [],
    validite: dans(5), validiteHeure: '18:00', delai: 30, notaire: '', note: '', signature: 'en_ligne', faitA: c.identite.ville, date: aujourdhui(),
  };
}

export const OFFRE_ACHAT: Modele = {
  id: 'offre_achat',
  categorie: 'offres',
  titre: 'Offre d’achat',
  description: 'Une offre ferme, avec son délai, son financement, et la place pour la réponse du vendeur.',
  ic: 'euro',
  signataires: 'Les acquéreurs, puis le vendeur pour répondre',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Offre d’achat · ${nomsCourts(acquereursDe(d))}`,
  sousTitre: d => [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', '),
  pour: d => nomsCourts(acquereursDe(d)),
  rediger,
  resume,
  garde: d => ({
    titre: 'Offre d’achat',
    sous: 'ferme, d’un bien immobilier',
    etiquette: `${num(d, 'prix') ? `${euros(num(d, 'prix') || 0).toUpperCase()} · ` : ''}VALABLE JUSQU’AU ${txt(d, 'validite') ? jourLong(txt(d, 'validite')).toUpperCase() : '…'}`,
    pour: 'ACQUÉREUR',
    ics: ['maison', 'etiquette', 'banque', 'calendrier'],
  }),
  entete: d => `Offre d’achat${txt(d, 'adresse') ? ` · ${txt(d, 'adresse')}` : ''}`,
  manques,
  reperes,
  cases: casesOffre,
  accepter: d => {
    const prix = num(d, 'prix');
    const jusquau = `${txt(d, 'validite') ? jourLong(txt(d, 'validite')) : '……………'}${txt(d, 'validiteHeure') ? ` à ${txt(d, 'validiteHeure').replace(':', ' h ')}` : ''}`;
    return `J’ai lu cette offre en entier et je m’engage à acheter ce bien${prix ? ` au prix de ${eurosLettres(prix)}${d.forme === 'fai' ? ', honoraires de l’agence du vendeur compris' : ', net vendeur'}` : ''}, aux conditions ci-dessus. Mon offre tient jusqu’au ${jusquau} : bon pour offre d’achat.`;
  },
};
