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

   V3.145 — les honoraires d'Alexandre (son mandat de recherche) ne sont
   plus écrits dans l'offre : elle part à l'agence ou au vendeur, qui n'ont
   pas à les voir. Le client, lui, les voit au moment de signer (« Pour vous,
   frais d'agence compris », voir `rappel`) et dans le mail de confirmation.
   Ils viennent du bien (avec inter : aucun ; sans inter ou particulier : son
   taux ou son forfait), et ne peuvent pas dépasser le mandat signé.

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre. */

import { euros, type Partie, type Bloc, type Resume } from '@/lib/mandat';
import { prixDuBien, honorairesDuMandat, plafondMandat, type HonoMandat } from '@/lib/honoraires-bien';
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
    id: 'prix', titre: 'Le prix et le financement', court: 'Prix et financement', sous: 'Ce qu’il propose, et comment il paie.', vers: 'Le prix offert', reperesApres: 'g-hono', ic: 'euro',
    champs: [
      { t: 'euros', cle: 'total', lib: 'Son offre, frais d’agence compris', ic: 'euro', requis: true,
        aide: 'Ce qu’il veut mettre en tout, hors frais de notaire. Le prix proposé au vendeur s’en déduit, juste en dessous.' },
      { t: 'choix', cle: 'forme', lib: 'Ce prix s’entend…', ic: 'etiquette', options: [
        { v: 'fai', l: 'Honoraires de l’agence du vendeur compris', ic: 'agence' }, { v: 'net', l: 'Net vendeur (sans agence côté vendeur)', ic: 'maison' },
      ] },
      { t: 'euros', cle: 'honoVendeur', lib: 'Dont honoraires de l’agence du vendeur', ic: 'agence', si: d => d.forme === 'fai' },
      { t: 'titre', cle: 't-hono', lib: 'Tes honoraires', ic: 'loupe' },
      { t: 'choix', cle: 'honoMode', lib: 'Sur ce bien', ic: 'loupe', options: [
        { v: 'aucun', l: 'Aucun : inter-cabinet', ic: 'accord' }, { v: 'taux', l: 'Un pourcentage', ic: 'pourcent' }, { v: 'forfait', l: 'Un forfait', ic: 'euro' },
      ] },
      { t: 'nombre', cle: 'honoTaux', lib: 'Taux', ic: 'pourcent', unite: '% TTC du prix proposé', si: d => d.honoMode === 'taux' },
      { t: 'euros', cle: 'honoForfait', lib: 'Forfait', ic: 'euro', si: d => d.honoMode === 'forfait' },
      { t: 'guide', cle: 'g-hono', titre: d => {
        const prix = num(d, 'prix');
        return prix ? `Proposé au vendeur : ${euros(prix)}` : 'Le prix proposé au vendeur';
      }, points: d => {
        const prix = num(d, 'prix'), h = honorairesOffre(d);
        return [
          prix
            ? h > 0
              ? { ic: 'euro', x: `Tes honoraires : ${euros(h)}, le reste de son total. Le prix est arrondi à la centaine au-dessus : un chiffre normal pour l’agence, et tu restes sous ton mandat.` }
              : { ic: 'euro', x: 'Aucun honoraire pour toi sur ce bien : tout son total va au vendeur.' }
            : { ic: 'euro', x: 'Tape son offre, frais d’agence compris : le prix proposé au vendeur s’affiche ici.' },
          { ic: 'cadenas', x: 'Tes honoraires ne sont pas écrits dans l’offre : l’agence et le vendeur ne les voient pas.' },
          { ic: 'plume', x: 'Ton client les voit au moment de signer, avec son total, et les retrouve dans le mail de confirmation.' },
        ];
      } },
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

/* ── Ses honoraires sur ce bien (V3.145) ──
   Au prix offert : aucun (inter-cabinet), un pourcentage, ou un forfait.
   Une offre d'avant gardait un montant tout fait (`honoRecherche`). */
export function honorairesOffre(d: Donnees): number {
  const prix = num(d, 'prix') || 0, total = num(d, 'total');
  if (d.honoMode === 'aucun') return 0;
  /* Depuis son total : le reste, une fois le prix arrondi (voir decomposer). */
  if ((d.honoMode === 'taux' || d.honoMode === 'forfait') && total && prix) return Math.max(0, total - prix);
  if (d.honoMode === 'taux') { const t = num(d, 'honoTaux'); return t && prix ? Math.round((prix * t) / 100) : 0; }
  if (d.honoMode === 'forfait') return num(d, 'honoForfait') || 0;
  return num(d, 'honoRecherche') || 0;
}

/* Son total, frais d'agence compris → le prix proposé au vendeur.
   Alexandre (9 octobre) : « s'il dit 450, ça s'affiche 450 ». Le prix est
   arrondi à la CENTAINE AU-DESSUS (450 000 € à 2,5 % → 439 100 €, et non
   439 024 €, un chiffre qui trahirait le calcul), et ses honoraires prennent
   le reste (10 900 €) : un peu moins que le taux, jamais plus — on reste
   sous le mandat. Le total affiché est toujours celui qu'il a dit. */
export function decomposer(d: Donnees): { prix: number | null; hono: number } {
  const total = num(d, 'total');
  if (!total || total <= 0) return { prix: null, hono: 0 };
  /* À l'euro d'abord : 512 500 / 1,025 vaut 499 999,999… en machine, et ne
     doit pas monter à 500 100. */
  const cent = (x: number) => Math.min(total, Math.ceil(Math.round(x) / 100) * 100);
  if (d.honoMode === 'taux') {
    const t = num(d, 'honoTaux') || 0;
    if (t > 0) { const prix = cent(total / (1 + t / 100)); return { prix, hono: total - prix }; }
  }
  if (d.honoMode === 'forfait') {
    const f = num(d, 'honoForfait') || 0;
    if (f > 0 && f < total) { const prix = cent(total - f); return { prix, hono: total - prix }; }
  }
  return { prix: total, hono: 0 };
}

/* L'éditeur recalcule le prix à chaque réponse. Une offre d'avant n'avait
   que son prix : son total s'en déduit à l'ouverture. Vider le total vide
   le prix (sinon le champ se remplirait tout seul pendant qu'on tape). */
function deduire(d0: Donnees, cle: string): Donnees {
  /* Une offre d'avant la V3.145 : ses honoraires étaient un montant
     (`honoRecherche`) ; ils deviennent un forfait, ou rien. */
  const d: Donnees = d0.honoMode ? d0 : { ...d0, honoMode: num(d0, 'honoRecherche') ? 'forfait' : 'aucun', honoForfait: num(d0, 'honoRecherche') || null };
  const total = num(d, 'total');
  if (!total) {
    if (cle === 'total') return { ...d, prix: null };
    const prix = num(d, 'prix');
    if (!prix || cle) return d;
    const h = d.honoMode === 'taux' ? Math.round((prix * (num(d, 'honoTaux') || 0)) / 100)
      : d.honoMode === 'forfait' ? num(d, 'honoForfait') || 0
        : d.honoMode === 'aucun' ? 0 : num(d, 'honoRecherche') || 0;
    return { ...d, total: prix + h };
  }
  const { prix } = decomposer(d);
  return prix === num(d, 'prix') ? d : { ...d, prix };
}
/* Le mandat de recherche relu à la création de l'offre (texte « 2,5 % TTC »). */
function mandatDe(d: Donnees): HonoMandat | null {
  const m = d.honoMandat as HonoMandat | null | undefined;
  return m && (m.type === 'pourcentage' || m.type === 'fixe') && Number(m.val) > 0 ? m : null;
}
/* Au-dessus du mandat ? La phrase qui le dit, ou null. */
function depasseMandat(d: Donnees): string | null {
  const m = mandatDe(d), prix = num(d, 'prix') || 0, h = honorairesOffre(d);
  const plafond = plafondMandat(m, prix);
  if (!m || plafond === null || h <= plafond + 1) return null;
  return `${euros(h)}, au-dessus de son mandat (${m.texte}, soit ${euros(plafond)} à ce prix) : tu ne peux pas prendre plus que ce qu’il a signé.`;
}

/* Le rappel montré à l'acquéreur au moment de signer, et repris dans son
   mail de confirmation : jamais dans l'offre elle-même. */
function rappel(d: Donnees): { titre: string; valeur: string; detail: string } | null {
  const prix = num(d, 'prix');
  if (!prix) return null;
  const h = honorairesOffre(d);
  return h > 0
    ? { titre: 'Pour vous, frais d’agence compris', valeur: euros(prix + h), detail: `dont ${euros(prix)} proposés au vendeur et ${euros(h)} de nos honoraires · hors frais de notaire` }
    : { titre: 'Pour vous, frais d’agence compris', valeur: euros(prix), detail: 'rien de plus à payer, hors frais de notaire' };
}

function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const as = acquereursDe(d);
  const pl = as.length > 1;
  const ACQ = pl ? 'les ACQUÉREURS' : 'l’ACQUÉREUR';
  const Acq = pl ? 'Les ACQUÉREURS' : 'L’ACQUÉREUR';
  const adresse = [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ');
  const prix = num(d, 'prix');
  const hv = num(d, 'honoVendeur');
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
  if (!num(d, 'prix')) out.push('Son offre, frais d’agence compris');
  if (depasseMandat(d)) out.push('Tes honoraires : au-dessus de son mandat de recherche');
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
  const recherche = honorairesOffre(d);
  /* L'écart se lit en « frais d'agence compris », comme le client pense :
     son total face au prix demandé, ses honoraires au même taux compris. */
  if (prix && affiche) {
    const total = prix + recherche;
    const hDemande = d.honoMode === 'taux' ? Math.round((affiche * (num(d, 'honoTaux') || 0)) / 100) : d.honoMode === 'forfait' ? num(d, 'honoForfait') || 0 : 0;
    const demande = affiche + hDemande;
    const ecart = ((total - demande) / demande) * 100;
    out.push({ l: hDemande ? 'Prix demandé, frais d’agence compris' : 'Prix demandé', v: euros(demande) });
    out.push({ l: 'Son offre par rapport au prix demandé', v: total === demande ? 'au prix demandé' : `${ecart > 0 ? '+' : ''}${pourcent(ecart)} (${ecart < 0 ? '−' : '+'}${euros(Math.abs(total - demande))})` });
  }
  if (prix) {
    const total = prix + recherche;
    const trop = depasseMandat(d);
    if (trop) out.push({ l: 'Tes honoraires', v: trop, ton: 'alerte' });
    else if (recherche && !mandatDe(d)) out.push({ l: 'Tes honoraires', v: 'Vérifie qu’il a un mandat de recherche signé : sans mandat, tu ne peux pas lui demander d’honoraires.', ton: 'alerte' });
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
  /* V3.145 : le prix de l'annonce, et ses honoraires tels que fixés sur le
     bien (avec inter : aucun) ; à défaut de taux sur le bien, celui du mandat. */
  const pb = prixDuBien(b);
  const mandat = honorairesDuMandat(c.recherche || null);
  const surBien = b && !pb.agence && pb.hono > 0 && Number(b.commission_val) > 0
    ? { mode: b.commission_type === 'fixe' ? 'forfait' : 'taux', val: Number(b.commission_val) } : null;
  const p: Personne = { ...PERSONNE_VIDE, prenom: cl?.prenom || '', nom: cl?.nom || '', adresse: cl?.adresse || '', email: cl?.emails?.[0] || '', telephone: cl?.telephones?.[0] || '' };
  const desc = b ? [b.type_bien, b.nb_pieces ? `${b.nb_pieces} pièces` : '', b.surface ? `${b.surface} m²` : '', b.etage != null ? (b.etage === 0 ? 'rez-de-chaussée' : `${b.etage}e étage`) : ''].filter(Boolean).join(', ').toLowerCase() : '';
  const dans = (j: number) => new Date(Date.now() + j * 86_400_000).toISOString().slice(0, 10);
  return {
    acquereurs: [p],
    adresse: b?.adresse || '', ville: b?.ville || '', description: desc, vendeurNom: '', agenceVendeur: b?.agence_nom || '',
    prixAffiche: pb.demande, total: null, prix: null, forme: b?.est_particulier ? 'net' : 'fai', honoVendeur: null,
    honoMode: surBien ? surBien.mode : 'aucun',
    honoTaux: surBien?.mode === 'taux' ? surBien.val : mandat?.type === 'pourcentage' ? mandat.val : null,
    honoForfait: surBien?.mode === 'forfait' ? surBien.val : mandat?.type === 'fixe' ? mandat.val : null,
    honoMandat: mandat,
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
  rappel,
  deduire,
  accepter: d => {
    const prix = num(d, 'prix');
    const jusquau = `${txt(d, 'validite') ? jourLong(txt(d, 'validite')) : '……………'}${txt(d, 'validiteHeure') ? ` à ${txt(d, 'validiteHeure').replace(':', ' h ')}` : ''}`;
    return `J’ai lu cette offre en entier et je m’engage à acheter ce bien${prix ? ` au prix de ${eurosLettres(prix)}${d.forme === 'fai' ? ', honoraires de l’agence du vendeur compris' : ', net vendeur'}` : ''}, aux conditions ci-dessus. Mon offre tient jusqu’au ${jusquau} : bon pour offre d’achat.`;
  },
};

/* V3.50 : l'instant où l'offre cesse de valoir — sa date de validité, à
   l'heure dite (sinon à 23 h 59), à l'heure de Paris. Avant, rien ne la
   lisait : le lien de signature valait 15 jours, le dernier rappel partait
   au 7e jour, et une offre se signait encore après sa date. Null : pas de
   date lisible. Navigateur et serveur. */
export function finValiditeOffre(d: Donnees): Date | null {
  const jour = txt(d, 'validite');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const heure = /^\d{2}:\d{2}$/.test(txt(d, 'validiteHeure')) ? txt(d, 'validiteHeure') : '23:59';
  const t = new Date(`${jour}T${heure}:${heure === '23:59' ? '59' : '00'}${decalageParis(jour)}`);
  return Number.isFinite(t.getTime()) ? t : null;
}
/* Le décalage de Paris sur l'heure universelle, ce jour-là (« +02:00 »). */
function decalageParis(ymd: string): string {
  try {
    const t = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${ymd}T12:00:00Z`)).find(x => x.type === 'timeZoneName')?.value || '';
    const m = /GMT([+-]\d{2}):?(\d{2})/.exec(t);
    return m ? `${m[1]}:${m[2]}` : '+01:00';
  } catch { return '+01:00'; }
}
